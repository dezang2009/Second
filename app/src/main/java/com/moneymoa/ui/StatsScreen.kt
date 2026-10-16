package com.moneymoa.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.moneymoa.parser.Category
import com.moneymoa.parser.TxType

@Composable
fun StatsScreen(
    data: MonthData,
    onPrevMonth: () -> Unit,
    onNextMonth: () -> Unit,
    onCategoryClick: (Category) -> Unit,
) {
    var type by rememberSaveable { mutableStateOf(TxType.EXPENSE) }
    val rows = data.byCategory(type)
    val total = rows.sumOf { it.second }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 32.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item { MonthHeader(data.month, onPrevMonth, onNextMonth) }
        item {
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                listOf(TxType.EXPENSE to "지출", TxType.INCOME to "수입").forEachIndexed { i, (t, label) ->
                    SegmentedButton(
                        selected = type == t,
                        onClick = { type = t },
                        shape = SegmentedButtonDefaults.itemShape(i, 2),
                    ) { Text(label) }
                }
            }
        }
        item {
            Column(Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
                Text(
                    "${data.month.monthValue}월 ${if (type == TxType.EXPENSE) "지출" else "수입"}",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(total.won(), fontSize = 30.sp, fontWeight = FontWeight.ExtraBold)
            }
        }
        item {
            Card(Modifier.fillMaxWidth()) {
                if (rows.isEmpty()) {
                    Text(
                        "이 달의 ${if (type == TxType.EXPENSE) "지출" else "수입"}이 없어요.",
                        modifier = Modifier.fillMaxWidth().padding(32.dp),
                        textAlign = TextAlign.Center,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                } else {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                        val max = rows.first().second
                        rows.forEach { (category, amount) ->
                            CategoryBar(category, amount, total, max) { onCategoryClick(category) }
                        }
                    }
                }
            }
        }
        if (rows.isNotEmpty()) {
            item {
                Text(
                    "카테고리를 누르면 해당 내역을 볼 수 있어요.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

/** 한 가지 색의 가로 막대. 길이는 가장 큰 카테고리 대비, 라벨은 전체 대비 비율. */
@Composable
private fun CategoryBar(category: Category, amount: Long, total: Long, max: Long, onClick: () -> Unit) {
    val share = if (total > 0) amount * 100.0 / total else 0.0
    val shareLabel = if (share in 0.0..<1.0) "1% 미만" else "%.0f%%".format(share)
    Column(
        Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .semantics { contentDescription = "${category.label} ${amount.won()}, $shareLabel" },
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            CategoryBadge(category, 28)
            Spacer(Modifier.width(10.dp))
            Text(category.label, Modifier.weight(1f), fontWeight = FontWeight.Medium)
            Text(
                shareLabel,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.width(10.dp))
            Text(amount.won(), fontWeight = FontWeight.Bold)
        }
        Spacer(Modifier.height(6.dp))
        Box(
            Modifier
                .fillMaxWidth()
                .height(8.dp)
                .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(4.dp)),
        ) {
            Box(
                Modifier
                    .fillMaxWidth((amount.toFloat() / max).coerceIn(0.02f, 1f))
                    .fillMaxHeight()
                    .background(MaterialTheme.colorScheme.primary, RoundedCornerShape(4.dp)),
            )
        }
    }
}
