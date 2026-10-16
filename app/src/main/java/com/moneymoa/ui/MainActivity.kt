package com.moneymoa.ui

import android.content.Context
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
import com.moneymoa.data.Transaction

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

    var tab by rememberSaveable { mutableStateOf(Tab.HOME) }
    var hasAccess by remember { mutableStateOf(context.hasNotificationAccess()) }
    var showAdd by remember { mutableStateOf(false) }
    var selected by remember { mutableStateOf<Transaction?>(null) }

    LifecycleResumeEffect(Unit) {
        hasAccess = context.hasNotificationAccess()
        onPauseOrDispose { }
    }

    Scaffold(
        topBar = {
            CenterAlignedTopAppBar(
                title = { Text(if (tab == Tab.HOME) "머니모아" else tab.label, fontWeight = FontWeight.Bold) },
            )
        },
        bottomBar = {
            NavigationBar {
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
            if (tab == Tab.HOME || tab == Tab.HISTORY) {
                FloatingActionButton(onClick = { showAdd = true }) { Icon(Icons.Filled.Add, "직접 추가") }
            }
        },
    ) { padding ->
        val modifier = Modifier.padding(padding)
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
                SettingsScreen(hasNotificationAccess = hasAccess)
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

    selected?.let { tx ->
        TransactionDetailDialog(
            tx = tx,
            onDismiss = { selected = null },
            onSave = { name, c, rememberRule -> viewModel.edit(tx, name, c, rememberRule) },
            onDelete = { viewModel.delete(tx) },
        )
    }
}
