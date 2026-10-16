package com.moneymoa.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.moneymoa.data.Transaction
import com.moneymoa.parser.TxType

@Composable
fun HomeScreen(
    data: MonthData,
    hasNotificationAccess: Boolean,
    onPrevMonth: () -> Unit,
    onNextMonth: () -> Unit,
    onOpenSettings: () -> Unit,
    onSeeAll: () -> Unit,
    onSeeStats: () -> Unit,
    onTransactionClick: (Transaction) -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 96.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (!hasNotificationAccess) item { AccessBanner(onOpenSettings) }
        item { MonthHeader(data.month, onPrevMonth, onNextMonth) }
        item { SummaryCard(data) }

        val top = data.byCategory(TxType.EXPENSE).take(3)
        if (top.isNotEmpty()) {
            item { SectionTitle("많이 쓴 곳", "통계", onSeeStats) }
            item {
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
                        top.forEach { (category, amount) ->
                            Row(
                                Modifier.fillMaxWidth().clickable(onClick = onSeeStats).padding(vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                CategoryBadge(category, 32)
                                Spacer(Modifier.width(12.dp))
                                Text(category.label, Modifier.weight(1f))
                                Text(amount.won(), fontWeight = FontWeight.Medium)
                            }
                        }
                    }
                }
            }
        }

        item { SectionTitle("최근 거래", if (data.transactions.isNotEmpty()) "전체 보기" else null, onSeeAll) }
        if (data.transactions.isEmpty()) {
            item {
                Text(
                    "아직 거래가 없어요.\n은행·카드 알림이 오면 자동으로 여기에 쌓여요.",
                    modifier = Modifier.fillMaxWidth().padding(vertical = 32.dp),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                )
            }
        } else {
            items(data.transactions.take(5), key = { it.id }) { TransactionRow(it) { onTransactionClick(it) } }
        }
    }
}

@Composable
private fun AccessBanner(onOpenSettings: () -> Unit) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer),
        modifier = Modifier.fillMaxWidth().padding(top = 8.dp).clickable(onClick = onOpenSettings),
    ) {
        Column(Modifier.padding(16.dp)) {
            Text("⚠️ 알림 수집이 꺼져 있어요", fontWeight = FontWeight.Bold)
            Text(
                "눌러서 설정에서 켜 주세요. 켜야 입출금이 자동으로 모여요.",
                style = MaterialTheme.typography.bodySmall,
            )
        }
    }
}

@Composable
private fun SummaryCard(data: MonthData) {
    val net = data.income - data.expense
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(20.dp)) {
            Text("이번 달 합계", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(signedNet(net), fontSize = 28.sp, fontWeight = FontWeight.ExtraBold)
            Spacer(Modifier.height(12.dp))
            HorizontalDivider()
            Spacer(Modifier.height(12.dp))
            Row(Modifier.fillMaxWidth()) {
                SummaryCell("수입", data.income.won(), IncomeColor, Modifier.weight(1f))
                SummaryCell("지출", data.expense.won(), ExpenseColor, Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun SummaryCell(label: String, value: String, color: Color, modifier: Modifier) {
    Column(modifier) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, color = color, fontWeight = FontWeight.Bold, fontSize = 17.sp)
    }
}
