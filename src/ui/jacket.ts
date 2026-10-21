import { type AudioTags, readTags } from "../audio/tags";
import type { SongRecord } from "../storage/library";

// 곡 재킷: 음원에 앨범 아트가 있으면 그 그림, 없으면 곡 이름으로 만든 그라데이션 표지.
// 태그는 곡마다 한 번만 읽고 이번 실행 동안 기억한다.

const tagCache = new Map<string, Promise<AudioTags & { artUrl: string | null }>>();

export function tagsOf(song: Pick<SongRecord, "id" | "audio">): Promise<AudioTags & { artUrl: string | null }> {
  let p = tagCache.get(song.id);
  if (!p) {
    p = readTags(song.audio).then((t) => ({ ...t, artUrl: t.picture ? URL.createObjectURL(t.picture) : null }));
    tagCache.set(song.id, p);
  }
  return p;
}

/** 지운 곡의 그림을 놓아 준다 */
export function forgetTags(id: string): void {
  const p = tagCache.get(id);
  tagCache.delete(id);
  void p?.then((t) => t.artUrl && URL.revokeObjectURL(t.artUrl));
}

/** 이름에서 늘 같은 색이 나오도록 */
function hueOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0) % 360;
}

export function jacketEl(song: Pick<SongRecord, "id" | "audio" | "title">, size: "big" | "small"): HTMLElement {
  const el = document.createElement("div");
  el.className = `jacket ${size}`;
  const hue = hueOf(song.title);
  el.style.setProperty("--j1", `hsl(${hue} 62% 80%)`);
  el.style.setProperty("--j2", `hsl(${(hue + 50) % 360} 58% 70%)`);
  const glyph = document.createElement("span");
  glyph.className = "jacket-glyph";
  glyph.textContent = Array.from(song.title.trim())[0]?.toUpperCase() ?? "♪";
  el.append(glyph);
  void tagsOf(song).then((t) => {
    if (!t.artUrl) return;
    const img = document.createElement("img");
    img.alt = "";
    img.decoding = "async";
    img.src = t.artUrl;
    img.addEventListener("load", () => el.classList.add("has-art"));
    el.append(img);
  });
  return el;
}
