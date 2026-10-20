import { audio } from "../audio/audio";
import { drawDotField, smoothPulse } from "../render/dotField";
import { drawCombo, Effects } from "../render/effects";
import { computeLayout, LANES, type Layout, laneCenterX } from "../render/layout";
import { Playfield } from "../render/playfield";
import type { Meter } from "../songs/meter";
import type { Grade, NoteRuntime } from "./judge";

// 캔버스 하나를 맡아 매 프레임 그리고, 터치/키 입력을 지금 장면(플레이 또는 에디터)에 넘긴다.
// 장면이 없으면 (목록, 결과 화면) 점 격자만 조용히 그린다.

export interface Scene {
  readonly meter: Meter;
  notes(): readonly NoteRuntime[];
  /** 노트 목록이 바뀔 때마다 달라지는 값. 바뀌면 화면용 데이터를 다시 만든다 */
  notesVersion(): number;
  update(t: number): void;
  /** @param x,y 누른 화면 좌표 (에디터가 멈춘 상태에서 노트를 고를 때 쓴다) */
  press(id: number, lane: number, t: number, x: number, y: number): void;
  release(id: number, t: number): void;
  heldLanes(): ReadonlySet<number>;
  /** 0이면 콤보를 숨긴다 */
  combo(): number;
}

const KEY_LANES: Record<string, number> = { KeyD: 0, KeyF: 1, KeyJ: 2, KeyK: 3 };
const EMPTY = new Set<number>();

export class Stage {
  layout: Layout = computeLayout(1, 1);
  readonly effects = new Effects();
  /** 노트가 화면 위에서 판정선까지 내려오는 시간(초). 나중에 노트 속도 설정으로 바꾼다 */
  scrollSec = 1.6;
  /** 매 프레임 그린 뒤 부른다. 화면의 글자(시계, 점수 등)를 고칠 때 쓴다 */
  onFrame: ((t: number) => void) | null = null;

  private scene: Scene | null = null;
  private playfield: Playfield | null = null;
  private playfieldVersion = NaN;
  private readonly ctx: CanvasRenderingContext2D;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
    window.addEventListener("resize", () => this.resize());
    this.resize();
    this.bindInput();
    requestAnimationFrame(() => this.frame());
  }

  setScene(scene: Scene | null): void {
    this.scene = scene;
    this.playfield = null;
    this.playfieldVersion = NaN;
    this.effects.clear();
  }

  /** 판정 효과를 레인에 띄운다 */
  hit(lane: number, grade: Grade): void {
    this.effects.add(laneCenterX(this.layout, lane), this.layout.judgeY, grade, nowSec());
  }

  /** 이벤트가 실제로 일어난 순간의 곡 시각. 프레임을 기다린 만큼 되돌린다 */
  songTimeOf(eventTimeStamp: number): number {
    const { clock } = audio();
    const lag = clock.state === "playing" ? Math.min(0.1, Math.max(0, (performance.now() - eventTimeStamp) / 1000)) : 0;
    return clock.time() - lag;
  }

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.layout = computeLayout(w, h);
  }

  private laneAtX(x: number): number {
    const lane = Math.floor((x - this.layout.laneLeft) / this.layout.laneWidth);
    return Math.min(LANES - 1, Math.max(0, lane)); // 레인 바깥을 눌러도 가장 가까운 레인으로
  }

  private bindInput(): void {
    const c = this.canvas;
    c.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.scene?.press(e.pointerId, this.laneAtX(e.clientX), this.songTimeOf(e.timeStamp), e.clientX, e.clientY);
    });
    const up = (e: PointerEvent) => this.scene?.release(e.pointerId, this.songTimeOf(e.timeStamp));
    c.addEventListener("pointerup", up);
    c.addEventListener("pointercancel", up);

    // 컴퓨터에서 시험할 때: D F J K
    const keyId = (lane: number) => -1 - lane;
    window.addEventListener("keydown", (e) => {
      const lane = KEY_LANES[e.code];
      if (lane === undefined || e.repeat || !this.scene) return;
      const L = this.layout;
      this.scene.press(keyId(lane), lane, this.songTimeOf(e.timeStamp), laneCenterX(L, lane), L.judgeY);
    });
    window.addEventListener("keyup", (e) => {
      const lane = KEY_LANES[e.code];
      if (lane !== undefined) this.scene?.release(keyId(lane), this.songTimeOf(e.timeStamp));
    });
  }

  private frame(): void {
    const { clock } = audio();
    const L = this.layout;
    const scene = this.scene;
    const t = scene ? clock.time() : 0;
    const now = nowSec();
    scene?.update(t);

    let pulse = 0;
    if (scene && clock.state === "playing" && scene.meter.hasBeats) {
      const pos = scene.meter.at(t);
      if (pos.beat >= 0) pulse = smoothPulse(pos.phase) * (pos.beatInBar === 1 ? 1 : 0.6);
    }
    drawDotField(this.ctx, L.width, L.height, { x: L.laneLeft, width: L.laneWidth * LANES, bottom: L.judgeY }, pulse, this.effects.waves(now));

    if (scene) {
      if (scene.notesVersion() !== this.playfieldVersion) {
        this.playfield = new Playfield(scene.notes(), scene.meter);
        this.playfieldVersion = scene.notesVersion();
      }
      this.playfield?.draw(this.ctx, L, t, { scrollSec: this.scrollSec, heldLanes: scene.heldLanes() ?? EMPTY });
      this.effects.draw(this.ctx, now, L.width / 2, L.judgeY - 28);
      drawCombo(this.ctx, scene.combo(), L.width / 2, L.judgeY + (L.height - L.judgeY) * 0.55);
    }
    this.onFrame?.(t);
    requestAnimationFrame(() => this.frame());
  }
}

const nowSec = () => performance.now() / 1000;
