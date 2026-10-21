// 사건 데이터의 모양과, 사건을 고르고 선택지 결과를 적용하는 규칙

import { addStat, clamp, newPersonId, opposite, peopleWith } from "./life";
import { randomName } from "./names";
import type { Rng } from "./rng";
import { fill } from "./text";
import type { Education, Gender, Life, Person, Role, Stat } from "./types";

/** 고정값 또는 [최소, 최대] 범위에서 무작위 정수 */
export type Amount = number | [number, number];

export interface Ctx {
  life: Life;
  rng: Rng;
  /** 이 사건에 등장하는 사람. 키는 사건 데이터의 cast 키 */
  cast: Record<string, Person>;
}

export interface Effects {
  stats?: Partial<Record<Stat, Amount>>;
  /** 만 원 */
  money?: Amount;
  fame?: Amount;
  flags?: Record<string, number | string | boolean>;
  /** cast 키별 호감도 변화 */
  affinity?: Record<string, Amount>;
  /** 새로 만난 사람(cast의 new) 중 인생에 남길 사람 */
  meet?: string[];
  /** cast 키별 관계 바꾸기. null이면 관계를 끊고 목록에서 지움 */
  role?: Record<string, Role | null>;
  job?: { id: string; title: string; salary: number } | null;
  education?: Education;
  reveal?: ("grit" | "luck" | "talent")[];
  /** 이 결과로 사망. 값은 사망 원인 */
  death?: string;
  /** 데이터로 표현하기 어려운 특별한 처리 */
  run?: (ctx: Ctx) => void;
}

export interface Outcome {
  text: string | ((ctx: Ctx) => string);
  effects?: Effects;
}

export type CheckStat = Stat | "grit" | "luck" | "fame";

export interface Choice {
  text: string;
  /** 이 조건일 때만 선택지가 보임 */
  when?: (life: Life) => boolean;
  /** 능력치 판정. 능력치가 dc보다 높을수록 성공하기 쉬움 */
  check?: { stat: CheckStat; dc: number };
  /** 판정 대신 직접 성공 확률을 정할 때 */
  chance?: (life: Life) => number;
  success?: Outcome;
  fail?: Outcome;
  /** 판정 없는 선택지의 결과 */
  outcome?: Outcome;
}

export type CastSpec =
  /** 이미 아는 사람 중에서 고름 */
  | { role: Role | Role[]; filter?: (p: Person, life: Life) => boolean }
  /** 새로 만나는 사람. gender 기본값은 아무나, age는 주인공과의 나이 차이 */
  | { new: Role; gender?: "same" | "opposite"; age?: [number, number] };

export interface GameEvent {
  id: string;
  ages: [number, number];
  /** 조건이 맞으면 반드시 일어나는 인생의 큰 사건 */
  milestone?: boolean;
  /** 평생 최대 횟수. 기본 1 */
  max?: number;
  /** 다시 나오기까지 최소 햇수 */
  cooldown?: number;
  weight?: number | ((life: Life) => number);
  when?: (life: Life) => boolean;
  cast?: Record<string, CastSpec>;
  text: string | ((ctx: Ctx) => string);
  choices: Choice[];
}

export function amount(rng: Rng, a: Amount): number {
  return typeof a === "number" ? a : rng.int(Math.min(a[0], a[1]), Math.max(a[0], a[1]));
}

export function eligible(ev: GameEvent, life: Life): boolean {
  if (life.age < ev.ages[0] || life.age > ev.ages[1]) return false;
  const seen = life.seen[ev.id] ?? 0;
  if (seen >= (ev.max ?? 1)) return false;
  if (ev.cooldown && life.lastSeen[ev.id] !== undefined && life.age - life.lastSeen[ev.id] < ev.cooldown) return false;
  if (ev.when && !ev.when(life)) return false;
  // 아는 사람이 필요한 사건은 그런 사람이 있어야 함
  for (const spec of Object.values(ev.cast ?? {})) {
    if ("role" in spec && candidatesFor(spec, life).length === 0) return false;
  }
  return true;
}

export function eventWeight(ev: GameEvent, life: Life): number {
  if (ev.weight === undefined) return 1;
  return typeof ev.weight === "number" ? ev.weight : ev.weight(life);
}

function candidatesFor(spec: { role: Role | Role[]; filter?: (p: Person, life: Life) => boolean }, life: Life): Person[] {
  const roles = Array.isArray(spec.role) ? spec.role : [spec.role];
  return peopleWith(life, ...roles).filter((p) => !spec.filter || spec.filter(p, life));
}

