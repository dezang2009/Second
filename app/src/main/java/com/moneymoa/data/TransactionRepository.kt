package com.moneymoa.data

import android.content.Context
import com.moneymoa.parser.Categorizer
import com.moneymoa.parser.Category
import com.moneymoa.parser.ParsedTransaction
import com.moneymoa.parser.TxType
import com.moneymoa.service.BudgetNotifier
import java.time.YearMonth
import java.time.ZoneId
import java.util.concurrent.TimeUnit

class TransactionRepository private constructor(
    private val context: Context,
    private val dao: TransactionDao,
) {

    fun observeBetween(from: Long, to: Long) = dao.observeBetween(from, to)

    fun observeInstitutions() = dao.observeInstitutions()

    suspend fun categorize(type: TxType, description: String, rawText: String?): Category =
        Categorizer.categorize(type, description, rawText, dao.rules().associate { it.keyword to it.category })

    suspend fun add(tx: Transaction) {
        dao.insert(tx)
        afterChange(tx)
    }

    suspend fun delete(tx: Transaction) = dao.delete(tx)

    /** 카테고리를 바꾸고, remember면 같은 내용의 다음 거래에도 적용한다. */
    suspend fun changeCategory(tx: Transaction, category: Category, remember: Boolean) {
        dao.update(tx.copy(category = category))
        if (remember && tx.description.isNotBlank()) dao.putRule(CategoryRule(tx.description.trim(), category))
    }

    /**
     * 알림에서 뽑은 거래를 저장한다. 같은 거래가 은행 앱 푸시와 문자로 두 번 오거나,
     * 알림이 갱신돼 다시 들어오는 경우는 건너뛴다. 저장했으면 true.
     */
    suspend fun addFromNotification(
        parsed: ParsedTransaction,
        rawText: String,
        sourcePackage: String,
        postedAt: Long,
    ): Boolean {
        val window = TimeUnit.MINUTES.toMillis(3)
        val similar = dao.findSimilar(parsed.type, parsed.amount, postedAt - window, postedAt + window)
        val duplicate = similar.any { old ->
            when {
                old.rawText == rawText -> true // 같은 알림이 다시 올라옴
                old.sourcePackage == sourcePackage -> false // 같은 앱의 다른 알림 = 별개 거래
                old.balance != null && parsed.balance != null -> old.balance == parsed.balance
                // 체크카드 승인 + 계좌 출금처럼 다른 곳에서 같은 금액이 바로 오면 같은 거래로 본다.
                else -> true
            }
        }
        if (duplicate) return false

        add(
            Transaction(
                timestamp = postedAt,
                type = parsed.type,
                amount = parsed.amount,
                institution = parsed.institution ?: "기타",
                description = parsed.description,
                balance = parsed.balance,
                rawText = rawText,
                sourcePackage = sourcePackage,
                category = categorize(parsed.type, parsed.description, rawText),
            )
        )
        return true
    }

    private suspend fun afterChange(tx: Transaction) {
        if (tx.type != TxType.EXPENSE) return
        val zone = ZoneId.systemDefault()
        val month = YearMonth.from(java.time.Instant.ofEpochMilli(tx.timestamp).atZone(zone))
        if (month != YearMonth.now()) return
        val from = month.atDay(1).atStartOfDay(zone).toInstant().toEpochMilli()
        val to = month.plusMonths(1).atDay(1).atStartOfDay(zone).toInstant().toEpochMilli()
        BudgetNotifier.check(context, dao.sumBetween(TxType.EXPENSE, from, to), month)
    }

    companion object {
        @Volatile private var instance: TransactionRepository? = null
        fun get(context: Context) = instance ?: synchronized(this) {
            instance ?: TransactionRepository(
                context.applicationContext,
                AppDatabase.get(context).transactions(),
            ).also { instance = it }
        }
    }
}
