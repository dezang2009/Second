import type { Chart, ChartNote } from "../songs/types";

// 판정: 터치 시각과 노트 시각의 차이로 등급을 매기고 콤보와 점수를 센다.
// 시각은 모두 곡 안에서의 초 단위.

export type Grade = "perfect" | "great" | "good" | "miss";

/** 판정 범위(초). DESIGN.md "판정 범위"와 같게 유지한다 */
export const WINDOW = { perfect: 0.05, great: 0.1, good: 0.15 } as const;
const WEIGHT: Record<Grade, number> = { perfect: 1, great: 0.7, good: 0.3, miss: 0 };
export const MAX_SCORE = 1_000_000;

export type NoteStatus = "pending" | "holding" | "done" | "missed" | "skipped";

export interface NoteRuntime {
  note: ChartNote;
  start: number;
  /** 롱 노트 끝 시각. 탭 노트면 null */
  end: number | null;
  status: NoteStatus;
  /** 놓쳤거나 판정이 끝난 시각. 화면에서 서서히 지울 때 쓴다 */
  settledAt: number;
  pointer: number | null;
}

export interface JudgeEvent {
  lane: number;
  grade: Grade;
  /** 판정이 난 곡 시각 */
  time: number;
  /** 입력 시각 - 노트 시각(초). 놓침이면 0 */
  offset: number;
  part: "tap" | "head" | "tail";
}

export interface JudgeStats {
  perfect: number;
  great: number;
  good: number;
  miss: number;
  combo: number;
  maxCombo: number;
  score: number;
  /** 판정이 끝난 개수 / 전체 판정 개수 */
  judged: number;
  total: number;
}

export function rankOf(score: number): string {
  if (score >= 950_000) return "S";
  if (score >= 900_000) return "A";
  if (score >= 800_000) return "B";
  return "C";
}

export class Judge {
  readonly notes: NoteRuntime[];
  private readonly byLane: number[][];
  /** 레인마다 아직 끝나지 않은 첫 노트의 byLane 위치 */
  private readonly cursor: number[];
  private counts = { perfect: 0, great: 0, good: 0, miss: 0 };
  private weightSum = 0;
  private combo = 0;
  private maxCombo = 0;
  private judged = 0;
  private total = 0;
  onJudge: ((e: JudgeEvent) => void) | null = null;

  constructor(chart: Chart, lanes: number) {
    this.notes = [...chart.notes]
      .sort((a, b) => a.t - b.t)
      .map((note) => ({
        note,
        start: note.t / 1000,
        end: note.len ? (note.t + note.len) / 1000 : null,
        status: "pending" as NoteStatus,
        settledAt: 0,
        pointer: null,
      }));
    this.byLane = Array.from({ length: lanes }, () => []);
    this.notes.forEach((n, i) => this.byLane[n.note.lane]?.push(i));
    this.cursor = new Array(lanes).fill(0);
    this.reset(0);
  }

  /** 처음부터 다시 세거나, fromTime 이전 노트는 건너뛴 것으로 치고 다시 센다 (재생 위치 이동). */
  reset(fromTime: number): void {
    this.counts = { perfect: 0, great: 0, good: 0, miss: 0 };
    this.weightSum = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.judged = 0;
    this.total = 0;
    this.cursor.fill(0);
    for (const n of this.notes) {
      n.pointer = null;
      n.settledAt = 0;
      n.status = n.start < fromTime - WINDOW.good ? "skipped" : "pending";
      if (n.status === "pending") this.total += n.end === null ? 1 : 2;
    }
  }

