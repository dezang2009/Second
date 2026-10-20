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
  /**
   * 노래(멜로디) onset: 스펙트럼의 뚜렷한 봉우리(음높이가 있는 소리)만으로, 300Hz~4kHz에서 새로 커진 정도.
   * 부드럽게 시작하는 가사 한 글자, 같은 음을 다시 부르는 자리도 잡는다.
   */
  melodyOnset: Float32Array;
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
  const tonalDb = new Float32Array(frames * N_MELS);
  const tonal = new Float32Array(N_FFT / 2 + 1);
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
    tonalPeaks(power, tonal);
    for (let m = 0; m < N_MELS; m++) {
      const { start, weights } = filters[m];
      let e = 0;
      for (let i = 0; i < weights.length; i++) e += tonal[start + i] * weights[i];
      tonalDb[t * N_MELS + m] = 10 * Math.log10(Math.max(1e-10, e));
    }
    for (let k = 1; k <= N_FFT / 2; k++) {
      const pc = pcOfBin[k];
      if (pc >= 0) chroma[t * 12 + pc] += power[k];
    }
    if (onProgress && t % 500 === 0) onProgress(t / frames);
  }

  // 너무 작은 소리는 바닥값으로 묶는다 (librosa power_to_db의 top_db)
  const floor = maxDb - TOP_DB;
  for (let i = 0; i < melDb.length; i++) {
    if (melDb[i] < floor) melDb[i] = floor;
    if (tonalDb[i] < floor) tonalDb[i] = floor;
  }

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
  const melodyOnset = harmonicOnset(tonalDb, melDb, frames, filters.map((fl) => fl.center));
  return { frames, onset, bassOnset, highOnset, melodyOnset, rmsDb, chroma, samples };
}

/** 주변보다 이만큼 이상 센 스펙트럼 봉우리만 '음'으로 본다 (약 8dB) */
const TONAL_PROMINENCE = 6;

/**
 * 스펙트럼에서 뚜렷한 봉우리(노래, 악기의 배음)만 남긴다.
 * 드럼처럼 넓게 퍼진 잡음 소리에는 이런 봉우리가 거의 없다.
 */
function tonalPeaks(power: Float32Array, out: Float32Array): void {
  out.fill(0);
  const n = power.length;
  for (let k = 10; k < n - 10; k++) {
    const p = power[k];
    if (p < power[k - 1] || p < power[k + 1] || p < power[k - 2] || p < power[k + 2]) continue;
    let side = 0;
    for (let j = 4; j <= 9; j++) side += power[k - j] + power[k + j];
    if (p < (TONAL_PROMINENCE * side) / 12) continue;
    out[k - 1] = power[k - 1];
    out[k] = p;
    out[k + 1] = power[k + 1];
  }
}

/** 멜로디 대역 아래 끝. 킥과 스네어 몸통(200Hz 안팎)의 울림을 피하고, 노래는 배음으로 잡는다 */
const MELODY_LO_HZ = 300;

/** 같은 음을 다시 부를 때 끊기는 길이(프레임)와, 그때 노래 대역 세기가 줄어야 하는 정도(dB) */
const DIP_SPAN = 4;
const DIP_DB = 1.5;

/** 시간 방향 중앙값 창(프레임, 약 0.4초. 분석 창이 93ms라 짧은 타격도 여러 프레임에 걸치므로 넉넉히) */
const HARM_WIN = 17;

/**
 * 멜로디 대역(300Hz~4kHz)의 뚜렷한 봉우리 세기에서 '길게 이어지는 소리'가 새로 시작된 정도를 구한다.
 *  - 대역마다 앞뒤 0.4초 중앙값을 쓴다. 드럼처럼 짧게 튀는 소리는 중앙값을 넘지 못해 사라지고,
 *    노래나 악기 음이 새로 시작되면 중앙값도 바로 그 자리에서 올라간다 (중앙값은 계단 모양을 그대로 둔다)
 *  - 같은 음을 다시 부를 때의 짧은 끊김은 중앙값에서 사라지므로 따로 찾는다: 지금 세기가 잠깐 꺼졌다 돌아왔고,
 *    그동안 노래 대역 전체 세기도 줄었을 때만 (드럼 잡음에 음이 잠깐 가려진 것은 전체 세기가 오히려 커진다)
 *  - 비브라토처럼 음이 옆 대역으로 살짝 옮겨 가는 것은 새 소리로 치지 않는다
 */
