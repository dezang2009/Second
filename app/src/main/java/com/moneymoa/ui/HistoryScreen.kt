package com.moneymoa.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.InputChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.moneymoa.data.Transaction
import com.moneymoa.parser.Category
import com.moneymoa.parser.TxType

@Composable
fun HistoryScreen(
    data: MonthData,
    banks: List<String>,
    filter: HistoryFilter,
    onPrevMonth: () -> Unit,
    onNextMonth: () -> Unit,
    onInstitution: (String?) -> Unit,
    onCategory: (Category?) -> Unit,
    onTransactionClick: (Transaction) -> Unit,
) {
    val filtered = data.transactions.filter(filter::matches)

    Column(Modifier.fillMaxSize()) {
        Column(Modifier.padding(horizontal = 16.dp)) {
            MonthHeader(data.month, onPrevMonth, onNextMonth)
        }
        LazyRow(
            contentPadding = PaddingValues(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            filter.category?.let { c ->
                item {
                    InputChip(
                        selected = true,
                        onClick = { onCategory(null) },
                        label = { Text("${c.emoji} ${c.label}") },
                        trailingIcon = { Icon(Icons.Filled.Close, "카테고리 필터 해제", Modifier.size(16.dp)) },
                    )
                }
            }
            item {
                FilterChip(selected = filter.institution == null, onClick = { onInstitution(null) }, label = { Text("전체") })
            }
            items(banks) { bank ->
                FilterChip(
                    selected = filter.institution == bank,
                    onClick = { onInstitution(if (filter.institution == bank) null else bank) },
                    label = { Text(bank) },
                )
            }
        }

        val income = filtered.filter { it.type == TxType.INCOME }.sumOf { it.amount }
        val expense = filtered.filter { it.type == TxType.EXPENSE }.sumOf { it.amount }
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text("${filtered.size}건", style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
            Text("수입 ${income.won()}", style = MaterialTheme.typography.bodySmall, color = IncomeColor, fontWeight = FontWeight.Medium)
            Text("지출 ${expense.won()}", style = MaterialTheme.typography.bodySmall, color = ExpenseColor, fontWeight = FontWeight.Medium)
        }

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 96.dp),
        ) {
            if (filtered.isEmpty()) {
                item {
                    Text(
                        if (data.transactions.isEmpty()) "이 달의 거래가 없어요." else "조건에 맞는 거래가 없어요.",
                        modifier = Modifier.fillMaxWidth().padding(vertical = 48.dp),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                    )
                }
            }
            filtered.groupBy { it.localDate() }.forEach { (day, txs) ->
                item(key = "day-$day") { DayHeader(day, txs) }
                items(txs, key = { it.id }) { TransactionRow(it) { onTransactionClick(it) } }
            }
        }
    }
}