  /** 레인을 눌렀다. 판정할 노트가 있으면 true */
  press(lane: number, t: number, pointer: number): boolean {
    const idx = this.firstPending(lane, t);
    if (idx < 0) return false;
    const n = this.notes[idx];
    const offset = t - n.start;
    if (offset < -WINDOW.good) return false; // 너무 일찍 누름: 빈 탭은 벌점 없이 무시
    const grade = gradeOf(offset);
    if (n.end === null) {
      n.status = "done";
      n.settledAt = t;
      this.record({ lane, grade, time: t, offset, part: "tap" });
    } else {
      n.status = "holding";
      n.pointer = pointer;
      this.record({ lane, grade, time: t, offset, part: "head" });
    }
    return true;
  }

  /** 손을 뗐다. 롱 노트를 잡고 있었다면 끝 판정을 한다 */
  release(pointer: number, t: number): void {
    for (const n of this.notes) {
      if (n.status !== "holding" || n.pointer !== pointer || n.end === null) continue;
      n.pointer = null;
      n.settledAt = t;
      if (t >= n.end - WINDOW.good) {
        n.status = "done";
        this.record({ lane: n.note.lane, grade: "perfect", time: t, offset: 0, part: "tail" });
      } else {
        n.status = "missed";
        this.record({ lane: n.note.lane, grade: "miss", time: t, offset: 0, part: "tail" });
      }
    }
  }

  /** 매 프레임 호출: 지나간 노트를 놓침 처리하고, 끝까지 잡은 롱 노트를 완료한다 */
  update(t: number): void {
    for (let lane = 0; lane < this.byLane.length; lane++) {
      const list = this.byLane[lane];
      for (let k = this.cursor[lane]; k < list.length; k++) {
        const n = this.notes[list[k]];
        if (n.start > t) break;
        if (n.status === "pending" && t - n.start > WINDOW.good) {
          n.status = "missed";
          n.settledAt = n.start + WINDOW.good;
          this.record({ lane, grade: "miss", time: t, offset: 0, part: n.end === null ? "tap" : "head" });
          if (n.end !== null) this.record({ lane, grade: "miss", time: t, offset: 0, part: "tail" });
        } else if (n.status === "holding" && n.end !== null && t >= n.end) {
          n.status = "done";
          n.settledAt = n.end;
          n.pointer = null;
          this.record({ lane, grade: "perfect", time: n.end, offset: 0, part: "tail" });
        }
      }
      // 끝난 노트는 다음부터 보지 않는다
      while (this.cursor[lane] < list.length && isSettled(this.notes[list[this.cursor[lane]]].status)) this.cursor[lane]++;
    }
  }

  stats(): JudgeStats {
    return {
      ...this.counts,
      combo: this.combo,
      maxCombo: this.maxCombo,
      score: this.total ? Math.round((MAX_SCORE * this.weightSum) / this.total) : 0,
      judged: this.judged,
      total: this.total,
    };
  }

  /** 이 레인에서 아직 판정하지 않은 가장 이른 노트 */
  private firstPending(lane: number, t: number): number {
    const list = this.byLane[lane];
    if (!list) return -1;
    for (let k = this.cursor[lane]; k < list.length; k++) {
      const n = this.notes[list[k]];
      if (n.status !== "pending") continue;
      if (t - n.start > WINDOW.good) continue; // 곧 놓침 처리될 노트
      return list[k];
    }
    return -1;
  }

  private record(e: JudgeEvent): void {
    this.counts[e.grade]++;
    this.weightSum += WEIGHT[e.grade];
    this.judged++;
    if (e.grade === "miss") this.combo = 0;
    else this.maxCombo = Math.max(this.maxCombo, ++this.combo);
    this.onJudge?.(e);
  }
}

function gradeOf(offset: number): Grade {
  const a = Math.abs(offset) - 1e-9; // 경계값(정확히 100ms 등)이 부동소수점 오차로 밀리지 않게

  if (a <= WINDOW.perfect) return "perfect";
  if (a <= WINDOW.great) return "great";
  if (a <= WINDOW.good) return "good";
  return "miss";
}

function isSettled(s: NoteStatus): boolean {
  return s === "done" || s === "missed" || s === "skipped";
}
