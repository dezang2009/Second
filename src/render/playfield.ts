import type { NoteRuntime } from "../game/judge";
import type { Meter } from "../songs/meter";
import { LANES, type Layout } from "./layout";
import { theme } from "./theme";

// 레인, 박자선, 떨어지는 노트, 판정선을 그린다.
// 노트 위치는 오직 곡 시각(t)으로만 계산하므로 프레임이 밀려도 음악과 어긋나지 않는다.
// 친 노트는 사라지고, 놓친 노트는 판정선 아래로 흐려지며 내려간다.

/** 놓친 노트가 흐려지며 사라지는 시간(초) */
const MISS_FADE_SEC = 0.4;
const NOTE_PAD = 8;
const NOTE_THICK = 4;

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

    // 레인 경계: 아주 옅게
    ctx.fillStyle = `rgba(${r},${g},${b},0.06)`;
    for (let i = 0; i <= LANES; i++) ctx.fillRect(Math.round(L.laneLeft + i * L.laneWidth), 0, 1, L.judgeY);

    // 누르고 있는 레인: 판정선 위를 은은하게
    for (const lane of opt.heldLanes) this.laneGlow(ctx, L, lane, 0.06);

    // 박자선: 실제 연주의 박 위치에 긋고, 마디 첫 박만 조금 진하게
    const { beats, downbeat } = this.meter;
    for (let i = Math.max(0, Math.ceil(this.meter.at(t).beat)); i < beats.length; i++) {
      const dt = beats[i] - t;
      if (dt > opt.scrollSec) break;
      ctx.fillStyle = `rgba(${r},${g},${b},${downbeat[i] ? 0.12 : 0.05})`;
      ctx.fillRect(L.laneLeft, Math.round(yOf(dt)), right - L.laneLeft, 1);
    }

    // 노트
    for (let i = lowerBound(this.notes, t - MISS_FADE_SEC - 0.2 - this.maxLen); i < this.notes.length; i++) {
      const n = this.notes[i];
      const dt = n.start - t;
      if (dt > opt.scrollSec * 1.05) break;
      if (n.status === "done" || n.status === "skipped") continue;
      if (n.end === null) this.drawTap(ctx, L, n, t, yOf);
      else this.drawLong(ctx, L, n, t, yOf);
    }

    // 위쪽 상단 정보와 겹치지 않게 노트가 서서히 나타나도록 덮는다
    const fadeH = L.height * 0.16;
    const fade = ctx.createLinearGradient(0, 0, 0, fadeH);
    fade.addColorStop(0, theme.bg);
    fade.addColorStop(0.35, theme.bg);
    fade.addColorStop(1, hexAlpha(theme.bg, 0));
    ctx.fillStyle = fade;
    ctx.fillRect(L.laneLeft - 1, 0, right - L.laneLeft + 2, fadeH);

    // 판정선
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = theme.ink;
    ctx.fillRect(L.laneLeft, Math.round(L.judgeY), right - L.laneLeft, 1);
    ctx.globalAlpha = 1;
  }

  private drawTap(ctx: CanvasRenderingContext2D, L: Layout, n: NoteRuntime, t: number, yOf: (dt: number) => number): void {
    const alpha = n.status === "missed" ? missAlpha(n, t) : 1;
    if (alpha <= 0) return;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = theme.ink;
    ctx.fillRect(L.laneLeft + n.note.lane * L.laneWidth + NOTE_PAD, yOf(n.start - t) - NOTE_THICK / 2, L.laneWidth - NOTE_PAD * 2, NOTE_THICK);
    ctx.globalAlpha = 1;
  }

  private drawLong(ctx: CanvasRenderingContext2D, L: Layout, n: NoteRuntime, t: number, yOf: (dt: number) => number): void {
    const end = n.end as number;
    const holding = n.status === "holding";
    // 놓친 롱 노트는 흐리게 끝까지 내려보낸다
    const alpha = n.status === "missed" ? Math.max(missAlpha(n, t), end > t ? 0.25 : 0) : 1;
    if (alpha <= 0 || yOf(end - t) > L.height) return;

    const x = L.laneLeft + n.note.lane * L.laneWidth + NOTE_PAD;
    const w = L.laneWidth - NOTE_PAD * 2;
    const headY = holding ? L.judgeY : yOf(n.start - t);
    const tailY = Math.min(yOf(end - t), headY);
    if (holding) this.laneGlow(ctx, L, n.note.lane, 0.09);

    ctx.globalAlpha = 0.7 * alpha;
    ctx.strokeStyle = theme.ink;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + w / 2 - 3, tailY, 6, headY - tailY);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = theme.ink;
    ctx.fillRect(x, tailY - NOTE_THICK / 2, w, NOTE_THICK);
    ctx.fillStyle = holding ? theme.accent : theme.ink; // 잡고 있는 쪽 끝만 강조
    ctx.fillRect(x, headY - NOTE_THICK / 2, w, NOTE_THICK);
    ctx.globalAlpha = 1;
  }

  private laneGlow(ctx: CanvasRenderingContext2D, L: Layout, lane: number, strength: number): void {
    const h = L.height * 0.3;
    const glow = ctx.createLinearGradient(0, L.judgeY, 0, L.judgeY - h);
    glow.addColorStop(0, `rgba(142,155,214,${strength})`);
    glow.addColorStop(1, "rgba(142,155,214,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(L.laneLeft + lane * L.laneWidth, L.judgeY - h, L.laneWidth, h);
  }
}

function missAlpha(n: NoteRuntime, t: number): number {
  return Math.max(0, 1 - (t - n.settledAt) / MISS_FADE_SEC) * 0.6;
}

function hexAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${alpha})`;
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
