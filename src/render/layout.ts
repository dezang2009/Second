// 플레이 화면의 레인 배치. 렌더링과 (다음 단계의) 터치 판정이 같은 값을 쓴다.

export const LANES = 4;

export interface Layout {
  width: number;
  height: number;
  /** 레인 영역 왼쪽 끝 x */
  laneLeft: number;
  /** 레인 하나의 폭 */
  laneWidth: number;
  /** 판정선 y. 화면 아래에서 20% 위 */
  judgeY: number;
}

export function computeLayout(width: number, height: number): Layout {
  // 폰 세로 화면에서는 폭의 72%, 넓은 화면에서는 너무 퍼지지 않게 높이 기준으로 제한
  const total = Math.min(width * 0.72, height * 0.45);
  return {
    width,
    height,
    laneLeft: (width - total) / 2,
    laneWidth: total / LANES,
    judgeY: height * 0.8,
  };
}

export function laneCenterX(layout: Layout, lane: number): number {
  return layout.laneLeft + layout.laneWidth * (lane + 0.5);
}
