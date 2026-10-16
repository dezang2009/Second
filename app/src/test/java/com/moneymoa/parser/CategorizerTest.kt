package com.moneymoa.parser

import org.junit.Assert.assertEquals
import org.junit.Test

class CategorizerTest {

    private fun expense(desc: String, raw: String? = null) = Categorizer.categorize(TxType.EXPENSE, desc, raw)

    @Test fun merchants() {
        assertEquals(Category.CAFE, expense("스타벅스"))
        assertEquals(Category.FOOD, expense("배달의민족"))
        assertEquals(Category.MART, expense("GS25 역삼점"))
        assertEquals(Category.SHOPPING, expense("쿠팡"))
        assertEquals(Category.TRANSPORT, expense("카카오T택시"))
        assertEquals(Category.CULTURE, expense("NETFLIX.COM"))
        assertEquals(Category.HEALTH, expense("온누리약국"))
    }

    @Test fun ktxIsTransportNotTelecom() {
        assertEquals(Category.TRANSPORT, expense("코레일 KTX"))
        assertEquals(Category.TELECOM, expense("KT 통신요금"))
    }

    @Test fun merchantWinsOverNoisyRawText() {
        // 원문 속 '이체'보다 가맹점 이름이 먼저다.
        assertEquals(Category.CAFE, expense("스타벅스", "신한카드 이체 스타벅스"))
    }

    @Test fun transferFromRawText() {
        assertEquals(Category.TRANSFER, expense("김철수", "김철수님에게 30,000원을 보냈어요"))
    }

    @Test fun unknownIsEtc() {
        assertEquals(Category.ETC, expense("홍길동"))
    }

    @Test fun incomeCategories() {
        assertEquals(Category.SALARY, Categorizer.categorize(TxType.INCOME, "(주)회사", "입금 급여"))
        assertEquals(Category.REFUND, Categorizer.categorize(TxType.INCOME, "쿠팡", "삼성카드 승인취소"))
        assertEquals(Category.INCOME_ETC, Categorizer.categorize(TxType.INCOME, "홍길동", "입금 50,000"))
    }

    @Test fun userRuleWins() {
        val rules = mapOf("홍길동" to Category.HOUSING)
        assertEquals(Category.HOUSING, Categorizer.categorize(TxType.EXPENSE, "홍길동", null, rules))
        // 브랜드 규칙은 다른 지점에도 적용된다.
        val brandRule = mapOf("스타벅스" to Category.FOOD)
        assertEquals(Category.FOOD, Categorizer.categorize(TxType.EXPENSE, "스타벅스 역삼점", null, brandRule))
        // 지출 규칙은 같은 이름의 입금에는 적용하지 않는다.
        assertEquals(Category.INCOME_ETC, Categorizer.categorize(TxType.INCOME, "홍길동", null, rules))
    }

    @Test fun parsedCardApprovalEndToEnd() {
        val raw = "신한카드(1234)승인 홍*동 4,500원(일시불)10/16 08:10 메가MGC커피 누적100,000원"
        val p = requireNotNull(TransactionParser.parse(raw))
        assertEquals(Category.CAFE, Categorizer.categorize(p.type, p.description, raw))
    }
}
