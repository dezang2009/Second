package com.moneymoa.ui

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.isSystemInDarkTheme
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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.app.NotificationManagerCompat
import androidx.lifecycle.compose.LifecycleResumeEffect
import com.moneymoa.data.Transaction
import com.moneymoa.parser.TransactionParser
import com.moneymoa.parser.TxType
import java.text.NumberFormat
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

private val IncomeColor = Color(0xFF2F6BFF)
private val ExpenseColor = Color(0xFFE5484D)
private val won = NumberFormat.getInstance(Locale.KOREA)

private fun Long.won() = won.format(this) + "원"
private fun signed(type: TxType, amount: Long) = (if (type == TxType.INCOME) "+" else "-") + amount.won()

class MainActivity : ComponentActivity() {
    private val viewModel: MainViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent { MoneyMoaTheme { MainScreen(viewModel) } }
    }
}

@Composable
fun MoneyMoaTheme(content: @Composable () -> Unit) {
    val dark = isSystemInDarkTheme()
    val context = LocalContext.current
    val scheme = when {
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ->
            if (dark) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        dark -> darkColorScheme(primary = IncomeColor)
        else -> lightColorScheme(primary = IncomeColor)
    }
    MaterialTheme(colorScheme = scheme, content = content)
}

private fun Context.hasNotificationAccess() =
    NotificationManagerCompat.getEnabledListenerPackages(this).contains(packageName)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScreen(viewModel: MainViewModel) {
    val context = LocalContext.current
    val state by viewModel.state.collectAsState()
    var hasAccess by remember { mutableStateOf(context.hasNotificationAccess()) }
    var showAdd by remember { mutableStateOf(false) }
    var toDelete by remember { mutableStateOf<Transaction?>(null) }

    LifecycleResumeEffect(Unit) {
        hasAccess = context.hasNotificationAccess()
        onPauseOrDispose { }
    }

    Scaffold(
        topBar = { CenterAlignedTopAppBar(title = { Text("머니모아", fontWeight = FontWeight.Bold) }) },
        floatingActionButton = {
            FloatingActionButton(onClick = { showAdd = true }) {
                Icon(Icons.Filled.Add, contentDescription = "직접 추가")
            }
        },
    ) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 96.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (!hasAccess) item { PermissionCard() }
            item { MonthHeader(state, viewModel::previousMonth, viewModel::nextMonth) }
            item { SummaryCard(state) }

            if (state.transactions.isEmpty()) {
                item {
                    Text(
                        "아직 거래가 없어요.\n은행·카드 알림이 오면 자동으로 여기에 쌓여요.",
                        modifier = Modifier.fillMaxWidth().padding(vertical = 48.dp),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                    )
                }
            }

            val zone = ZoneId.systemDefault()
            val byDay = state.transactions.groupBy { Instant.ofEpochMilli(it.timestamp).atZone(zone).toLocalDate() }
            byDay.forEach { (day, txs) ->
                item(key = "day-$day") { DayHeader(day, txs) }
                items(txs, key = { it.id }) { tx -> TransactionRow(tx, onLongClick = { toDelete = tx }) }
            }
        }
    }

    if (showAdd) {
        AddTransactionDialog(
            onDismiss = { showAdd = false },
            onAdd = { type, amount, desc, inst ->
                viewModel.add(type, amount, desc, inst)
                showAdd = false
            },
        )
    }

    toDelete?.let { tx ->
        AlertDialog(
            onDismissRequest = { toDelete = null },
            title = { Text("거래 삭제") },
            text = { Text("${tx.description} ${signed(tx.type, tx.amount)} 내역을 삭제할까요?") },
            confirmButton = {
                TextButton(onClick = { viewModel.delete(tx); toDelete = null }) { Text("삭제") }
            },
            dismissButton = { TextButton(onClick = { toDelete = null }) { Text("취소") } },
        )
    }
}

@Composable
private fun PermissionCard() {
    val context = LocalContext.current
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("알림 접근 권한이 필요해요", fontWeight = FontWeight.Bold)
            Text(
                "은행·카드 앱 알림에서 입출금 내역을 읽어 자동으로 모아요. " +
                    "알림 내용은 휴대폰 밖으로 나가지 않아요.",
                style = MaterialTheme.typography.bodySmall,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TextButton(onClick = {
                    context.startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
                }) { Text("권한 켜기") }
                TextButton(onClick = {
                    context.startActivity(
                        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}"))
                    )
                }) { Text("켜지지 않나요?") }
            }
            Text(
                "스위치가 회색이면: 앱 정보 → 오른쪽 위 ⋮ → '제한된 설정 허용' 후 다시 켜 주세요.",
                style = MaterialTheme.typography.bodySmall,
            )
        }
    }
}

