import type { Grade } from "../game/judge";
import type { Wave } from "./dotField";
import { font, laneColors, rgba, theme } from "./theme";

// 판정 효과: 판정선에서 퍼지는 고리, 점 격자 물결, 판정 글자, 콤보 숫자.
// 모두 서서히 나타나고 사라지며 깜빡이지 않는다 (DESIGN.md 화면 규칙).

const RING_SEC = 0.32;
const WAVE_SEC = 0.9;
const LABEL_SEC = 0.5;

interface Hit {
  x: number;
  y: number;
  lane: number;
  /** 효과가 시작된 화면 시각(초, performance.now 기준) */
  at: number;
  grade: Grade;
}

const LABEL: Record<Grade, string> = { perfect: "PERFECT", great: "GREAT", good: "GOOD", miss: "MISS" };

export class Effects {
  private hits: Hit[] = [];
  private label: { grade: Grade; at: number } | null = null;

  add(x: number, y: number, lane: number, grade: Grade, now: number): void {
    if (grade !== "miss") this.hits.push({ x, y, lane, at: now, grade });
    this.label = { grade, at: now };
  }

  clear(): void {
    this.hits = [];
    this.label = null;
  }

  /** 점 격자에 넘길 물결 목록. 오래된 효과는 여기서 정리한다 */
  waves(now: number): Wave[] {
    this.hits = this.hits.filter((h) => now - h.at < WAVE_SEC);
    return this.hits.map((h) => ({ x: h.x, y: h.y, age: now - h.at, life: WAVE_SEC, strength: h.grade === "good" ? 0.5 : 1 }));
  }

  draw(ctx: CanvasRenderingContext2D, now: number, labelX: number, labelY: number): void {
    for (const h of this.hits) {
      const k = (now - h.at) / RING_SEC;
      if (k >= 1) continue;
      const ease = 1 - Math.pow(1 - k, 3);
      const color = laneColors(h.lane)[1];
      ctx.strokeStyle = rgba(color, (h.grade === "perfect" ? 0.7 : 0.5) * (1 - k));
      ctx.lineWidth = 3 * (1 - k) + 1;
      ctx.beginPath();
      ctx.arc(h.x, h.y, 10 + ease * 30, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (this.label) {
      const k = (now - this.label.at) / LABEL_SEC;
      if (k >= 1) {
        this.label = null;
      } else {
        const g = this.label.grade;
        const rise = 1 - Math.pow(1 - Math.min(1, k * 3), 2); // 처음에 살짝 떠오르고 멈춘다
        ctx.globalAlpha = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
        ctx.fillStyle = g === "perfect" ? theme.accent : g === "miss" ? theme.miss : theme.ink;
        ctx.font = font(800, 18);
        ctx.textAlign = "center";
        ctx.fillText(LABEL[g], labelX, labelY - rise * 8);
        ctx.globalAlpha = 1;
      }
    }
  }
}

export function drawCombo(ctx: CanvasRenderingContext2D, combo: number, x: number, y: number): void {
  if (combo < 2) return;
  ctx.textAlign = "center";
  ctx.fillStyle = rgba(theme.ink, 0.85);
  ctx.font = font(800, 30);
  ctx.fillText(String(combo), x, y);
  ctx.fillStyle = theme.muted;
  ctx.font = font(700, 10);
  ctx.fillText("COMBO", x, y + 15);
}
