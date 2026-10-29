package com.moneymoa.parser

import org.junit.Assert.assertEquals
import org.junit.Test

/** 앱 푸시 알림처럼 "가맹점: / 금액: / 거래시간:" 라벨이 붙은 형식. 라벨 단어가 이름이 되면 안 된다. */
class LabeledFormatTest {

    private fun name(text: String, pkg: String? = null) = requireNotNull(TransactionParser.parse(text, pkg)) { text }.description

    @Test fun labeledCardPushMultiLine() =
        assertEquals("동네식당", name("[KB국민카드] 승인\n가맹점: 동네식당\n금액: 12,000원 (일시불)\n거래시간: 10/16 14:23"))

    @Test fun labeledCardPushOneLine() =
        assertEquals("동네식당", name("현대카드 승인 | 가맹점 동네식당 | 12,000원 | 거래시간 10/16 14:23"))

    @Test fun merchantBeforeTimeLabel() =
        assertEquals("동네식당", name("삼성카드 승인\n동네식당\n12,000원 일시불\n거래시간 10/16 14:23"))

    @Test fun merchantAfterTimeLabel() =
        assertEquals("동네식당", name("신한카드 승인 홍*동님 12,000원 거래시간 10/16 14:23 동네식당"))

    @Test fun otherLabelNames() {
        assertEquals("동네식당", name("하나카드 승인\n이용가맹점: 동네식당\n승인금액: 12,000원\n거래일시: 2026.10.16 14:23"))
        assertEquals("동네식당", name("롯데카드 결제 안내\n사용처 : 동네식당\n이용금액 : 12,000원\n이용일시 : 10/16 14:23\n할부개월 : 일시불"))
        assertEquals("스타벅스 강남역점", name("우리카드 승인\n가맹점명: 스타벅스 강남역점\n결제금액: 4,500원\n승인일시: 2026-10-16 14:23:05"))
    }

    @Test fun labeledBankPushUsesCounterparty() {
        assertEquals("홍길동", name("[신한은행] 출금\n거래시간: 10/16 14:23\n거래금액: 12,000원\n받는분: 홍길동\n잔액: 1,000,000원"))
        assertEquals("김철수", name("[KB국민은행] 입금\n거래일시 10/16 14:23\n입금액 50,000원\n보낸분 김철수\n거래후잔액 1,050,000원"))
    }

    @Test fun labelsAloneNeverBecomeNames() {
        // 가맹점이 없는 알림이어도 라벨 단어가 이름이 되면 안 된다.
        assertEquals("카드 결제", name("신한카드 승인\n금액: 12,000원\n거래시간: 10/16 14:23"))
        assertEquals("출금", name("[하나은행] 출금\n거래시간: 10/16 14:23\n거래금액: 12,000원"))
    }
}

/** 사용자가 보내 준 실제 하나카드 알림 원문 */
class RealHanaCardTest {
    private val raw = "하나카드\n[하나카드] 체크카드 승인  안내\n\n◈ 사용금액 : 13,600원\n  - 손님명 : 정*현님\n◈ 이용현황\n" +
        "  - 이용카드 : 하나 2*7*\n  - 거래종류 : 체크\n  - 가맹점명 : 시외버스승차권\n  - 거래시간 : 10/27 09:16"

    @Test fun hanaCheckCardPush() {
        val p = requireNotNull(TransactionParser.parse(raw))
        assertEquals(TxType.EXPENSE, p.type)
        assertEquals(13_600, p.amount)
        assertEquals("하나카드", p.institution)
        assertEquals("시외버스승차권", p.description)
        assertEquals(Category.TRANSPORT, Categorizer.categorize(p.type, p.description, raw))
    }

    @Test fun sameFormatWithoutMerchantFallsBack() {
        val noMerchant = raw.replace("  - 가맹점명 : 시외버스승차권\n", "")
        assertEquals("카드 결제", TransactionParser.parse(noMerchant)!!.description)
    }
}
