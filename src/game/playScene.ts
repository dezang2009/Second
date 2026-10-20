import { audio, playHitSound } from "../audio/audio";
import { LANES } from "../render/layout";
import { Meter } from "../songs/meter";
import type { Chart } from "../songs/types";
import { Judge, type JudgeStats } from "./judge";
import type { Scene, Stage } from "./stage";

// 플레이 장면: 레인 입력을 판정하고, 마지막 노트가 끝나면 결과를 알린다.

/** 마지막 노트 뒤 이만큼 지나면 곡이 남아 있어도 결과로 넘어간다(초) */
const FINISH_AFTER_SEC = 2;
/** 자동 플레이에서 탭 노트를 누르고 있는 것처럼 보여 줄 시간(초) */
const AUTO_TAP_SEC = 0.08;
/** 자동 플레이 손가락 번호 (실제 포인터와 겹치지 않게) */
const autoPointer = (lane: number) => -100 - lane;

export class PlayScene implements Scene {
  readonly judge: Judge;
  readonly meter: Meter;
  onFinish: ((stats: JudgeStats) => void) | null = null;
  private finished = false;
  private readonly held = new Map<number, number>();
  private readonly lastNoteEnd: number;
  /** 자동 플레이: 레인마다 손을 뗄 시각 */
  private readonly autoUntil = new Map<number, number>();

  /** auto: 노트를 스스로 정확히 쳐서 채보를 미리 보여 준다 (입력은 무시) */
  constructor(
    readonly chart: Chart,
    stage: Stage,
    readonly auto = false,
  ) {
    this.judge = new Judge(chart, LANES);
    this.judge.onJudge = (e) => stage.hit(e.lane, e.grade);
    this.meter = new Meter(chart);
    this.lastNoteEnd = this.judge.notes.reduce((m, n) => Math.max(m, n.end ?? n.start), -Infinity);
  }

  /** 첫 노트 전에 최소 2초는 여유가 있도록 곡 시작을 늦출 시간(초) */
  get leadIn(): number {
    const first = this.judge.notes[0]?.start ?? Infinity;
    return Math.max(0, 2 - first);
  }

  notes() {
    return this.judge.notes;
  }

  notesVersion(): number {
    return 0;
  }

  update(t: number): void {
    if (audio().clock.state !== "playing") return;
    if (this.auto) this.autoPlay(t);
    this.judge.update(t);
    const s = this.judge.stats();
    if (s.total > 0 && s.judged >= s.total && t > this.lastNoteEnd + FINISH_AFTER_SEC) this.finish();
  }

  private autoPlay(t: number): void {
    for (const [lane, until] of this.autoUntil) {
      if (t < until) continue;
      this.autoUntil.delete(lane);
      this.judge.release(autoPointer(lane), until);
    }
    for (const n of this.judge.notes) {
      if (n.start > t) break;
      if (n.status !== "pending") continue;
      const lane = n.note.lane;
      if (this.autoUntil.has(lane)) this.judge.release(autoPointer(lane), n.start);
      // 실제 노트 시각에 친 것으로 기록해 모두 PERFECT. 롱 노트는 끝에서 judge가 알아서 마무리한다
      this.judge.press(lane, n.start, autoPointer(lane));
      this.autoUntil.set(lane, n.end ?? n.start + AUTO_TAP_SEC);
      playHitSound();
    }
  }

  /** 곡이 끝났거나 모든 노트를 지나갔을 때. 한 번만 알린다 */
  finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.onFinish?.(this.judge.stats());
  }

  /** 처음부터(또는 연습할 위치부터) 다시. fromSec 앞의 노트는 건너뛴다 */
  restart(fromSec = 0): void {
    this.finished = false;
    this.held.clear();
    this.autoUntil.clear();
    this.judge.reset(fromSec);
  }

  press(id: number, lane: number, t: number): void {
    if (this.auto || audio().clock.state !== "playing") return;
    this.held.set(id, lane);
    this.judge.press(lane, t, id);
  }

  release(id: number, t: number): void {
    if (this.held.delete(id)) this.judge.release(id, t);
  }

  releaseAll(t: number): void {
    for (const id of [...this.held.keys()]) this.release(id, t);
  }

  heldLanes(): ReadonlySet<number> {
    if (this.auto) return new Set(this.autoUntil.keys());
    return new Set(this.held.values());
  }

  combo(): number {
    return this.judge.stats().combo;
  }
}
