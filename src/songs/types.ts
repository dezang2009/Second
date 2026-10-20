// 채보 파일 형식. DESIGN.md의 "채보 데이터 형식"과 같게 유지한다.

export interface ChartNote {
  /** 곡 시작 기준 ms */
  t: number;
  /** 0~3 */
  lane: number;
  /** 롱 노트 길이(ms). 없으면 탭 노트 */
  len?: number;
}

export interface Chart {
  title: string;
  artist: string;
  /** 이 채보를 만든 음원의 길이(ms). 사용자가 고른 파일과 짝을 맞출 때 쓴다 */
  durationMs: number;
  /** 대표 템포. 실제 박은 beats를 따른다 */
  bpm: number;
  beatsPerBar: number;
  /** 음원에서 첫 마디가 시작하는 시각(ms) */
  offsetMs: number;
  difficulty: { name: string; level: number };
  /** 실제 연주의 박 시각(ms). 템포가 흔들리는 곡에서 박자선과 맥박을 맞추는 데 쓴다 */
  beats?: number[];
  /** 마디 첫 박 시각(ms). beats에 들어 있는 값만 쓴다 */
  bars?: number[];
  notes: ChartNote[];
}
