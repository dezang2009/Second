// 게임 전체에서 쓰는 데이터 모양. 진행 중인 인생은 통째로 JSON으로 저장되므로
// Life 안에는 함수나 클래스 없이 순수한 값만 둔다.

export const STATS = ["health", "smarts", "looks", "fitness", "social", "happiness"] as const;
export type Stat = (typeof STATS)[number];

export const STAT_LABEL: Record<Stat, string> = {
  health: "건강",
  smarts: "지능",
  looks: "외모",
  fitness: "체력",
  social: "사회성",
  happiness: "행복",
};

export type Gender = "남" | "여";
export type Wealth = "poor" | "normal" | "rich";
export type Talent = "study" | "sports" | "art" | "business";

export const TALENT_LABEL: Record<Talent, string> = {
  study: "공부",
  sports: "운동",
  art: "예술",
  business: "사업",
};

export const WEALTH_LABEL: Record<Wealth, string> = {
  poor: "넉넉하지 않은 집",
  normal: "평범한 집",
  rich: "부유한 집",
};

export type Role = "엄마" | "아빠" | "형제" | "친구" | "연인" | "배우자" | "자녀" | "손주";

export interface Person {
  id: string;
  name: string;
  gender: Gender;
  role: Role;
  /** 태어난 해를 주인공 나이 기준으로 적는다. 주인공이 0살일 때 30살이면 -30 */
  bornAt: number;
  /** 주인공에 대한 호감도 0~100 */
  affinity: number;
  alive: boolean;
  /** 직업 (연인·배우자 등) */
  job?: string;
  /** 연봉(만 원) */
  salary?: number;
  /** 성격 */
  trait?: string;
  /** 집안 형편 */
  wealth?: Wealth;
}

export type Education = "없음" | "고졸" | "전문대졸" | "대졸" | "명문대졸";

export interface Job {
  /** 직업 종류: big, it, public, sme, startup, civil, pro, shop, artist, athlete, parttime */
  id: string;
  title: string;
  /** 올해 연봉(만 원) */
  salary: number;
  /** 이 일을 한 햇수 */
  years: number;
  /** 회사나 기관 id (data/companies.ts) */
  org?: string;
  /** 직급 단계 0부터 (사원, 대리, 과장...) */
  rank?: number;
}

export type Phase =
  | { kind: "activity" }
  | { kind: "event"; eventId: string; cast: Record<string, string>; pending: Person[] }
  | { kind: "outcome"; text: string; changes: Change[]; result?: "success" | "fail" }
  | { kind: "yearEnd"; lines: string[]; changes: Change[] }
  | { kind: "dead" };

export interface Change {
  label: string;
  delta: number;
  /** 돈처럼 단위가 붙는 값 */
  unit?: "money";
}

export interface YearLog {
  age: number;
  lines: string[];
}

export interface Life {
  version: 1;
  seed: number;
  rng: number;
  name: string;
  gender: Gender;
  wealth: Wealth;
  age: number;
  stats: Record<Stat, number>;
  /** 돈(만 원). 빚이면 음수 */
  money: number;
  fame: number;
  hidden: { grit: number; luck: number; talent: Talent };
  revealed: { grit: boolean; luck: boolean; talent: boolean };
  people: Person[];
  education: Education;
  job: Job | null;
  /** 사건에서 쓰는 표시. 숫자, 글자, 참/거짓 */
  flags: Record<string, number | string | boolean>;
  /** 사건별로 몇 번 나왔는지 */
  seen: Record<string, number>;
  /** 사건별로 마지막에 나온 나이 */
  lastSeen: Record<string, number>;
  /** 활동별로 몇 번 했는지 */
  practiced: Record<string, number>;
  phase: Phase;
  year: {
    activity: string | null;
    queue: string[];
    /** 이어지는 장면에 넘겨줄 등장인물 */
    carry?: { cast: Record<string, string>; pending: Person[] };
    start: { stats: Record<Stat, number>; money: number; fame: number };
    lines: string[];
  };
  log: YearLog[];
  happinessSum: number;
  yearsLived: number;
  peakMoney: number;
  alive: boolean;
  causeOfDeath: string | null;
  nextId: number;
}
