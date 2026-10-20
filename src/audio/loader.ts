// 사용자가 폰에서 고른 음원 파일을 AudioBuffer로 읽는다.
// 음원은 앱이나 저장소에 넣지 않으므로 항상 이 경로로만 들어온다.

export interface LoadedTrack {
  name: string;
  buffer: AudioBuffer;
}

export class AudioLoadError extends Error {}

export async function loadAudioFile(ctx: AudioContext, file: File): Promise<LoadedTrack> {
  let data: ArrayBuffer;
  try {
    data = await file.arrayBuffer();
  } catch {
    throw new AudioLoadError("파일을 읽지 못했어요. 다시 골라주세요.");
  }
  try {
    const buffer = await ctx.decodeAudioData(data);
    return { name: stripExtension(file.name), buffer };
  } catch {
    throw new AudioLoadError("이 형식은 재생할 수 없어요. mp3, m4a, ogg, wav 파일을 골라주세요.");
  }
}

function stripExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}
