package com.moneymoa.data

import com.moneymoa.parser.Category
import com.moneymoa.parser.TxType
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import org.json.JSONArray
import org.json.JSONObject

/** 백업(JSON, 복원용)과 내보내기(CSV, 엑셀용) */
object Backup {
    private const val FORMAT = "moneymoa-backup"
    private const val VERSION = 1

    class Content(
        val transactions: List<Transaction>,
        val categoryRules: List<CategoryRule>,
        val nameRules: List<NameRule>,
    )

    class InvalidBackupException(message: String) : Exception(message)

    fun toJson(transactions: List<Transaction>, categoryRules: List<CategoryRule>, nameRules: List<NameRule>): String =
        JSONObject()
            .put("format", FORMAT)
            .put("version", VERSION)
            .put("exportedAt", System.currentTimeMillis())
            .put("transactions", JSONArray(transactions.map { it.toJson() }))
            .put("categoryRules", JSONArray(categoryRules.map { JSONObject().put("keyword", it.keyword).put("category", it.category.name) }))
            .put("nameRules", JSONArray(nameRules.map { JSONObject().put("original", it.original).put("name", it.name) }))
            .toString()

    fun fromJson(json: String): Content {
        val root = try { JSONObject(json) } catch (e: Exception) { throw InvalidBackupException("백업 파일을 읽을 수 없어요.") }
        if (root.optString("format") != FORMAT) throw InvalidBackupException("머니모아 백업 파일이 아니에요.")
        if (root.optInt("version") > VERSION) throw InvalidBackupException("더 새 버전 앱에서 만든 백업이에요. 앱을 업데이트해 주세요.")
        return Content(
            transactions = root.getJSONArray("transactions").objects().map { it.toTransaction() },
            categoryRules = root.optJSONArray("categoryRules")?.objects().orEmpty().mapNotNull { o ->
                category(o.getString("category"))?.let { CategoryRule(o.getString("keyword"), it) }
            },
            nameRules = root.optJSONArray("nameRules")?.objects().orEmpty().map {
                NameRule(it.getString("original"), it.getString("name"))
            },
        )
    }

    private fun Transaction.toJson() = JSONObject()
        .put("id", id)
        .put("timestamp", timestamp)
        .put("type", type.name)
        .put("amount", amount)
        .put("institution", institution)
        .put("description", description)
        .put("balance", balance ?: JSONObject.NULL)
        .put("rawText", rawText ?: JSONObject.NULL)
        .put("sourcePackage", sourcePackage ?: JSONObject.NULL)
        .put("category", category.name)
        .put("excluded", excluded)

    private fun JSONObject.toTransaction() = Transaction(
        id = getLong("id"),
        timestamp = getLong("timestamp"),
        type = TxType.valueOf(getString("type")),
        amount = getLong("amount"),
        institution = getString("institution"),
        description = getString("description"),
        balance = if (isNull("balance")) null else getLong("balance"),
        rawText = optStringOrNull("rawText"),
        sourcePackage = optStringOrNull("sourcePackage"),
        category = category(optString("category")) ?: Category.ETC,
        excluded = optBoolean("excluded", false),
    )

    private fun JSONObject.optStringOrNull(key: String) = if (isNull(key)) null else getString(key)
    private fun category(name: String) = Category.entries.firstOrNull { it.name == name }
    private fun JSONArray.objects() = (0 until length()).map { getJSONObject(it) }

    private val dateFormat = DateTimeFormatter.ofPattern("yyyy-MM-dd")
    private val timeFormat = DateTimeFormatter.ofPattern("HH:mm")

    /** 엑셀에서 한글이 깨지지 않도록 BOM을 붙인 CSV */
    fun toCsv(transactions: List<Transaction>, zone: ZoneId = ZoneId.systemDefault()): String = buildString {
        append('﻿')
        appendLine("날짜,시간,구분,금액,이름,카테고리,은행/카드,잔액,합계 제외")
        transactions.sortedBy { it.timestamp }.forEach { tx ->
            val at = Instant.ofEpochMilli(tx.timestamp).atZone(zone)
            val kind = when {
                tx.type == TxType.INCOME -> "수입"
                tx.isSaving -> "저축"
                else -> "지출"
            }
            listOf(
                at.format(dateFormat), at.format(timeFormat), kind, tx.amount.toString(), tx.description,
                tx.category.label, tx.institution, tx.balance?.toString().orEmpty(), if (tx.excluded) "예" else "",
            ).joinTo(this, ",") { csvField(it) }
            appendLine()
        }
    }

    private fun csvField(value: String): String =
        if (value.any { it == ',' || it == '"' || it == '\n' || it == '\r' }) "\"" + value.replace("\"", "\"\"") + "\"" else value
}
