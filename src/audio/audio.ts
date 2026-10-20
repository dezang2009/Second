import { AudioClock } from "./clock";

// 앱 전체가 함께 쓰는 AudioContext와 게임 시계.
// 모바일은 사용자 터치 안에서 resume해야 소리가 나므로, 버튼 클릭 직후 unlockAudio()를 부른다.

let ctx: AudioContext | null = null;
let clock: AudioClock | null = null;

export function audio(): { ctx: AudioContext; clock: AudioClock } {
  if (!ctx || !clock) {
    ctx = new AudioContext({ latencyHint: "interactive" });
    clock = new AudioClock(ctx);
  }
  return { ctx, clock };
}

export function unlockAudio(): void {
  const { ctx } = audio();
  if (ctx.state !== "running") void ctx.resume();
}
