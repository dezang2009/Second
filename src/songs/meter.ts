import type { Chart } from "./types";

// 곡 안의 박/마디 위치를 계산한다.
// 채보에 실제 박 시각(beats)과 마디 시작(bars)이 있으면 그대로 따르고 (템포가 흔들리는 연주),
// 없으면 bpm과 offsetMs로 일정한 박을 만든다. bpm이 0이면 박 정보가 없는 곡이다.

export interface BeatPosition {
  /** 첫 박부터 센 박 번호(소수 포함). 첫 박 전이면 음수 */
  beat: number;
  /** 1부터 시작하는 마디 번호. 첫 마디 전이면 0 */
  bar: number;
  /** 마디 안에서 1부터 시작하는 박 번호 */
  beatInBar: number;
  /** 현재 박 안에서 얼마나 지났는지 0~1 */
  phase: number;
}

export class Meter {
  /** 박 시각(초), 오름차순 */
  readonly beats: number[];
  /** 각 박이 마디 첫 박인지 */
  readonly downbeat: boolean[];
  private readonly barOfBeat: number[];
  private readonly beatInBarOf: number[];

  constructor(chart: Chart) {
    if (chart.beats?.length) {
      this.beats = chart.beats.map((ms) => ms / 1000);
      const bars = new Set(chart.bars ?? []);
      this.downbeat = chart.beats.map((ms) => bars.has(ms));
    } else if (!chart.bpm) {
      this.beats = [];
      this.downbeat = [];
    } else {
      const beatSec = 60 / chart.bpm;
      const end = Math.max(chart.durationMs / 1000, chart.offsetMs / 1000 + beatSec);
      this.beats = [];
      this.downbeat = [];
      for (let i = 0, t = chart.offsetMs / 1000; t <= end; i++, t += beatSec) {
        this.beats.push(t);
        this.downbeat.push(i % chart.beatsPerBar === 0);
      }
    }

    // 박마다 몇 번째 마디의 몇 번째 박인지 미리 센다 (첫 마디 앞의 못갖춘마디는 0마디)
    this.barOfBeat = [];
    this.beatInBarOf = [];
    let bar = 0;
    let inBar = chart.beatsPerBar - this.downbeat.indexOf(true);
    for (let i = 0; i < this.beats.length; i++) {
      if (this.downbeat[i]) {
        bar++;
        inBar = 0;
      }
      inBar++;
      this.barOfBeat.push(bar);
      this.beatInBarOf.push(inBar);
    }
  }

  get hasBeats(): boolean {
    return this.beats.length > 1;
  }

  /**
   * 가장 가까운 박 격자 위치로 맞춘다. division=2면 반박, 4면 1/4박.
   * 박 정보가 없거나 division이 0이면 그대로 돌려준다.
   */
  snap(timeSec: number, division: number): number {
    const b = this.beats;
    if (!division || b.length < 2) return timeSec;
    let i = 0;
    if (timeSec >= b[b.length - 1]) i = b.length - 2;
    else if (timeSec > b[0]) i = this.indexAtOrBefore(timeSec);
    // 첫 박 앞이나 마지막 박 뒤는 가장 가까운 박 간격을 이어서 쓴다
    const len = b[i + 1] - b[i];
    const steps = Math.round(((timeSec - b[i]) / len) * division);
    return b[i] + (steps / division) * len;
  }

  private indexAtOrBefore(timeSec: number): number {
    const b = this.beats;
    let lo = 0;
    let hi = b.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (b[mid] <= timeSec) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  at(timeSec: number): BeatPosition {
    const b = this.beats;
    if (b.length === 0 || timeSec < b[0]) {
      const first = b[0] ?? 0;
      const step = b.length > 1 ? b[1] - b[0] : 0.5;
      return { beat: (timeSec - first) / step, bar: 0, beatInBar: 0, phase: 0 };
    }
    const lo = this.indexAtOrBefore(timeSec);
    const next = lo + 1 < b.length ? b[lo + 1] : b[lo] + (lo > 0 ? b[lo] - b[lo - 1] : 0.5);
    const phase = Math.min(1, (timeSec - b[lo]) / (next - b[lo]));
    return { beat: lo + phase, bar: this.barOfBeat[lo], beatInBar: this.beatInBarOf[lo], phase };
  }
}