/** 사건에 등장할 사람을 정한다. 새로 만나는 사람은 pending에 넣어 두고 선택에 따라 남긴다 */
export function castEvent(ev: GameEvent, life: Life, rng: Rng): { cast: Record<string, string>; pending: Person[] } {
  const cast: Record<string, string> = {};
  const pending: Person[] = [];
  for (const [key, spec] of Object.entries(ev.cast ?? {})) {
    if ("role" in spec) {
      cast[key] = rng.pick(candidatesFor(spec, life)).id;
    } else {
      const gender: Gender =
        spec.gender === "same" ? life.gender : spec.gender === "opposite" ? opposite(life.gender) : rng.chance(0.5) ? "남" : "여";
      const [lo, hi] = spec.age ?? [0, 0];
      const p: Person = {
        id: newPersonId(life),
        name: randomName(rng, gender),
        gender,
        role: spec.new,
        bornAt: life.age - (life.age + rng.int(lo, hi)),
        affinity: 50,
        alive: true,
      };
      pending.push(p);
      cast[key] = p.id;
    }
  }
  return { cast, pending };
}

export function resolveCast(life: Life, cast: Record<string, string>, pending: Person[]): Record<string, Person> {
  const out: Record<string, Person> = {};
  for (const [key, id] of Object.entries(cast)) {
    const p = life.people.find((x) => x.id === id) ?? pending.find((x) => x.id === id);
    if (p) out[key] = p;
  }
  return out;
}

/** 문장 속 {key}에 넣을 값: 주인공 이름과 등장인물 이름(성 빼고) */
export function textVars(ctx: Pick<Ctx, "life" | "cast">): Record<string, string> {
  const vars: Record<string, string> = { me: ctx.life.name.slice(1), fullname: ctx.life.name };
  for (const [key, p] of Object.entries(ctx.cast)) {
    vars[key] = p.role === "엄마" || p.role === "아빠" ? p.role : p.name.slice(1);
  }
  return vars;
}

export function render(text: string | ((ctx: Ctx) => string), ctx: Ctx): string {
  return fill(typeof text === "function" ? text(ctx) : text, textVars(ctx));
}

export function checkValue(life: Life, stat: CheckStat): number {
  if (stat === "grit") return life.hidden.grit;
  if (stat === "luck") return life.hidden.luck;
  if (stat === "fame") return life.fame;
  return life.stats[stat];
}

/** 성공 확률: 능력치가 dc와 같으면 50%, 25 차이마다 약 25%씩. 운이 조금 거든다 */
export function successChance(life: Life, choice: Choice): number {
  if (choice.chance) return clamp(choice.chance(life), 0, 1);
  if (!choice.check) return 1;
  const v = checkValue(life, choice.check.stat);
  return clamp(0.5 + (v - choice.check.dc) / 50 + (life.hidden.luck - 50) / 500, 0.05, 0.95);
}

export function applyEffects(e: Effects | undefined, ctx: Ctx, pending: Person[]): void {
  if (!e) return;
  const { life, rng, cast } = ctx;
  for (const [stat, a] of Object.entries(e.stats ?? {}) as [Stat, Amount][]) addStat(life, stat, amount(rng, a));
  if (e.money !== undefined) life.money += amount(rng, e.money);
  if (e.fame !== undefined) life.fame = clamp(life.fame + amount(rng, e.fame), 0, 100);
  Object.assign(life.flags, e.flags ?? {});
  for (const key of e.meet ?? []) {
    const p = pending.find((x) => x.id === cast[key]?.id);
    if (p && !life.people.includes(p)) life.people.push(p);
  }
  for (const [key, a] of Object.entries(e.affinity ?? {})) {
    const p = cast[key];
    if (p) p.affinity = clamp(p.affinity + amount(rng, a), 0, 100);
  }
  for (const [key, role] of Object.entries(e.role ?? {})) {
    const p = cast[key];
    if (!p) continue;
    if (role === null) life.people = life.people.filter((x) => x !== p);
    else p.role = role;
  }
  if (e.job !== undefined) life.job = e.job && { ...e.job, years: 0 };
  if (e.education) life.education = e.education;
  for (const r of e.reveal ?? []) life.revealed[r] = true;
  e.run?.(ctx);
  if (e.death) {
    life.alive = false;
    life.causeOfDeath = e.death;
  }
}
