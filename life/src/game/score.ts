// 인생 평가: 분야별 점수, 종합 등급, 업적

import { clamp, netWorth, num, peopleWith } from "./life";
import type { Life } from "./types";

export interface Score {
  key: "happiness" | "wealth" | "fame" | "relations" | "longevity";
  label: string;
  value: number;
}

export interface Verdict {
  scores: Score[];
  total: number;
  grade: "S" | "A" | "B" | "C" | "D";
  title: string;
  achievements: string[];
}

const WEIGHTS: Record<Score["key"], number> = { happiness: 0.3, relations: 0.25, wealth: 0.2, longevity: 0.15, fame: 0.1 };

export function scoreLife(life: Life): Score[] {
  const happiness = life.yearsLived > 0 ? life.happinessSum / life.yearsLived : life.stats.happiness;
  // 재산은 10억(100,000만 원)이면 100점. 로그 눈금이라 적은 돈도 점수가 된다
  const worth = Math.max(netWorth(life), life.peakMoney * 0.5);
  const wealth = worth <= 0 ? 0 : clamp((Math.log10(worth) / 5) * 100, 0, 100);
  const close = peopleWith(life, "배우자", "자녀", "손주", "친구", "형제");
  const ever = life.people.filter((p) => ["배우자", "자녀", "손주", "친구", "형제"].includes(p.role));
  const avgAff = ever.length > 0 ? ever.reduce((n, p) => n + p.affinity, 0) / ever.length : 20;
  const relations = clamp(avgAff * 0.7 + Math.min(30, close.length * 4), 0, 100);
  const longevity = clamp(life.age, 0, 100);
  return [
    { key: "happiness", label: "행복", value: Math.round(happiness) },
    { key: "relations", label: "인간관계", value: Math.round(relations) },
    { key: "wealth", label: "재산", value: Math.round(wealth) },
    { key: "longevity", label: "수명", value: Math.round(longevity) },
    { key: "fame", label: "명성", value: Math.round(life.fame) },
  ];
}

const TITLES: Record<Score["key"], string> = {
  happiness: "웃음이 많았던 인생",
  relations: "사람 곁에 머문 인생",
  wealth: "부를 일군 인생",
  longevity: "오래도록 살아낸 인생",
  fame: "이름을 남긴 인생",
};

export function judge(life: Life): Verdict {
  const scores = scoreLife(life);
  const total = Math.round(scores.reduce((n, s) => n + s.value * WEIGHTS[s.key], 0));
  const grade = total >= 75 ? "S" : total >= 62 ? "A" : total >= 50 ? "B" : total >= 38 ? "C" : "D";
  const best = [...scores].sort((a, b) => b.value - a.value)[0];
  const title = life.age < 20 ? "너무 짧았던 인생" : total < 38 ? "고단했던 인생" : TITLES[best.key];
  return { scores, total, grade, title, achievements: achievementsOf(life) };
}

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  test: (life: Life) => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: "century", name: "백세 인생", desc: "100살까지 산다", test: (l) => l.age >= 100 },
  { id: "eighty", name: "장수", desc: "80살을 넘긴다", test: (l) => l.age >= 80 },
  { id: "rich", name: "부자", desc: "재산 10억 원을 모은다", test: (l) => l.peakMoney >= 100000 },
  { id: "lottery", name: "인생 역전", desc: "로또 1등에 당첨된다", test: (l) => l.flags.lotteryWin === true },
  { id: "elite", name: "명문대 졸업", desc: "명문대를 졸업한다", test: (l) => l.education === "명문대졸" },
  { id: "snu", name: "관악의 별", desc: "서울대학교에 입학한다", test: (l) => l.flags.univ === "서울대학교" },
  { id: "bigcorp", name: "대기업 입사", desc: "대기업·IT·은행 공채에 합격한다", test: (l) => typeof l.flags.hiredAt === "string" && !!l.flags.target },
  { id: "doctor", name: "의사 선생님", desc: "의사 면허를 딴다", test: (l) => l.flags.doctor === true },
  { id: "lawyer", name: "변호사", desc: "변호사시험에 합격한다", test: (l) => l.flags.lawyer === true },
  { id: "exec", name: "별을 달다", desc: "회사 임원(상무)이 된다", test: (l) => (l.job?.rank ?? 0) >= 5 || l.flags.wasExec === true },
  { id: "married", name: "평생의 짝", desc: "결혼한다", test: (l) => num(l, "marriedAt") > 0 },
  { id: "together", name: "백년해로", desc: "배우자와 끝까지 함께한다", test: (l) => peopleWith(l, "배우자").length > 0 && l.age >= 70 },
  { id: "big_family", name: "대가족", desc: "자녀를 셋 이상 둔다", test: (l) => l.people.filter((p) => p.role === "자녀").length >= 3 },
  { id: "grandparent", name: "할머니·할아버지", desc: "손주를 본다", test: (l) => l.people.some((p) => p.role === "손주") },
  { id: "famous", name: "유명인", desc: "명성 60을 넘긴다", test: (l) => l.fame >= 60 },
  { id: "homeowner", name: "내 집 마련", desc: "집을 산다", test: (l) => num(l, "houseValue") > 0 },
  { id: "happy", name: "행복한 사람", desc: "평생 평균 행복 70 이상", test: (l) => l.yearsLived > 0 && l.happinessSum / l.yearsLived >= 70 },
  { id: "marine", name: "빨간 명찰", desc: "해병대에 다녀온다", test: (l) => l.flags.marine === true },
  { id: "president", name: "반장", desc: "반장에 뽑힌다", test: (l) => l.flags.president === true },
  { id: "pet", name: "집사", desc: "고양이를 키운다", test: (l) => l.flags.pet === true },
];

export function achievementsOf(life: Life): string[] {
  return ACHIEVEMENTS.filter((a) => a.test(life)).map((a) => a.id);
}
