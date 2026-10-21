// 기기 안(localStorage)에 진행 중인 인생과 명예의 전당을 저장한다.
// 저장 공간을 쓸 수 없는 환경(시크릿 모드 등)에서도 게임은 그대로 돌아가도록 모든 접근을 감싼다.

import type { Verdict } from "../game/score";
import type { Life } from "../game/types";

const CURRENT = "life.current";
const HALL = "life.hall";

export interface HallEntry {
  id: string;
  name: string;
  gender: string;
  age: number;
  cause: string;
  job: string;
  education: string;
  verdict: Verdict;
  /** 인생에서 기억할 만한 문장 몇 개 */
  highlights: string[];
  endedAt: number;
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 저장하지 못해도 플레이는 계속된다
  }
}

export function loadCurrent(): Life | null {
  const life = read<Life>(CURRENT);
  return life && life.version === 1 ? life : null;
}

export function saveCurrent(life: Life): void {
  write(CURRENT, life);
}

export function clearCurrent(): void {
  try {
    localStorage.removeItem(CURRENT);
  } catch {
    // 무시
  }
}

export function loadHall(): HallEntry[] {
  return read<HallEntry[]>(HALL) ?? [];
}

export function addToHall(entry: HallEntry): void {
  const hall = loadHall().filter((e) => e.id !== entry.id);
  hall.unshift(entry);
  write(HALL, hall.slice(0, 200));
}

/** 지금까지 한 번이라도 얻은 업적 */
export function unlockedAchievements(): Set<string> {
  return new Set(loadHall().flatMap((e) => e.verdict.achievements));
}

/** 저장 파일 내보내기용: 진행 중인 인생과 명예의 전당 전체 */
export function exportSave(): string {
  return JSON.stringify({ app: "life-sim", version: 1, current: loadCurrent(), hall: loadHall() });
}

export function importSave(text: string): boolean {
  try {
    const data = JSON.parse(text);
    if (data?.app !== "life-sim") return false;
    if (data.current) write(CURRENT, data.current);
    else clearCurrent();
    write(HALL, Array.isArray(data.hall) ? data.hall : []);
    return true;
  } catch {
    return false;
  }
}
