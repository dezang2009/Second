// 인생 상태를 읽고 바꾸는 작은 도구들. 사건 데이터의 조건문에서 주로 쓴다.

import { STATS, type Gender, type Life, type Person, type Role, type Stat } from "./types";

export const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export function ageOf(life: Life, p: Person): number {
  return life.age - p.bornAt;
}

/** 살아 있고 이미 태어난 사람 */
export function present(life: Life, p: Person): boolean {
  return p.alive && life.age >= p.bornAt;
}

export function peopleWith(life: Life, ...roles: Role[]): Person[] {
  return life.people.filter((p) => present(life, p) && roles.includes(p.role));
}

export function first(life: Life, role: Role): Person | undefined {
  return peopleWith(life, role)[0];
}

export const has = (life: Life, role: Role) => peopleWith(life, role).length > 0;
export const married = (life: Life) => has(life, "배우자");
export const single = (life: Life) => !has(life, "배우자") && !has(life, "연인");
export const flag = (life: Life, key: string) => life.flags[key];
export const num = (life: Life, key: string) => Number(life.flags[key] ?? 0);

/** 학교(초·중·고)에 다니는 나이 */
export const inSchool = (life: Life) => life.age >= 7 && life.age <= 18;
export const inCollege = (life: Life) => num(life, "collegeUntil") > life.age;
export const inMilitary = (life: Life) => num(life, "militaryUntil") > life.age;
export const retired = (life: Life) => flag(life, "retired") === true;
/** 일을 구할 수 있는 성인 */
export const canWork = (life: Life) =>
  life.age >= 19 && !inCollege(life) && !inMilitary(life) && !retired(life) && life.age < 70;
export const employed = (life: Life) => life.job !== null && life.job.id !== "parttime";

export function netWorth(life: Life): number {
  return life.money + num(life, "houseValue");
}

export function setStat(life: Life, stat: Stat, value: number): void {
  life.stats[stat] = clamp(Math.round(value), 0, 100);
}

export function addStat(life: Life, stat: Stat, delta: number): void {
  setStat(life, stat, life.stats[stat] + delta);
}

export function snapshotStats(life: Life): Record<Stat, number> {
  return Object.fromEntries(STATS.map((s) => [s, life.stats[s]])) as Record<Stat, number>;
}

export function opposite(g: Gender): Gender {
  return g === "남" ? "여" : "남";
}

export function newPersonId(life: Life): string {
  life.nextId += 1;
  return `p${life.nextId}`;
}
