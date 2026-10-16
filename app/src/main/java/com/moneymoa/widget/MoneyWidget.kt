package com.moneymoa.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import com.moneymoa.R
import com.moneymoa.data.AppDatabase
import com.moneymoa.data.totals
import com.moneymoa.ui.MainActivity
import com.moneymoa.ui.won
import java.time.LocalDate
import java.time.YearMonth
import java.time.ZoneId
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/** 홈 화면 위젯(2×1): 오늘 쓴 돈, 이번 달 지출. 거래가 바뀔 때마다, 그리고 30분마다 갱신된다. */
class MoneyWidget : AppWidgetProvider() {

    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        val pending = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try { refresh(context) } finally { pending.finish() }
        }
    }

    companion object {
        suspend fun refresh(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(ComponentName(context, MoneyWidget::class.java))
            if (ids.isEmpty()) return

            val zone = ZoneId.systemDefault()
            val month = YearMonth.now()
            val monthStart = month.atDay(1).atStartOfDay(zone).toInstant().toEpochMilli()
            val todayStart = LocalDate.now().atStartOfDay(zone).toInstant().toEpochMilli()
            val nextMonth = month.plusMonths(1).atDay(1).atStartOfDay(zone).toInstant().toEpochMilli()
            val txs = AppDatabase.get(context).transactions().between(monthStart, nextMonth)
            val monthTotals = txs.totals()
            val todayTotals = txs.filter { it.timestamp >= todayStart }.totals()

            val open = PendingIntent.getActivity(
                context, 0, Intent(context, MainActivity::class.java),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
            val views = RemoteViews(context.packageName, R.layout.widget_money).apply {
                setTextViewText(R.id.widget_today, todayTotals.expense.won())
                setTextViewText(R.id.widget_month_label, "${month.monthValue}월")
                setTextViewText(R.id.widget_month_expense, monthTotals.expense.won())
                setOnClickPendingIntent(R.id.widget_root, open)
            }
            manager.updateAppWidget(ids, views)
        }
    }
}
