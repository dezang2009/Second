package com.moneymoa.data

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import com.moneymoa.parser.TxType
import kotlinx.coroutines.flow.Flow

@Dao
interface TransactionDao {
    @Query("SELECT * FROM transactions WHERE timestamp >= :from AND timestamp < :to ORDER BY timestamp DESC")
    fun observeBetween(from: Long, to: Long): Flow<List<Transaction>>

    @Query("SELECT DISTINCT institution FROM transactions ORDER BY institution")
    fun observeInstitutions(): Flow<List<String>>

    @Query(
        "SELECT * FROM transactions WHERE type = :type AND amount = :amount " +
            "AND timestamp BETWEEN :from AND :to"
    )
    suspend fun findSimilar(type: TxType, amount: Long, from: Long, to: Long): List<Transaction>

    @Insert
    suspend fun insert(tx: Transaction): Long

    @Update
    suspend fun update(tx: Transaction)

    @Delete
    suspend fun delete(tx: Transaction)

    @Query("SELECT * FROM category_rules")
    suspend fun rules(): List<CategoryRule>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun putRule(rule: CategoryRule)

    @Query("SELECT * FROM name_rules")
    suspend fun nameRules(): List<NameRule>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun putNameRule(rule: NameRule)

    @Query("UPDATE transactions SET description = :newName WHERE description = :oldName")
    suspend fun renameAll(oldName: String, newName: String)
}
