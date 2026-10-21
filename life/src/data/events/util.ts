// 사건 데이터를 짧게 쓰기 위한 도우미

import type { Ctx, Effects, Outcome } from "../../game/events";
import { clamp, newPersonId } from "../../game/life";
import { randomGivenName } from "../../game/names";
import type { Gender, Life, Person, Role } from "../../game/types";

export const o = (text: Outcome["text"], effects?: Effects): Outcome => ({ text, effects });

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
