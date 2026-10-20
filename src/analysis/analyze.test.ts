import { describe, expect, it } from "vitest";
import type { Chart } from "../songs/types";
import { analyzeSamples } from "./analyze";
import { beatF, beatTimes, renderNotes, type SynthNote } from "./synth";

// 박 시각을 정확히 아는 합성 곡으로 자동 채보 품질을 잰다.
// 곡: 박마다 멜로디 음, 마디 첫 박마다 바뀌는 베이스(화음 변화), 가끔 반박 장식음.

const SCALE = [392, 440, 494, 523, 587, 659, 587, 523]; // G4~E5
const BASS = [98, 87, 110, 82]; // 마디마다 바뀌는 베이스 (G2, F2, A2, E2)

interface Song {
  samples: Float32Array;
  beats: number[];
  /** 마디 첫 박 시각 */
  downbeats: number[];
  /** 소리가 실제로 시작되는 시각 전부 */
  attacks: number[];
}

function makeSong(opts: { bpm: number; beatsPerBar: number; bars: number; start?: number; drift?: number; halfEvery?: number; holdBars?: number[]; tail?: number }): Song {
  const start = opts.start ?? 1;
  const count = opts.bars * opts.beatsPerBar;
  const beats = beatTimes(start, count, opts.bpm, opts.drift ?? 0);
  const notes: SynthNote[] = [];
  const attacks: number[] = [];
  const downbeats: number[] = [];
  beats.forEach((t, i) => {
    const bar = Math.floor(i / opts.beatsPerBar);
    const inBar = i % opts.beatsPerBar;
    const next = beats[i + 1] ?? t + 60 / opts.bpm;
    if (inBar === 0) {
      downbeats.push(t);
      const barEnd = beats[i + opts.beatsPerBar] ?? t + (opts.beatsPerBar * 60) / opts.bpm;
      notes.push({ t, hz: BASS[bar % BASS.length], dur: barEnd - t, gain: 0.35, decay: opts.holdBars?.includes(bar) ? 2.5 : 0.35 });
    }
    // 길게 끄는 마디: 첫 박 화음만 치고 나머지 박은 소리만 이어진다
    if (opts.holdBars?.includes(bar)) {
      if (inBar === 0) {
        const barEnd = beats[i + opts.beatsPerBar] ?? t + 2;
        notes.push({ t, hz: 523, dur: barEnd - t, gain: 0.25, decay: 2.5 }, { t, hz: 659, dur: barEnd - t, gain: 0.2, decay: 2.5 });
        attacks.push(t);
      }
      return;
    }
    notes.push({ t, hz: SCALE[(i * 3) % SCALE.length], dur: (next - t) * 0.9, gain: inBar === 0 ? 0.3 : 0.22 });
    attacks.push(t);
    if (opts.halfEvery && i % opts.halfEvery === opts.halfEvery - 1) {
      const h = (t + next) / 2;
      notes.push({ t: h, hz: SCALE[(i * 3 + 2) % SCALE.length] * 2, dur: (next - h) * 0.8, gain: 0.25 });
      attacks.push(h);
    }
  });
  const end = beats[beats.length - 1] + 60 / opts.bpm + (opts.tail ?? 1);
  return { samples: renderNotes(notes, end, 0.001), beats, downbeats, attacks };
}

function chartBeats(c: Chart): number[] {
  return (c.beats ?? []).map((ms) => ms / 1000);
}

/** 노트가 덮는 시각들 (탭은 그 순간, 롱 노트는 시작~끝) */
function covered(c: Chart, t: number, tol: number): boolean {
  return c.notes.some((n) => t >= n.t / 1000 - tol && t <= (n.t + (n.len ?? 0)) / 1000 + tol);
}

function meanAbsTimingMs(found: number[], truth: number[], tol = 0.05): number {
  const errs = truth.map((t) => found.reduce((b, f) => Math.min(b, Math.abs(f - t)), Infinity)).filter((e) => e <= tol);
  return (1000 * errs.reduce((a, b) => a + b, 0)) / Math.max(1, errs.length);
}

function checkPlayable(c: Chart): void {
  const notes = c.notes;
  for (const n of notes) {
    expect(n.lane).toBeGreaterThanOrEqual(0);
    expect(n.lane).toBeLessThan(4);
  }
  // 롱 노트를 누르는 동안 같은 레인에 다른 노트가 오지 않는다
  for (const a of notes) {
    const len = a.len;
    if (!len) continue;
    const clash = notes.find((b) => b !== a && b.lane === a.lane && b.t > a.t && b.t <= a.t + len);
    expect(clash, `lane ${a.lane} at ${a.t}`).toBeUndefined();
  }
  // 동시에 눌러야 하는 손가락은 2개 이하
  for (const a of notes) {
    const busy = notes.filter((b) => b.t <= a.t && b.t + (b.len ?? 0) >= a.t);
    expect(busy.length).toBeLessThanOrEqual(2);
  }
}

