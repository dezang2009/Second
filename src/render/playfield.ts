import type { NoteRuntime } from "../game/judge";
import type { SightMod } from "../settings";
import type { Meter } from "../songs/meter";
import { LANES, type Layout } from "./layout";
import { laneColors, rgba, theme } from "./theme";

// 레인, 박자선, 떨어지는 노트, 판정선, 판정선 아래 터치 패드를 그린다.
// 노트 위치는 오직 곡 시각(t)으로만 계산하므로 프레임이 밀려도 음악과 어긋나지 않는다.
// 친 노트는 사라지고, 놓친 노트는 회색으로 흐려지며 내려간다.

/** 놓친 노트가 흐려지며 사라지는 시간(초) */
const MISS_FADE_SEC = 0.4;
/** 노트 좌우 여백(px) */
const NOTE_PAD = 5;

export interface PlayfieldOptions {
  /** 노트가 화면 맨 위에서 판정선까지 내려오는 시간(초) */
  scrollSec: number;
  /** 손가락이 닿아 있는 레인 */
  heldLanes: ReadonlySet<number>;
  /** 노트 크기 배율 (설정) */
  noteScale?: number;
  /** 박자 맥박 0~1 (판정선 받침대가 박에 맞춰 은은하게 빛난다) */
  pulse?: number;
  /** 가리개 (히든: 판정선 가까이, 서든: 화면 위쪽) */
  cover?: SightMod;
}

/** 가리개가 덮는 범위 (판정선까지 높이에 대한 비율) */
const SUDDEN_TO = 0.42;
const HIDDEN_FROM = 0.6;
/** 가리개 가장자리를 부드럽게 흐리는 높이(px) */
const COVER_EDGE = 28;

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
    const noteH = noteHeight(L) * (opt.noteScale ?? 1);

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
    const padTop = L.judgeY + 10;
    const padH = Math.min(52, (L.height - L.judgeY) * 0.3);
    for (let lane = 0; lane < LANES; lane++) {
      const held = opt.heldLanes.has(lane);
      ctx.fillStyle = held ? rgba(laneColors(lane)[1], 0.22) : "rgba(255,255,255,0.22)";
      roundRect(ctx, L.laneLeft + lane * L.laneWidth + NOTE_PAD, padTop, L.laneWidth - NOTE_PAD * 2, padH, 12);
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

    if (opt.cover === "sudden") laneCover(ctx, L, 0, L.judgeY * SUDDEN_TO, "bottom");
    else if (opt.cover === "hidden") laneCover(ctx, L, L.judgeY * HIDDEN_FROM, L.judgeY - 6, "top");

    // 위쪽 상단 정보와 겹치지 않게 노트가 서서히 나타나도록 덮는다
    const fadeH = L.height * 0.16;
    const fade = ctx.createLinearGradient(0, 0, 0, fadeH);
    fade.addColorStop(0, theme.bg[0]);
    fade.addColorStop(0.35, theme.bg[0]);
    fade.addColorStop(1, rgba(theme.bg[0], 0));
    ctx.fillStyle = fade;
    ctx.fillRect(L.laneLeft - 2, 0, right - L.laneLeft + 4, fadeH);

    // 판정선: 옅은 한 줄 위에 레인마다 짧은 받침대. 누르면 레인 색으로 빛난다
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillRect(L.laneLeft, Math.round(L.judgeY) - 0.5, right - L.laneLeft, 1);
    for (let lane = 0; lane < LANES; lane++) {
      const held = opt.heldLanes.has(lane);
      const color = laneColors(lane)[1];
      ctx.save();
      ctx.shadowColor = held ? rgba(color, 0.8) : rgba(color, 0.25 + 0.35 * (opt.pulse ?? 0));
      ctx.shadowBlur = held ? 16 : 6 + 8 * (opt.pulse ?? 0);
      ctx.fillStyle = held ? color : "rgba(255,255,255,0.95)";
      roundRect(ctx, L.laneLeft + lane * L.laneWidth + NOTE_PAD + 2, L.judgeY - 2, L.laneWidth - NOTE_PAD * 2 - 4, 4, 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private drawTap(ctx: CanvasRenderingContext2D, L: Layout, n: NoteRuntime, t: number, yOf: (dt: number) => number, h: number): void {
    const missed = n.status === "missed";
    const alpha = missed ? missAlpha(n, t) : 1;
    if (alpha <= 0) return;
    const x = L.laneLeft + n.note.lane * L.laneWidth + NOTE_PAD;
    drawPill(ctx, x, yOf(n.start - t) - h / 2, L.laneWidth - NOTE_PAD * 2, h, n.note.lane, alpha, missed);
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
    const color = missed ? theme.miss : laneColors(n.note.lane)[1];
    if (holding) laneGlow(ctx, L, n.note.lane, 0.3);

    // 몸통: 꼬리 쪽은 투명하고 머리 쪽으로 갈수록 짙어지는 반투명 띠 + 얇은 테두리
    const bodyW = w * 0.42;
    const bx = x + (w - bodyW) / 2;
    const bodyH = headY - tailY;
    if (bodyH > 1) {
      const g = ctx.createLinearGradient(0, tailY, 0, headY);
      g.addColorStop(0, rgba(color, (holding ? 0.25 : 0.12) * alpha));
      g.addColorStop(1, rgba(color, (holding ? 0.7 : 0.45) * alpha));
      ctx.fillStyle = g;
      roundRect(ctx, bx, tailY, bodyW, bodyH, bodyW / 2);
      ctx.fill();
      ctx.strokeStyle = rgba(color, 0.55 * alpha);
      ctx.lineWidth = 1;
      ctx.stroke();
      // 누르고 있는 동안: 꼬리에서 머리 쪽으로 흐르는 은은한 빛
      if (holding && bodyH > 24) {
        const k = (t * 1.6) % 1;
        const sy = tailY + k * (bodyH - 18);
        const shine = ctx.createLinearGradient(0, sy, 0, sy + 18);
        shine.addColorStop(0, "rgba(255,255,255,0)");
        shine.addColorStop(0.5, "rgba(255,255,255,0.45)");
        shine.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = shine;
        roundRect(ctx, bx + 1, sy, bodyW - 2, 18, (bodyW - 2) / 2);
        ctx.fill();
      }
    }
    // 꼬리: 속이 흰 작은 캡슐
    const capW = w * 0.5;
    const capH = Math.max(6, h * 0.6);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    roundRect(ctx, x + (w - capW) / 2, tailY - capH / 2, capW, capH, capH / 2);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.globalAlpha = 1;
    drawPill(ctx, x, headY - h / 2, w, h, n.note.lane, alpha, missed);
  }
}

export function noteHeight(L: Layout): number {
  return Math.min(16, Math.max(12, L.laneWidth * 0.18));
}

/**
 * 노트: 납작한 캡슐에 레인 색을 단색으로 채우고, 얇은 흰 안쪽 테두리와 가운데 짧은 표시를 넣는다.
 * 회색 그림자 대신 같은 색으로 은은하게 번지는 빛을 둘러 밝은 배경에서도 또렷하게 보이게 한다.
 */
function drawPill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, lane: number, alpha: number, missed: boolean): void {
  const r = h / 2;
  if (missed) {
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = theme.miss;
    ctx.lineWidth = 1.5;
    roundRect(ctx, x + 0.75, y + 0.75, w - 1.5, h - 1.5, r);
    ctx.stroke();
    ctx.globalAlpha = 1;
    return;
  }
  const color = laneColors(lane)[1];
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.shadowColor = rgba(color, 0.55);
  ctx.shadowBlur = 14;
  ctx.fillStyle = color;
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.restore();

  ctx.globalAlpha = alpha * 0.85;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.5;
  roundRect(ctx, x + 1.5, y + 1.5, w - 3, h - 3, r - 1.5);
  ctx.stroke();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, x + w / 2 - w * 0.11, y + h / 2 - 1, w * 0.22, 2, 1);
  ctx.fill();
  ctx.globalAlpha = 1;
}

