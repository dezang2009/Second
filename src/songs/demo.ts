import type { Chart, ChartNote } from "./types";

// 메트로놈과 함께 쓰는 연습용 채보. 실제 곡 채보가 생기기 전까지
// 노트 낙하와 (다음 단계의) 판정을 시험하는 데 쓴다.

/** 4마디(3/4박자 기준 12박) 반복 패턴: [박, 레인, 롱노트 길이(박)] */
const WALTZ: [number, number, number?][] = [
  [0, 1], [1, 2], [2, 1],
  [3, 0, 2], [5, 2],
  [6, 2], [6, 0], [7, 3], [8, 2],
  [9, 1, 2], [11, 3],
];
const PATTERN_BEATS = 12;
const COUNT_IN_BARS = 2;

export function buildDemoChart(bpm: number, beatsPerBar: number, bars: number): Chart {
  const beatMs = 60000 / bpm;
  const notes: ChartNote[] = [];
  const startBeat = COUNT_IN_BARS * beatsPerBar;
  const totalBeats = bars * beatsPerBar;
  for (let base = startBeat; base < totalBeats; base += PATTERN_BEATS) {
    for (const [beat, lane, len] of WALTZ) {
      const b = base + beat;
      if (b + (len ?? 0) >= totalBeats) continue;
      notes.push(len ? { t: b * beatMs, lane, len: len * beatMs } : { t: b * beatMs, lane });
    }
  }
  return {
    title: "Metronome Practice",
    artist: "-",
    durationMs: totalBeats * beatMs,
    bpm,
    beatsPerBar,
    offsetMs: 0,
    difficulty: { name: "PRACTICE", level: 1 },
    notes,
  };
}
