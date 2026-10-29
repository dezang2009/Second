package com.moneymoa.service

/**
 * 알림 한 개에서 해석할 문장들을 뽑는다. (안드로이드 객체 없이 테스트할 수 있게 분리)
 *
 * - 대화형(MessagingStyle): 구글·삼성 메시지 앱의 문자. 문자마다 따로 본다.
 *   이때 본문(EXTRA_TEXT)은 "새 메시지 2개" 같은 요약일 수 있어 믿지 않는다.
 * - 목록형(InboxStyle): 줄마다 문자 하나.
 * - 일반: 제목 + 펼친 본문(없으면 본문). 은행 앱 푸시는 제목에 금액, 본문에 가맹점이 나뉘어 오기도 한다.
 */
object NotificationText {

    fun extract(
        title: String?,
        text: String?,
        bigText: String?,
        lines: List<String>,
        messages: List<String>,
        conversationTitle: String? = null,
    ): List<String> {
        val head = listOfNotNull(conversationTitle, title).filter { it.isNotBlank() }.distinct().joinToString("\n")
        fun withHead(body: String) = listOf(head, body).filter { it.isNotBlank() }.joinToString("\n")

        val parts = when {
            messages.isNotEmpty() -> messages
            lines.isNotEmpty() -> lines
            else -> listOfNotNull(bigText?.takeIf { it.isNotBlank() } ?: text)
        }
        return parts.filter { it.isNotBlank() }.map(::withHead).distinct()
    }
}
