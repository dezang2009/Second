package com.moneymoa.ui

import android.content.Context
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.app.NotificationManagerCompat
import androidx.lifecycle.compose.LifecycleResumeEffect
import com.moneymoa.data.MissedNotification
import com.moneymoa.data.Transaction
import java.time.LocalDate

class MainActivity : ComponentActivity() {
    private val viewModel: MainViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent { MoneyMoaTheme { MoneyMoaApp(viewModel) } }
    }
}

private enum class Tab(val label: String, val icon: ImageVector) {
    HOME("홈", Icons.Filled.Home),
    HISTORY("내역", Icons.AutoMirrored.Filled.List),
    STATS("통계", BarChartIcon),
    SETTINGS("설정", Icons.Filled.Settings),
}

private val BarChartIcon: ImageVector by lazy {
    ImageVector.Builder("BarChart", 24.dp, 24.dp, 24f, 24f).apply {
        path(fill = SolidColor(Color.Black)) {
            moveTo(4f, 10f); lineTo(8f, 10f); lineTo(8f, 20f); lineTo(4f, 20f); close()
            moveTo(10f, 4f); lineTo(14f, 4f); lineTo(14f, 20f); lineTo(10f, 20f); close()
            moveTo(16f, 13f); lineTo(20f, 13f); lineTo(20f, 20f); lineTo(16f, 20f); close()
        }
    }.build()
}

private fun Context.hasNotificationAccess() =
    NotificationManagerCompat.getEnabledListenerPackages(this).contains(packageName)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MoneyMoaApp(viewModel: MainViewModel) {
    val context = LocalContext.current
    val data by viewModel.monthData.collectAsState()
    val banks by viewModel.banks.collectAsState()
    val filter by viewModel.filter.collectAsState()
    val missed by viewModel.missed.collectAsState()

    var tab by rememberSaveable { mutableStateOf(Tab.HOME) }
    var hasAccess by remember { mutableStateOf(context.hasNotificationAccess()) }
    var showAdd by remember { mutableStateOf(false) }
    var selected by remember { mutableStateOf<Transaction?>(null) }
    var showMissed by rememberSaveable { mutableStateOf(false) }
    var addingFromMissed by remember { mutableStateOf<MissedNotification?>(null) }
    var confirmRestore by remember { mutableStateOf(false) }
    val snackbar = remember { SnackbarHostState() }

    LaunchedEffect(Unit) { viewModel.messages.collect { snackbar.showSnackbar(it) } }
    BackHandler(enabled = showMissed) { showMissed = false }

    val today = LocalDate.now()
    val exportCsv = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("text/csv")) { uri ->
        uri?.let(viewModel::exportCsv)
    }
    val exportBackup = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        uri?.let(viewModel::exportBackup)
    }
    val restore = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        uri?.let(viewModel::restoreBackup)
    }

    LifecycleResumeEffect(Unit) {
        hasAccess = context.hasNotificationAccess()
        onPauseOrDispose { }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = {
            CenterAlignedTopAppBar(
                title = {
                    Text(
                        when {
                            showMissed -> "인식 못 한 알림"
                            tab == Tab.HOME -> "머니모아"
                            else -> tab.label
                        },
                        fontWeight = FontWeight.Bold,
                    )
                },
                navigationIcon = {
                    if (showMissed) {
                        IconButton(onClick = { showMissed = false }) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, "뒤로")
                        }
                    }
                },
            )
        },
        bottomBar = {
            if (!showMissed) NavigationBar {
                Tab.entries.forEach { t ->
                    NavigationBarItem(
                        selected = tab == t,
                        onClick = { tab = t },
                        icon = { Icon(t.icon, contentDescription = null) },
                        label = { Text(t.label) },
                    )
                }
            }
        },
        floatingActionButton = {
            if (!showMissed && (tab == Tab.HOME || tab == Tab.HISTORY)) {
                FloatingActionButton(onClick = { showAdd = true }) { Icon(Icons.Filled.Add, "직접 추가") }
            }
        },
    ) { padding ->
        val modifier = Modifier.padding(padding)
        if (showMissed) {
            Box(modifier) {
                MissedScreen(
                    items = missed,
                    onAdd = { addingFromMissed = it },
                    onDelete = viewModel::deleteMissed,
                )
            }
            return@Scaffold
        }
        when (tab) {
            Tab.HOME -> Box(modifier) {
                HomeScreen(
                    data = data,
                    hasNotificationAccess = hasAccess,
                    onPrevMonth = viewModel::previousMonth,
                    onNextMonth = viewModel::nextMonth,
                    onOpenSettings = { tab = Tab.SETTINGS },
                    onSeeAll = { tab = Tab.HISTORY },
                    onSeeStats = { tab = Tab.STATS },
                    onTransactionClick = { selected = it },
                    missedCount = missed.size,
                    onOpenMissed = { showMissed = true },
                )
            }
            Tab.HISTORY -> Box(modifier) {
                HistoryScreen(
                    data = data,
                    banks = banks,
                    filter = filter,
                    onPrevMonth = viewModel::previousMonth,
                    onNextMonth = viewModel::nextMonth,
                    onInstitution = viewModel::setInstitutionFilter,
                    onCategory = viewModel::setCategoryFilter,
                    onTransactionClick = { selected = it },
                )
            }
            Tab.STATS -> Box(modifier) {
                StatsScreen(
                    data = data,
                    onPrevMonth = viewModel::previousMonth,
                    onNextMonth = viewModel::nextMonth,
                    onCategoryClick = {
                        viewModel.setCategoryFilter(it)
                        tab = Tab.HISTORY
                    },
                )
            }
            Tab.SETTINGS -> Box(modifier) {
                SettingsScreen(
                    hasNotificationAccess = hasAccess,
                    missedCount = missed.size,
                    onOpenMissed = { showMissed = true },
                    onExportCsv = { exportCsv.launch("머니모아_거래내역_$today.csv") },
                    onBackup = { exportBackup.launch("머니모아_백업_$today.json") },
                    onRestore = { confirmRestore = true },
                )
            }
        }
    }

    if (showAdd) {
        AddTransactionDialog(
            onDismiss = { showAdd = false },
            onAdd = { type, amount, desc, inst, category ->
                viewModel.add(type, amount, desc, inst, category)
                showAdd = false
            },
        )
    }

    addingFromMissed?.let { item ->
        AddTransactionDialog(
            initialText = item.text,
            onDismiss = { addingFromMissed = null },
            onAdd = { type, amount, desc, inst, category ->
                viewModel.add(type, amount, desc, inst, category, timestamp = item.timestamp, fromMissed = item)
                addingFromMissed = null
            },
        )
    }

    if (confirmRestore) {
        AlertDialog(
            onDismissRequest = { confirmRestore = false },
            title = { Text("백업에서 복원") },
            text = { Text("지금 앱에 있는 거래와 규칙이 모두 백업 파일 내용으로 바뀌어요. 계속할까요?") },
            confirmButton = {
                TextButton(onClick = {
                    confirmRestore = false
                    restore.launch(arrayOf("application/json", "application/octet-stream", "text/plain"))
                }) { Text("파일 고르기") }
            },
            dismissButton = { TextButton(onClick = { confirmRestore = false }) { Text("취소") } },
        )
    }

    selected?.let { tx ->
        TransactionDetailDialog(
            tx = tx,
            onDismiss = { selected = null },
            onSave = { name, c, excluded, rememberRule -> viewModel.edit(tx, name, c, excluded, rememberRule) },
            onDelete = { viewModel.delete(tx) },
        )
    }
}
