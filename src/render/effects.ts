import type { Grade } from "../game/judge";
import type { Wave } from "./dotField";
import { font, laneColors, rgba, theme } from "./theme";

// 판정 효과: 판정선에서 퍼지는 빛과 고리(판정마다 다르게), 점 격자 물결, 판정 글자,
// 콤보 숫자와 50콤보마다의 강조, 새 기록 축하 꽃가루.
// 모두 서서히 나타나고 사라지며 깜빡이지 않는다 (DESIGN.md 화면 규칙).

const RING_SEC = 0.32;
const WAVE_SEC = 0.9;
const LABEL_SEC = 0.5;
const COMBO_PULSE_SEC = 0.35;
const MILESTONE_SEC = 1.1;
/** 이 콤보마다 숫자를 강조한다 */
export const COMBO_STEP = 50;
const CONFETTI_SEC = 3;

interface Hit {
  x: number;
  y: number;
  lane: number;
  /** 효과가 시작된 화면 시각(초, performance.now 기준) */
  at: number;
  grade: Grade;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
  size: number;
  color: string;
  delay: number;
}

const LABEL: Record<Grade, string> = { perfect: "PERFECT", great: "GREAT", good: "GOOD", miss: "MISS" };

export class Effects {
  private hits: Hit[] = [];
  private label: { grade: Grade; at: number } | null = null;
  private milestone: { combo: number; at: number } | null = null;
  private confetti: { at: number; parts: Particle[] } | null = null;

  add(x: number, y: number, lane: number, grade: Grade, now: number): void {
    if (grade !== "miss") this.hits.push({ x, y, lane, at: now, grade });
    this.label = { grade, at: now };
  }

  /** 콤보가 COMBO_STEP의 배수가 됐을 때 */
  comboMilestone(combo: number, now: number): void {
    this.milestone = { combo, at: now };
  }

  /** 새 기록: 화면 위쪽에서 꽃가루가 천천히 흩날린다 */
  celebrate(width: number, height: number, now: number): void {
    const colors = [theme.accent, "#9b88dc", "#df82a6", "#93a1ef", "#f3a9c3", "#ffffff"];
    let seed = Math.floor(now * 1000) % 2147483647 || 1;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const parts: Particle[] = Array.from({ length: 56 }, () => ({
      x: rand() * width,
      y: -20 - rand() * height * 0.25,
      vx: (rand() - 0.5) * 60,
      vy: 90 + rand() * 110,
      spin: (rand() - 0.5) * 8,
      size: 5 + rand() * 6,
      color: colors[Math.floor(rand() * colors.length)],
      delay: rand() * 0.6,
    }));
    this.confetti = { at: now, parts };
  }

  clear(): void {
    this.hits = [];
    this.label = null;
    this.milestone = null;
  }

  /** 점 격자에 넘길 물결 목록. 오래된 효과는 여기서 정리한다 */
  /** @param scale 이펙트 세기 (설정: 끄기 0, 약하게 0.5, 보통 1) */
  waves(now: number, scale = 1): Wave[] {
    this.hits = this.hits.filter((h) => now - h.at < WAVE_SEC);
    if (scale <= 0) return [];
    const waves: Wave[] = this.hits
      .filter((h) => h.grade !== "good")
      .map((h) => ({ x: h.x, y: h.y, age: now - h.at, life: WAVE_SEC, strength: (h.grade === "perfect" ? 1 : 0.6) * scale }));
    return waves;
  }

  draw(ctx: CanvasRenderingContext2D, now: number, labelX: number, labelY: number, scale = 1): void {
    for (const h of this.hits) {
      if (scale <= 0) break;
      const k = (now - h.at) / RING_SEC;
      if (k >= 1) continue;
      const ease = 1 - Math.pow(1 - k, 3);
      const color = h.grade === "good" ? theme.miss : laneColors(h.lane)[1];
      const fade = (1 - k) * scale;
      if (h.grade === "perfect") {
        // PERFECT: 부드러운 빛 + 또렷한 고리 + 여섯 갈래 짧은 불꽃
        const glowR = 14 + ease * 20;
        const glow = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, glowR);
        glow.addColorStop(0, rgba(color, 0.4 * fade));
        glow.addColorStop(1, rgba(color, 0));
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(h.x, h.y, glowR, 0, Math.PI * 2);
        ctx.fill();
        ring(ctx, h.x, h.y, 8 + ease * 28, rgba(color, 0.9 * fade), 1.5);
        ctx.strokeStyle = rgba(color, 0.8 * fade);
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        for (let i = 0; i < 6; i++) {
          const a = -Math.PI / 2 + (i * Math.PI) / 3;
          const r0 = 12 + ease * 18;
          const r1 = r0 + 7 * (1 - k);
          ctx.beginPath();
          ctx.moveTo(h.x + Math.cos(a) * r0, h.y + Math.sin(a) * r0);
          ctx.lineTo(h.x + Math.cos(a) * r1, h.y + Math.sin(a) * r1);
          ctx.stroke();
        }
        ctx.lineCap = "butt";
      } else if (h.grade === "great") {
        // GREAT: 고리만, 조금 작고 옅게
        ring(ctx, h.x, h.y, 8 + ease * 20, rgba(color, 0.6 * fade), 1.5);
      } else {
        // GOOD: 회색 고리 하나
        ring(ctx, h.x, h.y, 8 + ease * 14, rgba(color, 0.5 * fade), 1);
      }
    }

