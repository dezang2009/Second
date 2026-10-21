// 해마다 고르는 "올해의 활동". 숨겨진 재능과 맞는 활동은 효과가 커지고, 몇 번 하면 재능이 드러난다.

import type { Amount } from "../game/events";
import { canWork, employed, inMilitary, inSchool, retired } from "../game/life";
import type { Life, Stat, Talent } from "../game/types";

export interface Activity {
  id: string;
  label: string;
  desc: string;
  ages: [number, number];
  when?: (life: Life) => boolean;
  /** 이 재능이 있으면 좋은 효과가 1.6배 */
  talent?: Talent;
  stats?: Partial<Record<Stat, Amount>>;
  money?: Amount | ((life: Life) => Amount);
  fame?: Amount;
  /** 가족 호감도 */
  family?: Amount;
}

const student = (life: Life) => inSchool(life);
const adult = (life: Life) => life.age >= 19 && life.age < 65 && !inMilitary(life) && !retired(life);
const senior = (life: Life) => life.age >= 65 || retired(life);

export const ACTIVITIES: Activity[] = [
  // 학창 시절
  { id: "study", label: "공부", desc: "지능이 오르고 조금 지친다", ages: [8, 18], when: student, talent: "study", stats: { smarts: [2, 4], happiness: -1 } },
  { id: "sports", label: "운동", desc: "체력과 건강이 오른다", ages: [8, 18], when: student, talent: "sports", stats: { fitness: [2, 4], health: [1, 2] } },
  { id: "friends", label: "친구들과 놀기", desc: "사회성과 행복이 오른다", ages: [8, 18], when: student, stats: { social: [2, 3], happiness: [2, 3] } },
  { id: "arts", label: "그림·음악", desc: "행복이 오르고 감각이 자란다", ages: [8, 18], when: student, talent: "art", stats: { happiness: [1, 3], smarts: [0, 1], looks: [0, 1] } },
  { id: "games", label: "게임", desc: "즐겁지만 공부와 건강엔 별로", ages: [8, 18], when: student, stats: { happiness: [3, 4], smarts: -1, health: -1 } },
  { id: "allowance", label: "용돈 모으기", desc: "심부름하고 용돈을 모은다", ages: [10, 18], when: student, talent: "business", stats: { happiness: -1 }, money: [20, 60] },

  // 군 복무
  { id: "drill", label: "체력 단련", desc: "체력과 끈기가 길러진다", ages: [19, 30], when: inMilitary, talent: "sports", stats: { fitness: [3, 5], health: [1, 2], happiness: -1 } },
  { id: "barracks_books", label: "틈틈이 독서", desc: "생활관에서 책을 읽는다", ages: [19, 30], when: inMilitary, talent: "study", stats: { smarts: [2, 3] } },
  { id: "letters", label: "편지 쓰기", desc: "가족과 친구에게 편지를 쓴다", ages: [19, 30], when: inMilitary, stats: { happiness: [1, 2], social: 1 }, family: [2, 4] },

  // 성인
  { id: "work_hard", label: "일에 집중", desc: "돈을 더 벌고 지친다", ages: [19, 69], when: (l) => adult(l) && employed(l), stats: { happiness: -2, health: -1 }, money: (l) => Math.round((l.job?.salary ?? 0) * 0.15) },
  { id: "parttime", label: "아르바이트", desc: "용돈벌이를 한다", ages: [19, 64], when: (l) => adult(l) && !employed(l), stats: { happiness: -1 }, money: [400, 700] },
  { id: "selfdev", label: "자기계발", desc: "공부하고 자격증을 딴다", ages: [19, 64], when: adult, talent: "study", stats: { smarts: [1, 3], happiness: -1 } },
  { id: "workout", label: "운동", desc: "체력과 건강을 챙긴다", ages: [19, 64], when: adult, talent: "sports", stats: { fitness: [1, 3], health: [1, 3] } },
  { id: "dating", label: "연애·모임", desc: "사람을 만나고 인연을 찾는다", ages: [19, 64], when: adult, stats: { social: [1, 3], happiness: [1, 2] }, money: -150 },
  { id: "rest", label: "휴식", desc: "쉬면서 마음을 돌본다", ages: [19, 64], when: adult, stats: { happiness: [3, 5], health: [0, 1] } },
  { id: "hobby", label: "창작 취미", desc: "글, 그림, 음악을 만든다", ages: [19, 64], when: adult, talent: "art", stats: { happiness: [2, 3] }, fame: [0, 1] },
  { id: "invest", label: "부업·투자", desc: "돈을 굴려 본다. 잃을 수도 있다", ages: [22, 64], when: (l) => adult(l) && canWork(l), talent: "business", money: (l) => [-400, 400 + l.hidden.luck * 6] },
  { id: "family_time", label: "가족과 시간", desc: "가족과의 관계가 깊어진다", ages: [25, 64], when: (l) => adult(l) && l.people.some((p) => p.alive && (p.role === "배우자" || p.role === "자녀")), stats: { happiness: [2, 3] }, family: [3, 5] },

  // 노년
  { id: "walk", label: "산책", desc: "건강을 조금 지킨다", ages: [50, 120], when: senior, stats: { health: [1, 2], happiness: 1 } },
  { id: "senior_family", label: "가족과 시간", desc: "가족과 함께 지낸다", ages: [50, 120], when: senior, stats: { happiness: [2, 3] }, family: [3, 5] },
  { id: "senior_hobby", label: "취미 생활", desc: "텃밭, 서예, 노래 교실", ages: [50, 120], when: senior, talent: "art", stats: { happiness: [2, 4] }, fame: [0, 1] },
  { id: "volunteer", label: "봉사 활동", desc: "이웃을 돕는다", ages: [50, 120], when: senior, stats: { social: [1, 3], happiness: [1, 3] }, fame: [0, 1] },
  { id: "senior_rest", label: "푹 쉬기", desc: "느긋하게 지낸다", ages: [50, 120], when: senior, stats: { happiness: [2, 3], health: [0, 1] } },
];

export function activitiesFor(life: Life): Activity[] {
  return ACTIVITIES.filter((a) => life.age >= a.ages[0] && life.age <= a.ages[1] && (!a.when || a.when(life)));
}
