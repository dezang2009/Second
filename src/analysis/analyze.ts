import type { Chart } from "../songs/types";
import { estimateTempo, trackBeats } from "./beats";
import { computeFeatures, FRAME_RATE, frameToSec, pitchAt, refineOnsetTime, SR } from "./features";
import { detectMeter } from "./meter";
import { buildNotes, type Level, type Onset } from "./notes";

// 음원 하나를 분석해 NORMAL / HARD 자동 채보를 만든다.
// 입력은 22050Hz 모노 샘플 (features.SR). 브라우저에서는 워커 안에서 돌린다.

/**
 * 프레임 단위 onset이 실제 소리보다 늦게(+) 잡히는 평균값(초). 음수면 일찍 잡힌다.
 * 23ms 프레임의 창이 소리 시작을 앞쪽 가장자리에서 먼저 잡기 때문에 약 25ms 일찍 나온다.
 * 파형으로 다듬지 못한 박에만 쓴다 (다듬은 onset은 오차 3ms 이내, analyze.test.ts).
 */
export const ONSET_LAG_SEC = -0.025;
/** 박을 이 거리 안의 실제 소리 시작에 맞춘다(초) */
const BEAT_SNAP_SEC = 0.06;
/** 가장 큰 음량보다 이만큼 이상 작으면 조용한 구간으로 본다(dB) */
const SILENCE_DB = 35;

export interface AnalysisResult {
  charts: Record<Level, Chart>;
  bpm: number;
  beatsPerBar: number;
  beatCount: number;
}

export interface AnalyzeOptions {
  title: string;
  onProgress?: (ratio: number, stage: string) => void;
}

export function analyzeSamples(samples: Float32Array, opt: AnalyzeOptions): AnalysisResult {
  const progress = opt.onProgress ?? (() => {});
  const durationMs = Math.round((samples.length / SR) * 1000);

  progress(0, "소리 분석");
  const f = computeFeatures(samples, (r) => progress(r * 0.6, "소리 분석"));

  progress(0.6, "박자 찾기");
  const bpm = estimateTempo(f.onset);
  const beatFrames = trackBeats(f.onset, bpm);

  progress(0.7, "노트 찾기");
  const peaks = pickPeaks(f.onset);
  const maxStrength = Math.max(1e-9, ...peaks.map((p) => f.onset[p]));
  const bandAt = (band: Float32Array, p: number) => Math.max(band[p - 1] ?? 0, band[p], band[p + 1] ?? 0);
  const maxKick = Math.max(1e-9, ...peaks.map((p) => bandAt(f.bassOnset, p)));
  const maxSnare = Math.max(1e-9, ...peaks.map((p) => bandAt(f.highOnset, p)));
  const onsets: Onset[] = peaks.map((p, i) => {
    if (i % 50 === 0) progress(0.7 + (0.25 * i) / peaks.length, "노트 찾기");
    const { midi, sustain } = pitchAt(f.samples, p);
    return {
      time: refineOnsetTime(f.samples, frameToSec(p)),
      strength: f.onset[p] / maxStrength,
      midi,
      sustain,
      kick: bandAt(f.bassOnset, p) / maxKick,
      snare: bandAt(f.highOnset, p) / maxSnare,
    };
  });

  // 박은 가까운 실제 소리 시작에 붙인다. onset으로 잡히지 않은 약한 소리는 파형에서 직접 찾고,
  // 그래도 없으면(소리 없이 흐르는 박) 평균 오차만큼만 보정한다
  const beats = beatFrames.map((b) => {
    const approx = frameToSec(b) - ONSET_LAG_SEC;
    let best = NaN;
    let bestD = BEAT_SNAP_SEC;
    for (const o of onsets) {
      const d = Math.abs(o.time - approx);
      if (d < bestD && o.strength >= 0.05) {
        bestD = d;
        best = o.time;
      }
    }
    if (!Number.isNaN(best)) return best;
    const refined = refineOnsetTime(f.samples, approx);
    return Math.abs(refined - approx) <= BEAT_SNAP_SEC ? refined : approx;
  });
  for (let i = 1; i < beats.length; i++) if (beats[i] <= beats[i - 1]) beats[i] = beats[i - 1] + 0.001;

  progress(0.95, "채보 만들기");
  const loud = Math.max(...f.rmsDb);
  const beatActive = beatFrames.map((b) => {
    let m = -Infinity;
    for (let t = Math.max(0, b - 3); t <= Math.min(f.frames - 1, b + 3); t++) m = Math.max(m, f.rmsDb[t]);
    return m >= loud - SILENCE_DB;
  });
  const meter = detectMeter(f.chroma, f.frames, beatFrames, f.bassOnset);
  const input = { beats, barStarts: meter.barStarts, onsets, beatActive };

  const intervals = beats.slice(1).map((b, i) => b - beats[i]).sort((a, b) => a - b);
  const medianBeat = intervals[intervals.length >> 1] ?? 60 / bpm;
  const base = {
    title: opt.title,
    artist: "",
    durationMs,
    bpm: Math.round((60 / medianBeat) * 100) / 100,
    beatsPerBar: meter.beatsPerBar,
    offsetMs: Math.round((beats[meter.barStarts[0] ?? 0] ?? 0) * 1000),
    beats: beats.map((b) => Math.round(b * 1000)),
    bars: meter.barStarts.map((i) => Math.round(beats[i] * 1000)),
  };
  const make = (level: Level): Chart => {
    const notes = buildNotes(input, level);
    const playSec = notes.length ? (notes[notes.length - 1].t - notes[0].t) / 1000 : 1;
    const nps = notes.length / Math.max(1, playSec);
    return { ...base, difficulty: { name: level.toUpperCase(), level: Math.max(1, Math.min(15, Math.round(nps * 3))) }, notes };
  };
  const charts = { normal: make("normal"), hard: make("hard") };
  progress(1, "완료");
  return { charts, bpm: base.bpm, beatsPerBar: meter.beatsPerBar, beatCount: beats.length };
}

/** onset 봉우리 고르기 (librosa onset_detect의 peak_pick과 같은 규칙) */
export function pickPeaks(onset: Float32Array): number[] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of onset) {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  const range = hi - lo || 1;
  const x = Array.from(onset, (v) => (v - lo) / range);
  const preMax = Math.max(1, Math.round(0.03 * FRAME_RATE));
  const preAvg = Math.round(0.1 * FRAME_RATE);
  const postAvg = Math.round(0.1 * FRAME_RATE) + 1;
  const wait = Math.max(1, Math.round(0.03 * FRAME_RATE));
  const delta = 0.07;
  const peaks: number[] = [];
  let last = -Infinity;
  for (let n = 1; n < x.length - 1; n++) {
    let isMax = x[n] >= x[n + 1];
    for (let k = Math.max(0, n - preMax); k < n && isMax; k++) if (x[k] > x[n]) isMax = false;
    if (!isMax) continue;
    let sum = 0;
    let cnt = 0;
    for (let k = Math.max(0, n - preAvg); k < Math.min(x.length, n + postAvg); k++) {
      sum += x[k];
      cnt++;
    }
    if (x[n] < sum / cnt + delta) continue;
    if (n - last <= wait) continue;
    peaks.push(n);
    last = n;
  }
  return peaks;
}
