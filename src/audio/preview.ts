import type { Chart } from "../songs/types";

// 곡 선택 화면의 미리 듣기: 곡에서 가장 신나는 구간(노트가 가장 빽빽한 구간)을 부드럽게 켜고 끄며 되풀이한다.

/** 미리 듣기 길이(초) */
export const PREVIEW_SEC = 15;
const FADE_IN = 0.6;
const FADE_OUT = 1.2;
/** 한 번 끝나고 다시 시작하기 전 쉬는 시간(초) */
const GAP_SEC = 0.6;

/**
 * 미리 듣기 시작 위치(초): 채보에서 PREVIEW_SEC초 안 노트 수가 가장 많은 구간.
 * 보통 후렴이 가장 빽빽하다. 채보가 없으면 곡의 1/3 지점.
 */
export function highlightStart(chart: Chart | null, durationSec: number): number {
  const fallback = Math.max(0, Math.min(durationSec - PREVIEW_SEC, durationSec / 3));
  const times = (chart?.notes ?? []).map((n) => n.t / 1000).sort((a, b) => a - b);
  if (times.length < 8 || durationSec <= PREVIEW_SEC) return durationSec <= PREVIEW_SEC ? 0 : fallback;
  let best = -1;
  let bestStart = fallback;
  let j = 0;
  for (let i = 0; i < times.length; i++) {
    while (j < times.length && times[j] < times[i] + PREVIEW_SEC) j++;
    // 같은 수면 앞쪽(먼저 나오는 후렴)
    if (j - i > best && times[i] + PREVIEW_SEC <= durationSec) {
      best = j - i;
      bestStart = times[i];
    }
  }
  // 노트 바로 위에서 뚝 시작하지 않게 살짝 앞에서
  return Math.max(0, bestStart - 0.5);
}

export class PreviewPlayer {
  private source: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private timer: number | null = null;
  /** 지금 미리 듣는 곡 (같은 곡을 다시 고르면 처음부터 다시 틀지 않는다) */
  playingId: string | null = null;

  constructor(
    private readonly ctx: AudioContext,
    private readonly volume: () => number,
  ) {}

  play(id: string, buffer: AudioBuffer, startSec: number): void {
    if (this.playingId === id) return;
    this.stop();
    this.playingId = id;
    const length = Math.min(PREVIEW_SEC, buffer.duration - startSec);
    const cycle = () => {
      if (this.playingId !== id) return;
      const t0 = this.ctx.currentTime + 0.05;
      const gain = this.ctx.createGain();
      const v = this.volume();
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(v, t0 + FADE_IN);
      gain.gain.setValueAtTime(v, t0 + length - FADE_OUT);
      gain.gain.linearRampToValueAtTime(0, t0 + length);
      gain.connect(this.ctx.destination);
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(gain);
      src.start(t0, startSec, length);
      this.fadeOutNow();
      this.source = src;
      this.gain = gain;
      this.timer = window.setTimeout(cycle, (length + GAP_SEC) * 1000);
    };
    cycle();
  }

  stop(): void {
    this.playingId = null;
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    this.fadeOutNow();
  }

  /** 지금 소리를 짧게 줄이며 멈춘다 (뚝 끊기면 딸깍 소리가 난다) */
  private fadeOutNow(): void {
    const src = this.source;
    const gain = this.gain;
    this.source = null;
    this.gain = null;
    if (!src || !gain) return;
    const t = this.ctx.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.linearRampToValueAtTime(0, t + 0.15);
    try {
      src.stop(t + 0.2);
    } catch {
      // 이미 끝난 소리
    }
  }
}
