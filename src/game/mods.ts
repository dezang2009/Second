import type { LaneMod, SightMod } from "../settings";
import type { Chart } from "../songs/types";

// 플레이 옵션(모드). 채보 자체는 바꾸지 않고, 플레이할 때만 레인을 바꾸거나 화면 일부를 가린다.

const LANES = 4;

/** 레인 번호를 바꾼 새 채보. 동시 노트, 롱 노트 겹침 같은 손 배치 규칙은 그대로 지켜진다 (레인을 통째로 바꾸므로) */
export function applyLaneMod(chart: Chart, mod: LaneMod, random: () => number = Math.random): Chart {
  if (mod === "none") return chart;
  const map = mod === "mirror" ? [3, 2, 1, 0] : shuffledLanes(random);
  return { ...chart, notes: chart.notes.map((n) => ({ ...n, lane: map[n.lane] })) };
}

/** 원래와 같은 배치는 빼고 섞는다 (섞었는데 그대로면 재미가 없으니) */
function shuffledLanes(random: () => number): number[] {
  for (;;) {
    const map = Array.from({ length: LANES }, (_, i) => i);
    for (let i = LANES - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [map[i], map[j]] = [map[j], map[i]];
    }
    if (map.some((v, i) => v !== i)) return map;
  }
}

export const LANE_MOD_LABEL: Record<LaneMod, string> = { none: "기본", mirror: "미러", random: "랜덤" };
export const SIGHT_MOD_LABEL: Record<SightMod, string> = { none: "없음", hidden: "히든", sudden: "서든" };

/** 결과, 플레이 화면에 붙이는 옵션 이름 (기본이면 빈 글자) */
export function modsLabel(lane: LaneMod, sight: SightMod): string {
  return [lane !== "none" ? LANE_MOD_LABEL[lane] : "", sight !== "none" ? SIGHT_MOD_LABEL[sight] : ""].filter(Boolean).join(" · ");
}
