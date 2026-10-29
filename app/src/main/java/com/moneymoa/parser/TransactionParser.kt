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
        "com.nonghyup.nhallonebank" to "NH농협은행",
        "com.hanaskcard.paycla" to "하나카드",
        "com.lcacApp" to "롯데카드",
        "com.wooricard.smartapp" to "우리카드",
        "kvp.jjy.MispAndroid320" to "BC카드",
        "nh.smart.nhallonepay" to "NH농협카드",
        "com.tossbank.app" to "토스뱅크",
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
        "전북은행" to "전북은행", "신협" to "신협", "제주은행" to "제주은행",
        "KDB산업은행" to "KDB산업은행", "산업은행" to "KDB산업은행", "씨티카드" to "씨티카드", "씨티은행" to "씨티은행",
        "Sh수협" to "수협", "수협은행" to "수협", "광주카드" to "광주은행",
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
    private val WEAK_INCOME_WORDS = listOf("급여", "이자", "캐시백", "환급", "지급")
    private val WEAK_EXPENSE_WORDS = listOf("자동이체", "송금", "이체", "일시불", "할부", "사용", "이용")

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
    // "김철수님에게", "김철수님이" 처럼 주고받은 상대만. "홍길동님 계좌", "홍길동님 12,000원"의 홍길동은 나다.
    private val COUNTERPARTY_RE = Regex("""([가-힣A-Za-z*]{2,10})님(?:에게|께|한테|이|으로부터|로부터)""")
    // "가맹점명 : 시외버스승차권"처럼 라벨이 붙은 앱 푸시. 라벨은 이름이 아니라 값의 이름표다.
    private val MERCHANT_LABELS = listOf(
        "가맹점명", "이용가맹점", "가맹점", "사용처", "이용처", "결제처", "거래처", "상호명", "상호", "사용장소", "이용장소",
    )
    private val COUNTERPARTY_LABELS = listOf(
        "받는분", "받는 분", "받는사람", "보낸분", "보낸 분", "보낸사람", "입금자명", "입금자", "출금자", "입금처", "출금처",
        "송금인", "수취인",
    )
    /** 값이 이름이 아닌 라벨: 시간·금액·카드번호·손님명(나) 등 */
    private val OTHER_LABELS = listOf(
        "거래시간", "거래일시", "거래일자", "이용일시", "이용일자", "승인일시", "승인시간", "사용일시", "결제일시",
        "승인금액", "이용금액", "결제금액", "거래금액", "사용금액", "입금금액", "출금금액", "입금액", "출금액",
        "카드번호", "승인번호", "계좌번호", "이용구분", "거래구분", "거래종류", "할부개월", "누적금액", "거래후잔액",
        "이용카드", "카드명", "손님명", "고객명", "이용현황", "사용현황", "거래내역", "금액", "잔액", "일시", "시간",
    )
    // 줄 맨 앞(기호 뒤)의 "라벨 : 값"
    private val LINE_LABEL_RE = Regex("""^[^가-힣A-Za-z0-9]*([가-힣A-Za-z]{1,8}(?: [가-힣A-Za-z]{1,4})?)\s*[:：]\s*(.*)$""")

    // 간편결제 앱: "스타벅스 강남점에서 4,500원"
    private val ESEO_RE = Regex("""(\S+(?: \S+)?)에서\s*[\d,]+\s*원""")
    // 카드 문자에서 가맹점이 아닌 조각들
    private val CARD_NOISE_RE = Regex(
        listOf(
            """\[[^\]]*]""",                                     // [Web발신], [일시불.승인(1234)]
            """\(\d{2,4}\)""",                                   // (1234)
            """(누적|잔액|잔고|한도)\s*(금액)?\s*:?\s*-?[\d,]+\s*원?""",
            """\d{1,2}[/.\-]\d{1,2}(\s+\d{1,2}:\d{2}(:\d{2})?)?""", // 날짜·시각
            """\d{1,2}:\d{2}""",
            """-?[\d,]+\s*원""",
            """\d{1,3}(,\d{3})+""",
            """\d+\s*개월""",
            """\S*\*\S*""",                                      // 가려진 이름·카드번호: 홍*동, 1234**
            """[가-힣A-Za-z]{2,10}님""",                           // 카드 주인 이름
        ).joinToString("|")
    )
    private val CARD_WORDS = listOf(
        "승인취소", "취소", "승인", "일시불", "할부", "무이자", "체크카드", "체크", "신용", "출금", "결제", "사용",
        "해외", "국내", "누적", "잔액", "금액", "Web발신", "알림", "완료",
    )
    private val BRACKET_RE = Regex("""\[([^\]]+)]""")

    private const val MAX_AMOUNT = 10_000_000_000L

    /**
     * 거래로 인식하지는 못했지만 금융기관이 보낸 금액 있는 알림인지.
     * '인식 못 한 알림'에 모아 두고 사용자가 직접 추가할 수 있게 한다.
     */
    fun looksFinancial(text: String, packageName: String? = null): Boolean {
        val normalized = text.replace('\u00A0', ' ').trim()
        if (normalized.isEmpty() || REJECT_WORDS.any { normalized.contains(it) }) return false
        val institution = packageName?.let { PACKAGE_INSTITUTIONS[it] } ?: findInstitution(normalized)
        val cleaned = NOT_AMOUNT_RE.replace(normalized, " ")
        return institution != null && (WON_AMOUNT_RE.containsMatchIn(cleaned) || COMMA_AMOUNT_RE.containsMatchIn(cleaned))
    }

    /** 수신 기록에 남길 만한지: 금융 앱이 보냈거나, 금액이 들어 있는 알림 */
    fun mightBeFinancial(text: String, packageName: String?) =
        packageName in PACKAGE_INSTITUTIONS || findInstitution(text) != null ||
            (packageName in SMS_PACKAGES && WON_AMOUNT_RE.containsMatchIn(text))

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

    /** 은행·카드사 대표 번호 → 기관. 문자 앱 알림 제목이 보낸 번호뿐일 때 쓴다. */
    private val SENDER_NUMBERS = mapOf(
        "15889999" to "KB국민은행", "15449999" to "KB국민은행",
        "15998000" to "신한은행", "15778000" to "신한은행",
        "15885000" to "우리은행", "15995000" to "우리은행",
        "15991111" to "하나은행", "15881111" to "하나은행",
        "16613000" to "NH농협은행", "15882100" to "NH농협은행",
        "15662566" to "IBK기업은행", "15882588" to "IBK기업은행",
        "15993333" to "카카오뱅크", "16617654" to "토스뱅크", "15221000" to "케이뱅크",
        "15881688" to "KB국민카드", "15447000" to "신한카드", "15888700" to "삼성카드",
        "15776000" to "현대카드", "15888100" to "롯데카드", "18001111" to "하나카드",
        "15889955" to "우리카드", "15884000" to "BC카드", "16444000" to "NH농협카드",
    )
    private val SENDER_NUMBER_RE = Regex("""1[5-8]\d{2}-?\d{4}""")

    fun findInstitution(text: String): String? {
        BRACKET_RE.findAll(text).forEach { m ->
            val inner = m.groupValues[1].trim()
            BRACKET_ALIASES[inner]?.let { return it }
            INSTITUTION_NAMES.firstOrNull { inner.contains(it.first) }?.let { return it.second }
        }
        INSTITUTION_NAMES.firstOrNull { text.contains(it.first) }?.let { return it.second }
        return SENDER_NUMBER_RE.findAll(text).firstNotNullOfOrNull { SENDER_NUMBERS[it.value.replace("-", "")] }
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
        // 계좌에서 카드값이 빠져나가는 경우: "신한카드 대금"
        if (type == TxType.EXPENSE && listOf("카드대금", "결제대금", "카드값").any { text.contains(it) }) {
            val card = INSTITUTION_NAMES.firstOrNull { (key, name) -> name.endsWith("카드") && text.contains(key) }?.second
            return if (card != null) "$card 대금" else "카드대금"
        }

        // 라벨이 붙은 형식: "가맹점명 : 시외버스승차권", "받는분: 홍길동"
        labeledValue(text, MERCHANT_LABELS)?.let { return it }
        if (!isCardMessage(text)) labeledValue(text, COUNTERPARTY_LABELS)?.let { return it }
        // 그 밖의 라벨 줄(시간·금액·손님명 등)은 이름 찾기에서 뺀다.
        val text = stripLabels(text)

        // 간편결제: "스타벅스에서 4,500원 결제"
        ESEO_RE.find(text)?.let { m ->
            // 바로 앞 낱말만 쓰고, 그게 지점명("강남점")일 때만 그 앞 낱말(브랜드)까지 붙인다.
            val words = m.groupValues[1].split(' ')
            val merchant = if (words.size == 2 && Regex("""\S+(점|지점|본점|매장)""").matches(words[1])) words.joinToString(" ") else words.last()
            MerchantName.clean(merchant)?.let { return it }
        }

        // 카드 결제: 카드 주인(나) 이름이 아니라 가맹점을 찾는다.
        if (isCardMessage(text)) {
            cardMerchant(text)?.let { return it }
            return "카드 결제"
        }

        // 은행 문자: "... 10/16 14:23 110-***-123 출금 12,000 홍길동"
        DATETIME_MERCHANT_RE.find(text)?.let { m ->
            // 시간 뒤에 계좌번호·금액이 오므로 그런 조각은 버린다.
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
        COUNTERPARTY_RE.findAll(text).map { it.groupValues[1] }
            .firstOrNull { !MerchantName.isStopWord(it) }
            ?.let { return it }

        // 그 밖에는 숫자·기관명·키워드를 지우고 남는 단어 중 이름이 될 만한 것을 쓴다.
        val noise = (INSTITUTION_NAMES.map { it.first } + INCOME_WORDS + EXPENSE_WORDS +
            WEAK_INCOME_WORDS + WEAK_EXPENSE_WORDS + CANCEL_WORDS + listOf("잔액", "잔고", "Web발신", "입출금"))
            .sortedByDescending { it.length }
        var rest = BRACKET_RE.replace(text, " ")
        rest = NOT_AMOUNT_RE.replace(rest, " ")
        rest = Regex("""[가-힣A-Za-z]{2,10}님(?!에게|께|한테|이|으로부터|로부터)""").replace(rest, " ") // 계좌 주인(나)
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

    /** "라벨 : 값" 또는 "라벨 값 |" 에서 값을 꺼낸다. 여러 줄·한 줄(| 구분) 형식 모두 */
    private fun labeledValue(text: String, labels: List<String>): String? {
        for (line in text.lines()) {
            LINE_LABEL_RE.find(line)?.let { m ->
                if (m.groupValues[1].trim() in labels) MerchantName.clean(m.groupValues[2])?.let { return it }
            }
        }
        // 한 줄 형식: "... | 가맹점 동네식당 | 12,000원 | ..."
        for (label in labels.sortedByDescending { it.length }) {
            Regex("""(?:^|[|\n·,]|\s)${Regex.escape(label)}\s*[:：]?\s+([^|\n]+)""").find(text)?.let { m ->
                val value = m.groupValues[1].split(Regex("""\s+(?=(?:${OTHER_LABELS.joinToString("|")})\b)""")).first()
                MerchantName.clean(value)?.let { return it }
            }
        }
        return null
    }

    /** 이름이 아닌 라벨 줄을 지우고, 줄 안에 섞인 라벨 단어도 지운다. */
    private fun stripLabels(text: String): String = text.lines()
        .filter { line -> LINE_LABEL_RE.find(line)?.let { it.groupValues[1].trim() !in OTHER_LABELS } ?: true }
        .joinToString("\n") { line -> INLINE_LABELS.fold(line) { acc, w -> acc.replace(w, " ") } }

    // 줄 안에서 지울 때는 "일시불"의 "일시"처럼 다른 말을 깨지 않도록 네 글자 이상 라벨만 쓴다.
    private val INLINE_LABELS = OTHER_LABELS.filter { it.length >= 4 }.sortedByDescending { it.length }

    private fun isCardMessage(text: String) =
        text.contains("카드") || text.contains("승인") || text.contains("일시불") || text.contains("할부")

    /**
     * 카드 문자에서 가맹점 이름을 찾는다. 카드사마다 순서가 달라서
     * (주인 이름·금액·시각·가맹점·누적액이 한 줄 또는 여러 줄로 섞여 온다)
     * 가맹점이 아닌 조각을 모두 지우고 남는 줄을 쓴다. 시각 뒤의 줄을 먼저 본다.
     */
    private fun cardMerchant(text: String): String? {
        val time = Regex("""\d{1,2}[/.\-]\d{1,2}\s+\d{1,2}:\d{2}""").find(text)
        val after = time?.let { text.substring(it.range.last + 1) }.orEmpty()
        val before = time?.let { text.substring(0, it.range.first) } ?: text
        val lines = after.lines() + before.lines().reversed()
        val institutions = INSTITUTION_NAMES.map { it.first }.sortedByDescending { it.length }
        for (line in lines) {
            var rest = CARD_NOISE_RE.replace(line, " ")
            institutions.forEach { rest = rest.replace(it, " ") }
            CARD_WORDS.forEach { rest = rest.replace(it, " ") }
            rest = rest.replace(Regex("""[()/|:.◈◇◆•▶►※\-–]"""), " ").replace(Regex("""\b\d+\b"""), " ")
                .replace(Regex("""\s+"""), " ").trim()
            if (rest.length >= 2 && rest.any { it.isLetter() }) MerchantName.clean(rest)?.let { return it }
        }
        return null
    }

    private fun String.toAmount(): Long? {
        val digits = replace(",", "")
        val negative = digits.startsWith("-")
        val value = digits.removePrefix("-").toLongOrNull() ?: return null
        if (value <= 0 || value > MAX_AMOUNT) return null
        return if (negative) -value else value
    }
}
