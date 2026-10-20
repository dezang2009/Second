import pianoChart from "./charts/always-with-me-piano.json";
import type { Chart } from "./types";

// 앱에 들어 있는 기본 채보 목록. 음원은 들어 있지 않고,
// 사용자가 추가한 음원의 길이가 맞으면 자동으로 연결한다.

export interface BuiltinChart {
  id: string;
  chart: Chart;
}

export const BUILTIN_CHARTS: BuiltinChart[] = [{ id: "always-with-me-piano", chart: pianoChart }];

/** 음원 길이가 이만큼 안으로 같으면 같은 음원으로 본다(초) */
const DURATION_TOLERANCE_SEC = 1.5;

export function findBuiltinFor(audioDurationSec: number): BuiltinChart | undefined {
  return BUILTIN_CHARTS.find((b) => Math.abs(audioDurationSec - b.chart.durationMs / 1000) <= DURATION_TOLERANCE_SEC);
}

export function builtinById(id: string | null): BuiltinChart | undefined {
  return BUILTIN_CHARTS.find((b) => b.id === id);
}

/** 채보가 없는 음원에 쓰는 빈 채보 (박 정보 없음) */
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
