package com.moneymoa.parser

enum class Category(val label: String, val emoji: String, val isIncome: Boolean = false) {
    FOOD("식비", "🍚"),
    CAFE("카페·간식", "☕"),
    MART("마트·편의점", "🛒"),
    SHOPPING("쇼핑", "🛍️"),
    TRANSPORT("교통", "🚌"),
    TELECOM("통신", "📱"),
    HOUSING("주거·공과금", "🏠"),
    HEALTH("의료·건강", "💊"),
    CULTURE("문화·여가", "🎬"),
    FINANCE("금융·보험", "🏦"),
    TRANSFER("이체", "🔁"),
    ETC("기타", "📦"),
    SALARY("급여", "💰", isIncome = true),
    REFUND("환불", "↩️", isIncome = true),
    INCOME_ETC("기타 수입", "💵", isIncome = true);

    companion object {
        fun forType(type: TxType) = entries.filter { it.isIncome == (type == TxType.INCOME) }
    }
}

/**
 * 거래 내용(가맹점·받는 사람)과 알림 원문으로 카테고리를 추정한다.
 * 사용자가 직접 바꾼 규칙(userRules: 내용 → 카테고리)이 항상 먼저 적용된다.
 */
object Categorizer {

    // 순서가 중요하다: 먼저 맞는 카테고리가 이긴다. (예: "KTX"는 통신 "KT"보다 교통이 먼저)
    private val EXPENSE_RULES: List<Pair<Category, List<String>>> = listOf(
        Category.CAFE to listOf(
            "스타벅스", "커피", "카페", "이디야", "투썸", "메가MGC", "메가커피", "컴포즈", "빽다방",
            "할리스", "폴바셋", "블루보틀", "파리바게뜨", "뚜레쥬르", "베이커리", "던킨", "배스킨",
            "디저트", "공차", "설빙",
        ),
        Category.FOOD to listOf(
            "배달의민족", "배민", "요기요", "쿠팡이츠", "맥도날드", "롯데리아", "버거킹", "KFC", "맘스터치",
            "버거", "치킨", "피자", "김밥", "분식", "국밥", "식당", "반점", "횟집", "고기", "갈비",
            "푸드", "도시락", "한식", "중식", "일식", "마라", "샐러드", "서브웨이", "본죽", "냉면",
        ),
        Category.MART to listOf(
            "GS25", "CU", "세븐일레븐", "이마트24", "미니스톱", "편의점", "이마트", "홈플러스",
            "롯데마트", "코스트코", "트레이더스", "하나로마트", "노브랜드", "마트",
        ),
        Category.TRANSPORT to listOf(
            "택시", "카카오T", "카카오모빌리티", "티머니", "지하철", "버스", "코레일", "KTX", "SRT",
            "주유", "SK에너지", "GS칼텍스", "S-OIL", "에쓰오일", "현대오일", "하이패스", "주차",
            "고속도로", "쏘카", "그린카", "따릉이",
        ),
        Category.TELECOM to listOf("SK텔레콤", "SKT", "KT", "LG유플러스", "LGU+", "통신", "알뜰폰"),
        Category.HOUSING to listOf("관리비", "월세", "전기요금", "한전", "도시가스", "가스", "수도", "아파트"),
        Category.HEALTH to listOf(
            "병원", "의원", "약국", "치과", "한의원", "내과", "외과", "피부과", "안과", "이비인후과",
            "헬스", "필라테스", "요가",
        ),
        Category.CULTURE to listOf(
            "CGV", "메가박스", "롯데시네마", "넷플릭스", "NETFLIX", "유튜브", "YOUTUBE", "멜론", "스포티파이",
            "티빙", "웨이브", "디즈니", "왓챠", "스팀", "STEAM", "게임", "노래방", "PC방", "교보문고",
            "예스24", "알라딘", "야놀자", "여기어때", "호텔", "숙박", "항공", "에어비앤비",
        ),
        Category.SHOPPING to listOf(
            "쿠팡", "11번가", "G마켓", "지마켓", "옥션", "SSG", "무신사", "올리브영", "다이소",
            "백화점", "아울렛", "29CM", "에이블리", "지그재그", "알리익스프레스", "테무", "컬리",
            "네이버페이", "스마트스토어",
        ),
        Category.FINANCE to listOf("보험", "대출", "이자", "카드대금", "수수료", "증권", "적금", "청약"),
        Category.TRANSFER to listOf("송금", "이체", "보냈어요", "보냄", "님에게"),
    )

    private val SALARY_WORDS = listOf("급여", "월급", "상여", "성과급", "보너스")
    private val REFUND_WORDS = listOf("취소", "환불", "캐시백")

    fun categorize(
        type: TxType,
        description: String,
        rawText: String? = null,
        userRules: Map<String, Category> = emptyMap(),
    ): Category {
        // 정확히 같은 이름이 먼저, 없으면 지점과 상관없이 브랜드 규칙을 쓴다.
        val rule = userRules[description.trim()] ?: userRules[MerchantName.brandOf(description.trim())]
        rule?.let { if (it.isIncome == (type == TxType.INCOME)) return it }

        val text = (description + " " + rawText.orEmpty()).uppercase()
        if (type == TxType.INCOME) {
            return when {
                REFUND_WORDS.any { text.contains(it) } -> Category.REFUND
                SALARY_WORDS.any { text.contains(it) } -> Category.SALARY
                else -> Category.INCOME_ETC
            }
        }
        // 가맹점 이름(description)을 원문보다 먼저 본다. 원문에는 은행 이름 등 잡음이 많다.
        for (source in listOf(description.uppercase(), text)) {
            EXPENSE_RULES.firstOrNull { (_, words) -> words.any { source.contains(it.uppercase()) } }
                ?.let { return it.first }
        }
        return Category.ETC
    }
}
