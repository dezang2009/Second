import type { ChartNote } from "../songs/types";

// 박과 onset으로 NORMAL / HARD 채보를 만든다.
// 원칙: 음악이 들리는 동안은 모든 박에 노트가 있다 (박자감이 끊기지 않게).
//  - 그 박에 소리가 새로 시작되면 그 소리(멜로디 높이)로 레인을 정한다.
//  - 소리가 이어지기만 하면(새 타격 없음) 두 박 이상이면 롱 노트, 한 박이면 박자 노트로 채운다.
//  - HARD는 반박/1/4박의 뚜렷한 소리와 동시 노트를 더한다.

const LANES = 4;

export interface Onset {
  /** 실제 소리가 시작된 시각(초) */
  time: number;
  /** 0~1로 정규화한 세기 */
  strength: number;
  /** 멜로디 음높이(MIDI). 알 수 없으면 null */
  midi: number | null;
  /** 0.5초 뒤 남은 비율 */
  sustain: number;
}

export interface NoteInput {
  /** 박 시각(초) */
  beats: number[];
  barStarts: number[];
  onsets: Onset[];
  /** 박마다 음악이 들리는지 */
  beatActive: boolean[];
}

export type Level = "normal" | "hard";

// 세기 기준은 곡 전체가 아니라 주변 4초 안에서 가장 센 소리에 대한 비율이다.
// (조용한 구간의 소리도, 거의 모든 소리가 진짜 음인 곡도 공정하게 다룬다)
interface Rules {
  /** 반박에 노트를 놓는 세기 하한 */
  half: number;
  /** 1/4박 세기 하한 (null이면 안 씀) */
  quarter: number | null;
  /** 노트 사이 최소 간격(초) */
  minGap: number;
  /** 동시 노트를 놓는 마디 첫 박 세기 하한 */
  chord: number;
  chordEveryBars: number;
}

const RULES: Record<Level, Rules> = {
  normal: { half: 0.7, quarter: null, minGap: 0.24, chord: 0.9, chordEveryBars: 4 },
  hard: { half: 0.2, quarter: 0.45, minGap: 0.11, chord: 0.7, chordEveryBars: 2 },
};
const LOCAL_SEC = 4;

/** 격자에 붙일 때 허용하는 오차: 70ms 또는 격자 간격의 20% 중 작은 값 */
function snapTolerance(step: number): number {
  return Math.min(0.07, step * 0.2);
}

interface Slot {
  time: number;
  /** 0 정박, 1 반박, 2 1/4박 */
  kind: 0 | 1 | 2;
  beat: number;
  onset: Onset | null;
}

