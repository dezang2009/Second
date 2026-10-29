package com.moneymoa.parser

/**
 * 알림에서 뽑은 거래 이름을 사람이 알아보기 쉬운 짧은 이름으로 정리한다.
 * 브랜드 이름은 사람들이 부르는 이름으로, 지점명은 그대로 살린다.
 * "KCP_(주)우아한형제들" → "배달의민족", "스타벅스강남역점" → "스타벅스 강남역점", "NETFLIX.COM" → "넷플릭스"
 */
object MerchantName {

    /** 법인명·결제대행 표기·영문 표기를 사람들이 부르는 브랜드 이름으로. 앞에서부터 먼저 맞는 것을 쓴다. */
    private val ALIASES: List<Pair<String, String>> = listOf(
        "우아한형제들" to "배달의민족", "배달의민족" to "배달의민족",
        "쿠팡이츠" to "쿠팡이츠", "COUPANGEATS" to "쿠팡이츠", "쿠팡" to "쿠팡", "COUPANG" to "쿠팡",
        "위대한상상" to "요기요", "요기요" to "요기요",
        "비바리퍼블리카" to "토스", "카카오모빌리티" to "카카오T", "카카오T" to "카카오T",
        "우버" to "우버", "UBER" to "우버",
        "NETFLIX" to "넷플릭스", "넷플릭스" to "넷플릭스",
        "YOUTUBE" to "유튜브", "유튜브" to "유튜브", "SPOTIFY" to "스포티파이", "DISNEY" to "디즈니+",
        "APPLE.COM" to "애플", "APPLE" to "애플", "GOOGLE" to "구글", "STEAM" to "스팀",
        "STARBUCKS" to "스타벅스", "스타벅스" to "스타벅스",
        "메가MGC커피" to "메가커피", "메가MGC" to "메가커피", "메가엠지씨" to "메가커피", "메가커피" to "메가커피",
        "투썸플레이스" to "투썸플레이스", "투썸" to "투썸플레이스", "이디야" to "이디야커피",
        "컴포즈커피" to "컴포즈커피", "빽다방" to "빽다방", "할리스" to "할리스", "폴바셋" to "폴바셋",
        "파리바게뜨" to "파리바게뜨", "파리크라상" to "파리바게뜨", "뚜레쥬르" to "뚜레쥬르",
        "던킨" to "던킨", "배스킨라빈스" to "배스킨라빈스", "비알코리아" to "배스킨라빈스",
        "맥도날드" to "맥도날드", "한국맥도날드" to "맥도날드", "버거킹" to "버거킹", "롯데리아" to "롯데리아",
        "맘스터치" to "맘스터치", "서브웨이" to "서브웨이", "KFC" to "KFC",
        "지에스25" to "GS25", "GS25" to "GS25", "GS리테일" to "GS25",
        "비지에프리테일" to "CU", "씨유" to "CU",
        "코리아세븐" to "세븐일레븐", "세븐일레븐" to "세븐일레븐", "미니스톱" to "미니스톱",
        "이마트24" to "이마트24", "이마트에브리데이" to "이마트에브리데이", "이마트" to "이마트",
        "홈플러스" to "홈플러스", "롯데마트" to "롯데마트", "코스트코" to "코스트코",
        "트레이더스" to "트레이더스", "하나로마트" to "하나로마트", "노브랜드" to "노브랜드",
        "올리브영" to "올리브영", "씨제이올리브영" to "올리브영", "다이소" to "다이소", "아성다이소" to "다이소",
        "무신사" to "무신사", "컬리" to "컬리", "지마켓" to "G마켓", "G마켓" to "G마켓",
        "이베이코리아" to "G마켓", "십일번가" to "11번가", "11번가" to "11번가", "에스에스지닷컴" to "SSG",
        "티머니" to "티머니", "한국철도공사" to "코레일", "코레일" to "코레일", "에스알" to "SRT",
        "한국전력" to "한전 전기요금", "한전" to "한전 전기요금",
        "에스케이텔레콤" to "SK텔레콤", "SK텔레콤" to "SK텔레콤", "케이티" to "KT",
        "엘지유플러스" to "LG유플러스", "LG유플러스" to "LG유플러스",
        "CGV" to "CGV", "씨제이씨지브이" to "CGV", "메가박스" to "메가박스", "롯데시네마" to "롯데시네마",
        "교보문고" to "교보문고", "예스이십사" to "예스24", "예스24" to "예스24",
    )

    // "CU 역삼점"처럼 짧은 영문 브랜드는 이름 맨 앞에 단어로 올 때만 인정한다.
    private val WORD_ALIASES = listOf(
        Regex("""^CU(?=\s|$|\(|[가-힣])""") to "CU",
        Regex("""^KT(?=\s|$|\()""") to "KT",
        Regex("""^SKT(?=\s|$|\()""") to "SK텔레콤",
    )

