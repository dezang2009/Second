package com.moneymoa.data

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import com.moneymoa.parser.Category
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

    @Query("SELECT * FROM transactions ORDER BY timestamp")
    suspend fun all(): List<Transaction>

    @Query("SELECT * FROM transactions WHERE timestamp >= :from AND timestamp < :to")
    suspend fun between(from: Long, to: Long): List<Transaction>

    @Insert
    suspend fun insert(tx: Transaction): Long

    @Insert
    suspend fun insertAll(txs: List<Transaction>)

    @Query("DELETE FROM transactions")
    suspend fun deleteAllTransactions()

    @Query("DELETE FROM category_rules")
    suspend fun deleteAllRules()

    @Query("DELETE FROM name_rules")
    suspend fun deleteAllNameRules()

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun putRules(rules: List<CategoryRule>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun putNameRules(rules: List<NameRule>)

    @Query("UPDATE transactions SET excluded = 1 WHERE id IN (:ids)")
    suspend fun markExcluded(ids: List<Long>)

    @Query("UPDATE transactions SET excluded = 1, category = :category WHERE id = :id")
    suspend fun markExcluded(id: Long, category: Category)

    @Insert
    suspend fun insertLog(log: NotificationLog)

    @Query("DELETE FROM notification_log WHERE id NOT IN (SELECT id FROM notification_log ORDER BY id DESC LIMIT 200)")
    suspend fun trimLog()

    @Query("SELECT * FROM notification_log ORDER BY id DESC")
    fun observeLog(): Flow<List<NotificationLog>>

    @Query("SELECT COUNT(*) FROM notification_log WHERE packageName = :packageName AND text = :text")
    suspend fun logCount(packageName: String, text: String): Int

    @Query("SELECT * FROM missed_notifications ORDER BY timestamp DESC")
    fun observeMissed(): Flow<List<MissedNotification>>

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertMissed(missed: MissedNotification)

    @Query("SELECT * FROM missed_notifications")
    suspend fun allMissed(): List<MissedNotification>

    @Query("DELETE FROM missed_notifications WHERE id = :id")
    suspend fun deleteMissed(id: Long)

    @Query("DELETE FROM missed_notifications WHERE timestamp < :before")
    suspend fun deleteMissedBefore(before: Long)

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
