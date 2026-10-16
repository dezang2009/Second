package com.moneymoa.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.moneymoa.data.MissedNotification
import com.moneymoa.parser.TransactionParser
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

private val missedTimeFormat = DateTimeFormatter.ofPattern("M월 d일 (E) HH:mm", Locale.KOREAN)

/** 금융기관 알림인데 거래로 알아보지 못한 것들. 직접 추가하거나 지운다. 30일이 지나면 자동으로 지워진다. */
@Composable
fun MissedScreen(
    items: List<MissedNotification>,
    onAdd: (MissedNotification) -> Unit,
    onDelete: (MissedNotification) -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Text(
                "은행·카드에서 온 알림 중 금액은 있는데 입출금으로 알아보지 못한 것들이에요. " +
                    "거래가 맞으면 추가하고, 아니면 지워 주세요. 30일이 지나면 자동으로 지워져요.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (items.isEmpty()) {
            item {
                Text(
                    "확인할 알림이 없어요.",
                    modifier = Modifier.fillMaxWidth().padding(vertical = 48.dp),
                    textAlign = TextAlign.Center,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        items(items, key = { it.id }) { item ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(start = 16.dp, top = 14.dp, end = 8.dp, bottom = 4.dp)) {
                    Text(
                        listOfNotNull(
                            TransactionParser.findInstitution(item.text)
                                ?: TransactionParser.PACKAGE_INSTITUTIONS[item.sourcePackage],
                            Instant.ofEpochMilli(item.timestamp).atZone(ZoneId.systemDefault()).format(missedTimeFormat),
                        ).joinToString(" · "),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(item.text, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 4.dp, end = 8.dp))
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                        TextButton(onClick = { onDelete(item) }) { Text("지우기", color = MaterialTheme.colorScheme.error) }
                        TextButton(onClick = { onAdd(item) }) { Text("거래로 추가") }
                    }
                }
            }
        }
    }
}
