import { theme } from "./theme";

// 화면 전체를 덮는 점 격자. 박자에 맞춰 레인 쪽 점이 부드럽게 숨쉬고,
// 노트를 치면 판정선에서 물결이 천천히 퍼진다.
// 밝기 변화는 작게, 곡선은 매끄럽게 유지한다 (깜빡임 금지).

const BASE_ALPHA = 0.09;
const LANE_ALPHA = 0.05;
const BEAT_ALPHA = 0.035;
const WAVE_GAIN = 0.18;
/** 물결이 1초에 화면 폭의 몇 배만큼 퍼지는지 */
const WAVE_SPEED = 0.7;
const COLUMNS = 22;

export interface LaneArea {
  x: number;
  width: number;
  bottom: number;
}

export interface Wave {
  x: number;
  y: number;
  /** 시작 후 지난 시간(초) */
  age: number;
  /** 물결이 사라지는 시간(초) */
  life: number;
  /** 0~1 세기 */
  strength: number;
}

/**
 * @param pulse 0~1. 박이 들어오는 순간 1, 박 사이에서 0
 */
export function drawDotField(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  lanes: LaneArea,
  pulse: number,
  waves: Wave[] = [],
): void {
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, w, h);

  const gap = w / COLUMNS;
  const band = gap * 2.6;
  const [r, g, b] = theme.dot;
  const fronts = waves.map((wv) => {
    const life = 1 - wv.age / wv.life;
    return { ...wv, front: wv.age * w * WAVE_SPEED, k: life * life * wv.strength };
  });
  for (let y = gap / 2; y < h; y += gap) {
    for (let x = gap / 2; x < w; x += gap) {
      let a = BASE_ALPHA;
      let size = 0.9;
      if (x > lanes.x && x < lanes.x + lanes.width && y < lanes.bottom) {
        a += LANE_ALPHA + BEAT_ALPHA * pulse;
        size += 0.15 * pulse;
      }
      for (const f of fronts) {
        const d = Math.hypot(x - f.x, y - f.y);
        const e = Math.max(0, 1 - Math.abs(d - f.front) / band) * f.k;
        if (e > 0) {
          a += e * WAVE_GAIN;
          size += e * 0.4;
        }
      }
      ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** 박 안에서의 위치(0~1)를 뚝 끊기지 않는 맥박 곡선으로 바꾼다. */
export function smoothPulse(phase: number): number {
  const c = 0.5 + 0.5 * Math.cos(phase * Math.PI * 2);
  return c * c;
}
