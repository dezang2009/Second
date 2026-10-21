import { describe, expect, it } from "vitest";
import { activitiesFor } from "../data/activities";
import { EVENTS } from "../data/events";
import { choose, chooseActivity, currentChoices, currentEventText, newLife, proceed, rollCandidates } from "./engine";
import { createRng } from "./rng";
import { judge } from "./score";
import { STATS, type Life } from "./types";

/** 선택을 무작위로 하며 인생 하나를 끝까지 살아 본다. 화면에 보일 문장도 모두 모은다 */
function autoplay(seed: number): { life: Life; texts: string[] } {
  const pick = createRng(seed * 7 + 1);
  const life = newLife({ name: "지민", gender: pick.chance(0.5) ? "남" : "여", seed, candidate: rollCandidates(seed)[pick.int(0, 2)] });
  const texts: string[] = [];
  for (let step = 0; step < 5000 && life.phase.kind !== "dead"; step++) {
    const ph = life.phase;
    if (ph.kind === "activity") {
      const acts = activitiesFor(life);
      chooseActivity(life, pick.pick(acts).id);
    } else if (ph.kind === "event") {
      texts.push(currentEventText(life));
      const cs = currentChoices(life);
      expect(cs.length, `${ph.eventId}: 고를 수 있는 선택지가 없음 (${life.age}살)`).toBeGreaterThan(0);
      choose(life, pick.pick(cs).index);
    } else if (ph.kind === "outcome") {
      texts.push(ph.text);
      proceed(life);
    } else if (ph.kind === "yearEnd") {
      texts.push(...ph.lines);
      proceed(life);
    }
  }
  return { life, texts };
}

describe("자동 플레이", () => {
  const runs = Array.from({ length: 300 }, (_, i) => autoplay(i + 1));

  it("모든 인생이 사망으로 끝난다", () => {
    for (const { life } of runs) {
      expect(life.phase.kind).toBe("dead");
      expect(life.age).toBeLessThan(125);
    }
  });

  it("수명이 현실과 비슷한 범위다", () => {
    const ages = runs.map((r) => r.life.age).sort((a, b) => a - b);
    const median = ages[Math.floor(ages.length / 2)];
    expect(median).toBeGreaterThanOrEqual(65);
    expect(median).toBeLessThanOrEqual(90);
  });

  it("능력치와 돈이 올바른 숫자로 남는다", () => {
    for (const { life } of runs) {
      for (const s of STATS) {
        expect(Number.isInteger(life.stats[s])).toBe(true);
        expect(life.stats[s]).toBeGreaterThanOrEqual(0);
        expect(life.stats[s]).toBeLessThanOrEqual(100);
      }
      expect(Number.isFinite(life.money)).toBe(true);
      const v = judge(life);
      expect(Number.isFinite(v.total)).toBe(true);
    }
  });

  it("화면 문장에 채워지지 않은 빈칸이나 조사 표시가 없다", () => {
    for (const { texts } of runs) {
      for (const t of texts) {
        expect(t).not.toMatch(/\{\w+\}/);
        expect(t).not.toMatch(/이\(가\)|을\(를\)|은\(는\)|와\(과\)|과\(와\)|\(으\)로|undefined|NaN/);
      }
    }
  });

  it("대부분의 사건이 실제로 등장한다", () => {
    const seen = new Set<string>();
    for (const { life } of runs) for (const id of Object.keys(life.seen)) seen.add(id);
    const never = EVENTS.filter((e) => !seen.has(e.id)).map((e) => e.id);
    expect(never).toEqual([]);
  });

  it("저장했다 불러와도 같은 인생이 이어진다", () => {
    const a = autoplay(42).life;
    const b = autoplay(42).life;
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });
});
