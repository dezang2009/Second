package com.moneymoa.ui

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import com.moneymoa.parser.TxType
import java.text.NumberFormat
import java.util.Locale
import kotlin.math.abs

val IncomeColor = Color(0xFF2F6BFF)
val ExpenseColor = Color(0xFFE5484D)
val WarningColor = Color(0xFFE08A00)

private val wonFormat = NumberFormat.getInstance(Locale.KOREA)

fun Long.won(): String = wonFormat.format(this) + "원"
fun signed(type: TxType, amount: Long) = (if (type == TxType.INCOME) "+" else "-") + amount.won()
fun signedNet(net: Long) = (if (net >= 0) "+" else "-") + abs(net).won()

@Composable
fun MoneyMoaTheme(content: @Composable () -> Unit) {
    val dark = isSystemInDarkTheme()
    val context = LocalContext.current
    val scheme = when {
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ->
            if (dark) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        dark -> darkColorScheme(primary = Color(0xFF8AA9FF))
        else -> lightColorScheme(primary = IncomeColor)
    }
    MaterialTheme(colorScheme = scheme, content = content)
}
