package com.moneymoa.data

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
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
)
