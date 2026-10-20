import { describe, expect, it } from "vitest";
import { estimateOffset } from "./calibrate";
import { sanitize, scrollSecFor } from "../settings";

const beats = Array.from({ length: 20 }, (_, i) => 1 + i * 0.6);

describe("estimateOffset", () => {
  it("finds a steady delay and ignores warm-up taps and missed beats", () => {
    const taps = beats.map((b, i) => b + 0.045 + (i % 2 ? 0.006 : -0.006));
    taps[0] = 1.3; // 처음엔 헤맨다
    taps.splice(10, 0, beats[9] + 0.3); // 박 사이 엉뚱한 탭
    const r = estimateOffset(beats, taps)!;
    expect(r.offsetMs).toBeGreaterThanOrEqual(39);
    expect(r.offsetMs).toBeLessThanOrEqual(51);
    expect(r.spreadMs).toBeLessThanOrEqual(6);
  });

  it("handles early tapping", () => {
    const r = estimateOffset(beats, beats.map((b) => b - 0.03))!;
    expect(r.offsetMs).toBe(-30);
  });

  it("needs enough taps", () => {
    expect(estimateOffset(beats, beats.slice(0, 7))).toBeNull();
  });
});

describe("settings", () => {
  it("clamps broken or out-of-range values to safe ones", () => {
    const s = sanitize({ audioOffsetMs: 9999, noteSpeed: "fast", effects: "max", hitSound: 1, musicVolume: -2 });
    expect(s).toMatchObject({ audioOffsetMs: 300, noteSpeed: 5, effects: "normal", hitSound: false, musicVolume: 0 });
    expect(sanitize(null).noteSize).toBe(1);
  });

  it("maps note speed 5 to the original 1.6 second fall", () => {
    expect(scrollSecFor(5)).toBeCloseTo(1.6);
    expect(scrollSecFor(10)).toBeCloseTo(0.8);
  });
});
