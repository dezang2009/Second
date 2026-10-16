package com.moneymoa.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.moneymoa.data.Transaction
import com.moneymoa.data.TransactionRepository
import com.moneymoa.parser.TxType
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.time.YearMonth
import java.time.ZoneId

data class MonthState(
    val month: YearMonth,
    val transactions: List<Transaction> = emptyList(),
) {
    val income get() = transactions.filter { it.type == TxType.INCOME }.sumOf { it.amount }
    val expense get() = transactions.filter { it.type == TxType.EXPENSE }.sumOf { it.amount }
}

@OptIn(ExperimentalCoroutinesApi::class)
class MainViewModel(app: Application) : AndroidViewModel(app) {

    private val repository = TransactionRepository.get(app)
    private val zone = ZoneId.systemDefault()
    private val month = MutableStateFlow(YearMonth.now())

    val state: StateFlow<MonthState> = month
        .flatMapLatest { m ->
            val from = m.atDay(1).atStartOfDay(zone).toInstant().toEpochMilli()
            val to = m.plusMonths(1).atDay(1).atStartOfDay(zone).toInstant().toEpochMilli()
            repository.observeBetween(from, to).map { MonthState(m, it) }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), MonthState(YearMonth.now()))

    fun previousMonth() { month.value = month.value.minusMonths(1) }
    fun nextMonth() { month.value = month.value.plusMonths(1) }

    fun add(type: TxType, amount: Long, description: String, institution: String) = viewModelScope.launch {
        repository.add(
            Transaction(
                timestamp = System.currentTimeMillis(),
                type = type,
                amount = amount,
                institution = institution.ifBlank { "직접 입력" },
                description = description.ifBlank { if (type == TxType.INCOME) "수입" else "지출" },
            )
        )
    }

    fun delete(tx: Transaction) = viewModelScope.launch { repository.delete(tx) }
}
