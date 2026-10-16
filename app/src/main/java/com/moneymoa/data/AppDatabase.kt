package com.moneymoa.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.TypeConverter
import androidx.room.TypeConverters
import com.moneymoa.parser.TxType

class Converters {
    @TypeConverter fun fromType(type: TxType): String = type.name
    @TypeConverter fun toType(value: String): TxType = TxType.valueOf(value)
}

@Database(entities = [Transaction::class], version = 1, exportSchema = false)
@TypeConverters(Converters::class)
abstract class AppDatabase : RoomDatabase() {
    abstract fun transactions(): TransactionDao

    companion object {
        @Volatile private var instance: AppDatabase? = null

        fun get(context: Context): AppDatabase = instance ?: synchronized(this) {
            instance ?: Room.databaseBuilder(context.applicationContext, AppDatabase::class.java, "moneymoa.db")
                .build().also { instance = it }
        }
    }
}