export function buildNotes(input: NoteInput, level: Level): ChartNote[] {
  const rules = RULES[level];
  const { beats, onsets } = input;
  if (beats.length < 2) return [];
  const rel = relativeStrength(onsets);

  // 1. 정박 슬롯: 들리는 박마다 하나씩
  const slots: Slot[] = [];
  const beatSlot = new Map<number, Slot>();
  for (let i = 0; i < beats.length; i++) {
    if (!input.beatActive[i]) continue;
    const s: Slot = { time: beats[i], kind: 0, beat: i, onset: null };
    slots.push(s);
    beatSlot.set(i, s);
  }

  // 2. onset을 가장 가까운 격자(정박/반박/1/4박)에 붙인다
  for (const o of onsets) {
    let i = upperIndex(beats, o.time);
    if (i < 0) i = 0;
    if (i >= beats.length - 1) i = beats.length - 2;
    const len = beats[i + 1] - beats[i];
    const frac = (o.time - beats[i]) / len;
    const quarter = Math.round(frac * 4);
    const beatIdx = i + Math.floor(quarter / 4);
    const sub = quarter % 4;
    const time = beats[i] + (quarter / 4) * len;
    const step = sub === 0 ? len : sub === 2 ? len / 2 : len / 4;
    if (Math.abs(o.time - time) > snapTolerance(step)) continue;
    if (sub === 0) {
      const s = beatSlot.get(beatIdx);
      if (s && (!s.onset || o.strength > s.onset.strength)) s.onset = o;
      continue;
    }
    const kind = sub === 2 ? 1 : 2;
    if (kind === 1 && rel.get(o)! < rules.half) continue;
    if (kind === 2 && (rules.quarter === null || rel.get(o)! < rules.quarter || len / 4 < rules.minGap)) continue;
    if (!input.beatActive[i] && !input.beatActive[i + 1]) continue;
    slots.push({ time, kind, beat: i, onset: o });
  }
  slots.sort((a, b) => a.time - b.time || a.kind - b.kind);

  // 3. 너무 가까운 슬롯은 정박 > 강한 쪽 순으로 하나만 남긴다
  const kept: Slot[] = [];
  for (const s of slots) {
    const prev = kept[kept.length - 1];
    if (prev && s.time - prev.time < rules.minGap - 1e-6) {
      const better = s.kind < prev.kind || (s.kind === prev.kind && (s.onset?.strength ?? 0) > (prev.onset?.strength ?? 0));
      if (better && prev.kind !== 0) kept[kept.length - 1] = s;
      continue;
    }
    kept.push(s);
  }

  // 4. 새 타격이 없는 정박이 두 박 이상 이어지면, 앞 노트를 그만큼 늘린 롱 노트로 바꾼다
  type Draft = { slot: Slot; end: number | null };
  const drafts: Draft[] = [];
  for (let k = 0; k < kept.length; k++) {
    const s = kept[k];
    if (s.kind === 0 && !s.onset) {
      const prev = drafts[drafts.length - 1];
      // 이어지는 '빈 박' 수를 센다
      let run = 0;
      while (k + run < kept.length && kept[k + run].kind === 0 && !kept[k + run].onset) run++;
      const lastEmpty = kept[k + run - 1];
      // 빈 박들은 모두 소리가 들리는 박이다(조용한 박은 슬롯이 없다). 바로 앞 노트의 소리가 이어지는 것으로 본다
      const sustained = prev && prev.end === null && prev.slot.onset && lastEmpty.beat - prev.slot.beat === run;
      if (run >= 2 && sustained) {
        prev.end = lastEmpty.time;
        k += run - 1;
        continue;
      }
    }
    drafts.push({ slot: s, end: null });
  }

  // 5. 레인 배치
  const notes: ChartNote[] = [];
  const heldUntil = new Array(LANES).fill(-Infinity);
  const pitches = drafts.map((d) => d.slot.onset?.midi ?? null);
  const times = drafts.map((d) => d.slot.time);
  let prevLane = 1;
  let prevPitch: number | null = null;
  let dir = 1;
  const history: number[] = [];
  let lastChordBar = -Infinity;
  for (let k = 0; k < drafts.length; k++) {
    const d = drafts[k];
    const t = d.slot.time;
    const p = pitches[k];
    let lane: number;
    if (p !== null) {
      // 앞뒤 4초 안의 음역에서 이 음이 어디쯤인지
      let lo = Infinity;
      let hi = -Infinity;
      for (let j = 0; j < drafts.length; j++) {
        const q = pitches[j];
        if (q !== null && Math.abs(times[j] - t) <= 4) {
          lo = Math.min(lo, q);
          hi = Math.max(hi, q);
        }
      }
      lane = hi > lo ? Math.min(LANES - 1, Math.floor(((p - lo) / (hi - lo)) * LANES)) : prevLane;
      if (prevPitch !== null && p !== prevPitch && lane === prevLane) lane = clamp(lane + (p > prevPitch ? 1 : -1));
    } else {
      // 소리 정보가 없는 박자 노트는 한 칸씩 오가며 이어 준다
      lane = prevLane + dir;
      if (lane < 0 || lane >= LANES) {
        dir = -dir;
        lane = prevLane + dir;
      }
    }
    // 같은 레인 연타는 빠르면 3번째부터, 느려도 4번째부터 옆 레인으로
    const n = history.length;
    if (n >= 2 && history[n - 1] === lane && history[n - 2] === lane) {
      const fast = t - times[k - 2] < 0.6;
      if (fast || (n >= 3 && history[n - 3] === lane)) lane = lane < LANES - 1 ? lane + 1 : lane - 1;
    }
    // 롱 노트를 누르고 있는 레인은 피한다
    lane = freeLane(lane, t, heldUntil);
    if (lane < 0) continue;

    const note: ChartNote = { t: Math.round(t * 1000), lane };
    if (d.end !== null) {
      note.len = Math.round((d.end - t) * 1000);
      heldUntil[lane] = d.end;
    }
    notes.push(note);
    history.push(lane);
    prevLane = lane;
    if (p !== null) prevPitch = p;

    // 동시 노트: 강하게 시작하는 마디 첫 박에 가끔
    const isBar = d.slot.kind === 0 && input.barStarts.includes(d.slot.beat);
    const barNo = input.barStarts.indexOf(d.slot.beat);
    const strong = d.slot.onset ? rel.get(d.slot.onset)! >= rules.chord : false;
    if (isBar && strong && barNo - lastChordBar >= rules.chordEveryBars && heldUntil.every((h) => h <= t)) {
      const partner = freeLane(LANES - 1 - lane !== lane ? LANES - 1 - lane : (lane + 2) % LANES, t, heldUntil, lane);
      if (partner >= 0) {
        notes.push({ t: note.t, lane: partner });
        lastChordBar = barNo;
      }
    }
  }
  return notes.sort((a, b) => a.t - b.t || a.lane - b.lane);
}

/** onset마다 주변 4초 안에서 가장 센 소리에 대한 세기 비율 */
function relativeStrength(onsets: Onset[]): Map<Onset, number> {
  const out = new Map<Onset, number>();
  let lo = 0;
  let hi = 0;
  for (const o of onsets) {
    while (onsets[lo].time < o.time - LOCAL_SEC) lo++;
    while (hi < onsets.length && onsets[hi].time <= o.time + LOCAL_SEC) hi++;
    let max = 0;
    for (let k = lo; k < hi; k++) max = Math.max(max, onsets[k].strength);
    out.set(o, max > 0 ? o.strength / max : 0);
  }
  return out;
}

function clamp(lane: number): number {
  return Math.max(0, Math.min(LANES - 1, lane));
}

/** 원하는 레인이 롱 노트로 막혀 있으면 가장 가까운 빈 레인. 없으면 -1 */
function freeLane(want: number, t: number, heldUntil: number[], exclude = -1): number {
  const order = [0, 1, -1, 2, -2, 3, -3].map((d) => want + d).filter((l) => l >= 0 && l < LANES);
  for (const l of order) if (l !== exclude && heldUntil[l] <= t + 1e-6) return l;
  return -1;
}

/** time 이하인 마지막 박 인덱스 (첫 박 앞이면 -1) */
function upperIndex(beats: number[], time: number): number {
  let lo = 0;
  let hi = beats.length - 1;
  if (time < beats[0]) return -1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (beats[mid] <= time) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