    private val PG_PREFIX = Regex(
        """^(KCP|NHN\s?KCP|NICE|나이스페이|나이스|KG이니시스|이니시스|INICIS|토스페이먼츠|다날|KICC|PAYCO|페이코|""" +
            """스마일페이|카카오페이|네이버페이|PG)\s*[_\-*:]\s*""",
        RegexOption.IGNORE_CASE,
    )
    private val CORP_WORDS = Regex(
        """\(주\)|㈜|주식회사|\(유\)|유한회사|\(사\)|사단법인|\(재\)|재단법인|\(합\)|합자회사|""" +
            """\b(INC|CO|LTD|CORP|LLC)\b\.?""",
        RegexOption.IGNORE_CASE,
    )
    private val BRANCH_WORD = Regex("""[가-힣A-Za-z0-9]{1,12}(점|지점|본점|직영점|매장)""")
    private val SPACED_BRANCH = Regex("""\s+(${BRANCH_WORD.pattern})$""")
    private val TRAILING_PAREN = Regex("""\s*\(([^)]*)\)$""")
    /** '점'으로 끝나지만 지점명이 아닌 말 */
    private val NOT_BRANCH = setOf("편의점", "백화점", "할인점", "면세점", "전문점", "대리점", "음식점", "상점", "매점", "아울렛점")
    private val TRAILING_CODE = Regex("""[\s_\-#]*\d{3,}$""")
    private val DOMAIN_SUFFIX = Regex("""\.(COM|CO\.KR|KR|NET)(/.*)?$""", RegexOption.IGNORE_CASE)

    /** 이름으로 쓸 수 없는 말. 알림 제목·은행 앱 이름 등 */
    private val STOP_WORDS = setOf(
        "고객님", "고객", "계좌", "통장", "내역", "안내", "알림", "거래", "사용", "이용", "금액", "일시불", "할부",
        "체크", "신용", "해외", "국내", "승인", "승인번호", "누적", "잔액", "입출금", "출금알림", "입금알림",
        "스타뱅킹", "SOL", "쏠", "WON", "원큐", "하나원큐", "올원뱅크", "스마트뱅킹", "뱅킹", "앱", "카드",
        "본인", "회원", "결제", "결제완료", "송금완료", "입금완료", "출금완료",
        "거래시간", "거래일시", "이용일시", "승인일시", "사용금액", "이용금액", "승인금액", "결제금액", "거래금액",
        "거래종류", "이용카드", "손님명", "고객명", "이용현황", "가맹점", "가맹점명", "카드번호", "승인번호",
    )

    fun clean(candidate: String?): String? {
        if (candidate.isNullOrBlank()) return null
        var name = candidate.replace('_', ' ').replace(Regex("""\s+"""), " ").trim()
        name = PG_PREFIX.replace(name, "")

        // 지점명을 먼저 떼어 두었다가 마지막에 다시 붙인다.
        var branch: String? = null
        TRAILING_PAREN.find(name)?.let { m ->
            val inner = m.groupValues[1].trim()
            if (isBranch(inner)) branch = inner
            name = name.removeRange(m.range).trim()
        }
        name = CORP_WORDS.replace(name, " ").replace(Regex("""\s+"""), " ").trim()
        name = DOMAIN_SUFFIX.replace(name, "")
        name = TRAILING_CODE.replace(name, "").trim()
        if (branch == null) {
            SPACED_BRANCH.find(name)?.let { m ->
                val b = m.groupValues[1]
                if (isBranch(b)) { branch = b; name = name.removeRange(m.range).trim() }
            }
        }

        val upper = name.uppercase()
        val alias = ALIASES.firstNotNullOfOrNull { (key, brand) ->
            upper.indexOf(key.uppercase()).takeIf { it >= 0 }?.let { Triple(brand, it, key.length) }
        } ?: WORD_ALIASES.firstNotNullOfOrNull { (re, brand) ->
            re.find(upper)?.let { Triple(brand, it.range.first, it.value.length) }
        }
        if (alias != null) {
            val (brand, at, len) = alias
            // "스타벅스강남역점"처럼 브랜드 뒤에 붙어 있는 지점명
            if (branch == null) {
                val rest = name.substring(at + len).trim(' ', '-', '.')
                if (BRANCH_WORD.matches(rest) && isBranch(rest)) branch = rest
            }
            return withBranch(brand, branch)
        }

        name = name.trim(' ', '.', ',', '-', '*', '/', '|', ':').replace(Regex("""\s+"""), " ")
        if (name.length < 2 || name.none { it.isLetter() } || name in STOP_WORDS) return null
        return withBranch(name, branch)
    }

    /** 지점명을 뺀 브랜드 이름. 카테고리 규칙은 지점과 상관없이 브랜드에 건다. */
    fun brandOf(name: String): String =
        SPACED_BRANCH.find(name)?.takeIf { isBranch(it.groupValues[1]) }
            ?.let { name.removeRange(it.range).trim() }?.ifBlank { null } ?: name

    private fun isBranch(word: String) =
        BRANCH_WORD.matches(word) && word !in NOT_BRANCH && NOT_BRANCH.none { word.endsWith(it) }

    private fun withBranch(base: String, branch: String?): String {
        val full = if (branch != null) "$base $branch" else base
        return if (full.length > 20) full.take(20).trimEnd() + "…" else full
    }

    fun isStopWord(word: String) = word in STOP_WORDS
}