    if (this.label) {
      const k = (now - this.label.at) / LABEL_SEC;
      if (k >= 1) {
        this.label = null;
      } else {
        const g = this.label.grade;
        const rise = 1 - Math.pow(1 - Math.min(1, k * 3), 2); // 처음에 살짝 떠오르고 멈춘다
        const pop = g === "perfect" ? 1 + 0.12 * Math.max(0, 1 - k * 4) : 1; // PERFECT는 처음에 살짝 커졌다 돌아온다
        ctx.save();
        ctx.globalAlpha = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
        ctx.translate(labelX, labelY - rise * 8);
        ctx.scale(pop, pop);
        ctx.textAlign = "center";
        if (g === "perfect") {
          const grad = ctx.createLinearGradient(-50, 0, 50, 0);
          grad.addColorStop(0, theme.accent);
          grad.addColorStop(1, "#df82a6");
          ctx.fillStyle = grad;
          ctx.font = font(900, 20);
        } else {
          ctx.fillStyle = g === "miss" ? theme.miss : g === "good" ? theme.muted : theme.ink;
          ctx.font = font(800, g === "great" ? 18 : 16);
        }
        ctx.fillText(LABEL[g], 0, 0);
        ctx.restore();
      }
    }
  }

  /** 콤보 숫자. 50콤보마다 살짝 커졌다 돌아오고 위에 "50 COMBO"가 떠오른다 */
  drawCombo(ctx: CanvasRenderingContext2D, combo: number, x: number, y: number, now: number, scale = 1): void {
    if (combo < 2) return;
    const m = this.milestone;
    const mk = m ? (now - m.at) / COMBO_PULSE_SEC : 1;
    const pulse = scale > 0 && mk < 1 ? 1 + 0.22 * (1 - mk) ** 2 : 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(pulse, pulse);
    ctx.textAlign = "center";
    ctx.fillStyle = rgba(theme.ink, 0.88);
    ctx.font = font(900, 34);
    ctx.fillText(String(combo), 0, 0);
    ctx.fillStyle = theme.muted;
    ctx.font = font(800, 10);
    ctx.fillText("COMBO", 0, 15);
    ctx.restore();
    if (m && scale > 0) {
      const k = (now - m.at) / MILESTONE_SEC;
      if (k >= 1) this.milestone = null;
      else {
        ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
        ctx.textAlign = "center";
        const grad = ctx.createLinearGradient(x - 50, 0, x + 50, 0);
        grad.addColorStop(0, theme.accent);
        grad.addColorStop(1, "#df82a6");
        ctx.fillStyle = grad;
        ctx.font = font(900, 13);
        ctx.fillText(`${m.combo} COMBO!`, x, y - 34 - k * 10);
        ctx.globalAlpha = 1;
      }
    }
  }

  /** 꽃가루. 장면과 상관없이(결과 화면에서도) 그린다 */
  drawConfetti(ctx: CanvasRenderingContext2D, now: number, height: number, scale = 1): void {
    const c = this.confetti;
    if (!c) return;
    const age = now - c.at;
    if (age > CONFETTI_SEC + 0.6 || scale <= 0) {
      this.confetti = null;
      return;
    }
    for (const p of c.parts) {
      const t = age - p.delay;
      if (t <= 0) continue;
      const y = p.y + p.vy * t + 30 * t * t;
      if (y > height + 20) continue;
      const x = p.x + p.vx * t + Math.sin(t * 3 + p.spin) * 12;
      const life = 1 - Math.max(0, (t - CONFETTI_SEC * 0.7) / (CONFETTI_SEC * 0.3));
      if (life <= 0) continue;
      ctx.save();
      ctx.globalAlpha = Math.min(1, life) * 0.9;
      ctx.translate(x, y);
      ctx.rotate(p.spin * t);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    }
  }
}

function ring(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, width: number): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
}
