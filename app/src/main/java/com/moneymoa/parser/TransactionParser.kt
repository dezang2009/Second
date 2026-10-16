package com.moneymoa.parser

enum class TxType { INCOME, EXPENSE }

data class ParsedTransaction(
    val type: TxType,
    val amount: Long,
    val institution: String?,
    val description: String,
    val balance: Long?,
)

/**
 * 은행/카드/간편결제 알림 문장에서 입출금 정보를 뽑아낸다.
 *
 * 금융기관 이름(알림을 보낸 앱 또는 문장 속 이름)이 확인되고,
 * 입출금 키워드와 금액이 모두 있을 때만 거래로 인정한다.
 */
object TransactionParser {

    /** 알림을 보낸 앱 패키지 → 기관 이름. 목록에 없어도 문장 속 기관 이름으로 인식된다. */
    val PACKAGE_INSTITUTIONS: Map<String, String> = mapOf(
        "com.kbstar.kbbank" to "KB국민은행",
        "com.shinhan.sbanking" to "신한은행",
        "com.wooribank.smart.npib" to "우리은행",
        "com.kebhana.hanapush" to "하나은행",
        "nh.smart.banking" to "NH농협은행",
        "com.ibk.android.ionebank" to "IBK기업은행",
        "com.kakaobank.channel" to "카카오뱅크",
        "viva.republica.toss" to "토스",
        "com.kbankwith.smartbank" to "케이뱅크",
        "com.kbcard.cxh.appcard" to "KB국민카드",
        "com.shcard.smartpay" to "신한카드",
        "kr.co.samsungcard.mpocket" to "삼성카드",
        "com.hyundaicard.appcard" to "현대카드",
        "com.kakaopay.app" to "카카오페이",
    )

    /** 문자 앱: 기관 이름은 문장에서 찾아야 한다. */
    val SMS_PACKAGES: Set<String> = setOf(
        "com.samsung.android.messaging",
        "com.google.android.apps.messaging",
        "com.android.mms",
    )

    // 긴 이름을 먼저 검사해야 "신한카드"가 "신한은행"보다 우선한다.
    private val INSTITUTION_NAMES = listOf(
        "KB국민카드" to "KB국민카드", "국민카드" to "KB국민카드",
        "신한카드" to "신한카드", "삼성카드" to "삼성카드", "현대카드" to "현대카드",
        "롯데카드" to "롯데카드", "우리카드" to "우리카드", "하나카드" to "하나카드",
        "BC카드" to "BC카드", "비씨카드" to "BC카드", "NH농협카드" to "NH농협카드",
        "농협카드" to "NH농협카드", "NH카드" to "NH농협카드", "IBK카드" to "IBK카드",
        "카카오뱅크" to "카카오뱅크", "토스뱅크" to "토스뱅크", "케이뱅크" to "케이뱅크",
        "KB국민은행" to "KB국민은행", "국민은행" to "KB국민은행",
        "신한은행" to "신한은행", "우리은행" to "우리은행", "하나은행" to "하나은행",
        "NH농협은행" to "NH농협은행", "농협은행" to "NH농협은행", "농협" to "NH농협은행",
        "IBK기업은행" to "IBK기업은행", "기업은행" to "IBK기업은행",
        "SC제일은행" to "SC제일은행", "새마을금고" to "새마을금고", "우체국" to "우체국",
        "수협" to "수협", "iM뱅크" to "iM뱅크", "대구은행" to "iM뱅크",
        "부산은행" to "부산은행", "경남은행" to "경남은행", "광주은행" to "광주은행",
        "전북은행" to "전북은행", "신협" to "신협",
        "카카오페이" to "카카오페이", "네이버페이" to "네이버페이", "토스" to "토스",
    )

    // 문자 머리에 붙는 [KB], [신한] 같은 약칭
    private val BRACKET_ALIASES = mapOf(
        "KB" to "KB국민은행", "국민" to "KB국민은행", "신한" to "신한은행",
        "우리" to "우리은행", "하나" to "하나은행", "NH" to "NH농협은행",
        "농협" to "NH농협은행", "IBK" to "IBK기업은행", "기업" to "IBK기업은행",
    )

