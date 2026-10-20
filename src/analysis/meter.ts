// 박자표(3/4, 4/4)와 마디 첫 박을 찾는다.
// 마디 첫 박에는 보통 화음이 바뀌고(12음 세기 변화) 베이스를 친다(저음 onset).
// 박마다 두 신호를 더한 '첫 박다움'을 구하고, 그것이 몇 박마다, 어느 위치에서 크게 나오는지 본다.

export interface MeterResult {
  beatsPerBar: number;
  /** 마디 첫 박인 박의 인덱스 */
  barStarts: number[];
}

/** 박 구간마다 12음 평균 → 바로 앞 박과의 변화량 */
function harmonicChange(chroma: Float32Array, frames: number, beatFrames: number[]): number[] {
  const vecs = beatFrames.map((f, i) => {
    const end = i + 1 < beatFrames.length ? beatFrames[i + 1] : Math.min(frames, f + (f - (beatFrames[i - 1] ?? f - 20)));
    const v = new Float64Array(12);
    for (let t = f; t < Math.max(f + 1, end); t++) for (let p = 0; p < 12; p++) v[p] += chroma[t * 12 + p] ?? 0;
    const norm = Math.hypot(...v) || 1;
    return v.map((x) => x / norm);
  });
  return vecs.map((v, i) => (i === 0 ? 0 : 1 - v.reduce((s, x, p) => s + x * vecs[i - 1][p], 0)));
}

function zscore(xs: number[]): number[] {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length) || 1;
  return xs.map((x) => (x - mean) / sd);
}

function phaseMeans(score: number[], from: number, to: number, period: number): number[] {
  const sums = new Array(period).fill(0);
  const counts = new Array(period).fill(0);
  for (let i = from; i < to; i++) {
    sums[i % period] += score[i];
    counts[i % period]++;
  }
  return sums.map((s, p) => (counts[p] ? s / counts[p] : 0));
}

/** 가장 센 위치가 나머지 위치보다 얼마나 두드러지는지 */
function separation(means: number[]): number {
  const best = Math.max(...means);
  const rest = means.filter((_, i) => i !== means.indexOf(best));
  return best - rest.reduce((a, b) => a + b, 0) / rest.length;
}

export function detectMeter(chroma: Float32Array, frames: number, beatFrames: number[], bassOnset: Float32Array): MeterResult {
  if (beatFrames.length < 8) return { beatsPerBar: 4, barStarts: beatFrames.length ? [0] : [] };
  const change = zscore(harmonicChange(chroma, frames, beatFrames));
  const bass = zscore(
    beatFrames.map((f) => {
      let m = 0;
      for (let t = Math.max(0, f - 2); t <= Math.min(frames - 1, f + 2); t++) m = Math.max(m, bassOnset[t]);
      return m;
    }),
  );
  const score = change.map((c, i) => c + bass[i]);

  // 3박과 4박 중 첫 박다움이 더 또렷하게 주기적으로 나오는 쪽 (구간별로 보고 평균)
  const seg = 48;
  const periodScore = (period: number) => {
    let s = 0;
    let n = 0;
    for (let a = 0; ; a += seg / 2) {
      s += separation(phaseMeans(score, a, Math.min(score.length, a + seg), period));
      n++;
      if (a + seg >= score.length) break;
    }
    return s / n;
  };
  const beatsPerBar = periodScore(3) > periodScore(4) ? 3 : 4;

  // 마디 첫 박 위치는 앞뒤 8마디를 보고 정한다 (연주 중 한 박이 늘어나도 다시 맞춘다)
  const window = 8 * beatsPerBar;
  const barStarts: number[] = [];
  let i = 0;
  while (i < score.length) {
    const lo = Math.max(0, i - window);
    const hi = Math.min(score.length, i + window);
    const means = phaseMeans(score, lo, hi, beatsPerBar);
    const phase = means.indexOf(Math.max(...means));
    let next = i + ((((phase - i) % beatsPerBar) + beatsPerBar) % beatsPerBar);
    if (barStarts.length && next - barStarts[barStarts.length - 1] < 2) next += beatsPerBar;
    if (next < score.length) barStarts.push(next);
    i = next + beatsPerBar;
  }
  return { beatsPerBar, barStarts };
}
