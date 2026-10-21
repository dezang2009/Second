import type { Gender } from "./types";
import type { Rng } from "./rng";

const SURNAMES = ["김", "김", "김", "이", "이", "박", "최", "정", "강", "조", "윤", "장", "임", "한", "오", "서", "신", "권", "황", "안", "송", "유", "홍"];

const GIVEN: Record<Gender, string[]> = {
  남: ["민준", "서준", "도윤", "예준", "시우", "하준", "주원", "지호", "지훈", "준서", "건우", "현우", "우진", "선우", "연우", "유준", "정우", "승현", "태윤", "재민", "동현", "성민", "준혁", "민재"],
  여: ["서연", "서윤", "지우", "하은", "민서", "하윤", "지유", "윤서", "채원", "수아", "지민", "지아", "다은", "예린", "수빈", "소율", "예은", "유나", "은서", "가은", "혜원", "나연", "소희", "민지"],
};

export function randomName(rng: Rng, gender: Gender, surname?: string): string {
  return (surname ?? rng.pick(SURNAMES)) + rng.pick(GIVEN[gender]);
}

export function randomGivenName(rng: Rng, gender: Gender): string {
  return rng.pick(GIVEN[gender]);
}

/** 성을 뺀 이름. 대사에서 친근하게 부를 때 쓴다 */
export function givenName(full: string): string {
  return full.length >= 3 ? full.slice(1) : full;
}
