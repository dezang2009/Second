package com.moneymoa.data

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.Query
import com.moneymoa.parser.TxType
import kotlinx.coroutines.flow.Flow

@Dao
interface TransactionDao {
    @Query("SELECT * FROM transactions WHERE timestamp >= :from AND timestamp < :to ORDER BY timestamp DESC")
    fun observeBetween(from: Long, to: Long): Flow<List<Transaction>>

    @Query(
        "SELECT * FROM transactions WHERE type = :type AND amount = :amount " +
            "AND timestamp BETWEEN :from AND :to"
    )
    suspend fun findSimilar(type: TxType, amount: Long, from: Long, to: Long): List<Transaction>

    @Insert
    suspend fun insert(tx: Transaction): Long

    @Delete
    suspend fun delete(tx: Transaction)
}
