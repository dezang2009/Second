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
  /** 저음(킥 드럼, 베이스) 타격 세기 0~1 */
  kick?: number;
  /** 고음(스네어, 하이햇) 타격 세기 0~1 */
  snare?: number;
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

/** 2초 창 안에서 넘지 않도록 하는 초당 노트 수 (너무 빽빽하면 덜 중요한 노트부터 뺀다) */
const MAX_NPS: Record<Level, number> = { normal: 4, hard: 8 };
const DENSITY_WINDOW_SEC = 2;
/** 드럼(킥/스네어) 세기는 이 비율로 쳐서 전체 세기와 비교한다 */
const DRUM_WEIGHT = 0.9;

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

  // 5. 노트가 지나치게 빽빽한 구간은 덜 중요한 노트부터 뺀다 (마디 첫 박은 남긴다)
  limitDensity(drafts, input.barStarts, MAX_NPS[level], rel);

  // 6. 레인 배치
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

/**
 * onset마다 '주변 4초 안에서 가장 센 소리에 대한 세기 비율'.
 * 전체 세기, 킥(저음) 세기, 스네어(고음) 세기를 각각 따로 견줘 가장 큰 값을 쓴다.
 * 그래서 멜로디가 조용해도 드럼이 박자를 이끄는 곡은 드럼 타격에 노트가 놓인다.
 */
function relativeStrength(onsets: Onset[]): Map<Onset, number> {
  const out = new Map<Onset, number>();
  const keys: [(o: Onset) => number, number][] = [
    [(o) => o.strength, 1],
    [(o) => o.kick ?? 0, DRUM_WEIGHT],
    [(o) => o.snare ?? 0, DRUM_WEIGHT],
  ];
  let lo = 0;
  let hi = 0;
  for (const o of onsets) {
    while (onsets[lo].time < o.time - LOCAL_SEC) lo++;
    while (hi < onsets.length && onsets[hi].time <= o.time + LOCAL_SEC) hi++;
    let best = 0;
    for (const [get, weight] of keys) {
      let max = 0;
      for (let k = lo; k < hi; k++) max = Math.max(max, get(onsets[k]));
      if (max > 0) best = Math.max(best, (weight * get(o)) / max);
    }
    out.set(o, best);
  }
  return out;
}

interface DensityItem {
  slot: { time: number; kind: 0 | 1 | 2; beat: number; onset: Onset | null };
  end: number | null;
}

/** 노트 중요도: 마디 첫 박 > 소리가 있는 박/롱 노트 > 박자 채움 > 반박 > 1/4박 */
function priority(d: DensityItem, bars: ReadonlySet<number>): number {
  if (d.slot.kind === 0 && bars.has(d.slot.beat)) return 5;
  if (d.end !== null) return 4;
  if (d.slot.kind === 0) return d.slot.onset ? 4 : 3;
  return d.slot.kind === 1 ? 2 : 1;
}

/** 2초 창 안의 노트 수가 maxNps × 2를 넘지 않을 때까지 가장 덜 중요한(같으면 약한) 노트를 뺀다 */
export function limitDensity<T extends DensityItem>(items: T[], barStarts: readonly number[], maxNps: number, rel: Map<Onset, number>): void {
  const bars = new Set(barStarts);
  const cap = maxNps * DENSITY_WINDOW_SEC;
  for (;;) {
    let worst = -1;
    let lo = 0;
    for (let hi = 0; hi < items.length && worst < 0; hi++) {
      while (items[hi].slot.time - items[lo].slot.time >= DENSITY_WINDOW_SEC) lo++;
      if (hi - lo + 1 <= cap) continue;
      // 이 창에서 뺄 노트를 고른다
      let bestScore = Infinity;
      for (let k = lo; k <= hi; k++) {
        const p = priority(items[k], bars);
        if (p >= 5) continue;
        const score = p * 10 + (items[k].slot.onset ? rel.get(items[k].slot.onset!) ?? 0 : 0);
        if (score < bestScore) {
          bestScore = score;
          worst = k;
        }
      }
      if (worst < 0) return; // 뺄 수 있는 노트가 없다
    }
    if (worst < 0) return;
    items.splice(worst, 1);
  }
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
