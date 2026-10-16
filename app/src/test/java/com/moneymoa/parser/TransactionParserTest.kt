package com.moneymoa.parser

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class TransactionParserTest {

    private fun parse(text: String, pkg: String? = null) =
        requireNotNull(TransactionParser.parse(text, pkg)) { "parse failed: $text" }

    @Test fun kbMultilineDeposit() {
        val t = parse("[Web발신]\n[KB]10/16 14:23\n123456**789\n홍길동\n입금\n50,000\n잔액1,234,567")
        assertEquals(TxType.INCOME, t.type)
        assertEquals(50_000, t.amount)
        assertEquals(1_234_567L, t.balance)
        assertEquals("KB국민은행", t.institution)
        assertEquals("홍길동", t.description)
    }

    @Test fun kbSmallAmountOnOwnLine() {
        val t = parse("[KB]10/16 09:01\n123456**789\n편의점\n출금\n500\n잔액12,000")
        assertEquals(TxType.EXPENSE, t.type)
        assertEquals(500, t.amount)
    }

    @Test fun shinhanWithdrawal() {
        val t = parse("[신한은행] 10/16 14:23 110-***-123456 출금 12,000 잔액 1,000,000 홍길동")
        assertEquals(TxType.EXPENSE, t.type)
        assertEquals(12_000, t.amount)
        assertEquals(1_000_000L, t.balance)
        assertEquals("신한은행", t.institution)
    }

    @Test fun cardApprovalPicksMerchantNotCumulative() {
        val t = parse("신한카드(1234)승인 홍*동 12,000원(일시불)10/16 14:23 스타벅스 누적1,234,000원")
        assertEquals(TxType.EXPENSE, t.type)
        assertEquals(12_000, t.amount)
        assertEquals("신한카드", t.institution)
        assertEquals("스타벅스", t.description)
    }

    @Test fun cardCancelIsIncome() {
        val t = parse("[Web발신]\n삼성카드 승인취소 8,900원 10/16 12:00 쿠팡")
        assertEquals(TxType.INCOME, t.type)
        assertEquals(8_900, t.amount)
    }

    @Test fun tossSendFromPackage() {
        val t = parse("송금\n김철수님에게 30,000원을 보냈어요", "viva.republica.toss")
        assertEquals(TxType.EXPENSE, t.type)
        assertEquals(30_000, t.amount)
        assertEquals("토스", t.institution)
        assertEquals("김철수", t.description)
    }

    @Test fun kakaoBankDeposit() {
        val t = parse("입출금 알림\n입금 1,500,000원\n홍길동 | 잔액 2,000,000원", "com.kakaobank.channel")
        assertEquals(TxType.INCOME, t.type)
        assertEquals(1_500_000, t.amount)
        assertEquals("카카오뱅크", t.institution)
        assertEquals("홍길동", t.description)
    }

    @Test fun loanInterestWithdrawalIsExpense() {
        val t = parse("[NH] 대출이자 출금 45,000원 잔액 300,000원")
        assertEquals(TxType.EXPENSE, t.type)
        assertEquals(45_000, t.amount)
        assertEquals("NH농협은행", t.institution)
    }

    @Test fun ignoresUnknownSender() {
        assertNull(TransactionParser.parse("친구: 나 오늘 5,000원 입금했어"))
    }

    @Test fun ignoresAdsAndAuthCodes() {
        assertNull(TransactionParser.parse("[KB국민은행] 인증번호 123456 입력"))
        assertNull(TransactionParser.parse("(광고)[신한카드] 결제 시 10,000원 캐시백 이벤트"))
        assertNull(TransactionParser.parse("[우리은행] 10/17 자동이체 출금예정 50,000원"))
    }

    @Test fun ignoresMessagesWithoutAmount() {
        assertNull(TransactionParser.parse("[하나은행] 입금 계좌가 등록되었습니다"))
    }
}

class LooksFinancialTest {
    @Test fun unrecognizedBankMessageWithAmount() {
        // 입출금 키워드가 없어 거래로는 못 읽지만 은행이 보낸 금액 있는 알림
        val text = "[KB국민은행] 홍길동님 10/16 14:23 50,000원 처리되었습니다"
        assertNull(TransactionParser.parse(text))
        assertEquals(true, TransactionParser.looksFinancial(text))
    }

    @Test fun ignoresNonFinancialOrNoAmount() {
        assertEquals(false, TransactionParser.looksFinancial("친구: 50,000원 보내줘"))
        assertEquals(false, TransactionParser.looksFinancial("[KB국민은행] 로그인되었습니다"))
        assertEquals(false, TransactionParser.looksFinancial("(광고)[신한카드] 10,000원 캐시백"))
        // 잔액만 있는 알림은 거래 금액이 아니다
        assertEquals(false, TransactionParser.looksFinancial("[하나은행] 현재 잔액 1,000,000원"))
    }
}
