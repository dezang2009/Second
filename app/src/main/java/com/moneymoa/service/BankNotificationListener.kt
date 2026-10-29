package com.moneymoa.service

import android.app.Notification
import android.content.ComponentName
import android.content.Context
import android.os.Build
import android.os.Bundle
import android.os.Parcelable
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import com.moneymoa.data.TransactionRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * 은행·카드·문자 앱 알림을 받아 입출금이면 바로 DB에 저장한다.
 * 화면은 DB를 Flow로 보고 있으므로 저장 즉시 반영된다.
 */
class BankNotificationListener : NotificationListenerService() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val repository by lazy { TransactionRepository.get(this) }

    override fun onListenerConnected() {
        ListenerStatus.setConnected(this, true)
        // 연결이 끊겨 있던 동안 와서 알림창에 남아 있는 알림도 읽는다. (이미 저장한 것은 중복 검사로 걸러진다)
        try {
            activeNotifications?.forEach(::handle)
        } catch (e: SecurityException) {
            Log.w(TAG, "activeNotifications", e)
        }
    }

    override fun onListenerDisconnected() {
        ListenerStatus.setConnected(this, false)
        // 앱 업데이트 등으로 끊기면 다시 연결해 달라고 요청한다.
        requestRebind(ComponentName(this, BankNotificationListener::class.java))
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) = handle(sbn)

    private fun handle(sbn: StatusBarNotification) {
        if (sbn.packageName == packageName) return
        val n = sbn.notification
        if (n.flags and Notification.FLAG_GROUP_SUMMARY != 0) return

        val texts = NotificationText.extract(
            title = n.extras.getCharSequence(Notification.EXTRA_TITLE)?.toString(),
            text = n.extras.getCharSequence(Notification.EXTRA_TEXT)?.toString(),
            bigText = n.extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString(),
            lines = n.extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)?.map { it.toString() }.orEmpty(),
            messages = messagingStyleTexts(n.extras),
            conversationTitle = n.extras.getCharSequence(Notification.EXTRA_CONVERSATION_TITLE)?.toString(),
        )
        for (text in texts) {
            scope.launch {
                val result = repository.handleNotificationText(text, sbn.packageName, sbn.postTime)
                Log.d(TAG, "$result: ${sbn.packageName}")
            }
        }
    }

    /** 메시지 앱의 대화형 알림(MessagingStyle)에 들어 있는 문자 본문들 */
    @Suppress("DEPRECATION")
    private fun messagingStyleTexts(extras: Bundle): List<String> {
        val raw: Array<out Parcelable>? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            extras.getParcelableArray(Notification.EXTRA_MESSAGES, Parcelable::class.java)
        } else {
            extras.getParcelableArray(Notification.EXTRA_MESSAGES)
        }
        return raw.orEmpty().mapNotNull { (it as? Bundle)?.getCharSequence("text")?.toString() }
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }

    companion object {
        private const val TAG = "MoneyMoa"

        /** 앱을 열 때마다 호출: 업데이트 후 연결이 끊긴 채로 남는 경우를 되살린다. */
        fun rebind(context: Context) {
            requestRebind(ComponentName(context, BankNotificationListener::class.java))
        }
    }
}

/** 알림 읽기 서비스가 지금 연결되어 있는지 화면에 보여 주기 위한 기록 */
object ListenerStatus {
    private const val PREFS = "listener"

    fun setConnected(context: Context, connected: Boolean) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putBoolean("connected", connected)
            .apply { if (connected) putLong("connectedAt", System.currentTimeMillis()) }
            .apply()
    }

    fun isConnected(context: Context) =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean("connected", false)
}
