import { FFT, hann } from "./fft";

// 음원에서 박/노트 분석에 쓰는 특징을 뽑는다 (librosa와 같은 방식).
// - onset: 멜 스펙트럼이 프레임마다 얼마나 늘었는지 (소리가 새로 시작되는 세기)
// - rmsDb: 프레임 음량(dB). 조용한 구간(곡 앞뒤)을 가려낸다
// - chroma: 12음 세기. 화음이 바뀌는 박(마디 첫 박)을 찾는다

export const SR = 22050;
export const N_FFT = 2048;
export const HOP = 512;
export const FRAME_RATE = SR / HOP;
const N_MELS = 64;
const TOP_DB = 80;

export interface Features {
  frames: number;
  onset: Float32Array;
  /** 200Hz 아래(베이스, 킥 드럼) 대역만 본 onset. 베이스는 보통 마디 첫 박에 친다 */
  bassOnset: Float32Array;
  /** 2kHz 위(스네어, 하이햇) 대역만 본 onset */
  highOnset: Float32Array;
  rmsDb: Float32Array;
  /** frames × 12, 프레임마다 정규화하지 않은 12음 세기 */
  chroma: Float32Array;
  samples: Float32Array;
}

export function frameToSec(frame: number): number {
  return (frame * HOP) / SR;
}

export function secToFrame(sec: number): number {
  return Math.round((sec * SR) / HOP);
}

/** 프레임 중심이 frame*HOP에 오도록 앞뒤를 0으로 채운 창을 꺼낸다 */
function frameAt(samples: Float32Array, frame: number, out: Float32Array): void {
  const start = frame * HOP - N_FFT / 2;
  for (let i = 0; i < N_FFT; i++) {
    const j = start + i;
    out[i] = j >= 0 && j < samples.length ? samples[j] : 0;
  }
}

function hzToMel(hz: number): number {
  return 2595 * Math.log10(1 + hz / 700);
}

function melToHz(mel: number): number {
  return 700 * (10 ** (mel / 2595) - 1);
}

/** 삼각형 멜 필터: [band][bin] 대신 band마다 (시작 bin, 가중치 목록, 중심 주파수) */
function melFilters(): { start: number; weights: Float32Array; center: number }[] {
  const lo = hzToMel(30);
  const hi = hzToMel(8000);
  const points = Array.from({ length: N_MELS + 2 }, (_, i) => melToHz(lo + ((hi - lo) * i) / (N_MELS + 1)));
  const binHz = SR / N_FFT;
  return Array.from({ length: N_MELS }, (_, m) => {
    const [f0, f1, f2] = [points[m], points[m + 1], points[m + 2]];
    const start = Math.floor(f0 / binHz);
    const end = Math.ceil(f2 / binHz);
    const weights = new Float32Array(end - start + 1);
    for (let k = start; k <= end; k++) {
      const f = k * binHz;
      const w = f < f1 ? (f - f0) / (f1 - f0) : (f2 - f) / (f2 - f1);
      weights[k - start] = Math.max(0, w);
    }
    return { start, weights, center: f1 };
  });
}

export function computeFeatures(samples: Float32Array, onProgress?: (ratio: number) => void): Features {
  const frames = Math.floor(samples.length / HOP) + 1;
  const fft = new FFT(N_FFT);
  const win = hann(N_FFT);
  const buf = new Float32Array(N_FFT);
  const power = new Float32Array(N_FFT / 2 + 1);
  const filters = melFilters();
  const melDb = new Float32Array(frames * N_MELS);
  const rmsDb = new Float32Array(frames);
  const chroma = new Float32Array(frames * 12);

  // 12음 표: 55Hz~2kHz bin만 쓴다
  const binHz = SR / N_FFT;
  const pcOfBin = new Int8Array(N_FFT / 2 + 1).fill(-1);
  for (let k = 1; k <= N_FFT / 2; k++) {
    const f = k * binHz;
    if (f >= 55 && f <= 2000) pcOfBin[k] = (((Math.round(12 * Math.log2(f / 440) + 69) % 12) + 12) % 12) as number;
  }

  let maxDb = -Infinity;
  for (let t = 0; t < frames; t++) {
    frameAt(samples, t, buf);
    let sq = 0;
    for (let i = 0; i < N_FFT; i++) sq += buf[i] * buf[i];
    rmsDb[t] = 20 * Math.log10(Math.sqrt(sq / N_FFT) + 1e-9);

    fft.power(buf, power, win);
    for (let m = 0; m < N_MELS; m++) {
      const { start, weights } = filters[m];
      let e = 0;
      for (let i = 0; i < weights.length; i++) e += power[start + i] * weights[i];
      const db = 10 * Math.log10(Math.max(1e-10, e));
      melDb[t * N_MELS + m] = db;
      if (db > maxDb) maxDb = db;
    }
    for (let k = 1; k <= N_FFT / 2; k++) {
      const pc = pcOfBin[k];
      if (pc >= 0) chroma[t * 12 + pc] += power[k];
    }
    if (onProgress && t % 500 === 0) onProgress(t / frames);
  }

  // 너무 작은 소리는 바닥값으로 묶는다 (librosa power_to_db의 top_db)
  const floor = maxDb - TOP_DB;
  for (let i = 0; i < melDb.length; i++) if (melDb[i] < floor) melDb[i] = floor;

  const bassBands = filters.filter((fl) => fl.center < 200).length;
  const highFrom = filters.findIndex((fl) => fl.center >= 2000);
  const highBands = N_MELS - highFrom;
  const onset = new Float32Array(frames);
  const bassOnset = new Float32Array(frames);
  const highOnset = new Float32Array(frames);
  for (let t = 1; t < frames; t++) {
    let s = 0;
    let bass = 0;
    let high = 0;
    for (let m = 0; m < N_MELS; m++) {
      const d = melDb[t * N_MELS + m] - melDb[(t - 1) * N_MELS + m];
      if (d > 0) {
        s += d;
        if (m < bassBands) bass += d;
        if (m >= highFrom) high += d;
      }
    }
    onset[t] = s / N_MELS;
    bassOnset[t] = bassBands ? bass / bassBands : 0;
    highOnset[t] = highBands > 0 ? high / highBands : 0;
  }
  onProgress?.(1);
  return { frames, onset, bassOnset, highOnset, rmsDb, chroma, samples };
}

