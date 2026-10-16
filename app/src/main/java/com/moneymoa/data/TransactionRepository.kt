package com.moneymoa.data

import android.content.Context
import androidx.room.withTransaction
import com.moneymoa.parser.Categorizer
import com.moneymoa.parser.Category
import com.moneymoa.parser.MerchantName
import com.moneymoa.parser.ParsedTransaction
import com.moneymoa.parser.TxType
import com.moneymoa.widget.MoneyWidget
import java.util.concurrent.TimeUnit
import kotlin.math.abs

class TransactionRepository private constructor(
    private val context: Context,
    private val db: AppDatabase,
) {
    private val dao = db.transactions()

    fun observeBetween(from: Long, to: Long) = dao.observeBetween(from, to)

    fun observeInstitutions() = dao.observeInstitutions()

    fun observeMissed() = dao.observeMissed()

    suspend fun categorize(type: TxType, description: String, rawText: String?): Category =
        Categorizer.categorize(type, description, rawText, dao.rules().associate { it.keyword to it.category })

    suspend fun add(tx: Transaction) {
        val id = dao.insert(tx)
        linkOwnTransfer(tx.copy(id = id))
        MoneyWidget.refresh(context)
    }

    suspend fun delete(tx: Transaction) {
        dao.delete(tx)
        MoneyWidget.refresh(context)
    }

    /**
     * 이름·카테고리·합계 제외 여부를 바꾼다. remember면 같은 이름의 기존 거래도 함께 바꾸고,
     * 앞으로 같은 이름으로 들어오는 거래에도 적용한다.
     */
    suspend fun edit(tx: Transaction, name: String, category: Category, excluded: Boolean, remember: Boolean) {
        val newName = name.trim().ifBlank { tx.description }
        dao.update(tx.copy(description = newName, category = category, excluded = excluded))
        if (remember) {
            if (newName != tx.description) {
                dao.putNameRule(NameRule(tx.description, newName))
                dao.renameAll(tx.description, newName)
            }
            dao.putRule(CategoryRule(MerchantName.brandOf(newName), category))
        }
        MoneyWidget.refresh(context)
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
                excluded = Categorizer.isExcludedByDefault(parsed.type, name, rawText),
            )
        )
        return true
    }

    /**
     * 같은 금액이 한 계좌에서 나가고 다른 계좌로 10분 안에 들어오면 내 계좌끼리 옮긴 돈으로 보고 합계에서 뺀다.
     * 적금 납입(저축)이 짝이면 저축 기록은 남기고 들어온 쪽만 뺀다. 카드 거래와 환불은 짝으로 보지 않는다.
     */
    private suspend fun linkOwnTransfer(tx: Transaction) {
        if (tx.excluded || !canPair(tx)) return
        val window = TimeUnit.MINUTES.toMillis(10)
        val oppositeType = if (tx.type == TxType.INCOME) TxType.EXPENSE else TxType.INCOME
        val other = dao.findSimilar(oppositeType, tx.amount, tx.timestamp - window, tx.timestamp + window)
            .filter { !it.excluded && it.id != tx.id && canPair(it) }
            .minByOrNull { abs(it.timestamp - tx.timestamp) } ?: return

        val (outgoing, incoming) = if (tx.type == TxType.EXPENSE) tx to other else other to tx
        if (outgoing.isSaving) {
            dao.markExcluded(listOf(incoming.id))
        } else {
            dao.markExcluded(outgoing.id, Category.TRANSFER)
            dao.markExcluded(listOf(incoming.id))
        }
    }

    private fun canPair(tx: Transaction) =
        institutionKind(tx.institution) != InstitutionKind.CARD && tx.category != Category.REFUND

    // ---- 인식 못 한 알림 ----

    suspend fun addMissed(text: String, sourcePackage: String, postedAt: Long) {
        dao.deleteMissedBefore(postedAt - TimeUnit.DAYS.toMillis(30))
        dao.insertMissed(MissedNotification(timestamp = postedAt, text = text, sourcePackage = sourcePackage))
    }

    suspend fun deleteMissed(id: Long) = dao.deleteMissed(id)

    // ---- 백업 ----

    suspend fun allTransactions() = dao.all()

    suspend fun exportBackup(): String =
        Backup.toJson(dao.all(), dao.rules(), dao.nameRules())

    /** 백업 파일로 지금 데이터를 모두 바꾼다. 들어온 거래 수를 돌려준다. */
    suspend fun restoreBackup(json: String): Int {
        val backup = Backup.fromJson(json)
        db.withTransaction {
            dao.deleteAllTransactions()
            dao.deleteAllRules()
            dao.deleteAllNameRules()
            dao.insertAll(backup.transactions)
            dao.putRules(backup.categoryRules)
            dao.putNameRules(backup.nameRules)
        }
        MoneyWidget.refresh(context)
        return backup.transactions.size
    }

    companion object {
        @Volatile private var instance: TransactionRepository? = null
        fun get(context: Context) = instance ?: synchronized(this) {
            instance ?: TransactionRepository(context.applicationContext, AppDatabase.get(context))
                .also { instance = it }
        }
    }
}
