// 한국어 문장 다듬기: 이름 뒤 조사 고르기, 돈 표시

const JOSA = /([가-힣A-Za-z0-9])(이\(가\)|을\(를\)|은\(는\)|과\(와\)|와\(과\)|아\(야\)|\(이\)|\(으\)로)/g;

function hasBatchim(ch: string): boolean {
  const code = ch.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0;
  // 숫자와 영문은 읽는 소리 기준으로 대략 판단
  if (/[013678LMNR]/i.test(ch)) return true;
  return false;
}

function rieulBatchim(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 === 8;
}

/** "지민이(가)" → "지민이", "서아이(가)" → "서아가" 처럼 앞 글자 받침에 맞는 조사를 고른다 */
export function josa(text: string): string {
  return text.replace(JOSA, (_, ch: string, form: string) => {
    const b = hasBatchim(ch);
    switch (form) {
      case "이(가)":
        return ch + (b ? "이" : "가");
      case "을(를)":
        return ch + (b ? "을" : "를");
      case "은(는)":
        return ch + (b ? "은" : "는");
      case "과(와)":
      case "와(과)":
        return ch + (b ? "과" : "와");
      case "아(야)":
        return ch + (b ? "아" : "야");
      case "(이)":
        return ch + (b ? "이" : "");
      case "(으)로":
        return ch + (b && !rieulBatchim(ch) ? "으로" : "로");
    }
    return ch + form;
  });
}

/** {key}를 vars[key]로 바꾸고 조사를 맞춘다 */
export function fill(template: string, vars: Record<string, string>): string {
  return josa(template.replace(/\{(\w+)\}/g, (m, key: string) => vars[key] ?? m));
}

/** 만 원 단위 금액을 "1억 2,300만 원"처럼 보여 준다 */
export function formatMoney(manwon: number): string {
  const sign = manwon < 0 ? "-" : "";
  const v = Math.abs(Math.round(manwon));
  const eok = Math.floor(v / 10000);
  const man = v % 10000;
  if (eok > 0 && man > 0) return `${sign}${eok.toLocaleString("ko-KR")}억 ${man.toLocaleString("ko-KR")}만 원`;
  if (eok > 0) return `${sign}${eok.toLocaleString("ko-KR")}억 원`;
  if (man > 0) return `${sign}${man.toLocaleString("ko-KR")}만 원`;
  return "0원";
}
