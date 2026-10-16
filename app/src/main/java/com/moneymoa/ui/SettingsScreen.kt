package com.moneymoa.ui

import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

@Composable
fun SettingsScreen(
    hasNotificationAccess: Boolean,
    budget: Long,
    alertsEnabled: Boolean,
    canPostNotifications: Boolean,
    onEditBudget: () -> Unit,
    onAlertsChange: (Boolean) -> Unit,
    onRequestPostPermission: () -> Unit,
) {
    val context = LocalContext.current
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        SettingsGroup("자동 수집") {
            SettingRow(
                title = "은행·카드 알림 읽기",
                subtitle = if (hasNotificationAccess) "켜짐 · 입출금 알림을 실시간으로 모으고 있어요" else "꺼짐 · 켜야 자동으로 모여요",
                subtitleColor = if (hasNotificationAccess) IncomeColor else MaterialTheme.colorScheme.error,
                onClick = { context.startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)) },
            )
            if (!hasNotificationAccess) {
                Text(
                    "스위치가 회색이라 켜지지 않으면: 앱 정보 → 오른쪽 위 ⋮ → '제한된 설정 허용' 후 다시 켜 주세요.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 16.dp),
                )
                TextButton(
                    onClick = {
                        context.startActivity(
                            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}"))
                        )
                    },
                    modifier = Modifier.padding(horizontal = 4.dp),
                ) { Text("앱 정보 열기") }
            }
        }

        SettingsGroup("예산") {
            SettingRow(
                title = "월 예산",
                subtitle = if (budget > 0) budget.won() else "설정 안 함",
                onClick = onEditBudget,
            )
            Row(
                Modifier.fillMaxWidth().clickable { onAlertsChange(!alertsEnabled) }.padding(horizontal = 16.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text("예산 알림", fontWeight = FontWeight.Medium)
                    Text(
                        "예산의 80%, 100%에 도달하면 알려 드려요",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Switch(checked = alertsEnabled, onCheckedChange = onAlertsChange)
            }
            if (alertsEnabled && !canPostNotifications) {
                SettingRow(
                    title = "알림 표시 권한이 필요해요",
                    subtitle = "눌러서 허용하기",
                    subtitleColor = MaterialTheme.colorScheme.error,
                    onClick = onRequestPostPermission,
                )
            }
        }

        SettingsGroup("정보") {
            Text(
                "모든 거래 내역은 이 휴대폰 안에만 저장되고, 어디로도 전송되지 않아요.\n" +
                    "카테고리는 가맹점 이름으로 자동 분류되며, 거래를 눌러 바꾸면 다음부터 그대로 적용돼요.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(16.dp),
            )
        }
    }
}

@Composable
private fun SettingsGroup(title: String, content: @Composable () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
            title,
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier.padding(start = 4.dp),
        )
        Card(Modifier.fillMaxWidth()) { Column { content() } }
    }
}

@Composable
private fun SettingRow(
    title: String,
    subtitle: String,
    onClick: () -> Unit,
    subtitleColor: androidx.compose.ui.graphics.Color = MaterialTheme.colorScheme.onSurfaceVariant,
) {
    Column(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 12.dp)) {
        Text(title, fontWeight = FontWeight.Medium)
        Text(subtitle, style = MaterialTheme.typography.bodySmall, color = subtitleColor)
    }
}
