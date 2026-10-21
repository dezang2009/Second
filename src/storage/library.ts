import type { Level } from "../analysis/notes";
import type { Chart } from "../songs/types";

// 곡 보관함: 사용자가 추가한 음원과 직접 만든 채보, 최고 기록을 이 기기의 IndexedDB에 저장한다.
// 음원은 기기 밖으로 나가지 않는다 (저장소, APK, 서버 어디에도 올리지 않음).

export interface BestRecord {
  score: number;
  rank: string;
  maxCombo: number;
  at: number;
  /** 정확도(0~100). 예전 기록에는 없다 */
  accuracy?: number;
}

/** 곡마다 고를 수 있는 채보: 자동 EASY / NORMAL / HARD / EXPERT, 직접 만든 채보 */
export type Difficulty = Level | "user";

/** 클리어 램프: 끝까지 플레이, 미스 없이(FULL COMBO), 모두 PERFECT(ALL PERFECT) */
export type Lamp = "clear" | "fc" | "ap";
const LAMP_ORDER: Lamp[] = ["clear", "fc", "ap"];

/** 둘 중 더 높은 램프 */
export function betterLamp(a: Lamp | undefined, b: Lamp | undefined): Lamp | undefined {
  if (!a) return b;
  if (!b) return a;
  return LAMP_ORDER.indexOf(a) >= LAMP_ORDER.indexOf(b) ? a : b;
}

export interface SongRecord {
  id: string;
  /** 목록에 보이는 곡 이름. 바꿀 수 있다 */
  title: string;
  /** 음원 태그에서 읽은 가수. 없으면 비어 있다 */
  artist?: string;
  fileName: string;
  durationMs: number;
  addedAt: number;
  audio: Blob;
  /** 음원을 분석해 만든 자동 채보. 아직 분석 전이면 null */
  auto: Partial<Record<Level, Chart>> | null;
  /** 사용자가 에디터에서 저장한 채보 */
  userChart: Chart | null;
  /** 마지막으로 고른 난이도 */
  difficulty: Difficulty;
  /** 난이도마다 최고 기록 */
  bests: Partial<Record<Difficulty, BestRecord>>;
  /** 난이도마다 가장 높은 클리어 램프 (최고 점수와 따로 남긴다) */
  lamps: Partial<Record<Difficulty, Lamp>>;
  /** 즐겨찾기 */
  favorite: boolean;
  /** 마지막으로 플레이를 시작한 시각 (아직 안 했으면 null) */
  lastPlayedAt: number | null;
  playCount: number;
}

/** 예전 형식(기본 채보 연결, 최고 기록 하나)으로 저장된 곡을 지금 형식으로 맞춘다 */
function upgrade(raw: SongRecord & { builtinId?: unknown; best?: unknown }): SongRecord {
  const { builtinId: _b, best: _old, ...rest } = raw;
  return {
    ...rest,
    auto: rest.auto ?? null,
    userChart: rest.userChart ?? null,
    difficulty: rest.difficulty ?? (rest.userChart ? "user" : "normal"),
    bests: rest.bests ?? {},
    // 램프가 생기기 전 기록: 결과 화면까지 갔으니 적어도 클리어
    lamps: rest.lamps ?? Object.fromEntries(Object.keys(rest.bests ?? {}).map((d) => [d, "clear"])),
    favorite: rest.favorite ?? false,
    lastPlayedAt: rest.lastPlayedAt ?? null,
    playCount: rest.playCount ?? 0,
  };
}

const DB_NAME = "rhythm";
const STORE = "songs";

let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const store = (await db()).transaction(STORE, mode).objectStore(STORE);
  return new Promise((resolve, reject) => {
    const req = fn(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function listSongs(): Promise<SongRecord[]> {
  const all = await run<SongRecord[]>("readonly", (s) => s.getAll());
  return all.map(upgrade).sort((a, b) => a.addedAt - b.addedAt);
}

export async function getSong(id: string): Promise<SongRecord | undefined> {
  const raw = await run<SongRecord | undefined>("readonly", (s) => s.get(id));
  return raw && upgrade(raw);
}

export async function putSong(song: SongRecord): Promise<void> {
  await run("readwrite", (s) => s.put(song));
}

/** 모든 곡과 기록을 지운다 (데이터베이스를 통째로 삭제) */
export async function wipeAll(): Promise<void> {
  if (dbPromise) {
    (await dbPromise).close();
    dbPromise = null;
  }
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("blocked"));
  });
}

export async function deleteSong(id: string): Promise<void> {
  await run("readwrite", (s) => s.delete(id));
}

export async function updateSong(id: string, patch: Partial<Omit<SongRecord, "id">>): Promise<SongRecord> {
  const song = await getSong(id);
  if (!song) throw new Error("곡을 찾을 수 없어요.");
  const next = { ...song, ...patch };
  await putSong(next);
  return next;
}

export function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
