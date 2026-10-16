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
)

/** 사용자가 카테고리를 바꾸면 같은 내용의 다음 거래에도 적용한다. */
@Entity(tableName = "category_rules")
data class CategoryRule(
    @PrimaryKey val keyword: String,
    val category: Category,
)

enum class InstitutionKind { BANK, CARD, PAY, OTHER }

fun institutionKind(name: String): InstitutionKind = when {
    name.contains("카드") -> InstitutionKind.CARD
    name in setOf("카카오페이", "네이버페이", "토스") -> InstitutionKind.PAY
    name in setOf("직접 입력", "기타") -> InstitutionKind.OTHER
    else -> InstitutionKind.BANK
}
