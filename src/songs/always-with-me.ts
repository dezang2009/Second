import pianoChart from "./charts/always-with-me-piano.json";
import type { Chart } from "./types";

// 첫 곡. 사용자가 준 피아노 연주 음원(4:54)을 tools/autochart로 분석해 만든 자동 채보 초안.
// 음원 파일 자체는 저장소에 넣지 않으며, 사용자가 같은 파일을 고르면 길이로 알아보고 연결한다.
export const alwaysWithMe: Chart = pianoChart;

/** 고른 음원이 이 채보를 만든 음원과 같은지 길이로 판단할 때 허용하는 차이(초) */
const DURATION_TOLERANCE_SEC = 1.5;

export function matchesChart(chart: Chart, audioDurationSec: number): boolean {
  return Math.abs(audioDurationSec - chart.durationMs / 1000) <= DURATION_TOLERANCE_SEC;
}
