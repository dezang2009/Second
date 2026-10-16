package com.moneymoa.service

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import com.moneymoa.data.TransactionRepository
import com.moneymoa.parser.TransactionParser
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

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        if (sbn.packageName == packageName) return
        val n = sbn.notification
        if (n.flags and Notification.FLAG_GROUP_SUMMARY != 0) return

        val extras = n.extras
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
        val body = (extras.getCharSequence(Notification.EXTRA_BIG_TEXT)
            ?: extras.getCharSequence(Notification.EXTRA_TEXT))?.toString().orEmpty()
        // 문자 앱은 여러 문자를 한 알림에 줄 단위로 묶어 보내기도 한다.
        val lines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)
            ?.map { it.toString() }.orEmpty()

        val messages = lines.ifEmpty { listOf(body) }
            .filter { it.isNotBlank() }
            .map { listOf(title, it).filter(String::isNotBlank).joinToString("\n") }

        for (text in messages) {
            val parsed = TransactionParser.parse(text, sbn.packageName) ?: continue
            scope.launch {
                val saved = repository.addFromNotification(parsed, text, sbn.packageName, sbn.postTime)
                Log.d(TAG, "${if (saved) "saved" else "duplicate"}: $parsed")
            }
        }
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }

    companion object {
        private const val TAG = "MoneyMoa"
    }
}