describe("auto chart on a steady 4/4 song", () => {
  const song = makeSong({ bpm: 100, beatsPerBar: 4, bars: 16, halfEvery: 4 });
  const result = analyzeSamples(song.samples, { title: "steady" });
  const { normal, hard } = result.charts;

  it("finds the tempo and meter", () => {
    expect(result.bpm).toBeGreaterThan(98);
    expect(result.bpm).toBeLessThan(102);
    expect(result.beatsPerBar).toBe(4);
  });

  it("places beats on the real beats within a few ms", () => {
    expect(beatF(chartBeats(normal), song.beats, 0.05)).toBeGreaterThan(0.95);
    expect(meanAbsTimingMs(chartBeats(normal), song.beats)).toBeLessThan(6);
  });

  it("finds the bar starts", () => {
    expect(beatF((normal.bars ?? []).map((b) => b / 1000), song.downbeats, 0.05)).toBeGreaterThan(0.9);
  });

  it("puts a note on every beat in NORMAL and every attack in HARD", () => {
    const missingNormal = song.beats.filter((t) => !covered(normal, t, 0.03));
    expect(missingNormal.length).toBeLessThanOrEqual(1);
    const missingHard = song.attacks.filter((t) => !hard.notes.some((n) => Math.abs(n.t / 1000 - t) < 0.03));
    expect(missingHard.length / song.attacks.length).toBeLessThan(0.05);
    expect(hard.notes.length).toBeGreaterThan(normal.notes.length);
  });

  it("note times match the sound within a few ms", () => {
    const hits = hard.notes.map((n) => n.t / 1000);
    expect(meanAbsTimingMs(hits, song.attacks)).toBeLessThan(6);
  });

  it("is playable", () => {
    checkPlayable(normal);
    checkPlayable(hard);
  });
});

describe("auto chart on a 3/4 waltz that speeds up like a live pianist", () => {
  const song = makeSong({ bpm: 112, beatsPerBar: 3, bars: 40, drift: 0.1 });
  const result = analyzeSamples(song.samples, { title: "waltz" });
  const { normal } = result.charts;

  it("detects 3/4", () => {
    expect(result.beatsPerBar).toBe(3);
  });

  it("follows the changing tempo", () => {
    expect(beatF(chartBeats(normal), song.beats, 0.05)).toBeGreaterThan(0.95);
    expect(meanAbsTimingMs(chartBeats(normal), song.beats)).toBeLessThan(6);
  });

  it("keeps a note on the beat all the way through", () => {
    const missing = song.beats.filter((t) => !covered(normal, t, 0.03));
    if (missing.length) console.log("WALTZ missing", missing.map((t) => t.toFixed(3)).join(" "), "| chart beats near:", missing.map((t) => (normal.beats ?? []).filter((b) => Math.abs(b / 1000 - t) < 0.4).join("/")).join(" "), "| notes near:", missing.map((t) => normal.notes.filter((n) => Math.abs(n.t / 1000 - t) < 0.6).map((n) => `${n.t}${n.len ? "+" + n.len : ""}`).join(",")).join(" ; "));
    expect(missing.length / song.beats.length).toBeLessThan(0.03);
  });
});

describe("silence and held chords", () => {
  const song = makeSong({ bpm: 96, beatsPerBar: 4, bars: 12, start: 4, holdBars: [5, 9], tail: 4 });
  const result = analyzeSamples(song.samples, { title: "holds" });
  const { normal, hard } = result.charts;
  const first = song.beats[0];
  const last = song.beats[song.beats.length - 1];

  it("puts no notes in the silent intro or after the music ends", () => {
    for (const c of [normal, hard]) {
      expect(c.notes[0].t / 1000).toBeGreaterThan(first - 0.05);
      const end = Math.max(...c.notes.map((n) => (n.t + (n.len ?? 0)) / 1000));
      expect(end).toBeLessThan(last + 60 / 96 + 0.1);
    }
  });

  it("turns a held chord into a long note instead of leaving a gap", () => {
    for (const bar of [5, 9]) {
      const t = song.beats[bar * 4];
      const long = normal.notes.find((n) => Math.abs(n.t / 1000 - t) < 0.03 && n.len);
      expect(long, `bar ${bar}`).toBeDefined();
      expect((long!.len ?? 0) / 1000).toBeGreaterThan(1.2); // 4박 중 적어도 2박 넘게
    }
  });

  it("never leaves the beat uncovered while music is playing", () => {
    const missing = song.beats.filter((t) => !covered(normal, t, 0.03));
    if (missing.length) console.log("HOLD missing", missing.map((t) => t.toFixed(3)).join(" "), "| notes near:", missing.map((t) => normal.notes.filter((n) => Math.abs(n.t / 1000 - t) < 1.2).map((n) => `${n.t}${n.len ? "+" + n.len : ""}`).join(",")).join(" ; "), "| beats:", (normal.beats ?? []).slice(0, 3).join(","), "...", (normal.beats ?? []).slice(-3).join(","));
    expect(missing.length).toBeLessThanOrEqual(1);
  });

  it("is playable", () => {
    checkPlayable(normal);
    checkPlayable(hard);
  });
});

describe("speed", () => {
  it("analyzes a minute of audio quickly", () => {
    const song = makeSong({ bpm: 120, beatsPerBar: 4, bars: 30 });
    const t0 = performance.now();
    analyzeSamples(song.samples, { title: "speed" });
    const sec = (performance.now() - t0) / 1000;
    expect(sec).toBeLessThan(5);
  });
});
