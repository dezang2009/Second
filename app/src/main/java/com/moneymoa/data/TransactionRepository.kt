package com.moneymoa.data

import android.content.Context
import com.moneymoa.parser.Categorizer
import com.moneymoa.parser.Category
import com.moneymoa.parser.MerchantName
import com.moneymoa.parser.ParsedTransaction
import com.moneymoa.parser.TxType
import java.util.concurrent.TimeUnit

class TransactionRepository private constructor(
    private val context: Context,
    private val dao: TransactionDao,
) {

    fun observeBetween(from: Long, to: Long) = dao.observeBetween(from, to)

    fun observeInstitutions() = dao.observeInstitutions()

    suspend fun categorize(type: TxType, description: String, rawText: String?): Category =
        Categorizer.categorize(type, description, rawText, dao.rules().associate { it.keyword to it.category })

    suspend fun add(tx: Transaction) = dao.insert(tx)

    suspend fun delete(tx: Transaction) = dao.delete(tx)

    /**
     * 이름·카테고리를 바꾼다. remember면 같은 이름의 기존 거래도 함께 바꾸고,
     * 앞으로 같은 이름으로 들어오는 거래에도 적용한다.
     */
    suspend fun edit(tx: Transaction, name: String, category: Category, remember: Boolean) {
        val newName = name.trim().ifBlank { tx.description }
        dao.update(tx.copy(description = newName, category = category))
        if (!remember) return
        if (newName != tx.description) {
            dao.putNameRule(NameRule(tx.description, newName))
            dao.renameAll(tx.description, newName)
        }
        dao.putRule(CategoryRule(MerchantName.brandOf(newName), category))
    }

    /** 자동으로 정한 이름에 사용자가 바꾼 이름이 있으면 그것을 쓴다. */
    private suspend fun resolveName(autoName: String): String {
        val rules = dao.nameRules().associate { it.original to it.name }
        var name = autoName
        repeat(3) { name = rules[name] ?: return name } // 여러 번 바꾼 경우를 따라가되 순환은 막는다
        return name
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

        val name = resolveName(parsed.description)
        add(
            Transaction(
                timestamp = postedAt,
                type = parsed.type,
                amount = parsed.amount,
                institution = parsed.institution ?: "기타",
                description = name,
                balance = parsed.balance,
                rawText = rawText,
                sourcePackage = sourcePackage,
                category = categorize(parsed.type, name, rawText),
            )
        )
        return true
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
