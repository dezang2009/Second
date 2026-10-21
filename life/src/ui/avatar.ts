// 16×16 픽셀 캐릭터. 나이와 성별, 지금 하는 일에 따라 머리색과 옷이 바뀐다.

import { inCollege, inMilitary } from "../game/life";
import type { Gender, Life } from "../game/types";

const BASE = [
  "....HHHHHHHH....",
  "...HHHHHHHHHH...",
  "...HHHHHHHHHH...",
  "...HSSSSSSSSH...",
  "...SSSSSSSSSS...",
  "...SSESSSSESS...",
  "...SSESSSSESS...",
  "...RSSSSSSSSR...",
  "....SSSMMSSS....",
  ".....SSSSSS.....",
  "....CCCCCCCC....",
  "...CCCLCCLCCC...",
  "...SCCCCCCCCS...",
  "....PPPPPPPP....",
  "....PPP..PPP....",
  "....FFF..FFF....",
];

interface Look {
  gender: Gender;
  age: number;
  shirt: string;
  pants: string;
  alive?: boolean;
}

const SKIN = "#f6d2b4";

function hairColor(age: number): string {
  if (age >= 75) return "#e9e9ef";
  if (age >= 60) return "#a9adb8";
  return "#3a2e2a";
}

/** 지금 상태에 맞는 옷 색 */
export function outfit(life: Life): { shirt: string; pants: string } {
  const a = life.age;
  if (a <= 7) return { shirt: "#ffd166", pants: "#8ecae6" };
  if (a <= 18) return { shirt: "#ffffff", pants: "#3d4a7a" };
  if (inMilitary(life)) return { shirt: "#6b7a3a", pants: "#55612e" };
  if (inCollege(life)) return { shirt: "#7fb3ff", pants: "#44506b" };
  if (life.flags.retired || a >= 65) return { shirt: "#b08968", pants: "#6b5b4e" };
  switch (life.job?.id) {
    case "shop":
      return { shirt: "#f2a65a", pants: "#4b4f5c" };
    case "artist":
      return { shirt: "#b48ee0", pants: "#3f3a4f" };
    case "athlete":
      return { shirt: "#e5484d", pants: "#ffffff" };
    case "parttime":
      return { shirt: "#59c3a3", pants: "#44506b" };
    case undefined:
      return { shirt: "#9aa4b2", pants: "#4b5563" };
    default:
      return { shirt: "#3a4256", pants: "#2c3242" };
  }
}

export function lifeAvatar(life: Life): string {
  return avatarSvg({ gender: life.gender, age: life.age, ...outfit(life), alive: life.alive });
}

export function avatarSvg(look: Look): string {
  const grid = BASE.map((r) => r.split(""));
  // 아기는 머리숱이 적다
  if (look.age <= 2) {
    grid[0] = "................".split("");
    grid[1] = "......HHHH......".split("");
  }
  // 긴 머리: 얼굴 옆으로 머리카락을 내린다
  if (look.gender === "여" && look.age > 2) {
    for (let y = 3; y <= 10; y++) {
      grid[y][2] = "H";
      grid[y][13] = "H";
    }
    grid[4][3] = "H";
    grid[4][12] = "H";
  }
  const colors: Record<string, string> = {
    H: hairColor(look.age),
    S: SKIN,
    E: "#2a2730",
    M: "#d9786f",
    R: "#f4b0a6",
    C: look.shirt,
    L: shade(look.shirt),
    P: look.pants,
    F: "#2f2f38",
  };
  let rects = "";
  grid.forEach((row, y) =>
    row.forEach((ch, x) => {
      if (ch !== ".") rects += `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${colors[ch]}"/>`;
    }),
  );
  const style = look.alive === false ? ' style="filter:grayscale(1);opacity:.6"' : "";
  return `<svg class="avatar-svg" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true"${style}>${rects}</svg>`;
}

/** 옷 주름처럼 보이게 조금 어두운 색 */
function shade(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.round(v * 0.82));
  const r = f(n >> 16),
    g = f((n >> 8) & 255),
    b = f(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
