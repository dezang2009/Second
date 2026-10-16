package com.moneymoa.data

import android.content.Context
import com.moneymoa.parser.ParsedTransaction
import java.util.concurrent.TimeUnit

class TransactionRepository(private val dao: TransactionDao) {

    fun observeBetween(from: Long, to: Long) = dao.observeBetween(from, to)

    suspend fun add(tx: Transaction) = dao.insert(tx)

    suspend fun delete(tx: Transaction) = dao.delete(tx)

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

        dao.insert(
            Transaction(
                timestamp = postedAt,
                type = parsed.type,
                amount = parsed.amount,
                institution = parsed.institution ?: "기타",
                description = parsed.description,
                balance = parsed.balance,
                rawText = rawText,
                sourcePackage = sourcePackage,
            )
        )
        return true
    }

    companion object {
        fun get(context: Context) = TransactionRepository(AppDatabase.get(context).transactions())
    }
}