    private val REJECT_WORDS = listOf(
        "거절", "실패", "인증번호", "인증 번호", "광고", "이벤트", "혜택", "예정", "미납", "연체", "OTP",
    )
    private val CANCEL_WORDS = listOf("승인취소", "결제취소", "취소승인", "취소 승인", "취소")
    // 거래 방향을 분명히 말해 주는 단어
    private val INCOME_WORDS = listOf("입금", "받았어요", "받음", "환불")
    private val EXPENSE_WORDS = listOf("출금", "인출", "승인", "결제", "보냈어요", "보냄")
    // 방향이 분명한 단어가 없을 때만 쓰는 단어 ("대출이자 출금"은 지출이어야 한다)
    private val WEAK_INCOME_WORDS = listOf("급여", "이자", "캐시백")
    private val WEAK_EXPENSE_WORDS = listOf("자동이체", "송금", "이체")

    private val BALANCE_RE = Regex("""(잔액|잔고)\s*:?\s*(-?[\d,]+)\s*원?""")
    private val NOT_AMOUNT_RE = Regex("""(잔액|잔고|누적|한도|이용가능|가능금액)\s*(금액)?\s*:?\s*-?[\d,]+\s*원?""")
    private val WON_AMOUNT_RE = Regex("""(?<![\d,*\-/:.])(\d{1,3}(?:,\d{3})+|\d+)\s*원""")
    private val KEYWORD_AMOUNT_RE =
        Regex("""(입금|출금|인출|이체|승인|결제|송금)\s*:?\s*(\d{1,3}(?:,\d{3})+|\d+)(?![\d\-*/:])""")
    private val COMMA_AMOUNT_RE = Regex("""(?<![\d*\-/:.])\d{1,3}(?:,\d{3})+(?![\d\-*/:])""")
    private val LONE_NUMBER_LINE_RE = Regex("""^\s*(\d{1,9})\s*$""")
    private val DATETIME_MERCHANT_RE =
        Regex("""\d{1,2}[/.\-]\d{1,2}\s+\d{1,2}:\d{2}(?::\d{2})?\s+([^\n]+)""")
    private val ACCOUNT_LIKE_RE = Regex("""[\d\-,.원]+""")
    private val NAME_NIM_RE = Regex("""([가-힣A-Za-z*]{2,10})님""")
    private val BRACKET_RE = Regex("""\[([^\]]+)]""")

    private const val MAX_AMOUNT = 10_000_000_000L

    fun parse(text: String, packageName: String? = null): ParsedTransaction? {
        val normalized = text.replace(' ', ' ').replace("\r", "").trim()
        if (normalized.isEmpty()) return null
        if (REJECT_WORDS.any { normalized.contains(it) }) return null

        val institution = packageName?.let { PACKAGE_INSTITUTIONS[it] } ?: findInstitution(normalized)
            ?: return null

        val type = detectType(normalized) ?: return null
        val amount = findAmount(normalized) ?: return null
        val balance = BALANCE_RE.find(normalized)?.groupValues?.get(2)?.toAmount()

        return ParsedTransaction(
            type = type,
            amount = amount,
            institution = institution,
            description = findDescription(normalized, type),
            balance = balance,
        )
    }

    fun findInstitution(text: String): String? {
        BRACKET_RE.findAll(text).forEach { m ->
            val inner = m.groupValues[1].trim()
            BRACKET_ALIASES[inner]?.let { return it }
            INSTITUTION_NAMES.firstOrNull { inner.contains(it.first) }?.let { return it.second }
        }
        return INSTITUTION_NAMES.firstOrNull { text.contains(it.first) }?.second
    }

    private fun detectType(raw: String): TxType? {
        // "입출금 알림" 같은 제목 속 '출금'에 속지 않도록 지운다.
        val text = raw.replace("입출금", " ")
        if (CANCEL_WORDS.any { text.contains(it) }) return TxType.INCOME
        return earliest(text, INCOME_WORDS, EXPENSE_WORDS)
            ?: earliest(text, WEAK_INCOME_WORDS, WEAK_EXPENSE_WORDS)
    }

