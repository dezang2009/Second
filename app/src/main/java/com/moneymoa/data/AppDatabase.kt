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
import com.moneymoa.parser.MerchantName
import com.moneymoa.parser.TransactionParser
import com.moneymoa.parser.TxType

class Converters {
    @TypeConverter fun fromType(type: TxType): String = type.name
    @TypeConverter fun toType(value: String): TxType = TxType.valueOf(value)
    @TypeConverter fun fromCategory(c: Category): String = c.name
    @TypeConverter fun toCategory(value: String): Category =
        Category.entries.firstOrNull { it.name == value } ?: Category.ETC
}

@Database(entities = [Transaction::class, CategoryRule::class, NameRule::class], version = 3, exportSchema = false)
@TypeConverters(Converters::class)
abstract class AppDatabase : RoomDatabase() {
    abstract fun transactions(): TransactionDao

    companion object {
        @Volatile private var instance: AppDatabase? = null

        fun get(context: Context): AppDatabase = instance ?: synchronized(this) {
            instance ?: Room.databaseBuilder(context.applicationContext, AppDatabase::class.java, "moneymoa.db")
                .addMigrations(MIGRATION_1_2, MIGRATION_2_3)
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
    
        /** 사용자 이름 규칙 표를 만들고, 이미 저장된 거래 이름을 핵심만 남게 다시 정리한다. */
        val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    "CREATE TABLE IF NOT EXISTS name_rules " +
                        "(original TEXT NOT NULL, name TEXT NOT NULL, PRIMARY KEY(original))"
                )
                db.query("SELECT id, type, description, rawText, sourcePackage, category FROM transactions").use { c ->
                    while (c.moveToNext()) {
                        val type = TxType.valueOf(c.getString(1))
                        val old = c.getString(2)
                        val raw = if (c.isNull(3)) null else c.getString(3)
                        val pkg = if (c.isNull(4)) null else c.getString(4)
                        val name = raw?.let { TransactionParser.parse(it, pkg)?.description }
                            ?: MerchantName.clean(old) ?: old
                        val values = ContentValues().apply {
                            put("description", name)
                            if (c.getString(5) == Category.ETC.name) {
                                put("category", Categorizer.categorize(type, name, raw).name)
                            }
                        }
                        db.update("transactions", SQLiteDatabase.CONFLICT_NONE, values, "id = ?", arrayOf(c.getLong(0)))
                    }
                }
                // 예전 이름으로 저장된 카테고리 규칙도 새 이름으로 옮긴다.
                val rules = mutableListOf<Pair<String, String>>()
                db.query("SELECT keyword, category FROM category_rules").use { c ->
                    while (c.moveToNext()) rules += c.getString(0) to c.getString(1)
                }
                rules.forEach { (keyword, category) ->
                    val cleaned = MerchantName.clean(keyword) ?: return@forEach
                    db.insert(
                        "category_rules", SQLiteDatabase.CONFLICT_REPLACE,
                        ContentValues().apply { put("keyword", cleaned); put("category", category) },
                    )
                }
            }
        }
    }
}