/**
 * 레인 가리개: 노트를 덮는 불투명한 판. soft 쪽 가장자리는 흐리게 열려 노트가 스르륵 나타나거나 사라진다.
 * 가장자리에 얇은 선을 그어 어디부터 가려지는지 보이게 한다.
 */
function laneCover(ctx: CanvasRenderingContext2D, L: Layout, top: number, bottom: number, soft: "top" | "bottom"): void {
  const x = L.laneLeft - 1;
  const w = L.laneWidth * LANES + 2;
  const solid = rgba(theme.bg[1], 0.97);
  const g = ctx.createLinearGradient(0, top, 0, bottom);
  const edge = Math.min(0.5, COVER_EDGE / Math.max(1, bottom - top));
  if (soft === "top") {
    g.addColorStop(0, rgba(theme.bg[1], 0));
    g.addColorStop(edge, solid);
    g.addColorStop(1, solid);
  } else {
    g.addColorStop(0, solid);
    g.addColorStop(1 - edge, solid);
    g.addColorStop(1, rgba(theme.bg[1], 0));
  }
  ctx.fillStyle = g;
  ctx.fillRect(x, top, w, bottom - top);
  // 덮개 안쪽 경계 표시
  const lineY = soft === "top" ? top + COVER_EDGE : bottom - COVER_EDGE;
  ctx.fillStyle = rgba(theme.accent, 0.35);
  ctx.fillRect(x + 8, Math.round(lineY), w - 16, 1.5);
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
