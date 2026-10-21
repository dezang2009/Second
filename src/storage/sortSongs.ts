import type { SongRecord } from "./library";

// 곡 목록 검색과 정렬. 즐겨찾기는 언제나 위에 둔다.

export type SongSort = "recent" | "added" | "name" | "score";

export interface ListQuery {
  sort: SongSort;
  /** 곡 이름이나 가수에 들어 있어야 하는 글자 (대소문자, 띄어쓰기 무시) */
  search: string;
  favoritesOnly: boolean;
}

const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, "");

function bestScore(song: SongRecord): number {
  return Math.max(-1, ...Object.values(song.bests).map((b) => b?.score ?? -1));
}

export function querySongs(songs: readonly SongRecord[], q: ListQuery): SongRecord[] {
  const needle = normalize(q.search);
  const filtered = songs.filter((s) => (!q.favoritesOnly || s.favorite) && (!needle || normalize(s.title).includes(needle) || normalize(s.artist ?? "").includes(needle)));
  const by: Record<SongSort, (a: SongRecord, b: SongRecord) => number> = {
    // 플레이한 적 없는 곡은 최근 플레이 순에서 뒤로, 그 안에서는 최근에 추가한 순
    recent: (a, b) => (b.lastPlayedAt ?? -1) - (a.lastPlayedAt ?? -1) || b.addedAt - a.addedAt,
    added: (a, b) => b.addedAt - a.addedAt,
    name: (a, b) => a.title.localeCompare(b.title, "ko"),
    score: (a, b) => bestScore(b) - bestScore(a) || a.title.localeCompare(b.title, "ko"),
  };
  return filtered.sort((a, b) => Number(b.favorite) - Number(a.favorite) || by[q.sort](a, b));
}

/** "방금", "5분 전", "3시간 전", "2일 전" */
export function timeAgo(at: number, now = Date.now()): string {
  const sec = Math.max(0, (now - at) / 1000);
  if (sec < 60) return "방금";
  if (sec < 3600) return `${Math.floor(sec / 60)}분 전`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}시간 전`;
  if (sec < 86400 * 30) return `${Math.floor(sec / 86400)}일 전`;
  return `${Math.floor(sec / (86400 * 30))}달 전`;
}