    private fun earliest(text: String, income: List<String>, expense: List<String>): TxType? {
        fun firstIndex(words: List<String>) =
            words.mapNotNull { w -> text.indexOf(w).takeIf { it >= 0 } }.minOrNull()
        val i = firstIndex(income)
        val e = firstIndex(expense)
        return when {
            i == null && e == null -> null
            e == null -> TxType.INCOME
            i == null -> TxType.EXPENSE
            i < e -> TxType.INCOME
            else -> TxType.EXPENSE
        }
    }

    private fun findAmount(text: String): Long? {
        val cleaned = NOT_AMOUNT_RE.replace(text, " ")
        WON_AMOUNT_RE.find(cleaned)?.let { m -> m.groupValues[1].toAmount()?.let { return it } }
        KEYWORD_AMOUNT_RE.find(cleaned)?.let { m -> m.groupValues[2].toAmount()?.let { return it } }
        COMMA_AMOUNT_RE.find(cleaned)?.let { m -> m.value.toAmount()?.let { return it } }
        cleaned.lines().forEach { line ->
            LONE_NUMBER_LINE_RE.find(line)?.let { m -> m.groupValues[1].toAmount()?.let { return it } }
        }
        return null
    }

    private fun findDescription(text: String, type: TxType): String {
        // 이름보다 거래 성격이 더 중요한 경우
        if (type == TxType.INCOME && text.contains("급여")) return "급여"
        if (text.contains("이자") && !text.contains("대출")) return "이자"
        if (type == TxType.EXPENSE && (text.contains("ATM") || text.contains("인출"))) return "ATM 출금"

        // 카드 승인: "... 10/16 14:23 스타벅스 강남점 누적 ..."
        DATETIME_MERCHANT_RE.find(text)?.let { m ->
            // 은행 문자는 시간 뒤에 계좌번호·금액이 오므로 그런 조각은 버린다.
            val keywords = INCOME_WORDS + EXPENSE_WORDS + WEAK_EXPENSE_WORDS + CANCEL_WORDS
            val merchant = m.groupValues[1].substringBefore("누적").substringBefore("잔액")
                .split(' ')
                .filter { w ->
                    w.isNotBlank() && w.any { it.isLetter() } && !w.contains('*') &&
                        !ACCOUNT_LIKE_RE.matches(w) && keywords.none { w.contains(it) }
                }
                .joinToString(" ")
            MerchantName.clean(merchant)?.let { return it }
        }
        // 간편송금: "홍길동님에게 보냈어요" (단, "고객님"은 이름이 아니다)
        NAME_NIM_RE.findAll(text).map { it.groupValues[1] }
            .firstOrNull { !MerchantName.isStopWord(it) }
            ?.let { return it }

        // 그 밖에는 숫자·기관명·키워드를 지우고 남는 단어 중 이름이 될 만한 것을 쓴다.
        val noise = (INSTITUTION_NAMES.map { it.first } + INCOME_WORDS + EXPENSE_WORDS +
            WEAK_INCOME_WORDS + WEAK_EXPENSE_WORDS + CANCEL_WORDS + listOf("잔액", "잔고", "Web발신", "입출금"))
            .sortedByDescending { it.length }
        var rest = BRACKET_RE.replace(text, " ")
        rest = NOT_AMOUNT_RE.replace(rest, " ")
        noise.forEach { rest = rest.replace(it, " ") }
        rest.split(Regex("""[\s|,()/]+"""))
            .map { it.trim('.', ':', '-', '>', '→') }
            .filter { w -> w.length >= 2 && w.any { it.isLetter() } && !w.endsWith("원") && !w.contains('*') }
            .firstNotNullOfOrNull { MerchantName.clean(it) }
            ?.let { return it }

        return when {
            text.contains("자동이체") -> "자동이체"
            type == TxType.INCOME -> "입금"
            text.contains("카드") || text.contains("승인") || text.contains("결제") -> "카드 결제"
            text.contains("송금") || text.contains("이체") -> "송금"
            else -> "출금"
        }
    }

    private fun String.toAmount(): Long? {
        val digits = replace(",", "")
        val negative = digits.startsWith("-")
        val value = digits.removePrefix("-").toLongOrNull() ?: return null
        if (value <= 0 || value > MAX_AMOUNT) return null
        return if (negative) -value else value
    }
}
