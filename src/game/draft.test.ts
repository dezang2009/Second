import { describe, expect, it } from "vitest";
import { Meter } from "../songs/meter";
import type { Chart } from "../songs/types";
import { ChartDraft } from "./draft";

describe("ChartDraft", () => {
  it("keeps notes sorted when adding", () => {
    const d = new ChartDraft([{ t: 2000, lane: 1 }]);
    d.add({ t: 1000, lane: 0 });
    d.add({ t: 3000, lane: 2 });
    expect(d.notes.map((n) => n.t)).toEqual([1000, 2000, 3000]);
  });

  it("does not share note objects with the source chart", () => {
    const src = [{ t: 1000, lane: 0 }];
    const d = new ChartDraft(src);
    d.setLength(d.notes[0], 500);
    expect(src[0]).toEqual({ t: 1000, lane: 0 });
  });

  it("undoes back to each checkpoint", () => {
    const d = new ChartDraft([]);
    d.checkpoint();
    d.add({ t: 1000, lane: 0 });
    d.checkpoint();
    d.add({ t: 2000, lane: 1 });
    expect(d.undo()).toBe(true);
    expect(d.notes).toHaveLength(1);
    expect(d.undo()).toBe(true);
    expect(d.notes).toHaveLength(0);
    expect(d.undo()).toBe(false);
  });

  it("punch-in recording replaces only the recorded range", () => {
    const d = new ChartDraft([
      { t: 1000, lane: 0 },
      { t: 2000, lane: 1 },
      { t: 3000, lane: 2 },
      { t: 4000, lane: 3 },
    ]);
    const fresh = d.add({ t: 2500, lane: 0 });
    d.punchOut(1500, 3200, new Set([fresh]));
    expect(d.notes.map((n) => [n.t, n.lane])).toEqual([
      [1000, 0],
      [2500, 0],
      [4000, 3],
    ]);
  });

  it("finds a note by its head or its long body", () => {
    const d = new ChartDraft([
      { t: 1000, lane: 0 },
      { t: 2000, lane: 1, len: 1000 },
    ]);
    expect(d.findAt(0, 1030, 50)?.t).toBe(1000);
    expect(d.findAt(0, 1100, 50)).toBeUndefined();
    expect(d.findAt(1, 2600, 50)?.t).toBe(2000);
    expect(d.findAt(2, 1000, 50)).toBeUndefined();
  });
});

describe("Meter.snap", () => {
  const chart: Chart = {
    title: "t",
    artist: "a",
    durationMs: 10000,
    bpm: 0,
    beatsPerBar: 3,
    offsetMs: 1000,
    difficulty: { name: "N", level: 1 },
    // 템포가 흔들리는 박: 간격 500, 500, 600ms
    beats: [1000, 1500, 2000, 2600],
    bars: [1000],
    notes: [],
  };
  const meter = new Meter(chart);

  it("snaps to half beats following the real beat spacing", () => {
    expect(meter.snap(1.26, 2)).toBeCloseTo(1.25);
    expect(meter.snap(2.28, 2)).toBeCloseTo(2.3); // 600ms 박의 절반
    expect(meter.snap(1.6, 1)).toBeCloseTo(1.5);
  });

  it("extends the grid before the first and after the last beat", () => {
    expect(meter.snap(0.74, 2)).toBeCloseTo(0.75);
    expect(meter.snap(2.92, 2)).toBeCloseTo(2.9);
  });

  it("leaves time untouched without beats or with snapping off", () => {
    expect(meter.snap(1.26, 0)).toBe(1.26);
    const free = new Meter({ ...chart, beats: undefined, bars: undefined });
    expect(free.hasBeats).toBe(false);
    expect(free.snap(1.26, 2)).toBe(1.26);
  });
});
