package com.moneymoa.parser

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class MerchantNameTest {

    private fun clean(s: String) = MerchantName.clean(s)

    @Test fun legalNamesBecomeBrands() {
        assertEquals("배달의민족", clean("(주)우아한형제들"))
        assertEquals("배달의민족", clean("KCP_우아한형제들"))
        assertEquals("토스", clean("비바리퍼블리카"))
        assertEquals("CU", clean("비지에프리테일"))
        assertEquals("세븐일레븐", clean("코리아세븐 역삼점"))
        assertEquals("메가커피", clean("메가MGC커피 강남역점"))
    }

    @Test fun englishBillingNames() {
        assertEquals("넷플릭스", clean("NETFLIX.COM"))
        assertEquals("유튜브", clean("GOOGLE*YOUTUBE"))
        assertEquals("애플", clean("APPLE.COM/BILL"))
    }

    @Test fun shortBrandsOnlyAsWords() {
        assertEquals("CU", clean("CU 역삼점"))
        assertEquals("CU", clean("CU역삼점"))
        assertEquals("KT", clean("KT 통신요금"))
        // 'CU'가 단어 중간에 있으면 CU 편의점이 아니다
        assertEquals("ACUVUE", clean("ACUVUE"))
    }

    @Test fun stripsBranchCorpAndCodes() {
        assertEquals("김밥천국", clean("김밥천국 서초2호점"))
        assertEquals("한솥도시락", clean("주식회사 한솥도시락"))
        assertEquals("동네식당", clean("동네식당(강남)"))
        assertEquals("우리약국", clean("우리약국_000123"))
    }

    @Test fun keepsNamesThatOnlyLookLikeSuffixes() {
        assertEquals("편의점", clean("편의점"))
        assertEquals("홍길동", clean("홍길동"))
    }

    @Test fun rejectsNonNames() {
        assertNull(clean("고객님"))
        assertNull(clean("일시불"))
        assertNull(clean("12345"))
        assertNull(clean("스타뱅킹"))
    }

    @Test fun parserProducesCleanNames() {
        fun name(text: String, pkg: String? = null) = TransactionParser.parse(text, pkg)!!.description
        assertEquals("배달의민족", name("KB국민카드1234승인 홍*동 23,000원 일시불 10/16 12:03 (주)우아한형제들 누적500,000원"))
        assertEquals("스타벅스", name("신한카드(1234)승인 홍*동 4,500원(일시불)10/16 08:10 스타벅스 강남역점 누적100,000원"))
        assertEquals("급여", name("[KB]10/25 09:00\n123456**789\n(주)회사\n급여입금\n2,800,000\n잔액3,000,000"))
        assertEquals("김철수", name("송금\n고객님, 김철수님에게 30,000원을 보냈어요", "viva.republica.toss"))
        assertEquals("ATM 출금", name("[신한은행] 10/16 14:23 110-***-123456 ATM인출 100,000 잔액 900,000"))
        assertEquals("카드 결제", name("[Web발신]\n삼성카드 승인 15,000원"))
    }
}
