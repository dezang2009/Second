// 기기마다 다른 설정: 싱크 보정, 노트 속도와 크기, 이펙트 세기, 소리 크기.
// 작은 값들이라 localStorage에 둔다. 읽기/쓰기가 막힌 환경에서도 기본값으로 동작한다.

export type EffectLevel = "off" | "low" | "normal";
/** 레인 배치 바꾸기: 그대로, 좌우 뒤집기, 곡마다 무작위로 섞기 */
export type LaneMod = "none" | "mirror" | "random";
/** 가리개: 없음, 판정선 가까이를 가림(히든), 화면 위쪽을 가림(서든) */
export type SightMod = "none" | "hidden" | "sudden";

export interface Settings {
  /** 판정 싱크(ms). +면 판정과 노트를 그만큼 늦춘다 (블루투스 이어폰처럼 소리가 늦게 나올 때) */
  audioOffsetMs: number;
  /** 화면 싱크(ms). +면 노트를 그만큼 더 일찍(위쪽에) 그린다 (화면이 늦게 보일 때). 판정에는 영향 없음 */
  visualOffsetMs: number;
  /** 노트 속도 1.0~10.0. 5.0이면 노트가 1.6초 동안 내려온다 */
  noteSpeed: number;
  /** 노트 크기 배율 0.7~1.4 */
  noteSize: number;
  effects: EffectLevel;
  hitSound: boolean;
  /** 0~1 */
  hitVolume: number;
  /** 0~1 */
  musicVolume: number;
  laneMod: LaneMod;
  sightMod: SightMod;
}

export const DEFAULT_SETTINGS: Settings = {
  audioOffsetMs: 0,
  visualOffsetMs: 0,
  noteSpeed: 5,
  noteSize: 1,
  effects: "normal",
  hitSound: false,
  hitVolume: 0.5,
  musicVolume: 1,
  laneMod: "none",
  sightMod: "none",
};

export const LIMITS = {
  audioOffsetMs: [-300, 300],
  visualOffsetMs: [-150, 150],
  noteSpeed: [1, 10],
  noteSize: [0.7, 1.4],
  hitVolume: [0, 1],
  musicVolume: [0, 1],
} as const;

const KEY = "rhythm.settings.v1";

function clamp(v: unknown, [lo, hi]: readonly [number, number], fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
}

/** 저장된 값을 검사해 범위를 벗어나거나 깨진 값은 기본값으로 바꾼다 */
export function sanitize(raw: unknown): Settings {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  return {
    audioOffsetMs: Math.round(clamp(r.audioOffsetMs, LIMITS.audioOffsetMs, d.audioOffsetMs)),
    visualOffsetMs: Math.round(clamp(r.visualOffsetMs, LIMITS.visualOffsetMs, d.visualOffsetMs)),
    noteSpeed: clamp(r.noteSpeed, LIMITS.noteSpeed, d.noteSpeed),
    noteSize: clamp(r.noteSize, LIMITS.noteSize, d.noteSize),
    effects: r.effects === "off" || r.effects === "low" || r.effects === "normal" ? r.effects : d.effects,
    hitSound: typeof r.hitSound === "boolean" ? r.hitSound : d.hitSound,
    hitVolume: clamp(r.hitVolume, LIMITS.hitVolume, d.hitVolume),
    musicVolume: clamp(r.musicVolume, LIMITS.musicVolume, d.musicVolume),
    laneMod: r.laneMod === "mirror" || r.laneMod === "random" ? r.laneMod : "none",
    sightMod: r.sightMod === "hidden" || r.sightMod === "sudden" ? r.sightMod : "none",
  };
}

function load(): Settings {
  try {
    const text = localStorage.getItem(KEY);
    return sanitize(text ? JSON.parse(text) : {});
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** 지금 설정. 바꿀 때는 updateSettings를 쓴다 */
export const settings: Settings = load();
const listeners = new Set<(s: Settings) => void>();

export function updateSettings(patch: Partial<Settings>): void {
  Object.assign(settings, sanitize({ ...settings, ...patch }));
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // 저장이 막혀도 이번 실행 동안은 바뀐 값으로 동작한다
  }
  for (const fn of listeners) fn(settings);
}

export function resetSettings(): void {
  updateSettings({ ...DEFAULT_SETTINGS });
}

export function onSettingsChange(fn: (s: Settings) => void): void {
  listeners.add(fn);
}

/** 노트가 화면 위에서 판정선까지 내려오는 시간(초) */
export function scrollSecFor(speed: number): number {
  return 8 / speed;
}

/** 이펙트 세기 배율 */
export function effectScale(level: EffectLevel): number {
  return level === "off" ? 0 : level === "low" ? 0.5 : 1;
}
