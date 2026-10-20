import { Meter } from "../songs/meter";
import type { Chart, ChartNote } from "../songs/types";
import { ChartDraft } from "./draft";
import type { NoteRuntime } from "./judge";
import type { Scene, Stage } from "./stage";

// 에디터 장면.
// - 녹음: 곡을 들으며 레인을 치면 노트가 된다. 길게 누르면 롱 노트. 녹음을 시작한 지점부터 지나간 구간은 덮어쓴다.
// - 미리듣기: 노트만 보여주고 아무것도 바꾸지 않는다.
// - 멈춤: 빈 곳을 누르면 노트를 추가하고, 노트를 누르면 지운다.

export type EditMode = "idle" | "preview" | "record";

/** 이만큼 이상 누르고 있으면 롱 노트(초) */
const LONG_MIN_SEC = 0.3;
/** 멈춘 상태에서 노트를 고를 때 허용하는 손가락 오차(px) */
const PICK_TOLERANCE_PX = 18;
/** 녹음 중 같은 레인을 이 간격 안에 두 번 치면 하나로 본다(ms) */
const DOUBLE_TAP_MS = 60;

interface Hold {
  note: ChartNote;
  startSec: number;
  lane: number;
}

export class EditScene implements Scene {
  readonly draft: ChartDraft;
  readonly meter: Meter;
  mode: EditMode = "idle";
  /** 박 맞추기: 0 끄기, 1 한 박, 2 반박, 4 1/4박 */
  division: number;
  /** 노트를 바꿀 때마다 부른다 (저장 안 됨 표시, 노트 수 갱신) */
  onChange: (() => void) | null = null;

  private runtime: NoteRuntime[] = [];
  private runtimeVersion = -1;
  private recordFromMs = 0;
  private readonly recorded = new Set<ChartNote>();
  private readonly holds = new Map<number, Hold>();

  constructor(
    readonly base: Chart,
    private readonly stage: Stage,
  ) {
    this.draft = new ChartDraft(base.notes);
    this.meter = new Meter(base);
    this.division = this.meter.hasBeats ? 2 : 0;
  }

  /** 미리듣기나 녹음을 시작한다. 곡 재생은 부르는 쪽에서 한다 */
  begin(mode: "preview" | "record", fromSec: number): void {
    this.mode = mode;
    if (mode === "record") {
      this.draft.checkpoint();
      this.recordFromMs = Math.max(0, fromSec) * 1000;
      this.recorded.clear();
    }
  }

  /** 멈췄을 때. 누르고 있던 롱 노트는 거기서 끝낸다 */
  end(t: number): void {
    for (const id of [...this.holds.keys()]) this.release(id, t);
    this.mode = "idle";
  }

  toChart(): Chart {
    return {
      ...this.base,
      notes: this.draft.notes.map((n) => ({ ...n })),
      difficulty: { name: "USER", level: this.base.difficulty.level },
    };
  }

  notes(): readonly NoteRuntime[] {
    if (this.draft.version !== this.runtimeVersion) {
      this.runtime = this.draft.notes.map((note) => ({
        note,
        start: note.t / 1000,
        end: note.len ? (note.t + note.len) / 1000 : null,
        status: "pending",
        settledAt: 0,
        pointer: null,
      }));
      this.runtimeVersion = this.draft.version;
    }
    return this.runtime;
  }

  notesVersion(): number {
    return this.draft.version;
  }

  update(t: number): void {
    if (this.mode !== "record") return;
    this.draft.punchOut(this.recordFromMs, t * 1000, this.recorded);
    // 누르고 있는 동안 롱 노트가 자라는 것을 보여준다
    for (const h of this.holds.values()) {
      if (t - h.startSec >= LONG_MIN_SEC) this.draft.setLength(h.note, t * 1000 - h.note.t);
    }
  }

  press(id: number, lane: number, t: number, _x: number, y: number): void {
    if (this.mode === "record") this.recordPress(id, lane, t);
    else if (this.mode === "idle") this.editAt(lane, t, y);
  }

  release(id: number, t: number): void {
    const h = this.holds.get(id);
    if (!h) return;
    this.holds.delete(id);
    const lenMs = t - h.startSec >= LONG_MIN_SEC ? this.snapMs(t) - h.note.t : 0;
    this.draft.setLength(h.note, lenMs);
    this.onChange?.();
  }

  heldLanes(): ReadonlySet<number> {
    return new Set([...this.holds.values()].map((h) => h.lane));
  }

  combo(): number {
    return 0;
  }

  private recordPress(id: number, lane: number, t: number): void {
    if (t < 0) return;
    const ms = this.snapMs(t);
    for (const n of this.recorded) if (n.lane === lane && Math.abs(n.t - ms) < DOUBLE_TAP_MS) return;
    const note = this.draft.add({ t: ms, lane });
    this.recorded.add(note);
    this.holds.set(id, { note, startSec: t, lane });
    this.stage.hit(lane, "perfect");
    this.onChange?.();
  }

  /** 멈춘 화면에서 누른 위치의 시각을 계산해 노트를 넣거나 뺀다 */
  private editAt(lane: number, t: number, y: number): void {
    const L = this.stage.layout;
    const secPerPx = this.stage.scrollSec / L.judgeY;
    const sec = t + (L.judgeY - y) * secPerPx;
    const existing = this.draft.findAt(lane, sec * 1000, PICK_TOLERANCE_PX * secPerPx * 1000);
    if (!existing && sec < 0) return;
    this.draft.checkpoint();
    if (existing) this.draft.remove(existing);
    else this.draft.add({ t: this.snapMs(sec), lane });
    this.onChange?.();
  }

  private snapMs(sec: number): number {
    return Math.round(this.meter.snap(sec, this.division) * 1000);
  }
}
