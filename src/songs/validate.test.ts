import { describe, expect, it } from "vitest";
import pianoChart from "./charts/always-with-me-piano.json";
import { ChartFormatError, chartFileName, parseChart } from "./validate";

describe("parseChart", () => {
  it("round-trips the built-in chart", () => {
    const parsed = parseChart(JSON.stringify(pianoChart));
    expect(parsed.notes).toHaveLength(pianoChart.notes.length);
    expect(parsed.beats).toHaveLength(pianoChart.beats.length);
    expect(parsed.bars).toEqual(pianoChart.bars);
    expect(parsed.bpm).toBe(pianoChart.bpm);
  });

  it("fills in defaults and sorts notes", () => {
    const c = parseChart(JSON.stringify({ notes: [{ t: 2000, lane: 1 }, { t: 1000, lane: 3, len: 0 }] }));
    expect(c.notes).toEqual([
      { t: 1000, lane: 3 },
      { t: 2000, lane: 1 },
    ]);
    expect(c).toMatchObject({ title: "가져온 채보", bpm: 0, beatsPerBar: 4 });
  });

  it.each([
    ["not json", "{"],
    ["no notes", JSON.stringify({ title: "x" })],
    ["bad lane", JSON.stringify({ notes: [{ t: 0, lane: 4 }] })],
    ["negative time", JSON.stringify({ notes: [{ t: -5, lane: 0 }] })],
    ["bad length", JSON.stringify({ notes: [{ t: 0, lane: 0, len: "long" }] })],
    ["array root", JSON.stringify([1, 2])],
  ])("rejects %s", (_name, text) => {
    expect(() => parseChart(text)).toThrow(ChartFormatError);
  });
});

describe("chartFileName", () => {
  it("removes characters files cannot have", () => {
    expect(chartFileName("Always with Me (Piano)")).toBe("Always-with-Me-(Piano).chart.json");
    expect(chartFileName('a/b:c*?"')).toBe("a-b-c.chart.json");
    expect(chartFileName("  ")).toBe("chart.chart.json");
  });
});
