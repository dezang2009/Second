import { FRAME_RATE } from "./features";

// 템포 추정과 박 추적 (Ellis 2007 동적 계획법, librosa beat_track과 같은 방식).
// 박 간격을 하나로 고정하지 않고, 정해 둔 템포에서 조금씩 벗어나는 것을 허용하며
// onset이 강한 자리를 이어 가므로 연주자가 템포를 밀고 당겨도 따라간다.

/** 템포 추정에 쓰는 창 길이(프레임, 약 8.9초)와 간격 */
const TEMPO_WIN = 384;
const TEMPO_HOP = 64;
/** 템포 사전 분포: 120 BPM 근처를 선호, 표준편차 1옥타브 */
const PRIOR_BPM = 120;
const MIN_BPM = 40;
const MAX_BPM = 240;
/** 템포에서 벗어나는 것을 얼마나 싫어하는지 (클수록 일정한 박) */
const TIGHTNESS = 100;

/** 구간마다 onset의 자기상관을 구해 평균한 뒤, 사전 분포를 곱해 가장 그럴듯한 템포를 고른다 */
export function estimateTempo(onset: Float32Array): number {
  const maxLag = TEMPO_WIN;
  const acf = new Float64Array(maxLag + 1);
  const win = new Float64Array(TEMPO_WIN);
  for (let i = 0; i < TEMPO_WIN; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / TEMPO_WIN);
  const seg = new Float64Array(TEMPO_WIN);
  let count = 0;
  for (let start = 0; start + TEMPO_WIN <= Math.max(onset.length, TEMPO_WIN); start += TEMPO_HOP) {
    for (let i = 0; i < TEMPO_WIN; i++) seg[i] = (onset[start + i] ?? 0) * win[i];
    let zero = 0;
    for (let i = 0; i < TEMPO_WIN; i++) zero += seg[i] * seg[i];
    if (zero <= 0) continue;
    for (let lag = 0; lag <= maxLag; lag++) {
      let s = 0;
      for (let i = 0; i + lag < TEMPO_WIN; i++) s += seg[i] * seg[i + lag];
      acf[lag] += s / zero;
    }
    count++;
  }
  if (!count) return PRIOR_BPM;

  let best = -Infinity;
  let bestLag = Math.round((60 * FRAME_RATE) / PRIOR_BPM);
  const lo = Math.ceil((60 * FRAME_RATE) / MAX_BPM);
  const hi = Math.floor((60 * FRAME_RATE) / MIN_BPM);
  for (let lag = lo; lag <= Math.min(hi, maxLag); lag++) {
    const bpm = (60 * FRAME_RATE) / lag;
    const logPrior = -0.5 * Math.log2(bpm / PRIOR_BPM) ** 2;
    const score = Math.log1p((1e6 * acf[lag]) / count) + logPrior;
    if (score > best) {
      best = score;
      bestLag = lag;
    }
  }
  // 봉우리 꼭대기를 포물선으로 다듬어 프레임 단위보다 정밀하게
  const a = acf[bestLag - 1] ?? acf[bestLag];
  const b = acf[bestLag];
  const c = acf[bestLag + 1] ?? acf[bestLag];
  const denom = a - 2 * b + c;
  const shift = denom < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / denom)) : 0;
  return (60 * FRAME_RATE) / (bestLag + shift);
}

/** onset 세기에서 박 위치(프레임)를 찾는다. */
export function trackBeats(onset: Float32Array, bpm: number): number[] {
  const n = onset.length;
  if (n < 4) return [];
  const period = Math.round((60 * FRAME_RATE) / bpm);

  // onset을 표준편차로 나누고, 박 간격에 맞춘 가우시안으로 부드럽게 만든다
  let mean = 0;
  for (let i = 0; i < n; i++) mean += onset[i];
  mean /= n;
  let varSum = 0;
  for (let i = 0; i < n; i++) varSum += (onset[i] - mean) ** 2;
  const std = Math.sqrt(varSum / (n - 1)) || 1;
  const kernel: number[] = [];
  for (let k = -period; k <= period; k++) kernel.push(Math.exp(-0.5 * ((k * 32) / period) ** 2));
  const local = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = -period; k <= period; k++) {
      const j = i + k;
      if (j >= 0 && j < n) s += (onset[j] / std) * kernel[k + period];
    }
    local[i] = s;
  }

  // 동적 계획법: 직전 박은 반 박~두 박 전 사이에서, 템포에서 벗어난 만큼 벌점을 받는다
  const offsets: number[] = [];
  for (let o = -2 * period; o <= -Math.round(period / 2); o++) offsets.push(o);
  const penalty = offsets.map((o) => -TIGHTNESS * Math.log(-o / period) ** 2);
  const cum = new Float64Array(n);
  const back = new Int32Array(n).fill(-1);
  let maxLocal = 0;
  for (let i = 0; i < n; i++) maxLocal = Math.max(maxLocal, local[i]);
  const thresh = 0.01 * maxLocal;
  let firstBeat = true;
  for (let i = 0; i < n; i++) {
    let bestScore = -Infinity;
    let bestPrev = -1;
    for (let k = 0; k < offsets.length; k++) {
      const j = i + offsets[k];
      const s = penalty[k] + (j >= 0 ? cum[j] : 0);
      if (s > bestScore) {
        bestScore = s;
        bestPrev = j;
      }
    }
    cum[i] = local[i] + bestScore;
    if (firstBeat && local[i] < thresh) back[i] = -1;
    else {
      back[i] = bestPrev >= 0 ? bestPrev : -1;
      firstBeat = false;
    }
  }

  // 마지막 박: 누적 점수 봉우리 중 중앙값의 절반을 넘는 마지막 것
  const peaks: number[] = [];
  for (let i = 1; i < n - 1; i++) if (cum[i] > cum[i - 1] && cum[i] >= cum[i + 1]) peaks.push(i);
  if (!peaks.length) return [];
  const sorted = peaks.map((i) => cum[i]).sort((x, y) => x - y);
  const median = sorted[sorted.length >> 1];
  let tail = peaks[peaks.length - 1];
  for (let p = peaks.length - 1; p >= 0; p--) {
    if (cum[peaks[p]] * 2 > median) {
      tail = peaks[p];
      break;
    }
  }
  const beats: number[] = [];
  for (let i = tail; i >= 0; i = back[i]) beats.push(i);
  beats.reverse();
  return trimBeats(local, beats);
}

/** 곡 앞뒤의 약한 박(조용한 구간에 억지로 이어 붙인 박)을 잘라낸다 */
function trimBeats(local: Float64Array, beats: number[]): number[] {
  if (beats.length < 3) return beats;
  const w = [0.25, 0.75, 1, 0.75, 0.25]; // 길이 5 hann
  const vals = beats.map((b) => local[b]);
  const smooth = vals.map((_, i) => {
    let s = 0;
    for (let k = -2; k <= 2; k++) s += (vals[i + k] ?? 0) * w[k + 2];
    return s;
  });
  const rms = Math.sqrt(smooth.reduce((a, v) => a + v * v, 0) / smooth.length);
  const th = 0.5 * rms;
  let first = smooth.findIndex((v) => v >= th);
  let last = smooth.length - 1 - [...smooth].reverse().findIndex((v) => v >= th);
  if (first < 0) return [];
  first = Math.max(0, first);
  last = Math.min(beats.length - 1, last);
  return beats.slice(first, last + 1);
}
