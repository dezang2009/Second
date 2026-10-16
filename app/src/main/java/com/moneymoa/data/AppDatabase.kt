package com.moneymoa.data

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.TypeConverter
import androidx.room.TypeConverters
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import com.moneymoa.parser.Categorizer
import com.moneymoa.parser.Category
import com.moneymoa.parser.TxType

class Converters {
    @TypeConverter fun fromType(type: TxType): String = type.name
    @TypeConverter fun toType(value: String): TxType = TxType.valueOf(value)
    @TypeConverter fun fromCategory(c: Category): String = c.name
    @TypeConverter fun toCategory(value: String): Category =
        Category.entries.firstOrNull { it.name == value } ?: Category.ETC
}

@Database(entities = [Transaction::class, CategoryRule::class], version = 2, exportSchema = false)
@TypeConverters(Converters::class)
abstract class AppDatabase : RoomDatabase() {
    abstract fun transactions(): TransactionDao

    companion object {
        @Volatile private var instance: AppDatabase? = null

        fun get(context: Context): AppDatabase = instance ?: synchronized(this) {
            instance ?: Room.databaseBuilder(context.applicationContext, AppDatabase::class.java, "moneymoa.db")
                .addMigrations(MIGRATION_1_2)
                .build().also { instance = it }
        }

        /** 카테고리 칸을 추가하고, 이미 쌓인 거래도 자동 분류해 둔다. */
        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE transactions ADD COLUMN category TEXT NOT NULL DEFAULT 'ETC'")
                db.execSQL(
                    "CREATE TABLE IF NOT EXISTS category_rules " +
                        "(keyword TEXT NOT NULL, category TEXT NOT NULL, PRIMARY KEY(keyword))"
                )
                db.query("SELECT id, type, description, rawText FROM transactions").use { c ->
                    while (c.moveToNext()) {
                        val category = Categorizer.categorize(
                            TxType.valueOf(c.getString(1)),
                            c.getString(2),
                            if (c.isNull(3)) null else c.getString(3),
                        )
                        db.update(
                            "transactions", SQLiteDatabase.CONFLICT_NONE,
                            ContentValues().apply { put("category", category.name) },
                            "id = ?", arrayOf(c.getLong(0)),
                        )
                    }
                }
            }
        }
    }
}
