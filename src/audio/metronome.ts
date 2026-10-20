// 음원 없이 시계와 박자 표시를 확인하기 위한 메트로놈 소리를 직접 만든다.
// 마디 첫 박은 높은 음, 나머지 박은 낮은 음.

export function createMetronomeBuffer(
  ctx: BaseAudioContext,
  bpm: number,
  beatsPerBar: number,
  bars: number,
): AudioBuffer {
  const rate = ctx.sampleRate;
  const beatSec = 60 / bpm;
  const totalBeats = bars * beatsPerBar;
  const buffer = ctx.createBuffer(1, Math.ceil((totalBeats * beatSec + 0.5) * rate), rate);
  const out = buffer.getChannelData(0);
  const clickLen = Math.floor(0.05 * rate);

  for (let b = 0; b < totalBeats; b++) {
    const accent = b % beatsPerBar === 0;
    const freq = accent ? 1760 : 1175;
    const gain = accent ? 0.6 : 0.35;
    const start = Math.round(b * beatSec * rate);
    for (let i = 0; i < clickLen && start + i < out.length; i++) {
      const env = Math.exp(-i / (0.008 * rate));
      out[start + i] += gain * env * Math.sin((2 * Math.PI * freq * i) / rate);
    }
  }
  return buffer;
}
