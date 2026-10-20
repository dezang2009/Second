import { onSettingsChange, settings } from "../settings";
import { AudioClock } from "./clock";

// 앱 전체가 함께 쓰는 AudioContext와 게임 시계, 타격음.
// 모바일은 사용자 터치 안에서 resume해야 소리가 나므로, 버튼 클릭 직후 unlockAudio()를 부른다.

let ctx: AudioContext | null = null;
let clock: AudioClock | null = null;
let hitBuffer: AudioBuffer | null = null;
let hitGain: GainNode | null = null;

export function audio(): { ctx: AudioContext; clock: AudioClock } {
  if (!ctx || !clock) {
    ctx = new AudioContext({ latencyHint: "interactive" });
    clock = new AudioClock(ctx);
    clock.output.gain.value = settings.musicVolume;
    hitGain = ctx.createGain();
    hitGain.gain.value = settings.hitVolume;
    hitGain.connect(ctx.destination);
    hitBuffer = makeHitBuffer(ctx);
  }
  return { ctx, clock };
}

onSettingsChange((s) => {
  if (clock) clock.output.gain.value = s.musicVolume;
  if (hitGain) hitGain.gain.value = s.hitVolume;
});

export function unlockAudio(): void {
  const { ctx } = audio();
  if (ctx.state !== "running") void ctx.resume();
}

/** 레인을 누를 때 나는 짧은 타격음 (설정에서 켰을 때만) */
export function playHitSound(): void {
  if (!settings.hitSound) return;
  const { ctx } = audio();
  if (!hitBuffer || !hitGain) return;
  const src = ctx.createBufferSource();
  src.buffer = hitBuffer;
  src.connect(hitGain);
  src.start();
}

/** 부드러운 '톡' 소리: 짧은 고음 사인파 + 아주 약한 잡음, 40ms */
function makeHitBuffer(c: BaseAudioContext): AudioBuffer {
  const len = Math.round(0.04 * c.sampleRate);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  let seed = 7;
  for (let i = 0; i < len; i++) {
    seed = (seed * 16807) % 2147483647;
    const env = Math.exp(-i / (0.006 * c.sampleRate));
    d[i] = env * (0.6 * Math.sin((2 * Math.PI * 1500 * i) / c.sampleRate) + 0.15 * ((seed / 2147483647) * 2 - 1));
  }
  return buf;
}
