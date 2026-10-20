import { SR } from "./features";

// 테스트용 합성 음원. 박 시각을 정확히 알고 있는 신호로 분석 품질을 잰다.

export interface SynthNote {
  /** 시작 시각(초) */
  t: number;
  /** 주파수(Hz) */
  hz: number;
  /** 길이(초) */
  dur: number;
  gain?: number;
  /** 소리가 줄어드는 빠르기(초). 클수록 오래 울린다 (페달 밟은 피아노) */
  decay?: number;
}

/** 피아노처럼 처음에 세게 치고 점점 줄어드는 음들을 섞는다 */
export function renderNotes(notes: SynthNote[], seconds: number, noise = 0): Float32Array {
  const out = new Float32Array(Math.ceil(seconds * SR));
  for (const n of notes) {
    const start = Math.round(n.t * SR);
    const len = Math.round(n.dur * SR);
    const g = n.gain ?? 0.3;
    for (let i = 0; i < len && start + i < out.length; i++) {
      const release = Math.min(1, (len - i) / (0.03 * SR)); // 끝을 부드럽게 (뚝 끊으면 딸깍 소리가 난다)
      const env = Math.min(1, i / (0.003 * SR)) * Math.exp(-i / ((n.decay ?? 0.35) * SR)) * release;
      const ph = (2 * Math.PI * n.hz * i) / SR;
      out[start + i] += g * env * (Math.sin(ph) + 0.4 * Math.sin(2 * ph) + 0.2 * Math.sin(3 * ph));
    }
  }
  if (noise) {
    let seed = 1;
    for (let i = 0; i < out.length; i++) {
      seed = (seed * 16807) % 2147483647;
      out[i] += noise * ((seed / 2147483647) * 2 - 1);
    }
  }
  return out;
}

/** 박 시각 목록. bpm에서 시작해 끝으로 갈수록 drift만큼 빨라지거나 느려진다 */
export function beatTimes(startSec: number, count: number, bpm: number, drift = 0): number[] {
  const out: number[] = [];
  let t = startSec;
  for (let i = 0; i < count; i++) {
    out.push(t);
    const tempo = bpm * (1 + (drift * i) / Math.max(1, count - 1));
    t += 60 / tempo;
  }
  return out;
}

/** 박 F-측정값: 정답 박과 ±tol 안에서 짝지어지는 비율 (조화 평균) */
export function beatF(found: number[], truth: number[], tol = 0.07): number {
  const used = new Set<number>();
  let hit = 0;
  for (const t of truth) {
    let best = -1;
    let bestD = tol;
    found.forEach((f, i) => {
      const d = Math.abs(f - t);
      if (!used.has(i) && d <= bestD) {
        best = i;
        bestD = d;
      }
    });
    if (best >= 0) {
      used.add(best);
      hit++;
    }
  }
  const p = found.length ? hit / found.length : 0;
  const r = truth.length ? hit / truth.length : 0;
  return p + r ? (2 * p * r) / (p + r) : 0;
}
