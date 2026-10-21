import { describe, expect, it } from "vitest";
import type { Chart } from "../songs/types";
import { analyzeSamples } from "./analyze";
import { beatF, beatTimes, type DrumHit, renderDrums, renderNotes, renderVoice, type SynthNote, type VoiceNote } from "./synth";

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

describe("drum-driven song", () => {
  // 킥 1·3박, 스네어 2·4박, 하이햇 8분음표, 아주 작은 패드 화음
  const bpm = 110;
  const beats = beatTimes(1, 64, bpm);
  const hits: DrumHit[] = [];
  const hats: number[] = [];
  const pads: SynthNote[] = [];
  beats.forEach((t, i) => {
    hits.push({ t, kind: i % 2 === 0 ? "kick" : "snare" }, { t, kind: "hat" });
    const off = t + 30 / bpm;
    hits.push({ t: off, kind: "hat" });
    hats.push(off);
    if (i % 4 === 0) pads.push({ t, hz: [220, 196, 247, 175][(i / 4) % 4], dur: 240 / bpm, gain: 0.05, decay: 3 });
  });
  const samples = renderNotes(pads, beats[63] + 1.5, 0.001);
  renderDrums(hits, samples);
  const result = analyzeSamples(samples, { title: "drums" });
  const { normal, hard } = result.charts;
  const hasNote = (c: Chart, t: number) => c.notes.some((n) => Math.abs(n.t / 1000 - t) < 0.03);

  it("tracks the groove", () => {
    expect(result.bpm).toBeGreaterThan(bpm * 0.98);
    expect(result.bpm).toBeLessThan(bpm * 1.02);
    expect(beatF(chartBeats(normal), beats, 0.05)).toBeGreaterThan(0.95);
  });

  it("puts a note on every kick and snare", () => {
    expect(beats.filter((t) => !hasNote(normal, t)).length).toBeLessThanOrEqual(1);
  });

  it("adds the hi-hat off-beats in HARD but keeps NORMAL calm", () => {
    expect(hats.filter((t) => hasNote(hard, t)).length / hats.length).toBeGreaterThan(0.8);
    expect(hats.filter((t) => hasNote(normal, t)).length / hats.length).toBeLessThan(0.2);
  });

  it("is playable", () => {
    checkPlayable(normal);
    checkPlayable(hard);
  });
});

describe("very dense song", () => {
  // 150 BPM 16분음표 멜로디 (초당 10음)
  const bpm = 150;
  const beats = beatTimes(1, 48, bpm);
  const notes: SynthNote[] = [];
  beats.forEach((t, i) => {
    for (let q = 0; q < 4; q++) notes.push({ t: t + (q * 15) / bpm, hz: SCALE[(i * 4 + q) % SCALE.length], dur: 0.09, gain: q === 0 ? 0.3 : 0.24 });
    if (i % 4 === 0) notes.push({ t, hz: BASS[(i / 4) % BASS.length], dur: 1.5, gain: 0.3 });
  });
  const result = analyzeSamples(renderNotes(notes, beats[47] + 1.5, 0.001), { title: "dense" });
  const maxIn2s = (c: Chart) => {
    const ts = c.notes.map((n) => n.t / 1000);
    let best = 0;
    for (let i = 0, j = 0; i < ts.length; i++) {
      while (ts[i] - ts[j] >= 2) j++;
      best = Math.max(best, i - j + 1);
    }
    return best;
  };

  it("finds the real tempo, not a slower multiple", () => {
    expect(result.bpm).toBeGreaterThan(bpm * 0.98);
    expect(result.bpm).toBeLessThan(bpm * 1.02);
  });

  it("keeps note density within each difficulty's limit", () => {
    // 동시 노트(최대 2개)까지 세므로 한도에 약간 여유를 둔다
    expect(maxIn2s(result.charts.normal)).toBeLessThanOrEqual(4 * 2 + 2);
    expect(maxIn2s(result.charts.hard)).toBeLessThanOrEqual(8 * 2 + 2);
    expect(result.charts.hard.notes.length).toBeGreaterThan(result.charts.normal.notes.length);
  });

  it("still keeps the beat in NORMAL", () => {
    const missing = beats.filter((t) => !result.charts.normal.notes.some((n) => Math.abs(n.t / 1000 - t) < 0.03));
    expect(missing.length / beats.length).toBeLessThan(0.1);
  });
});

function makeVocalSong(bpm: number, drums: boolean) {
  // 2마디(8박) 가사 리듬: 엇박, 16분음표, 같은 음 되풀이, 2.5박 끄는 음
  const beats = beatTimes(1, 64, bpm);
  const beatLen = 60 / bpm;
  const RHYTHM = [0, 0.5, 1, 2, 2.5, 3.5, 3.75, 4, 7, 7.5];
  const PITCH = [440, 440, 494, 523, 494, 440, 392, 440, 523, 587];
  const syllables: VoiceNote[] = [];
  for (let phrase = 0; phrase < 8; phrase++) {
    const base = beats[phrase * 8];
    RHYTHM.forEach((b, k) => {
      const next = RHYTHM[k + 1] ?? 8;
      // 다음 글자 직전까지 이어 부른다 (자음 자리만큼 살짝 끊김)
      syllables.push({ t: base + b * beatLen, hz: PITCH[k] * (phrase % 2 ? 1.122 : 1), dur: (next - b) * beatLen - 0.04 });
    });
  }
  const hits: DrumHit[] = [];
  const backing: SynthNote[] = [];
  beats.forEach((t, i) => {
    if (drums) hits.push({ t, kind: i % 2 === 0 ? "kick" : "snare" }, { t, kind: "hat" }, { t: t + beatLen / 2, kind: "hat" });
    if (i % 4 === 0) {
      const root = [110, 98, 87, 98][(i / 4) % 4];
      // 드럼 곡은 조용한 패드, 발라드는 마디마다 한 번 치고 길게 울리는 피아노 화음
      for (const m of [1, 2, 2.52, 3]) backing.push({ t, hz: root * m, dur: 4 * beatLen, gain: drums ? 0.05 : 0.12, decay: drums ? 4 : 2.5 });
    }
  });
  const samples = renderNotes(backing, beats[63] + 2, 0.001);
  renderDrums(hits, samples);
  renderVoice(syllables, samples);
  return { samples, beats, beatLen, syllables };
}

