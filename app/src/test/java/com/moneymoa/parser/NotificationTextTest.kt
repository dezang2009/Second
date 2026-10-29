package com.moneymoa.parser

import com.moneymoa.service.NotificationText
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test

class NotificationTextTest {

    @Test fun messagingStyleReadsEverySms() {
        // 메시지 앱이 문자 두 개를 한 알림으로 묶고, 본문에는 요약만 넣은 경우
        val texts = NotificationText.extract(
            title = "KB국민카드", text = "새 메시지 2개", bigText = null, lines = emptyList(),
            messages = listOf(
                "KB국민카드1234승인\n홍*동님\n4,500원 일시불\n10/16 08:10\n스타벅스\n누적100,000원",
                "KB국민카드1234승인\n홍*동님\n12,000원 일시불\n10/16 12:30\n동네식당\n누적112,000원",
            ),
        )
        assertEquals(2, texts.size)
        assertEquals(listOf(4_500L, 12_000L), texts.map { TransactionParser.parse(it)!!.amount })
    }

    @Test fun pushWithAmountInTitleAndMerchantInBody() {
        val texts = NotificationText.extract("신한카드 12,000원 승인", "동네식당 10/16 14:23", null, emptyList(), emptyList())
        val p = TransactionParser.parse(texts.single(), "com.shcard.smartpay")
        assertNotNull(p); assertEquals(12_000L, p!!.amount)
    }

    @Test fun bigTextPreferredOverTruncatedText() {
        val texts = NotificationText.extract("하나카드", "[하나카드] 체크카드 승인 안내…", "[하나카드] 체크카드 승인 안내\n사용금액 : 13,600원", emptyList(), emptyList())
        assertEquals("하나카드\n[하나카드] 체크카드 승인 안내\n사용금액 : 13,600원", texts.single())
    }
}

class MoreFormatsTest {
    private fun parse(text: String, pkg: String? = null) = TransactionParser.parse(text, pkg)

    @Test fun usageWordWithoutApproval() {
        val p = parse("[KB국민카드] 홍*동님 12,000원 사용 10/16 14:23 동네식당")!!
        assertEquals(com.moneymoa.parser.TxType.EXPENSE, p.type); assertEquals("동네식당", p.description)
    }

    @Test fun senderNumberIdentifiesBank() {
        // 문자 앱: 제목(보낸 번호)만 있고 본문에 은행 이름이 없는 경우
        val p = parse("1588-9999\n10/16 14:23 입금 50,000원 홍길동 잔액 1,050,000원", "com.samsung.android.messaging")!!
        assertEquals("KB국민은행", p.institution); assertEquals(50_000L, p.amount)
    }
}
