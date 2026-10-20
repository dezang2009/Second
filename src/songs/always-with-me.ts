import type { Chart } from "./types";

// 첫 곡. BPM은 Hooktheory 표기(약 131, 3/4박자) 기준의 임시값이고,
// offsetMs와 노트는 사용자의 음원 파일로 탭 녹음 모드에서 맞춘다.
export const alwaysWithMe: Chart = {
  title: "Always with Me",
  artist: "木村弓",
  durationMs: 0,
  bpm: 131,
  beatsPerBar: 3,
  offsetMs: 0,
  difficulty: { name: "NORMAL", level: 3 },
  notes: [],
};