/**
 * 프레임에서 새로 울린 음 중 가장 높은 음(멜로디)의 MIDI 번호와,
 * 0.5초 뒤에도 그 음이 남아 있는 비율(롱 노트 판단용).
 */
export function pitchAt(samples: Float32Array, frame: number): { midi: number | null; sustain: number } {
  const fft = new FFT(N_FFT);
  const win = hann(N_FFT);
  const buf = new Float32Array(N_FFT);
  const before = new Float32Array(N_FFT / 2 + 1);
  const after = new Float32Array(N_FFT / 2 + 1);
  const later = new Float32Array(N_FFT / 2 + 1);
  frameAt(samples, Math.max(0, frame - 3), buf);
  fft.power(buf, before, win);
  frameAt(samples, frame + 2, buf);
  fft.power(buf, after, win);
  frameAt(samples, frame + secToFrame(0.5), buf);
  fft.power(buf, later, win);

  const binHz = SR / N_FFT;
  const lo = Math.ceil(130 / binHz);
  const hi = Math.floor(2100 / binHz);
  let maxRise = 0;
  for (let k = lo; k <= hi; k++) maxRise = Math.max(maxRise, after[k] - before[k]);
  if (maxRise <= 0) return { midi: null, sustain: 0 };
  let top = -1;
  for (let k = hi; k >= lo; k--) {
    // 위에서부터 내려오며, 충분히 강하게 새로 울린 봉우리를 찾는다
    if (after[k] - before[k] >= maxRise * 0.3 && after[k] >= after[k - 1] && after[k] >= after[k + 1]) {
      top = k;
      break;
    }
  }
  if (top < 0) return { midi: null, sustain: 0 };
  const midi = Math.round(12 * Math.log2((top * binHz) / 440) + 69);
  return { midi, sustain: later[top] / (after[top] + 1e-12) };
}

/**
 * 프레임 단위(약 23ms)로 찾은 onset 시각을 파형에서 다듬는다.
 * 2.5ms 간격 음량 곡선에서 '뒤 10ms 평균'이 '앞 10ms 평균'보다 가장 크게 커지는 지점을 찾는다.
 * (두 음이 겹쳐 생기는 짧은 음량 골짜기에 속지 않도록 짧은 차이 대신 평균끼리 비교한다)
 * 근처에 뚜렷한 시작이 없으면 원래 시각을 그대로 돌려준다.
 */
export function refineOnsetTime(samples: Float32Array, approxSec: number): number {
  const step = Math.round(0.0025 * SR);
  const span = 4; // 4 × 2.5ms = 10ms
  const from = Math.round((approxSec - 0.05) * SR);
  const to = Math.round((approxSec + 0.08) * SR);
  const energy: number[] = [];
  const starts: number[] = [];
  for (let s = from; s + step <= to; s += step) {
    let e = 0;
    for (let i = s; i < s + step; i++) {
      const v = i >= 0 && i < samples.length ? samples[i] : 0;
      e += v * v;
    }
    energy.push(e / step);
    starts.push(s);
  }
  const db = (a: number, b: number) => {
    let e = 0;
    for (let k = a; k < b; k++) e += energy[k];
    return 10 * Math.log10(e / (b - a) + 1e-12);
  };
  let best = -1;
  let bestRise = 3; // 3dB 이상 커져야 시작으로 본다
  for (let k = span; k + span <= energy.length; k++) {
    const rise = db(k, k + span) - db(k - span, k);
    if (rise > bestRise) {
      bestRise = rise;
      best = k;
    }
  }
  return best < 0 ? approxSec : starts[best] / SR;
}
