package com.moneymoa.service

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.moneymoa.R
import com.moneymoa.data.AppSettings
import com.moneymoa.ui.MainActivity
import com.moneymoa.ui.won
import java.time.YearMonth

/** 이번 달 지출이 예산의 80%, 100%를 넘으면 한 번씩 알려 준다. */
object BudgetNotifier {
    private const val CHANNEL_ID = "budget"
    private val LEVELS = listOf(80, 100)

    fun createChannel(context: Context) {
        val channel = NotificationChannel(CHANNEL_ID, "예산 알림", NotificationManager.IMPORTANCE_DEFAULT)
            .apply { description = "월 예산의 80%, 100%에 도달하면 알려요" }
        context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    fun check(context: Context, monthExpense: Long, month: YearMonth = YearMonth.now()) {
        val settings = AppSettings.get(context)
        val budget = settings.budget.value
        if (budget <= 0 || !settings.alertsEnabled.value) return

        val percent = (monthExpense * 100 / budget).toInt()
        val level = LEVELS.lastOrNull { percent >= it } ?: return
        if (level <= settings.notifiedLevel(month)) return
        settings.setNotifiedLevel(month, level)

        val (title, text) = if (level >= 100) {
            "이번 달 예산을 넘었어요" to "지출 ${monthExpense.won()} / 예산 ${budget.won()} (${(monthExpense - budget).won()} 초과)"
        } else {
            "이번 달 예산의 $percent%를 썼어요" to "남은 예산 ${(budget - monthExpense).won()}"
        }
        notify(context, level, title, text)
    }

    private fun notify(context: Context, id: Int, title: String, text: String) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) return
        createChannel(context)
        val open = PendingIntent.getActivity(
            context, 0, Intent(context, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_budget)
            .setContentTitle(title)
            .setContentText(text)
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
        NotificationManagerCompat.from(context).notify(id, notification)
    }
}
