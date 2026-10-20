import { audio } from "../audio/audio";
import { LANES } from "../render/layout";
import { Meter } from "../songs/meter";
import type { Chart } from "../songs/types";
import { Judge, type JudgeStats } from "./judge";
import type { Scene, Stage } from "./stage";

// 플레이 장면: 레인 입력을 판정하고, 마지막 노트가 끝나면 결과를 알린다.

/** 마지막 노트 뒤 이만큼 지나면 곡이 남아 있어도 결과로 넘어간다(초) */
const FINISH_AFTER_SEC = 2;

export class PlayScene implements Scene {
  readonly judge: Judge;
  readonly meter: Meter;
  onFinish: ((stats: JudgeStats) => void) | null = null;
  private finished = false;
  private readonly held = new Map<number, number>();
  private readonly lastNoteEnd: number;

  constructor(
    readonly chart: Chart,
    stage: Stage,
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
    this.judge.update(t);
    const s = this.judge.stats();
    if (s.total > 0 && s.judged >= s.total && t > this.lastNoteEnd + FINISH_AFTER_SEC) this.finish();
  }

  /** 곡이 끝났거나 모든 노트를 지나갔을 때. 한 번만 알린다 */
  finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.onFinish?.(this.judge.stats());
  }

  restart(): void {
    this.finished = false;
    this.held.clear();
    this.judge.reset(0);
  }

  press(id: number, lane: number, t: number): void {
    if (audio().clock.state !== "playing") return;
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
    return new Set(this.held.values());
  }

  combo(): number {
    return this.judge.stats().combo;
  }
}
