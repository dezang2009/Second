// 사용자가 폰에서 고른 음원(또는 앱에 보관해 둔 음원)을 AudioBuffer로 읽는다.
// 음원은 저장소나 APK에 넣지 않으므로 항상 이 경로로만 들어온다.

export class AudioLoadError extends Error {}

export async function decodeAudio(ctx: AudioContext, blob: Blob): Promise<AudioBuffer> {
  let data: ArrayBuffer;
  try {
    data = await blob.arrayBuffer();
  } catch {
    throw new AudioLoadError("파일을 읽지 못했어요. 다시 골라주세요.");
  }
  try {
    return await ctx.decodeAudioData(data);
  } catch {
    throw new AudioLoadError("이 형식은 재생할 수 없어요. mp3, m4a, ogg, wav 파일을 골라주세요.");
  }
}

export function stripExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}
