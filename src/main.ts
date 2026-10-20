// 임시 화면: APK 자동 빌드가 실제 폰에서 동작하는지 확인하기 위한 4레인 터치 테스트.
// 게임 본체(노트, 판정, 음악)는 MVP 단계에서 이 자리를 대체한다.

const LANES = 4;
const LANE_COLORS = ["#ff5c8a", "#ffd166", "#5ce1a8", "#5cb8ff"];

const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

let width = 0;
let height = 0;

// pointerId -> 누르고 있는 레인
const activePointers = new Map<number, number>();
const flash = new Array<number>(LANES).fill(0);
let tapCount = 0;

function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  width = canvas.clientWidth;
  height = canvas.clientHeight;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function laneAt(x: number): number {
  return Math.min(LANES - 1, Math.max(0, Math.floor((x / width) * LANES)));
}

canvas.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  const lane = laneAt(e.clientX);
  activePointers.set(e.pointerId, lane);
  flash[lane] = 1;
  tapCount++;
});

const release = (e: PointerEvent) => activePointers.delete(e.pointerId);
canvas.addEventListener("pointerup", release);
canvas.addEventListener("pointercancel", release);

function draw(): void {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);

  const laneWidth = width / LANES;
  const judgeY = height * 0.82;
  const held = new Set(activePointers.values());

  for (let i = 0; i < LANES; i++) {
    const x = i * laneWidth;
    if (held.has(i)) flash[i] = 1;
    if (flash[i] > 0) {
      const g = ctx.createLinearGradient(0, judgeY, 0, judgeY - height * 0.5);
      g.addColorStop(0, hexAlpha(LANE_COLORS[i], 0.6 * flash[i]));
      g.addColorStop(1, hexAlpha(LANE_COLORS[i], 0));
      ctx.fillStyle = g;
      ctx.fillRect(x, judgeY - height * 0.5, laneWidth, height * 0.5);
      flash[i] = Math.max(0, flash[i] - 0.06);
    }
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.fillRect(x, 0, 1, height);
  }

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, judgeY - 1, width, 2);

  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = "600 20px system-ui, sans-serif";
  ctx.fillText("터치 테스트", width / 2, height * 0.2);
  ctx.font = "14px system-ui, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.fillText(`탭 ${tapCount}회 · 동시 터치 ${activePointers.size}개`, width / 2, height * 0.2 + 28);

  requestAnimationFrame(draw);
}

function hexAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

window.addEventListener("resize", resize);
resize();
requestAnimationFrame(draw);
