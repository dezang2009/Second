// 싱크 자동 맞추기: 메트로놈 딸깍 소리에 맞춰 친 시각과 실제 박 시각의 차이로 기기 지연을 잰다.

export interface CalibrationResult {
  /** 판정 싱크로 쓸 값(ms). +면 소리가 늦게 들리는 기기 */
  offsetMs: number;
  /** 계산에 쓴 탭 수 */
  taps: number;
  /** 탭이 얼마나 고르게 맞았는지 (중앙값에서 벗어난 정도의 중앙값, ms) */
  spreadMs: number;
}

/** 박에서 이보다 멀리 친 탭은 박을 놓친 것으로 보고 뺀다(초) */
const MAX_DIST_SEC = 0.25;
/** 처음 몇 번은 박에 익숙해지는 중이라 뺀다 */
const WARMUP_TAPS = 3;
export const MIN_TAPS = 6;

/** 탭과 가장 가까운 박의 차이들의 중앙값. 탭이 부족하면 null */
export function estimateOffset(beats: number[], taps: number[]): CalibrationResult | null {
  const deltas = taps
    .slice(WARMUP_TAPS)
    .map((t) => {
      let best = Infinity;
      for (const b of beats) if (Math.abs(t - b) < Math.abs(best)) best = t - b;
      return best;
    })
    .filter((d) => Math.abs(d) <= MAX_DIST_SEC);
  if (deltas.length < MIN_TAPS) return null;
  const med = median(deltas);
  const spread = median(deltas.map((d) => Math.abs(d - med)));
  return { offsetMs: Math.round(med * 1000), taps: deltas.length, spreadMs: Math.round(spread * 1000) };
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
