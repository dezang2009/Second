import type { NoteRuntime } from "../game/judge";
import type { Meter } from "../songs/meter";
import { LANES, type Layout } from "./layout";
import { laneColors, rgba, theme } from "./theme";

// 레인, 박자선, 떨어지는 노트, 판정선, 판정선 아래 터치 패드를 그린다.
// 노트 위치는 오직 곡 시각(t)으로만 계산하므로 프레임이 밀려도 음악과 어긋나지 않는다.
// 친 노트는 사라지고, 놓친 노트는 회색으로 흐려지며 내려간다.

/** 놓친 노트가 흐려지며 사라지는 시간(초) */
const MISS_FADE_SEC = 0.4;
/** 노트 블록 좌우 여백(px) */
const NOTE_PAD = 4;

export interface PlayfieldOptions {
  /** 노트가 화면 맨 위에서 판정선까지 내려오는 시간(초) */
  scrollSec: number;
  /** 손가락이 닿아 있는 레인 */
  heldLanes: ReadonlySet<number>;
}

export class Playfield {
  private readonly maxLen: number;

  constructor(
    private readonly notes: readonly NoteRuntime[],
    private readonly meter: Meter,
  ) {
    this.maxLen = notes.reduce((m, n) => Math.max(m, n.end === null ? 0 : n.end - n.start), 0);
  }

  draw(ctx: CanvasRenderingContext2D, L: Layout, t: number, opt: PlayfieldOptions): void {
    const yOf = (dt: number) => L.judgeY - (dt / opt.scrollSec) * L.judgeY;
    const right = L.laneLeft + L.laneWidth * LANES;
    const [r, g, b] = theme.dot;
    const noteH = noteHeight(L);

    // 레인 바탕과 경계
    ctx.fillStyle = theme.track;
    roundRect(ctx, L.laneLeft, -12, right - L.laneLeft, L.judgeY + 12, 14);
    ctx.fill();
    ctx.fillStyle = `rgba(${r},${g},${b},0.08)`;
    for (let i = 1; i < LANES; i++) ctx.fillRect(Math.round(L.laneLeft + i * L.laneWidth), 0, 1, L.judgeY);

    // 누르고 있는 레인: 판정선 위를 레인 색으로 은은하게
    for (const lane of opt.heldLanes) laneGlow(ctx, L, lane, 0.22);

    // 박자선: 실제 연주의 박 위치에 긋고, 마디 첫 박만 조금 진하게
    const { beats, downbeat } = this.meter;
    for (let i = Math.max(0, Math.ceil(this.meter.at(t).beat)); i < beats.length; i++) {
      const dt = beats[i] - t;
      if (dt > opt.scrollSec) break;
      ctx.fillStyle = `rgba(${r},${g},${b},${downbeat[i] ? 0.16 : 0.07})`;
      ctx.fillRect(L.laneLeft, Math.round(yOf(dt)), right - L.laneLeft, downbeat[i] ? 2 : 1);
    }

    // 판정선 아래 터치 패드
    const padTop = L.judgeY + 8;
    const padH = Math.min(56, (L.height - L.judgeY) * 0.32);
    for (let lane = 0; lane < LANES; lane++) {
      const held = opt.heldLanes.has(lane);
      ctx.fillStyle = held ? rgba(laneColors(lane)[1], 0.35) : "rgba(255,255,255,0.32)";
      roundRect(ctx, L.laneLeft + lane * L.laneWidth + NOTE_PAD, padTop, L.laneWidth - NOTE_PAD * 2, padH, 10);
      ctx.fill();
    }

    // 노트
    for (let i = lowerBound(this.notes, t - MISS_FADE_SEC - 0.2 - this.maxLen); i < this.notes.length; i++) {
      const n = this.notes[i];
      const dt = n.start - t;
      if (dt > opt.scrollSec * 1.05) break;
      if (n.status === "done" || n.status === "skipped") continue;
      if (n.end === null) this.drawTap(ctx, L, n, t, yOf, noteH);
      else this.drawLong(ctx, L, n, t, yOf, noteH);
    }

    // 위쪽 상단 정보와 겹치지 않게 노트가 서서히 나타나도록 덮는다
    const fadeH = L.height * 0.16;
    const fade = ctx.createLinearGradient(0, 0, 0, fadeH);
    fade.addColorStop(0, theme.bg[0]);
    fade.addColorStop(0.35, theme.bg[0]);
    fade.addColorStop(1, rgba(theme.bg[0], 0));
    ctx.fillStyle = fade;
    ctx.fillRect(L.laneLeft - 2, 0, right - L.laneLeft + 4, fadeH);

    // 판정선
    ctx.save();
    ctx.shadowColor = "rgba(110,127,220,0.35)";
    ctx.shadowBlur = 8;
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    roundRect(ctx, L.laneLeft - 2, L.judgeY - 2, right - L.laneLeft + 4, 4, 2);
    ctx.fill();
    ctx.restore();
  }

