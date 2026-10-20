import type { ChartNote } from "../songs/types";

// 에디터에서 고치는 중인 채보. 화면이나 오디오와 상관없는 순수한 편집 규칙만 담는다.
// 노트는 항상 시각순으로 정렬해 둔다.

const HISTORY_LIMIT = 50;

export class ChartDraft {
  private _notes: ChartNote[];
  private history: ChartNote[][] = [];
  /** 노트가 바뀔 때마다 1씩 오른다. 화면이 다시 그릴지 판단할 때 쓴다 */
  version = 0;

  constructor(notes: readonly ChartNote[]) {
    this._notes = notes.map((n) => ({ ...n })).sort(byTime);
  }

  get notes(): readonly ChartNote[] {
    return this._notes;
  }

  get canUndo(): boolean {
    return this.history.length > 0;
  }

  /** 지금 상태를 되돌리기 목록에 남긴다. 편집 한 번(녹음 한 번, 탭 한 번) 전에 부른다 */
  checkpoint(): void {
    this.history.push(this._notes.map((n) => ({ ...n })));
    if (this.history.length > HISTORY_LIMIT) this.history.shift();
  }

  undo(): boolean {
    const prev = this.history.pop();
    if (!prev) return false;
    this._notes = prev;
    this.version++;
    return true;
  }

  add(note: ChartNote): ChartNote {
    const n = { ...note, t: Math.round(note.t) };
    let i = this._notes.findIndex((x) => x.t > n.t);
    if (i < 0) i = this._notes.length;
    this._notes.splice(i, 0, n);
    this.version++;
    return n;
  }

  remove(note: ChartNote): void {
    const i = this._notes.indexOf(note);
    if (i < 0) return;
    this._notes.splice(i, 1);
    this.version++;
  }

  /** 롱 노트 길이를 바꾼다. 0 이하면 탭 노트로 */
  setLength(note: ChartNote, lenMs: number): void {
    if (lenMs > 0) note.len = Math.round(lenMs);
    else delete note.len;
    this.version++;
  }

  clear(): void {
    this._notes = [];
    this.version++;
  }

  /**
   * 덮어쓰기 녹음: [fromMs, toMs] 구간에서 시작하는 기존 노트를 지운다.
   * 이번 녹음에서 새로 친 노트(keep)는 남긴다.
   */
  punchOut(fromMs: number, toMs: number, keep: ReadonlySet<ChartNote>): void {
    const before = this._notes.length;
    this._notes = this._notes.filter((n) => n.t < fromMs || n.t > toMs || keep.has(n));
    if (this._notes.length !== before) this.version++;
  }

  /** 레인의 그 시각에 있는 노트. 머리에서 toleranceMs 안이거나 롱 노트 몸통 위면 찾는다 */
  findAt(lane: number, ms: number, toleranceMs: number): ChartNote | undefined {
    let best: ChartNote | undefined;
    let bestDist = Infinity;
    for (const n of this._notes) {
      if (n.lane !== lane) continue;
      const end = n.t + (n.len ?? 0);
      const dist = ms < n.t ? n.t - ms : ms > end ? ms - end : 0;
      if (dist <= toleranceMs && dist < bestDist) {
        best = n;
        bestDist = dist;
      }
    }
    return best;
  }
}

function byTime(a: ChartNote, b: ChartNote): number {
  return a.t - b.t || a.lane - b.lane;
}
