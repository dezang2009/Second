package com.moneymoa.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.moneymoa.data.LogResult
import com.moneymoa.data.NotificationLog
import com.moneymoa.parser.TransactionParser
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

private val logTimeFormat = DateTimeFormatter.ofPattern("M/d (E) HH:mm", Locale.KOREAN)

/** 최근 받은 금융 알림과 처리 결과. 거래가 빠졌을 때 원인을 찾고, 원문을 복사해 보낼 수 있다. */
@Composable
fun LogScreen(items: List<NotificationLog>) {
    val context = LocalContext.current
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            Text(
                "최근 받은 은행·카드·문자 알림과 처리 결과예요 (최근 200개). " +
                    "거래가 빠졌는데 여기에 없다면 알림 자체가 오지 않은 것이고, " +
                    "'인식 못 함'이면 원문을 복사해서 보내 주시면 고칠 수 있어요.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (items.isEmpty()) {
            item {
                Text(
                    "아직 받은 금융 알림이 없어요.",
                    modifier = Modifier.fillMaxWidth().padding(vertical = 48.dp),
                    textAlign = TextAlign.Center,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        items(items, key = { it.id }) { log ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(start = 16.dp, top = 12.dp, end = 8.dp, bottom = 2.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        ResultBadge(log.result)
                        Text(
                            "  " + listOfNotNull(
                                TransactionParser.PACKAGE_INSTITUTIONS[log.packageName] ?: log.packageName.substringAfterLast('.'),
                                Instant.ofEpochMilli(log.timestamp).atZone(ZoneId.systemDefault()).format(logTimeFormat),
                            ).joinToString(" · "),
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Text(log.text, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 6.dp, end = 8.dp))
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                        TextButton(onClick = { copy(context, log) }) { Text("원문 복사") }
                    }
                }
            }
        }
    }
}

@Composable
private fun ResultBadge(result: LogResult) {
    val color = when (result) {
        LogResult.SAVED -> IncomeColor
        LogResult.DUPLICATE -> MaterialTheme.colorScheme.outline
        LogResult.MISSED -> ExpenseColor
        LogResult.IGNORED -> MaterialTheme.colorScheme.outline
    }
    Text(
        result.label,
        color = Color.White,
        fontWeight = FontWeight.Bold,
        style = MaterialTheme.typography.labelSmall,
        modifier = Modifier.background(color, RoundedCornerShape(6.dp)).padding(horizontal = 6.dp, vertical = 2.dp),
    )
}

private fun copy(context: Context, log: NotificationLog) {
    val text = "[${log.result.label}] ${log.packageName}\n${log.text}"
    context.getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("알림 원문", text))
    Toast.makeText(context, "복사했어요", Toast.LENGTH_SHORT).show()
}
