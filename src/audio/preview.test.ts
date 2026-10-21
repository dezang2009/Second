import { describe, expect, it } from "vitest";
import type { Chart } from "../songs/types";
import { highlightStart, PREVIEW_SEC } from "./preview";

const chart = (times: number[]): Chart => ({
  title: "t",
  artist: "",
  durationMs: 200000,
  bpm: 120,
  beatsPerBar: 4,
  offsetMs: 0,
  difficulty: { name: "NORMAL", level: 5 },
  notes: times.map((t) => ({ t: Math.round(t * 1000), lane: 0 })),
});

describe("highlightStart", () => {
  it("picks the densest stretch of notes (the chorus)", () => {
    const verse = Array.from({ length: 60 }, (_, i) => 10 + i); // 1초에 하나
    const chorus = Array.from({ length: 60 }, (_, i) => 80 + i * 0.25); // 1초에 넷
    const start = highlightStart(chart([...verse, ...chorus]), 200);
    expect(start).toBeGreaterThan(79);
    expect(start).toBeLessThan(80.1);
  });

  it("stays inside the song", () => {
    const end = Array.from({ length: 40 }, (_, i) => 190 + i * 0.2);
    const start = highlightStart(chart([5, 6, 7, 8, 9, 10, 11, 12, ...end]), 200);
    expect(start + PREVIEW_SEC).toBeLessThanOrEqual(200);
  });

  it("falls back to a third of the song without a chart, and to 0 for short songs", () => {
    expect(highlightStart(null, 180)).toBe(60);
    expect(highlightStart(null, 10)).toBe(0);
  });
});
