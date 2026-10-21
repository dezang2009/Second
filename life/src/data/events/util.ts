// 사건 데이터를 짧게 쓰기 위한 도우미

import type { Choice, Ctx, Effects, Outcome } from "../../game/events";
import { clamp, newPersonId } from "../../game/life";
import { randomGivenName } from "../../game/names";
import type { Gender, Life, Person, Role } from "../../game/types";

export const o = (text: Outcome["text"], effects?: Effects, extra?: Pick<Outcome, "next" | "quiet">): Outcome => ({ text, effects, ...extra });

/** 다음 장면으로 이어지는 결과(continue). 한 해 요약에는 남기지 않는다. ("then"이라는 이름을 내보내면 모듈이 Promise처럼 취급되어 import가 멈춘다) */
export const cont = (next: string, text: Outcome["text"] = "", effects?: Effects): Outcome => ({ text, effects, next, quiet: true });

/** 두 능력치 평균으로 성공 확률을 정한다 (평균이 dc면 50%) */
export const avgChance = (a: number, b: number, dc: number) => clamp(0.5 + ((a + b) / 2 - dc) / 50, 0.05, 0.95);

/** 올해 고른 활동 */
export const doing = (life: Life, id: string) => life.year.activity === id;

/** 새 가족(자녀, 손주)을 만들어 인생에 넣고, 문장에서 {key}로 부를 수 있게 한다 */
export function addFamily(ctx: Ctx, key: string, role: Role, surname: string): Person {
  const gender: Gender = ctx.rng.chance(0.5) ? "남" : "여";
  const p: Person = {
    id: newPersonId(ctx.life),
    name: surname + randomGivenName(ctx.rng, gender),
    gender,
    role,
    bornAt: ctx.life.age,
    affinity: 80,
    alive: true,
  };
  ctx.life.people.push(p);
  ctx.cast[key] = p;
  return p;
}

export const surnameOf = (name: string) => name.slice(0, 1);

/** flags에 "a|b|c" 모양으로 저장한 목록 (합격한 대학, 지원할 회사 등) */
export function listFlag(life: Life, key: string): string[] {
  const v = life.flags[key];
  return typeof v === "string" && v.length > 0 ? v.split("|") : [];
}

/**
 * 목록의 i번째 항목을 고르는 선택지 n개를 만든다. 선택지 이름과 결과가 항목에 따라 바뀌고,
 * 목록이 짧으면 남는 선택지는 숨는다.
 */
export function slots(
  key: string,
  n: number,
  label: (item: string, life: Life) => string,
  outcome: (item: string, life: Life) => Outcome,
  icon?: (item: string) => string | undefined,
): Choice[] {
  return Array.from({ length: n }, (_, i) => ({
    text: (life: Life) => label(listFlag(life, key)[i], life),
    icon: icon && ((life: Life) => icon(listFlag(life, key)[i])),
    when: (life: Life) => listFlag(life, key).length > i,
    outcome: (life: Life) => outcome(listFlag(life, key)[i], life),
  }));
}

