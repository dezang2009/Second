package com.moneymoa.parser

import org.junit.Assert.assertEquals
import org.junit.Test

/** 카드 문자에는 카드 주인(나) 이름이 들어 있다. 거래 이름은 반드시 가맹점이어야 한다. */
class CardMerchantTest {

    private fun name(text: String, pkg: String? = null) = requireNotNull(TransactionParser.parse(text, pkg)) { text }.description

    @Test fun shinhanSingleLine() =
        assertEquals("동네식당", name("신한카드(1234)승인 홍*동 12,000원(일시불)10/16 14:23 동네식당 누적1,234,000원"))

    @Test fun kbMultiLine() =
        assertEquals("동네식당", name("[Web발신]\nKB국민카드1234승인\n홍*동님\n12,000원 일시불\n10/16 14:23\n동네식당\n누적1,234,000원"))

    @Test fun kbMultiLineFullName() =
        assertEquals("동네식당", name("KB국민카드1234승인\n홍길동님\n12,000원 일시불\n10/16 14:23\n동네식당\n누적1,234,000원"))

    @Test fun samsung() =
        assertEquals("동네식당", name("[Web발신]\n삼성카드 승인 홍*동\n12,000원 일시불\n10/16 14:23 동네식당\n누적 1,234,000원"))

    @Test fun hanaAmountAfterDate() =
        assertEquals("동네식당", name("하나카드(1234)홍*동님 10/16 14:23 일시불 12,000원 동네식당"))

    @Test fun wooriNameLineAfterDate() =
        assertEquals("동네식당", name("[우리카드]\n[일시불.승인(1234)]10/16 14:23\n12,000원 / 홍*동님\n동네식당\n누적:1,234,000원"))

    @Test fun lotteNameFirst() =
        assertEquals("동네식당", name("롯데카드 홍길동님 12,000원 승인 10/16 14:23 동네식당"))

    @Test fun nhInstallment() =
        assertEquals("동네식당", name("NH카드 승인 홍*동 120,000원 3개월 10/16 14:23 동네식당 누적1,234,000원"))

    @Test fun noDateTime() =
        assertEquals("동네식당", name("현대카드 승인 홍*동님 12,000원 일시불 동네식당"))

    @Test fun cardCancel() =
        assertEquals("동네식당", name("삼성카드 승인취소 홍*동 12,000원 10/16 14:23 동네식당"))

    @Test fun checkCardWithdrawalFromBank() =
        assertEquals("동네식당", name("[KB]10/16 14:23\n123456**789\n동네식당\n체크카드출금\n12,000\n잔액1,000,000"))

    @Test fun payAppEseo() =
        assertEquals("동네식당", name("결제 완료\n동네식당에서 12,000원을 결제했어요", "com.kakaopay.app"))

    @Test fun holderNameOnlyFallsBackToCardPayment() =
        assertEquals("카드 결제", name("신한카드 승인 홍길동님 12,000원 일시불"))

    @Test fun accountOwnerIsNotCounterparty() =
        // "홍길동님 계좌에" 의 홍길동은 계좌 주인(나)이고, 보낸 사람은 김철수
        assertEquals("김철수", name("[하나은행] 홍길동님 계좌에 김철수님이 50,000원 입금했습니다"))

    @Test fun transferCounterpartyStillUsed() {
        assertEquals("김철수", name("송금\n김철수님에게 30,000원을 보냈어요", "viva.republica.toss"))
        assertEquals("홍길동", name("[KB]10/16 14:23\n123456**789\n홍길동\n입금\n50,000\n잔액1,234,567"))
    }
}

class PayAppBranchTest {
    @Test fun branchKeptBeforeEseo() {
        val p = TransactionParser.parse("결제 완료 스타벅스 강남점에서 4,500원 결제", "com.kakaopay.app")!!
        assertEquals("스타벅스 강남점", p.description)
    }
}
