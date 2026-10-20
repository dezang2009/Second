import type { Grade } from "../game/judge";
import type { Wave } from "./dotField";
import { theme } from "./theme";

// 판정 효과: 판정선에서 퍼지는 고리, 점 격자 물결, 작은 판정 글자, 콤보 숫자.
// 모두 서서히 나타나고 사라지며 깜빡이지 않는다 (DESIGN.md 화면 규칙).

const RING_SEC = 0.3;
const WAVE_SEC = 0.9;
const LABEL_SEC = 0.45;

interface Hit {
  x: number;
  y: number;
  /** 효과가 시작된 화면 시각(초, performance.now 기준) */
  at: number;
  grade: Grade;
}

const LABEL: Record<Grade, string> = { perfect: "perfect", great: "great", good: "good", miss: "miss" };

export class Effects {
  private hits: Hit[] = [];
  private label: { grade: Grade; at: number } | null = null;

  add(x: number, y: number, grade: Grade, now: number): void {
    if (grade !== "miss") this.hits.push({ x, y, at: now, grade });
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
      const alpha = (h.grade === "perfect" ? 0.5 : 0.35) * (1 - k);
      ctx.strokeStyle = `rgba(142,155,214,${alpha})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(h.x, h.y, 6 + ease * 24, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (this.label) {
      const k = (now - this.label.at) / LABEL_SEC;
      if (k >= 1) {
        this.label = null;
      } else {
        const g = this.label.grade;
        ctx.globalAlpha = 0.75 * (1 - k);
        ctx.fillStyle = g === "perfect" ? theme.accent : g === "miss" ? theme.muted : theme.ink;
        ctx.font = "400 12px ui-monospace, Menlo, monospace";
        ctx.textAlign = "center";
        ctx.fillText(LABEL[g], labelX, labelY - k * 10);
        ctx.globalAlpha = 1;
      }
    }
  }
}

export function drawCombo(ctx: CanvasRenderingContext2D, combo: number, x: number, y: number): void {
  if (combo < 2) return;
  ctx.textAlign = "center";
  ctx.fillStyle = theme.ink;
  ctx.globalAlpha = 0.85;
  ctx.font = "300 28px ui-monospace, Menlo, monospace";
  ctx.fillText(String(combo), x, y);
  ctx.globalAlpha = 1;
  ctx.fillStyle = theme.muted;
  ctx.font = "500 9px ui-monospace, Menlo, monospace";
  ctx.fillText("COMBO", x, y + 15);
}
