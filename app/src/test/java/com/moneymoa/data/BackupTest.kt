package com.moneymoa.data

import com.moneymoa.parser.Category
import com.moneymoa.parser.TxType
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class BackupTest {
    private val txs = listOf(
        Transaction(1, 1_700_000_000_000, TxType.EXPENSE, 4500, "신한카드", "스타벅스 강남역점", null, "원문, \"따옴표\"", "pkg", Category.CAFE),
        Transaction(2, 1_700_000_100_000, TxType.INCOME, 2_800_000, "KB국민은행", "급여", 3_000_000, null, null, Category.SALARY),
        Transaction(3, 1_700_000_200_000, TxType.EXPENSE, 300_000, "KB국민은행", "적금", null, null, null, Category.SAVINGS),
        Transaction(4, 1_700_000_300_000, TxType.EXPENSE, 100_000, "KB국민은행", "내 토스", null, null, null, Category.TRANSFER, excluded = true),
    )

    @Test fun totalsSeparateSavingsAndSkipExcluded() {
        val t = txs.totals()
        assertEquals(2_800_000, t.income)
        assertEquals(4_500, t.expense)
        assertEquals(300_000, t.savings)
        assertEquals(2_800_000 - 4_500 - 300_000L, t.left)
    }

    @Test fun jsonRoundTrip() {
        val json = Backup.toJson(txs, listOf(CategoryRule("스타벅스", Category.FOOD)), listOf(NameRule("메가커피", "단골카페")))
        val back = Backup.fromJson(json)
        assertEquals(txs, back.transactions)
        assertEquals(listOf(CategoryRule("스타벅스", Category.FOOD)), back.categoryRules)
        assertEquals(listOf(NameRule("메가커피", "단골카페")), back.nameRules)
    }

    @Test fun rejectsForeignFiles() {
        assertThrows(Backup.InvalidBackupException::class.java) { Backup.fromJson("""{"hello":1}""") }
        assertThrows(Backup.InvalidBackupException::class.java) { Backup.fromJson("not json") }
    }

    @Test fun csvForExcel() {
        val csv = Backup.toCsv(txs, ZoneId.of("Asia/Seoul"))
        val lines = csv.removePrefix("﻿").trim().lines()
        assertTrue(csv.startsWith("﻿"))
        assertEquals("날짜,시간,구분,금액,이름,카테고리,은행/카드,잔액,합계 제외", lines[0])
        assertEquals("2023-11-15,07:13,지출,4500,스타벅스 강남역점,카페·간식,신한카드,,", lines[1])
        assertEquals("2023-11-15,07:16,저축,300000,적금,저축·투자,KB국민은행,,", lines[3])
        assertEquals("2023-11-15,07:18,지출,100000,내 토스,이체,KB국민은행,,예", lines[4])
    }
}
