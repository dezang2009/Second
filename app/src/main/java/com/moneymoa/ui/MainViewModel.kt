package com.moneymoa.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.moneymoa.data.InstitutionKind
import com.moneymoa.data.Transaction
import com.moneymoa.data.TransactionRepository
import com.moneymoa.data.institutionKind
import com.moneymoa.parser.Category
import com.moneymoa.parser.MerchantName
import com.moneymoa.parser.TxType
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.time.YearMonth
import java.time.ZoneId

data class MonthData(
    val month: YearMonth,
    val transactions: List<Transaction> = emptyList(),
) {
    val income get() = transactions.filter { it.type == TxType.INCOME }.sumOf { it.amount }
    val expense get() = transactions.filter { it.type == TxType.EXPENSE }.sumOf { it.amount }

    fun byCategory(type: TxType): List<Pair<Category, Long>> = transactions
        .filter { it.type == type }
        .groupBy { it.category }
        .map { (c, txs) -> c to txs.sumOf { it.amount } }
        .sortedByDescending { it.second }
}

/** 내역 탭 필터. institution은 은행 이름, null이면 전체 */
data class HistoryFilter(val institution: String? = null, val category: Category? = null) {
    fun matches(tx: Transaction) =
        (institution == null || tx.institution == institution) && (category == null || tx.category == category)
}

@OptIn(ExperimentalCoroutinesApi::class)
class MainViewModel(app: Application) : AndroidViewModel(app) {

    private val repository = TransactionRepository.get(app)
    private val zone = ZoneId.systemDefault()

    private val _month = MutableStateFlow(YearMonth.now())

    val monthData: StateFlow<MonthData> = _month
        .flatMapLatest { m ->
            val from = m.atDay(1).atStartOfDay(zone).toInstant().toEpochMilli()
            val to = m.plusMonths(1).atDay(1).atStartOfDay(zone).toInstant().toEpochMilli()
            repository.observeBetween(from, to).map { MonthData(m, it) }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), MonthData(YearMonth.now()))

    /** 필터 칩에 보여 줄 은행 목록 (카드·간편결제 제외) */
    val banks: StateFlow<List<String>> = repository.observeInstitutions()
        .map { names -> names.filter { institutionKind(it) == InstitutionKind.BANK } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    private val _filter = MutableStateFlow(HistoryFilter())
    val filter: StateFlow<HistoryFilter> = _filter.asStateFlow()

    fun previousMonth() { _month.value = _month.value.minusMonths(1) }
    fun nextMonth() { _month.value = _month.value.plusMonths(1) }

    fun setInstitutionFilter(name: String?) { _filter.value = _filter.value.copy(institution = name) }
    fun setCategoryFilter(category: Category?) { _filter.value = _filter.value.copy(category = category) }

    fun add(type: TxType, amount: Long, description: String, institution: String, category: Category?) =
        viewModelScope.launch {
            val desc = MerchantName.clean(description) ?: description.ifBlank { if (type == TxType.INCOME) "수입" else "지출" }
            repository.add(
                Transaction(
                    timestamp = System.currentTimeMillis(),
                    type = type,
                    amount = amount,
                    institution = institution.ifBlank { "직접 입력" },
                    description = desc,
                    category = category ?: repository.categorize(type, desc, null),
                )
            )
        }

    fun edit(tx: Transaction, name: String, category: Category, remember: Boolean) =
        viewModelScope.launch { repository.edit(tx, name, category, remember) }

    fun delete(tx: Transaction) = viewModelScope.launch { repository.delete(tx) }
}
