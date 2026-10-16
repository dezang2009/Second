package com.moneymoa.data

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.time.YearMonth

/** 월 예산과 예산 알림 설정. 화면과 알림 서비스가 같은 인스턴스를 쓴다. */
class AppSettings private constructor(context: Context) {
    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences("settings", Context.MODE_PRIVATE)

    private val _budget = MutableStateFlow(prefs.getLong(KEY_BUDGET, 0))
    /** 0이면 예산 없음 */
    val budget: StateFlow<Long> = _budget.asStateFlow()

    private val _alertsEnabled = MutableStateFlow(prefs.getBoolean(KEY_ALERTS, true))
    val alertsEnabled: StateFlow<Boolean> = _alertsEnabled.asStateFlow()

    fun setBudget(value: Long) {
        prefs.edit().putLong(KEY_BUDGET, value).remove(notifiedKey(YearMonth.now())).apply()
        _budget.value = value
    }

    fun setAlertsEnabled(enabled: Boolean) {
        prefs.edit().putBoolean(KEY_ALERTS, enabled).apply()
        _alertsEnabled.value = enabled
    }

    /** 이번 달에 이미 보낸 가장 높은 알림 단계(%) */
    fun notifiedLevel(month: YearMonth) = prefs.getInt(notifiedKey(month), 0)

    fun setNotifiedLevel(month: YearMonth, level: Int) =
        prefs.edit().putInt(notifiedKey(month), level).apply()

    private fun notifiedKey(month: YearMonth) = "budget_notified_$month"

    companion object {
        private const val KEY_BUDGET = "monthly_budget"
        private const val KEY_ALERTS = "budget_alerts"

        @Volatile private var instance: AppSettings? = null
        fun get(context: Context) = instance ?: synchronized(this) {
            instance ?: AppSettings(context).also { instance = it }
        }
    }
}
