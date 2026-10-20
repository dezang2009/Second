import { describe, expect, it } from "vitest";
import type { SongRecord } from "./library";
import { querySongs, timeAgo } from "./sortSongs";

function song(id: string, over: Partial<SongRecord> = {}): SongRecord {
  return {
    id,
    title: id,
    fileName: `${id}.mp3`,
    durationMs: 1000,
    addedAt: 0,
    audio: new Blob(),
    auto: null,
    userChart: null,
    difficulty: "normal",
    bests: {},
    favorite: false,
    lastPlayedAt: null,
    playCount: 0,
    ...over,
  };
}

const songs = [
  song("Always with Me", { addedAt: 1, lastPlayedAt: 100, bests: { normal: { score: 900000, rank: "A", maxCombo: 1, at: 1 } } }),
  song("밤양갱", { addedAt: 3, lastPlayedAt: 300 }),
  song("Lemon", { addedAt: 2, favorite: true, bests: { hard: { score: 950000, rank: "S", maxCombo: 1, at: 1 } } }),
  song("가나다", { addedAt: 4 }),
];
const ids = (list: SongRecord[]) => list.map((s) => s.id);

describe("querySongs", () => {
  it("keeps favorites on top, then sorts", () => {
    expect(ids(querySongs(songs, { sort: "recent", search: "", favoritesOnly: false }))).toEqual(["Lemon", "밤양갱", "Always with Me", "가나다"]);
    expect(ids(querySongs(songs, { sort: "added", search: "", favoritesOnly: false }))).toEqual(["Lemon", "가나다", "밤양갱", "Always with Me"]);
    expect(ids(querySongs(songs, { sort: "score", search: "", favoritesOnly: false }))).toEqual(["Lemon", "Always with Me", "가나다", "밤양갱"]);
  });

  it("searches ignoring case and spaces", () => {
    expect(ids(querySongs(songs, { sort: "name", search: "alwayswith", favoritesOnly: false }))).toEqual(["Always with Me"]);
    expect(ids(querySongs(songs, { sort: "name", search: "양 갱", favoritesOnly: false }))).toEqual(["밤양갱"]);
  });

  it("can show favorites only", () => {
    expect(ids(querySongs(songs, { sort: "name", search: "", favoritesOnly: true }))).toEqual(["Lemon"]);
  });
});

describe("timeAgo", () => {
  it("reads naturally", () => {
    const now = 1_000_000_000;
    expect(timeAgo(now - 10_000, now)).toBe("방금");
    expect(timeAgo(now - 5 * 60_000, now)).toBe("5분 전");
    expect(timeAgo(now - 3 * 3_600_000, now)).toBe("3시간 전");
    expect(timeAgo(now - 2 * 86_400_000, now)).toBe("2일 전");
  });
});
