import { Meter } from "../songs/meter";
import type { Chart, ChartNote } from "../songs/types";
import { LANES, type Layout, laneCenterX } from "./layout";
import { theme } from "./theme";

// 레인, 박자선, 떨어지는 노트, 판정선을 그린다.
// 노트 위치는 오직 곡 시각(t)으로만 계산하므로 프레임이 밀려도 음악과 어긋나지 않는다.

/** 판정선을 지난 뒤 효과를 보여주는 시간(초) */
const AFTER_SEC = 0.3;
const NOTE_PAD = 8;
const NOTE_THICK = 4;

export interface PlayfieldOptions {
  /** 노트가 화면 맨 위에서 판정선까지 내려오는 시간(초) */
  scrollSec: number;
}

export class Playfield {
  private readonly notes: ChartNote[];
  private readonly maxLenMs: number;

  constructor(
    chart: Chart,
    private readonly meter: Meter,
  ) {
    this.notes = [...chart.notes].sort((a, b) => a.t - b.t);
    this.maxLenMs = this.notes.reduce((m, n) => Math.max(m, n.len ?? 0), 0);
  }

  get noteCount(): number {
    return this.notes.length;
  }

  draw(ctx: CanvasRenderingContext2D, L: Layout, t: number, opt: PlayfieldOptions): void {
    const yOf = (dt: number) => L.judgeY - (dt / opt.scrollSec) * L.judgeY;
    const right = L.laneLeft + L.laneWidth * LANES;
    const [r, g, b] = theme.dot;

    // 레인 경계: 아주 옅게
    ctx.fillStyle = `rgba(${r},${g},${b},0.06)`;
    for (let i = 0; i <= LANES; i++) ctx.fillRect(Math.round(L.laneLeft + i * L.laneWidth), 0, 1, L.judgeY);

    // 박자선: 실제 연주의 박 위치에 긋고, 마디 첫 박만 조금 진하게
    const { beats, downbeat } = this.meter;
    for (let i = Math.max(0, Math.ceil(this.meter.at(t).beat)); i < beats.length; i++) {
      const dt = beats[i] - t;
      if (dt > opt.scrollSec) break;
      ctx.fillStyle = `rgba(${r},${g},${b},${downbeat[i] ? 0.12 : 0.05})`;
      ctx.fillRect(L.laneLeft, Math.round(yOf(dt)), right - L.laneLeft, 1);
    }

    // 노트
    const from = lowerBound(this.notes, (t - AFTER_SEC) * 1000 - this.maxLenMs);
    for (let i = from; i < this.notes.length; i++) {
      const n = this.notes[i];
      const dt = n.t / 1000 - t;
      if (dt > opt.scrollSec * 1.05) break;
      if (n.len) this.drawLong(ctx, L, n, dt, yOf);
      else this.drawTap(ctx, L, n.lane, dt, yOf);
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

  private drawTap(ctx: CanvasRenderingContext2D, L: Layout, lane: number, dt: number, yOf: (dt: number) => number): void {
    if (dt >= 0) {
      ctx.fillStyle = theme.ink;
      ctx.fillRect(L.laneLeft + lane * L.laneWidth + NOTE_PAD, yOf(dt) - NOTE_THICK / 2, L.laneWidth - NOTE_PAD * 2, NOTE_THICK);
    } else if (dt > -AFTER_SEC) {
      drawRing(ctx, laneCenterX(L, lane), L.judgeY, -dt / AFTER_SEC);
    }
  }

  private drawLong(ctx: CanvasRenderingContext2D, L: Layout, n: ChartNote, dt: number, yOf: (dt: number) => number): void {
    const endDt = dt + (n.len ?? 0) / 1000;
    if (endDt < -AFTER_SEC) return;
    if (endDt < 0) {
      drawRing(ctx, laneCenterX(L, n.lane), L.judgeY, -endDt / AFTER_SEC);
      return;
    }
    const x = L.laneLeft + n.lane * L.laneWidth + NOTE_PAD;
    const w = L.laneWidth - NOTE_PAD * 2;
    const headY = dt > 0 ? yOf(dt) : L.judgeY;
    const tailY = yOf(endDt);

    if (dt <= 0) {
      // 누르고 있는 구간: 레인 아래쪽을 은은하게 밝힌다
      const glow = ctx.createLinearGradient(0, L.judgeY, 0, L.judgeY - L.height * 0.3);
      glow.addColorStop(0, "rgba(142,155,214,0.09)");
      glow.addColorStop(1, "rgba(142,155,214,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(L.laneLeft + n.lane * L.laneWidth, L.judgeY - L.height * 0.3, L.laneWidth, L.height * 0.3);
    }

    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = theme.ink;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + w / 2 - 3, tailY, 6, headY - tailY);
    ctx.globalAlpha = 1;
    ctx.fillStyle = theme.ink;
    ctx.fillRect(x, tailY - NOTE_THICK / 2, w, NOTE_THICK);
    ctx.fillRect(x, headY - NOTE_THICK / 2, w, NOTE_THICK);
  }
}

/** 판정선에서 천천히 퍼지는 고리. k는 0~1 진행도 */
function drawRing(ctx: CanvasRenderingContext2D, x: number, y: number, k: number): void {
  const ease = 1 - Math.pow(1 - k, 3);
  ctx.strokeStyle = `rgba(142,155,214,${0.45 * (1 - k)})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, 6 + ease * 24, 0, Math.PI * 2);
  ctx.stroke();
}

function hexAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** t가 ms 이상인 첫 노트의 위치 */
function lowerBound(notes: ChartNote[], ms: number): number {
  let lo = 0;
  let hi = notes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (notes[mid].t < ms) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
