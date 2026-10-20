import { describe, expect, it } from "vitest";
import { computeLayout } from "../render/layout";
import type { Chart } from "../songs/types";
import { EditScene } from "./editScene";

// 화면 높이 1000px, 판정선 y=800, 노트가 1.6초에 800px 내려오므로 1px = 2ms
const stage = { layout: computeLayout(400, 1000), scrollSec: 1.6, hit: () => {} };
const yAt = (t: number, sec: number) => stage.layout.judgeY - ((sec - t) / stage.scrollSec) * stage.layout.judgeY;

function sceneOf(notes: Chart["notes"]): EditScene {
  const chart: Chart = {
    title: "t",
    artist: "",
    durationMs: 10000,
    bpm: 0,
    beatsPerBar: 4,
    offsetMs: 0,
    difficulty: { name: "USER", level: 0 },
    notes,
  };
  return new EditScene(chart, stage);
}

describe("editing while paused", () => {
  it("taps add a note on empty space and remove an existing one", () => {
    const s = sceneOf([]);
    s.press(1, 2, 1.0, 0, yAt(1.0, 1.5));
    s.release(1, 1.0);
    expect(s.draft.notes).toEqual([{ t: 1500, lane: 2 }]);
    s.press(2, 2, 1.0, 0, yAt(1.0, 1.51));
    s.release(2, 1.0);
    expect(s.draft.notes).toHaveLength(0);
  });

  it("dragging a tap note upward turns it into a long note ending at the finger", () => {
    const s = sceneOf([{ t: 1500, lane: 1 }]);
    s.press(1, 1, 1.0, 0, yAt(1.0, 1.5));
    s.move(1, 1.0, 0, yAt(1.0, 1.8));
    s.move(1, 1.0, 0, yAt(1.0, 2.3));
    s.release(1, 1.0);
    expect(s.draft.notes).toEqual([{ t: 1500, lane: 1, len: 800 }]);
  });

  it("dragging a long note down shortens it, and below the minimum makes it a tap again", () => {
    const s = sceneOf([{ t: 1500, lane: 1, len: 1000 }]);
    s.press(1, 1, 1.0, 0, yAt(1.0, 2.4)); // 몸통 위를 잡는다
    s.move(1, 1.0, 0, yAt(1.0, 1.9));
    expect(s.draft.notes[0].len).toBe(400);
    s.move(1, 1.0, 0, yAt(1.0, 1.55));
    s.release(1, 1.0);
    expect(s.draft.notes[0].len).toBeUndefined();
  });

  it("dragging from empty space creates a new long note, undone in one step", () => {
    const s = sceneOf([]);
    s.press(1, 3, 1.0, 0, yAt(1.0, 1.2));
    s.move(1, 1.0, 0, yAt(1.0, 1.7));
    s.release(1, 1.0);
    expect(s.draft.notes).toEqual([{ t: 1200, lane: 3, len: 500 }]);
    s.draft.undo();
    expect(s.draft.notes).toHaveLength(0);
  });

  it("a small wobble still counts as a tap", () => {
    const s = sceneOf([]);
    s.press(1, 0, 1.0, 0, yAt(1.0, 1.5));
    s.move(1, 1.0, 0, yAt(1.0, 1.5) - 4);
    s.release(1, 1.0);
    expect(s.draft.notes).toEqual([{ t: 1500, lane: 0 }]);
  });
});

describe("recording", () => {
  it("records taps, turns holds into long notes, and overwrites the passed range", () => {
    const s = sceneOf([
      { t: 500, lane: 0 },
      { t: 1500, lane: 1 },
      { t: 5000, lane: 2 },
    ]);
    s.begin("record", 1.0);
    s.press(1, 3, 1.2, 0, 0);
    s.release(1, 1.25);
    s.press(2, 2, 2.0, 0, 0);
    s.update(2.5);
    s.release(2, 2.6);
    s.update(3.0);
    s.end(3.0);
    expect(s.draft.notes).toEqual([
      { t: 500, lane: 0 }, // 녹음 시작 전
      { t: 1200, lane: 3 },
      { t: 2000, lane: 2, len: 600 },
      { t: 5000, lane: 2 }, // 아직 지나가지 않은 구간
    ]);
  });
});
