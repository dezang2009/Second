import type { Chart } from "./types";

/** 노트도 박 정보도 없는 빈 채보. 아직 자동 채보가 없는 곡을 에디터에서 처음부터 만들 때 쓴다 */
export function emptyChart(title: string, durationMs: number): Chart {
  return {
    title,
    artist: "",
    durationMs,
    bpm: 0,
    beatsPerBar: 4,
    offsetMs: 0,
    difficulty: { name: "USER", level: 0 },
    notes: [],
  };
}
