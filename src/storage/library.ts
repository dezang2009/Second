import type { Chart } from "../songs/types";

// 곡 보관함: 사용자가 추가한 음원과 직접 만든 채보, 최고 기록을 이 기기의 IndexedDB에 저장한다.
// 음원은 기기 밖으로 나가지 않는다 (저장소, APK, 서버 어디에도 올리지 않음).

export interface BestRecord {
  score: number;
  rank: string;
  maxCombo: number;
  at: number;
}

/** 곡마다 고를 수 있는 채보: 자동 NORMAL, 자동 HARD, 직접 만든 채보 */
export type Difficulty = "normal" | "hard" | "user";

export interface SongRecord {
  id: string;
  /** 목록에 보이는 곡 이름. 바꿀 수 있다 */
  title: string;
  fileName: string;
  durationMs: number;
  addedAt: number;
  audio: Blob;
  /** 음원을 분석해 만든 자동 채보. 아직 분석 전이면 null */
  auto: { normal: Chart; hard: Chart } | null;
  /** 사용자가 에디터에서 저장한 채보 */
  userChart: Chart | null;
  /** 마지막으로 고른 난이도 */
  difficulty: Difficulty;
  /** 난이도마다 최고 기록 */
  bests: Partial<Record<Difficulty, BestRecord>>;
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
