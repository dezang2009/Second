package com.moneymoa.data

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import com.moneymoa.parser.Category
import com.moneymoa.parser.TxType

@Entity(tableName = "transactions", indices = [Index("timestamp")])
data class Transaction(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val timestamp: Long,
    val type: TxType,
    val amount: Long,
    val institution: String,
    val description: String,
    val balance: Long? = null,
    /** 알림에서 온 경우 원문, 직접 입력이면 null */
    val rawText: String? = null,
    val sourcePackage: String? = null,
    @ColumnInfo(defaultValue = "ETC") val category: Category = Category.ETC,
    /** 합계에서 뺀다: 내 계좌끼리 이체, 카드대금 출금, 적금 만기 입금 등 */
    @ColumnInfo(defaultValue = "0") val excluded: Boolean = false,
) {
    val isSaving get() = type == TxType.EXPENSE && category == Category.SAVINGS
}

/** 금융기관이 보낸, 금액은 있는데 거래로 인식하지 못한 알림 */
@Entity(tableName = "missed_notifications", indices = [Index(value = ["text"], unique = true)])
data class MissedNotification(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val timestamp: Long,
    val text: String,
    val sourcePackage: String,
)

/** 받은 알림을 어떻게 처리했는지 기록한다. 놓친 거래를 찾을 때 쓴다. 최근 200개만 남긴다. */
@Entity(tableName = "notification_log", indices = [Index("timestamp")])
data class NotificationLog(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val timestamp: Long,
    val packageName: String,
    val text: String,
    val result: LogResult,
)

enum class LogResult(val label: String) {
    SAVED("저장됨"),
    DUPLICATE("중복이라 건너뜀"),
    MISSED("인식 못 함"),
    IGNORED("금융 알림 아님"),
}

data class Totals(val income: Long, val expense: Long, val savings: Long) {
    /** 수입에서 쓴 돈과 저축한 돈을 빼고 남은 돈 */
    val left get() = income - expense - savings
}

/** 합계 계산은 화면·위젯이 모두 이 함수를 쓴다. */
fun List<Transaction>.totals(): Totals {
    var income = 0L; var expense = 0L; var savings = 0L
    for (tx in this) {
        if (tx.excluded) continue
        when {
            tx.type == TxType.INCOME -> income += tx.amount
            tx.isSaving -> savings += tx.amount
            else -> expense += tx.amount
        }
    }
    return Totals(income, expense, savings)
}

/** 사용자가 카테고리를 바꾸면 같은 내용의 다음 거래에도 적용한다. */
@Entity(tableName = "category_rules")
data class CategoryRule(
    @PrimaryKey val keyword: String,
    val category: Category,
)

/** 사용자가 바꾼 거래 이름. original(자동으로 정한 이름)로 들어오면 name으로 바꾼다. */
@Entity(tableName = "name_rules")
data class NameRule(
    @PrimaryKey val original: String,
    val name: String,
)

enum class InstitutionKind { BANK, CARD, PAY, OTHER }

fun institutionKind(name: String): InstitutionKind = when {
    name.contains("카드") -> InstitutionKind.CARD
    name in setOf("카카오페이", "네이버페이", "토스") -> InstitutionKind.PAY
    name in setOf("직접 입력", "기타") -> InstitutionKind.OTHER
    else -> InstitutionKind.BANK
}
