import { describe, expect, it } from "vitest";
import type { Chart } from "../songs/types";
import { applyLaneMod, modsLabel } from "./mods";

const chart: Chart = {
  title: "t",
  artist: "",
  durationMs: 10000,
  bpm: 120,
  beatsPerBar: 4,
  offsetMs: 0,
  difficulty: { name: "NORMAL", level: 5 },
  notes: [
    { t: 0, lane: 0 },
    { t: 0, lane: 3 },
    { t: 500, lane: 1, len: 1000 },
    { t: 1000, lane: 2 },
  ],
};

describe("applyLaneMod", () => {
  it("leaves the chart alone without a mod", () => {
    expect(applyLaneMod(chart, "none")).toBe(chart);
  });

  it("mirrors lanes left to right", () => {
    expect(applyLaneMod(chart, "mirror").notes.map((n) => n.lane)).toEqual([3, 0, 2, 1]);
    expect(chart.notes[0].lane).toBe(0); // 원래 채보는 그대로
  });

  it("shuffles lanes as a whole, never keeping the original order", () => {
    let seed = 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 50; k++) {
      const out = applyLaneMod(chart, "random", rand);
      const map = new Map(chart.notes.map((n, i) => [n.lane, out.notes[i].lane]));
      expect(new Set(map.values()).size).toBe(map.size); // 레인끼리 겹치지 않게 통째로 바꿈
      expect([...map].some(([a, b]) => a !== b)).toBe(true);
      expect(out.notes[2].len).toBe(1000);
    }
    // 매번 그대로인 random()이어도 원래 배치가 나오지 않는다
    let n = 0;
    const stuck = () => [0.99, 0.99, 0.99, 0.1][n++ % 4];
    expect(applyLaneMod(chart, "random", stuck).notes.map((x) => x.lane)).not.toEqual([0, 3, 1, 2]);
  });

  it("names the active mods", () => {
    expect(modsLabel("none", "none")).toBe("");
    expect(modsLabel("mirror", "hidden")).toBe("미러 · 히든");
  });
});
