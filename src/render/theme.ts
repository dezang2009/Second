// 밝은 그라데이션 테마. DESIGN.md "화면 규칙"과 style.css의 :root 값과 같게 유지한다.
// 배경은 연한 하늘색 → 라일락 → 복숭아색으로 옅게 흐르고, 글자는 진한 남색.

export const FONT = '"Pretendard Variable", Pretendard, system-ui, -apple-system, "Noto Sans KR", sans-serif';

export const theme = {
  bg: ["#dde4f6", "#ebe5f4", "#f7e9e6"] as const,
  ink: "#2f3552",
  muted: "#6f7591",
  accent: "#6e7fdc",
  /** 점 격자 색(rgb) */
  dot: [64, 74, 120] as const,
  /** 레인 노트 색: [밝은 위쪽, 진한 아래쪽]. 바깥 레인은 연보라, 안쪽 레인은 연분홍 */
  noteOuter: ["#93a1ef", "#6f80dd"] as const,
  noteInner: ["#f3a9c3", "#df82a6"] as const,
  /** 레인 바탕 */
  track: "rgba(255,255,255,0.40)",
  miss: "#a3a7ba",
};

export function laneColors(lane: number): readonly [string, string] {
  return lane === 0 || lane === 3 ? theme.noteOuter : theme.noteInner;
}

export function font(weight: number, px: number): string {
  return `${weight} ${px}px ${FONT}`;
}

/** 캔버스 전체에 배경 그라데이션을 칠한다 */
export function paintBackground(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const g = ctx.createLinearGradient(0, 0, w * 0.4, h);
  g.addColorStop(0, theme.bg[0]);
  g.addColorStop(0.5, theme.bg[1]);
  g.addColorStop(1, theme.bg[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

export function rgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${alpha})`;
}