  private drawTap(ctx: CanvasRenderingContext2D, L: Layout, n: NoteRuntime, t: number, yOf: (dt: number) => number, h: number): void {
    const missed = n.status === "missed";
    const alpha = missed ? missAlpha(n, t) : 1;
    if (alpha <= 0) return;
    const x = L.laneLeft + n.note.lane * L.laneWidth + NOTE_PAD;
    drawBlock(ctx, x, yOf(n.start - t) - h / 2, L.laneWidth - NOTE_PAD * 2, h, n.note.lane, alpha, missed);
  }

  private drawLong(ctx: CanvasRenderingContext2D, L: Layout, n: NoteRuntime, t: number, yOf: (dt: number) => number, h: number): void {
    const end = n.end as number;
    const holding = n.status === "holding";
    const missed = n.status === "missed";
    // 놓친 롱 노트는 흐리게 끝까지 내려보낸다
    const alpha = missed ? Math.max(missAlpha(n, t), end > t ? 0.35 : 0) : 1;
    if (alpha <= 0 || yOf(end - t) > L.height) return;

    const x = L.laneLeft + n.note.lane * L.laneWidth + NOTE_PAD;
    const w = L.laneWidth - NOTE_PAD * 2;
    const headY = holding ? L.judgeY : yOf(n.start - t);
    const tailY = Math.min(yOf(end - t), headY);
    const [, dark] = laneColors(n.note.lane);
    if (holding) laneGlow(ctx, L, n.note.lane, 0.3);

    // 몸통: 레인 폭의 60%, 끝이 둥근 띠
    const bodyW = w * 0.6;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = missed ? rgba(theme.miss, 0.4) : rgba(dark, holding ? 0.55 : 0.38);
    roundRect(ctx, x + (w - bodyW) / 2, tailY, bodyW, headY - tailY, bodyW / 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    drawBlock(ctx, x + w * 0.1, tailY - h * 0.35, w * 0.8, h * 0.7, n.note.lane, alpha, missed);
    drawBlock(ctx, x, headY - h / 2, w, h, n.note.lane, alpha, missed);
  }
}

export function noteHeight(L: Layout): number {
  return Math.min(18, Math.max(12, L.laneWidth * 0.2));
}

/** 둥근 노트 블록: 위는 밝고 아래는 진한 그라데이션에 윗면 하이라이트 */
function drawBlock(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, lane: number, alpha: number, missed: boolean): void {
  const [light, dark] = missed ? [theme.miss, theme.miss] : laneColors(lane);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.shadowColor = "rgba(60,70,120,0.22)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, light);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  roundRect(ctx, x, y, w, h, Math.min(7, h / 2));
  ctx.fill();
  ctx.restore();
  ctx.globalAlpha = alpha * 0.6;
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, x + 4, y + 2, w - 8, Math.max(2, h * 0.18), 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function laneGlow(ctx: CanvasRenderingContext2D, L: Layout, lane: number, strength: number): void {
  const h = L.height * 0.3;
  const color = laneColors(lane)[0];
  const glow = ctx.createLinearGradient(0, L.judgeY, 0, L.judgeY - h);
  glow.addColorStop(0, rgba(color, strength));
  glow.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(L.laneLeft + lane * L.laneWidth, L.judgeY - h, L.laneWidth, h);
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, w / 2, Math.abs(h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function missAlpha(n: NoteRuntime, t: number): number {
  return Math.max(0, 1 - (t - n.settledAt) / MISS_FADE_SEC) * 0.7;
}

/** start가 sec 이상인 첫 노트의 위치 */
function lowerBound(notes: readonly NoteRuntime[], sec: number): number {
  let lo = 0;
  let hi = notes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (notes[mid].start < sec) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