for (const [name, bpm, drums] of [["vocal song with drums", 100, true], ["ballad with piano chords", 84, false]] as const) {
  describe(name, () => {
    const { samples, beatLen, syllables } = makeVocalSong(bpm, drums);
    const result = analyzeSamples(samples, { title: name });
    const { normal, hard } = result.charts;
    const hasNote = (c: Chart, t: number) => c.notes.some((n) => Math.abs(n.t / 1000 - t) < 0.035);
    const on8 = syllables.filter((v) => {
      const x = ((v.t - 1) / beatLen) * 2;
      return Math.abs(x - Math.round(x)) < 0.01;
    });

    it("tracks the beat", () => {
      // 드럼 없는 느린 곡은 8분음표를 박으로 잡을 수도 있다 (84와 168은 120 BPM 기준에서 거의 같은 거리). 둘 다 박자는 맞다
      const ok = [1, ...(drums ? [] : [2])].some((k) => Math.abs(result.bpm / (bpm * k) - 1) < 0.02);
      expect(ok, `bpm ${result.bpm}`).toBe(true);
    });

    it("puts a note on every sung syllable on the 8th-note grid in NORMAL", () => {
      const missed = on8.filter((v) => !hasNote(normal, v.t));
      expect(missed.length / on8.length).toBeLessThan(0.1);
    });

    it("puts a note on almost every sung syllable in HARD", () => {
      const missed = syllables.filter((v) => !hasNote(hard, v.t));
      expect(missed.length / syllables.length).toBeLessThan(0.08);
    });

    it("holds a long sung note", () => {
      // 각 소절 4박째에서 2.5박 끄는 음
      const held = syllables.filter((v) => v.dur > 2 * beatLen);
      // 드럼이 박마다 치는 곡의 NORMAL은 롱 노트 대신 박을 치므로 HARD로 본다
      const chart = drums ? hard : normal;
      const longs = held.filter((v) => chart.notes.some((n) => n.len && Math.abs(n.t / 1000 - v.t) < 0.035 && n.len / 1000 > beatLen * 1.5));
      expect(longs.length / held.length).toBeGreaterThan(0.7);
    });

    it("never covers a new syllable with a long note", () => {
      for (const c of [normal, hard]) {
        const swallowed = syllables.filter((v) => c.notes.some((n) => n.len && n.t / 1000 + 0.04 < v.t && v.t < (n.t + n.len) / 1000 - 0.04));
        expect(swallowed.map((v) => v.t.toFixed(2))).toEqual([]);
      }
    });

    it("is playable", () => {
      checkPlayable(normal);
      checkPlayable(hard);
    });
  });
}

describe("speed", () => {
  it("analyzes a minute of audio quickly", () => {
    const song = makeSong({ bpm: 120, beatsPerBar: 4, bars: 30 });
    const t0 = performance.now();
    analyzeSamples(song.samples, { title: "speed" });
    const sec = (performance.now() - t0) / 1000;
    expect(sec).toBeLessThan(5);
  });
});

describe("four difficulties", () => {
  const steady = makeSong({ bpm: 100, beatsPerBar: 4, bars: 16, halfEvery: 2 });
  const vocal = makeVocalSong(100, true);
  for (const [name, samples, beats] of [
    ["steady", steady.samples, steady.beats],
    ["vocal", vocal.samples, vocal.beats],
  ] as const) {
    const { charts } = analyzeSamples(samples, { title: name });
    const maxIn2s = (c: Chart) => {
      const ts = c.notes.map((n) => n.t / 1000);
      let best = 0;
      for (let i = 0, j = 0; i < ts.length; i++) {
        while (ts[i] - ts[j] >= 2) j++;
        best = Math.max(best, i - j + 1);
      }
      return best;
    };

    it(`${name}: gets harder step by step`, () => {
      const counts = (["easy", "normal", "hard", "expert"] as const).map((l) => charts[l].notes.length);
      expect(counts[0]).toBeLessThan(counts[1]);
      expect(counts[1]).toBeLessThan(counts[2]);
      expect(counts[2]).toBeLessThanOrEqual(counts[3]);
      const levels = (["easy", "normal", "hard", "expert"] as const).map((l) => charts[l].difficulty.level);
      expect([...levels].sort((a, b) => a - b)).toEqual(levels);
    });

    it(`${name}: EASY stays on the beat with no chords`, () => {
      const offBeat = charts.easy.notes.filter((n) => !beats.some((b) => Math.abs(n.t / 1000 - b) < 0.04));
      expect(offBeat.length).toBe(0);
      const times = charts.easy.notes.map((n) => n.t);
      expect(new Set(times).size).toBe(times.length);
      expect(maxIn2s(charts.easy)).toBeLessThanOrEqual(Math.ceil(1.6 * 2) + 1);
    });

    it(`${name}: EXPERT respects its density cap`, () => {
      expect(maxIn2s(charts.expert)).toBeLessThanOrEqual(11 * 2 + 2);
    });

    it(`${name}: every difficulty is playable`, () => {
      for (const c of Object.values(charts)) checkPlayable(c);
    });
  }
});