@Composable
private fun MonthHeader(state: MonthState, onPrev: () -> Unit, onNext: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        IconButton(onClick = onPrev) { Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, "이전 달") }
        Text(
            "${state.month.year}년 ${state.month.monthValue}월",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
        )
        IconButton(onClick = onNext) { Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, "다음 달") }
    }
}

@Composable
private fun SummaryCard(state: MonthState) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            SummaryLine("수입", state.income.won(), IncomeColor)
            SummaryLine("지출", state.expense.won(), ExpenseColor)
            HorizontalDivider()
            val net = state.income - state.expense
            SummaryLine(
                "합계",
                (if (net >= 0) "+" else "-") + kotlin.math.abs(net).won(),
                MaterialTheme.colorScheme.onSurface,
                big = true,
            )
        }
    }
}

@Composable
private fun SummaryLine(label: String, value: String, color: Color, big: Boolean = false) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, color = color, fontWeight = FontWeight.Bold, fontSize = if (big) 20.sp else 16.sp)
    }
}

private val dayFormat = DateTimeFormatter.ofPattern("M월 d일 (E)", Locale.KOREAN)
private val timeFormat = DateTimeFormatter.ofPattern("HH:mm")

@Composable
private fun DayHeader(day: LocalDate, txs: List<Transaction>) {
    val net = txs.sumOf { if (it.type == TxType.INCOME) it.amount else -it.amount }
    Row(
        modifier = Modifier.fillMaxWidth().padding(top = 16.dp, bottom = 2.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(day.format(dayFormat), style = MaterialTheme.typography.labelLarge)
        Text(
            (if (net >= 0) "+" else "-") + kotlin.math.abs(net).won(),
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun TransactionRow(tx: Transaction, onLongClick: () -> Unit) {
    val time = Instant.ofEpochMilli(tx.timestamp).atZone(ZoneId.systemDefault()).toLocalTime()
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .combinedClickable(onClick = {}, onLongClick = onLongClick)
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(tx.description, maxLines = 1, overflow = TextOverflow.Ellipsis, fontWeight = FontWeight.Medium)
            Text(
                "${tx.institution} · ${time.format(timeFormat)}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Spacer(Modifier.width(12.dp))
        Column(horizontalAlignment = Alignment.End) {
            Text(
                signed(tx.type, tx.amount),
                color = if (tx.type == TxType.INCOME) IncomeColor else ExpenseColor,
                fontWeight = FontWeight.Bold,
            )
            tx.balance?.let {
                Text(
                    "잔액 ${it.won()}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun AddTransactionDialog(
    onDismiss: () -> Unit,
    onAdd: (TxType, Long, String, String) -> Unit,
) {
    var type by remember { mutableStateOf(TxType.EXPENSE) }
    var amount by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var institution by remember { mutableStateOf("") }
    var pasted by remember { mutableStateOf("") }
    var parseError by remember { mutableStateOf(false) }
    val amountValue = amount.filter(Char::isDigit).toLongOrNull()

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("거래 추가") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = pasted,
                    onValueChange = { pasted = it; parseError = false },
                    label = { Text("은행 문자 붙여넣기 (선택)") },
                    minLines = 2,
                    modifier = Modifier.fillMaxWidth(),
                )
                TextButton(onClick = {
                    val p = TransactionParser.parse(pasted)
                    parseError = p == null
                    if (p != null) {
                        type = p.type
                        amount = p.amount.toString()
                        description = p.description
                        institution = p.institution.orEmpty()
                    }
                }, enabled = pasted.isNotBlank()) { Text("문자에서 채우기") }
                if (parseError) {
                    Text(
                        "입출금 문자를 인식하지 못했어요.",
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(selected = type == TxType.EXPENSE, onClick = { type = TxType.EXPENSE }, label = { Text("지출") })
                    FilterChip(selected = type == TxType.INCOME, onClick = { type = TxType.INCOME }, label = { Text("수입") })
                }
                OutlinedTextField(
                    value = amount,
                    onValueChange = { amount = it.filter(Char::isDigit) },
                    label = { Text("금액") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = description,
                    onValueChange = { description = it },
                    label = { Text("내용") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = institution,
                    onValueChange = { institution = it },
                    label = { Text("은행/카드 (선택)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(4.dp))
            }
        },
        confirmButton = {
            TextButton(
                onClick = { amountValue?.let { onAdd(type, it, description.trim(), institution.trim()) } },
                enabled = amountValue != null && amountValue > 0,
            ) { Text("추가") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("취소") } },
    )
}
