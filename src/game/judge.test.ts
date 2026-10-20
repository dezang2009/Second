import { describe, expect, it } from "vitest";
import type { Chart } from "../songs/types";
import { Judge, type JudgeEvent, rankOf } from "./judge";

function chartOf(notes: Chart["notes"]): Chart {
  return {
    title: "t",
    artist: "a",
    durationMs: 10000,
    bpm: 120,
    beatsPerBar: 3,
    offsetMs: 0,
    difficulty: { name: "N", level: 1 },
    notes,
  };
}

function judgeOf(notes: Chart["notes"]) {
  const judge = new Judge(chartOf(notes), 4);
  const events: JudgeEvent[] = [];
  judge.onJudge = (e) => events.push(e);
  return { judge, events };
}

describe("tap notes", () => {
  it("grades by distance from the note time", () => {
    const { judge, events } = judgeOf([
      { t: 1000, lane: 0 },
      { t: 2000, lane: 0 },
      { t: 3000, lane: 0 },
      { t: 4000, lane: 0 },
    ]);
    judge.press(0, 1.03, 1); // 30ms
    judge.press(0, 1.92, 1); // -80ms
    judge.press(0, 3.14, 1); // 140ms
    expect(events.map((e) => e.grade)).toEqual(["perfect", "great", "good"]);
    judge.update(4.2); // 마지막 노트는 안 침
    expect(events.map((e) => e.grade)).toEqual(["perfect", "great", "good", "miss"]);
  });

  it("ignores taps far from any note without penalty", () => {
    const { judge, events } = judgeOf([{ t: 1000, lane: 1 }]);
    expect(judge.press(1, 0.5, 1)).toBe(false);
    expect(judge.press(2, 1.0, 1)).toBe(false); // 다른 레인
    expect(events).toHaveLength(0);
    expect(judge.press(1, 1.0, 1)).toBe(true);
  });

  it("does not judge the same note twice", () => {
    const { judge, events } = judgeOf([{ t: 1000, lane: 0 }]);
    judge.press(0, 1.0, 1);
    judge.press(0, 1.01, 2);
    expect(events).toHaveLength(1);
  });

  it("picks the earliest pending note in the lane", () => {
    const { judge, events } = judgeOf([
      { t: 1000, lane: 0 },
      { t: 1240, lane: 0 },
    ]);
    judge.press(0, 1.1, 1); // 첫 노트에 GREAT
    judge.press(0, 1.24, 1);
    expect(events.map((e) => [e.grade, Math.round(e.offset * 1000)])).toEqual([
      ["great", 100],
      ["perfect", 0],
    ]);
  });
});

describe("long notes", () => {
  it("counts head and tail when held to the end", () => {
    const { judge, events } = judgeOf([{ t: 1000, lane: 2, len: 1000 }]);
    judge.press(2, 1.0, 7);
    judge.update(1.5);
    expect(judge.notes[0].status).toBe("holding");
    judge.update(2.0);
    expect(events.map((e) => [e.part, e.grade])).toEqual([
      ["head", "perfect"],
      ["tail", "perfect"],
    ]);
    expect(judge.stats().combo).toBe(2);
  });

  it("accepts a release just before the end", () => {
    const { judge, events } = judgeOf([{ t: 1000, lane: 2, len: 1000 }]);
    judge.press(2, 1.0, 7);
    judge.release(7, 1.9);
    expect(events[1]).toMatchObject({ part: "tail", grade: "perfect" });
  });

  it("misses the tail on an early release and breaks the combo", () => {
    const { judge, events } = judgeOf([{ t: 1000, lane: 2, len: 1000 }]);
    judge.press(2, 1.0, 7);
    judge.release(7, 1.4);
    expect(events[1]).toMatchObject({ part: "tail", grade: "miss" });
    expect(judge.stats().combo).toBe(0);
  });

  it("only the finger that grabbed the note can release it", () => {
    const { judge, events } = judgeOf([{ t: 1000, lane: 2, len: 1000 }]);
    judge.press(2, 1.0, 7);
    judge.release(8, 1.2);
    expect(judge.notes[0].status).toBe("holding");
    expect(events).toHaveLength(1);
  });

  it("misses both head and tail when never pressed", () => {
    const { judge, events } = judgeOf([{ t: 1000, lane: 2, len: 1000 }]);
    judge.update(1.2);
    expect(events.map((e) => [e.part, e.grade])).toEqual([
      ["head", "miss"],
      ["tail", "miss"],
    ]);
  });
});

describe("score and combo", () => {
  it("scores 1,000,000 for an all-perfect run", () => {
    const { judge } = judgeOf([
      { t: 1000, lane: 0 },
      { t: 2000, lane: 1, len: 500 },
      { t: 3000, lane: 3 },
    ]);
    judge.press(0, 1.0, 1);
    judge.press(1, 2.0, 1);
    judge.update(2.5);
    judge.press(3, 3.0, 1);
    const s = judge.stats();
    expect(s).toMatchObject({ score: 1_000_000, perfect: 4, combo: 4, maxCombo: 4, judged: 4, total: 4 });
    expect(rankOf(s.score)).toBe("S");
  });

  it("weights grades and keeps the max combo after a miss", () => {
    const { judge } = judgeOf([
      { t: 1000, lane: 0 },
      { t: 2000, lane: 0 },
      { t: 3000, lane: 0 },
      { t: 4000, lane: 0 },
    ]);
    judge.press(0, 1.0, 1); // perfect 1
    judge.press(0, 2.08, 1); // great 0.7
    judge.update(3.2); // miss
    judge.press(0, 3.87, 1); // good 0.3
    const s = judge.stats();
    expect(s.score).toBe(500_000);
    expect(s).toMatchObject({ combo: 1, maxCombo: 2, miss: 1 });
  });

  it("skips notes before the seek point and scores only the rest", () => {
    const { judge } = judgeOf([
      { t: 1000, lane: 0 },
      { t: 5000, lane: 0 },
    ]);
    judge.reset(3);
    expect(judge.notes[0].status).toBe("skipped");
    judge.press(0, 5.0, 1);
    expect(judge.stats()).toMatchObject({ total: 1, score: 1_000_000 });
  });
});
