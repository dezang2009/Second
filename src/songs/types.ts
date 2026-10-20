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
  durationMs: number;
  bpm: number;
  beatsPerBar: number;
  /** 음원에서 첫 박이 나오는 시각(ms) */
  offsetMs: number;
  difficulty: { name: string; level: number };
  notes: ChartNote[];
}

export interface BeatPosition {
  /** 첫 박부터 센 박 번호(소수 포함). 첫 박 전이면 음수 */
  beat: number;
  /** 1부터 시작하는 마디 번호 */
  bar: number;
  /** 마디 안에서 1부터 시작하는 박 번호 */
  beatInBar: number;
  /** 현재 박 안에서 얼마나 지났는지 0~1 */
  phase: number;
}

export function beatAt(timeSec: number, bpm: number, beatsPerBar: number, offsetMs: number): BeatPosition {
  const beat = (timeSec - offsetMs / 1000) / (60 / bpm);
  const whole = Math.floor(beat);
  const inBar = ((whole % beatsPerBar) + beatsPerBar) % beatsPerBar;
  return {
    beat,
    bar: Math.floor(whole / beatsPerBar) + 1,
    beatInBar: inBar + 1,
    phase: beat - whole,
  };
}
