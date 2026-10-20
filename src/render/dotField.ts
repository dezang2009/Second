import { theme } from "./theme";

// 화면 전체를 덮는 점 격자. 박자에 맞춰 레인 쪽 점이 부드럽게 숨쉰다.
// 밝기 변화는 작게, 곡선은 매끄럽게 유지한다 (깜빡임 금지).

const BASE_ALPHA = 0.09;
const LANE_ALPHA = 0.05;
const BEAT_ALPHA = 0.035;
const COLUMNS = 22;

export interface LaneArea {
  x: number;
  width: number;
  bottom: number;
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
): void {
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, w, h);

  const gap = w / COLUMNS;
  const [r, g, b] = theme.dot;
  for (let y = gap / 2; y < h; y += gap) {
    for (let x = gap / 2; x < w; x += gap) {
      let a = BASE_ALPHA;
      let size = 0.9;
      if (x > lanes.x && x < lanes.x + lanes.width && y < lanes.bottom) {
        a += LANE_ALPHA + BEAT_ALPHA * pulse;
        size += 0.15 * pulse;
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
