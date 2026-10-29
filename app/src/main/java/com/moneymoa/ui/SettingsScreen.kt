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
    missedCount: Int,
    onOpenMissed: () -> Unit,
    listenerConnected: Boolean = true,
    batteryRestricted: Boolean = false,
    onOpenLog: () -> Unit = {},
    onReconnect: () -> Unit = {},
    onAllowBackground: () -> Unit = {},
    onExportCsv: () -> Unit,
    onBackup: () -> Unit,
    onRestore: () -> Unit,
) {
    val context = LocalContext.current
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        SettingsGroup("자동 수집") {
            SettingRow(
                title = "은행·카드 알림 읽기",
                subtitle = when {
                    !hasNotificationAccess -> "꺼짐 · 켜야 자동으로 모여요"
                    !listenerConnected -> "권한은 켜져 있지만 연결이 끊겼어요 · 눌러서 다시 연결"
                    else -> "켜짐 · 입출금 알림을 실시간으로 모으고 있어요"
                },
                subtitleColor = if (hasNotificationAccess && listenerConnected) IncomeColor else MaterialTheme.colorScheme.error,
                onClick = {
                    if (hasNotificationAccess && !listenerConnected) onReconnect()
                    else context.startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
                },
            )
            if (hasNotificationAccess && !listenerConnected) {
                Text(
                    "다시 연결해도 그대로면 알림 접근 설정에서 머니모아를 껐다가 다시 켜 주세요.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 16.dp).padding(bottom = 8.dp),
                )
            }
            SettingRow(
                title = "백그라운드 실행 허용",
                subtitle = if (batteryRestricted) "제한됨 · 폰이 앱을 잠재우면 알림을 놓칠 수 있어요. 눌러서 허용하기" else "허용됨",
                subtitleColor = if (batteryRestricted) MaterialTheme.colorScheme.error else IncomeColor,
                onClick = onAllowBackground,
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

        SettingsGroup("인식") {
            SettingRow(
                title = "알림 수신 기록",
                subtitle = "최근 받은 금융 알림과 처리 결과. 거래가 빠졌을 때 확인하세요.",
                onClick = onOpenLog,
            )
            SettingRow(
                title = "인식 못 한 알림",
                subtitle = if (missedCount > 0) "${missedCount}건 · 눌러서 확인하고 거래로 추가하기" else "없음",
                subtitleColor = if (missedCount > 0) MaterialTheme.colorScheme.tertiary else MaterialTheme.colorScheme.onSurfaceVariant,
                onClick = onOpenMissed,
            )
        }

        SettingsGroup("데이터") {
            SettingRow("엑셀로 내보내기", "모든 거래를 CSV 파일로 저장해요. 엑셀·구글 시트에서 열 수 있어요.", onExportCsv)
            SettingRow("백업 파일 만들기", "거래와 이름·카테고리 규칙을 파일 하나로 저장해요. 폰을 바꿀 때 쓰세요.", onBackup)
            SettingRow("백업에서 복원", "백업 파일로 지금 데이터를 모두 바꿔요.", onRestore)
        }

        SettingsGroup("정보") {
            Text(
                "모든 거래 내역은 이 휴대폰 안에만 저장되고, 어디로도 전송되지 않아요.\n" +
                    "카테고리는 가맹점 이름으로 자동 분류되며, 거래를 눌러 바꾸면 다음부터 그대로 적용돼요.\n" +
                    "적금·청약·투자로 보낸 돈은 '저축'으로 따로 모으고, 내 계좌끼리 옮긴 돈과 카드대금 출금은 합계에서 빼요.\n" +
                    "홈 화면을 길게 눌러 '머니모아' 위젯을 추가하면 오늘 쓴 돈을 바로 볼 수 있어요.",
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
