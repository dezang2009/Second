package com.moneymoa.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.moneymoa.data.Transaction
import com.moneymoa.parser.Category
import com.moneymoa.parser.TransactionParser
import com.moneymoa.parser.TxType
import java.time.Instant
import java.time.LocalDate
import java.time.YearMonth
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

private val dayFormat = DateTimeFormatter.ofPattern("M월 d일 (E)", Locale.KOREAN)
private val timeFormat = DateTimeFormatter.ofPattern("HH:mm")
private val dateTimeFormat = DateTimeFormatter.ofPattern("yyyy.M.d (E) HH:mm", Locale.KOREAN)

fun Transaction.localDate(): LocalDate = Instant.ofEpochMilli(timestamp).atZone(ZoneId.systemDefault()).toLocalDate()

@Composable
fun MonthHeader(month: YearMonth, onPrev: () -> Unit, onNext: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        IconButton(onClick = onPrev) { Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, "이전 달") }
        Text("${month.year}년 ${month.monthValue}월", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        IconButton(onClick = onNext, enabled = month < YearMonth.now()) {
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, "다음 달")
        }
    }
}

@Composable
fun SectionTitle(text: String, action: String? = null, onAction: () -> Unit = {}) {
    Row(
        Modifier.fillMaxWidth().padding(top = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(text, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
        if (action != null) TextButton(onClick = onAction) { Text(action) }
    }
}

@Composable
fun DayHeader(day: LocalDate, txs: List<Transaction>) {
    val net = txs.sumOf { if (it.type == TxType.INCOME) it.amount else -it.amount }
    Row(
        modifier = Modifier.fillMaxWidth().padding(top = 16.dp, bottom = 2.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(day.format(dayFormat), style = MaterialTheme.typography.labelLarge)
        Text(signedNet(net), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
fun CategoryBadge(category: Category, size: Int = 40) {
    Box(
        Modifier.size(size.dp).background(MaterialTheme.colorScheme.secondaryContainer, CircleShape),
        contentAlignment = Alignment.Center,
    ) { Text(category.emoji, fontSize = (size * 0.45).sp) }
}

@Composable
fun TransactionRow(tx: Transaction, onClick: () -> Unit) {
    val time = Instant.ofEpochMilli(tx.timestamp).atZone(ZoneId.systemDefault()).toLocalTime()
    Row(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CategoryBadge(tx.category)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(tx.description, maxLines = 1, overflow = TextOverflow.Ellipsis, fontWeight = FontWeight.Medium)
            Text(
                "${tx.category.label} · ${tx.institution} · ${time.format(timeFormat)}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Spacer(Modifier.width(12.dp))
        Column(horizontalAlignment = Alignment.End) {
            Text(
                signed(tx.type, tx.amount),
                color = if (tx.type == TxType.INCOME) IncomeColor else MaterialTheme.colorScheme.onSurface,
                fontWeight = FontWeight.Bold,
            )
            tx.balance?.let {
                Text("잔액 ${it.won()}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun CategoryPicker(type: TxType, selected: Category?, onSelect: (Category) -> Unit) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Category.forType(type).forEach { c ->
            FilterChip(
                selected = c == selected,
                onClick = { onSelect(c) },
                label = { Text("${c.emoji} ${c.label}") },
            )
        }
    }
}

/** 거래를 눌렀을 때: 상세 보기, 이름·카테고리 변경, 삭제 */
@Composable
fun TransactionDetailDialog(
    tx: Transaction,
    onDismiss: () -> Unit,
    onSave: (name: String, category: Category, remember: Boolean) -> Unit,
    onDelete: () -> Unit,
) {
    var name by remember { mutableStateOf(tx.description) }
    var category by remember { mutableStateOf(tx.category) }
    var rememberRule by remember { mutableStateOf(true) }
    var confirmDelete by remember { mutableStateOf(false) }
    val nameChanged = name.isNotBlank() && name.trim() != tx.description
    val changed = nameChanged || category != tx.category

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(signed(tx.type, tx.amount), fontWeight = FontWeight.Bold) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    "${tx.institution} · ${Instant.ofEpochMilli(tx.timestamp).atZone(ZoneId.systemDefault()).format(dateTimeFormat)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it.take(30) },
                    label = { Text("이름") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Text("카테고리", style = MaterialTheme.typography.labelLarge)
                CategoryPicker(tx.type, category) { category = it }
                if (changed) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(checked = rememberRule, onCheckedChange = { rememberRule = it })
                        Text(
                            if (nameChanged) "'${tx.description}' 거래를 모두 바꾸고 다음에도 적용"
                            else "'${tx.description}'은(는) 앞으로도 이 카테고리로",
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
                tx.rawText?.let {
                    Text("알림 원문", style = MaterialTheme.typography.labelLarge)
                    Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                if (confirmDelete) {
                    Text("정말 삭제할까요? 한 번 더 누르면 삭제돼요.", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                if (changed) onSave(name, category, rememberRule)
                onDismiss()
            }) { Text("저장") }
        },
        dismissButton = {
            TextButton(onClick = { if (confirmDelete) { onDelete(); onDismiss() } else confirmDelete = true }) {
                Text("삭제", color = MaterialTheme.colorScheme.error)
            }
        },
    )
}

@Composable
fun AddTransactionDialog(
    onDismiss: () -> Unit,
    onAdd: (TxType, Long, String, String, Category?) -> Unit,
) {
    var type by remember { mutableStateOf(TxType.EXPENSE) }
    var amount by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var institution by remember { mutableStateOf("") }
    var category by remember { mutableStateOf<Category?>(null) }
    var pasted by remember { mutableStateOf("") }
    var parseError by remember { mutableStateOf(false) }
    val amountValue = amount.toLongOrNull()

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("거래 추가") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
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
                        category = null
                    }
                }, enabled = pasted.isNotBlank()) { Text("문자에서 채우기") }
                if (parseError) {
                    Text("입출금 문자를 인식하지 못했어요.", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
                SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                    listOf(TxType.EXPENSE to "지출", TxType.INCOME to "수입").forEachIndexed { i, (t, label) ->
                        SegmentedButton(
                            selected = type == t,
                            onClick = { if (type != t) { type = t; category = null } },
                            shape = SegmentedButtonDefaults.itemShape(i, 2),
                        ) { Text(label) }
                    }
                }
                OutlinedTextField(
                    value = amount,
                    onValueChange = { amount = it.filter(Char::isDigit) },
                    label = { Text("금액") },
                    suffix = { Text("원") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = description,
                    onValueChange = { description = it },
                    label = { Text("내용 (가맹점·보낸 사람)") },
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
                Text("카테고리 (비워 두면 자동 분류)", style = MaterialTheme.typography.labelLarge)
                CategoryPicker(type, category) { category = if (category == it) null else it }
                Spacer(Modifier.height(4.dp))
            }
        },
        confirmButton = {
            TextButton(
                onClick = { amountValue?.let { onAdd(type, it, description.trim(), institution.trim(), category) } },
                enabled = amountValue != null && amountValue > 0,
            ) { Text("추가") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("취소") } },
    )
}

@Composable
fun BudgetDialog(current: Long, onDismiss: () -> Unit, onSave: (Long) -> Unit) {
    var value by remember { mutableStateOf(if (current > 0) current.toString() else "") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("월 예산") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("한 달 동안 쓸 금액을 정하면 80%, 100%에 도달할 때 알려 드려요.", style = MaterialTheme.typography.bodySmall)
                OutlinedTextField(
                    value = value,
                    onValueChange = { value = it.filter(Char::isDigit).take(12) },
                    label = { Text("예산") },
                    suffix = { Text("원") },
                    supportingText = { value.toLongOrNull()?.let { Text(it.won()) } },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    singleLine = true,
                )
                FlowRowPresets { value = it.toString() }
            }
        },
        confirmButton = {
            TextButton(onClick = { onSave(value.toLongOrNull() ?: 0); onDismiss() }) { Text("저장") }
        },
        dismissButton = {
            if (current > 0) TextButton(onClick = { onSave(0); onDismiss() }) { Text("예산 끄기") }
            else TextButton(onClick = onDismiss) { Text("취소") }
        },
    )
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun FlowRowPresets(onPick: (Long) -> Unit) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        listOf(500_000L, 1_000_000L, 1_500_000L, 2_000_000L, 3_000_000L).forEach { v ->
            FilterChip(selected = false, onClick = { onPick(v) }, label = { Text("${v / 10_000}만") })
        }
    }
}