function harmonicOnset(tonalDb: Float32Array, rawDb: Float32Array, frames: number, centers: number[]): Float32Array {
  const from = centers.findIndex((c) => c >= MELODY_LO_HZ);
  let to = centers.findIndex((c) => c > 4000);
  if (to < 0) to = N_MELS;
  let coreTo = centers.findIndex((c) => c > 2000);
  if (coreTo < 0) coreTo = N_MELS;
  const med = new Float32Array(frames * N_MELS);
  const low = new Float32Array(frames * N_MELS);
  const half = HARM_WIN >> 1;
  const at = (k: number, m: number) => (k >= 0 && k < frames ? tonalDb[k * N_MELS + m] : -Infinity);
  for (let m = from; m < to; m++) {
    // 정렬된 창을 한 칸씩 밀며 중앙값을 구한다 (빠지는 값 하나 빼고, 들어오는 값 하나 끼움)
    const win: number[] = [];
    for (let k = -half; k <= half; k++) win.push(at(k, m));
    win.sort((a, b) => a - b);
    for (let t = 0; t < frames; t++) {
      med[t * N_MELS + m] = win[half];
      low[t * N_MELS + m] = Math.min(tonalDb[t * N_MELS + m], win[half]);
      win.splice(lowerBound(win, at(t - half, m)), 1);
      const v = at(t + half + 1, m);
      win.splice(lowerBound(win, v), 0, v);
    }
  }
  // 직전 프레임의 이웃 대역 중 가장 큰 값과 비교한 상승량 (SuperFlux). 비브라토로 음이 옆 대역에 걸치는 것은 새 소리가 아니다
  const flux = (x: Float32Array, t: number) => {
    let s = 0;
    const p = (t - 1) * N_MELS;
    for (let m = from; m < to; m++) {
      const prev = Math.max(x[p + m], m > from ? x[p + m - 1] : -Infinity, m + 1 < to ? x[p + m + 1] : -Infinity);
      const d = x[t * N_MELS + m] - prev;
      if (d > 0) s += d;
    }
    return s / (to - from);
  };
  // 노래 핵심 대역(300Hz~2kHz)의 전체 세기. 짧게 끊긴 자리가 정말 소리가 줄어든 것인지(노래를 끊음),
  // 드럼 잡음이 덮어 음만 가려진 것인지(전체 세기는 오히려 커짐) 가린다
  const core = new Float32Array(frames);
  for (let t = 0; t < frames; t++) {
    let e = 0;
    for (let m = from; m < coreTo; m++) e += 10 ** (rawDb[t * N_MELS + m] / 10);
    core[t] = 10 * Math.log10(e + 1e-10);
  }
  const out = new Float32Array(frames);
  for (let t = 1; t < frames; t++) {
    const steady = flux(med, t);
    const withDips = flux(low, t);
    let rearticulated = 0;
    if (withDips > steady && t > DIP_SPAN) {
      const pre = core[t - DIP_SPAN - 1];
      let dipMin = Infinity;
      let dipMax = -Infinity;
      for (let k = t - DIP_SPAN; k < t; k++) {
        dipMin = Math.min(dipMin, core[k]);
        dipMax = Math.max(dipMax, core[k]);
      }
      if (dipMin < pre - DIP_DB && dipMax < pre + DIP_DB) rearticulated = withDips - steady;
    }
    out[t] = steady + rearticulated;
  }
  return out;
}

/** 정렬된 배열에서 v 이상인 첫 위치 */
function lowerBound(a: number[], v: number): number {
  let lo = 0;
  let hi = a.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (a[mid] < v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
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
  // 킥 드럼(150Hz 아래)이 함께 쳐도 노래 음을 찾도록 200Hz부터 본다 (낮은 음은 배음으로 잡힌다)
  const lo = Math.ceil(200 / binHz);
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

/**
 * frame에서 시작한 음(midi)이 끊기지 않고 얼마나 오래 울리는지(초, 최대 maxSec).
 * 그 음 주파수의 세기가 시작 직후의 20% 아래로 떨어지거나, 바로 앞 0.1초보다 갑자기 1/3 아래로 꺼지면
 * (같은 음을 새로 부르려고 잠깐 끊은 자리) 거기서 끝으로 본다. 노래처럼 끄는 음은 길고, 피아노는 짧다.
 */
export function ringTime(samples: Float32Array, frame: number, midi: number, maxSec: number): number {
  const fft = new FFT(N_FFT);
  const win = hann(N_FFT);
  const buf = new Float32Array(N_FFT);
  const power = new Float32Array(N_FFT / 2 + 1);
  const bin = Math.round((440 * 2 ** ((midi - 69) / 12)) / (SR / N_FFT));
  const level = (f: number) => {
    frameAt(samples, f, buf);
    fft.power(buf, power, win);
    // 비브라토로 한두 칸 흔들려도 같은 음으로 본다
    return Math.max(power[bin - 2] ?? 0, power[bin - 1] ?? 0, power[bin], power[bin + 1] ?? 0, power[bin + 2] ?? 0);
  };
  const first = frame + 2;
  const start = level(first);
  if (start <= 0) return 0;
  const recent: number[] = [start];
  const last = first + secToFrame(maxSec);
  let f = first + 1;
  for (; f <= last; f++) {
    const v = level(f);
    if (v < start * 0.2 || v < Math.max(...recent) / 3) break;
    recent.push(v);
    if (recent.length > 4) recent.shift();
  }
  return frameToSec(f - 1 - frame);
}
