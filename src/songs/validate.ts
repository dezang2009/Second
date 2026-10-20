import type { Chart, ChartNote } from "./types";

// 가져온 채보 파일(JSON)을 검사한다. 밖에서 들어온 파일이므로 형식이 틀리면 이유를 알려주고 거부한다.

export class ChartFormatError extends Error {}

const LANES = 4;
const MAX_NOTES = 20000;

export function parseChart(text: string): Chart {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ChartFormatError("채보 파일(JSON)을 읽을 수 없어요.");
  }
  if (!isObject(raw)) throw new ChartFormatError("채보 파일 형식이 아니에요.");

  const notesRaw = raw.notes;
  if (!Array.isArray(notesRaw)) throw new ChartFormatError("채보에 노트 목록(notes)이 없어요.");
  if (notesRaw.length > MAX_NOTES) throw new ChartFormatError(`노트가 너무 많아요 (최대 ${MAX_NOTES}개).`);
  const notes: ChartNote[] = notesRaw.map((n, i) => {
    if (!isObject(n) || !isFiniteNum(n.t) || n.t < 0 || !Number.isInteger(n.lane) || (n.lane as number) < 0 || (n.lane as number) >= LANES) {
      throw new ChartFormatError(`${i + 1}번째 노트가 올바르지 않아요.`);
    }
    const note: ChartNote = { t: Math.round(n.t), lane: n.lane as number };
    if (n.len !== undefined) {
      if (!isFiniteNum(n.len) || n.len < 0) throw new ChartFormatError(`${i + 1}번째 노트의 길이가 올바르지 않아요.`);
      if (n.len > 0) note.len = Math.round(n.len);
    }
    return note;
  });
  notes.sort((a, b) => a.t - b.t || a.lane - b.lane);

  const beats = numList(raw.beats);
  const bars = numList(raw.bars);
  return {
    title: typeof raw.title === "string" ? raw.title.slice(0, 200) : "가져온 채보",
    artist: typeof raw.artist === "string" ? raw.artist.slice(0, 200) : "",
    durationMs: isFiniteNum(raw.durationMs) && raw.durationMs > 0 ? raw.durationMs : 0,
    bpm: isFiniteNum(raw.bpm) && raw.bpm > 0 && raw.bpm < 1000 ? raw.bpm : 0,
    beatsPerBar: Number.isInteger(raw.beatsPerBar) && (raw.beatsPerBar as number) >= 1 && (raw.beatsPerBar as number) <= 16 ? (raw.beatsPerBar as number) : 4,
    offsetMs: isFiniteNum(raw.offsetMs) ? raw.offsetMs : 0,
    difficulty: isObject(raw.difficulty) && typeof raw.difficulty.name === "string" && isFiniteNum(raw.difficulty.level)
      ? { name: raw.difficulty.name.slice(0, 40), level: raw.difficulty.level }
      : { name: "USER", level: 0 },
    ...(beats ? { beats } : {}),
    ...(beats && bars ? { bars: bars.filter((b) => beats.includes(b)) } : {}),
    notes,
  };
}

/** 내보낼 때 쓰는 파일 이름. 파일 이름에 못 쓰는 글자는 뺀다 */
export function chartFileName(title: string): string {
  const safe = title.replace(/[\\/:*?"<>|\s]+/g, "-").replace(/^-+|-+$/g, "") || "chart";
  return `${safe}.chart.json`;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isFiniteNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function numList(v: unknown): number[] | undefined {
  if (!Array.isArray(v) || v.length < 2 || !v.every(isFiniteNum)) return undefined;
  return [...v].sort((a, b) => a - b);
}
