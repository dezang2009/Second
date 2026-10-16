package com.moneymoa.ui

import android.app.Application
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.moneymoa.data.Backup
import com.moneymoa.data.InstitutionKind
import com.moneymoa.data.MissedNotification
import com.moneymoa.data.Transaction
import com.moneymoa.data.TransactionRepository
import com.moneymoa.data.institutionKind
import com.moneymoa.data.totals
import com.moneymoa.parser.Categorizer
import com.moneymoa.parser.Category
import com.moneymoa.parser.MerchantName
import com.moneymoa.parser.TxType
import java.time.YearMonth
import java.time.ZoneId
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class MonthData(
    val month: YearMonth,
    val transactions: List<Transaction> = emptyList(),
) {
    val totals by lazy { transactions.totals() }

    /** 카테고리별 합계. 합계 제외 거래는 빼고, 지출에는 저축을 넣지 않는다. */
    fun byCategory(type: TxType): List<Pair<Category, Long>> = transactions
        .filter { it.type == type && !it.excluded && !it.isSaving }
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

    val missed: StateFlow<List<MissedNotification>> = repository.observeMissed()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    private val _messages = MutableSharedFlow<String>(extraBufferCapacity = 4)
    /** 화면 아래에 잠깐 보여 줄 안내 문구 */
    val messages: SharedFlow<String> = _messages.asSharedFlow()

    fun add(
        type: TxType,
        amount: Long,
        description: String,
        institution: String,
        category: Category?,
        timestamp: Long = System.currentTimeMillis(),
        fromMissed: MissedNotification? = null,
    ) = viewModelScope.launch {
            val desc = MerchantName.clean(description) ?: description.ifBlank { if (type == TxType.INCOME) "수입" else "지출" }
            repository.add(
                Transaction(
                    timestamp = timestamp,
                    type = type,
                    amount = amount,
                    institution = institution.ifBlank { "직접 입력" },
                    description = desc,
                    category = category ?: repository.categorize(type, desc, fromMissed?.text),
                    excluded = Categorizer.isExcludedByDefault(type, desc, fromMissed?.text),
                    rawText = fromMissed?.text,
                    sourcePackage = fromMissed?.sourcePackage,
                )
            )
            fromMissed?.let { repository.deleteMissed(it.id) }
        }

    fun deleteMissed(item: MissedNotification) = viewModelScope.launch { repository.deleteMissed(item.id) }

    fun exportCsv(uri: Uri) = writeTo(uri, "엑셀 파일로 내보냈어요") { Backup.toCsv(repository.allTransactions()) }

    fun exportBackup(uri: Uri) = writeTo(uri, "백업 파일을 만들었어요") { repository.exportBackup() }

    fun restoreBackup(uri: Uri) = viewModelScope.launch {
        val message = try {
            val json = withContext(Dispatchers.IO) {
                getApplication<Application>().contentResolver.openInputStream(uri)?.use { it.readBytes().decodeToString() }
            } ?: error("파일을 열 수 없어요.")
            "거래 ${repository.restoreBackup(json)}건을 복원했어요"
        } catch (e: Backup.InvalidBackupException) {
            e.message.orEmpty()
        } catch (e: Exception) {
            "복원하지 못했어요: ${e.message}"
        }
        _messages.emit(message)
    }

    private fun writeTo(uri: Uri, success: String, content: suspend () -> String) = viewModelScope.launch {
        val message = try {
            val text = content()
            withContext(Dispatchers.IO) {
                getApplication<Application>().contentResolver.openOutputStream(uri, "wt")?.use { it.write(text.toByteArray()) }
                    ?: error("파일을 만들 수 없어요.")
            }
            success
        } catch (e: Exception) {
            "저장하지 못했어요: ${e.message}"
        }
        _messages.emit(message)
    }

    fun edit(tx: Transaction, name: String, category: Category, excluded: Boolean, remember: Boolean) =
        viewModelScope.launch { repository.edit(tx, name, category, excluded, remember) }

    fun delete(tx: Transaction) = viewModelScope.launch { repository.delete(tx) }
}
