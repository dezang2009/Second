// 화면 흐름: 메뉴 → 곡 목록 → 플레이 → 결과, 곡 목록 → 채보 만들기 (→ 시험 플레이 → 결과 → 채보 만들기).
// 음원을 추가하면 자동으로 분석해 NORMAL / HARD 채보를 만든다.
// 음원과 채보, 최고 기록은 이 기기에만 보관한다.

import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import { analyzeBuffer } from "./analysis/client";
import { audio, unlockAudio } from "./audio/audio";
import { AudioLoadError, decodeAudio, stripExtension } from "./audio/loader";
import { createMetronomeBuffer } from "./audio/metronome";
import { EditScene } from "./game/editScene";
import { rankOf, type JudgeStats } from "./game/judge";
import { PlayScene } from "./game/playScene";
import { Stage } from "./game/stage";
import { buildDemoChart } from "./songs/demo";
import { emptyChart } from "./songs/empty";
import type { Chart } from "./songs/types";
import { ChartFormatError, chartFileName, parseChart } from "./songs/validate";
import { onSettingsChange, settings, updateSettings } from "./settings";
import { type Difficulty, deleteSong, getSong, listSongs, newId, putSong, type SongRecord, updateSong, wipeAll } from "./storage/library";
import { exportTextFile } from "./storage/share";
import { type ListQuery, querySongs, type SongSort, timeAgo } from "./storage/sortSongs";
import { setupSettingsScreen } from "./ui/settingsScreen";

const METRONOME_BARS = 64;
const METRONOME_BPM = 120;
const DIFF_LABEL: Record<Difficulty, string> = { normal: "NORMAL", hard: "HARD", user: "내 채보" };

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const stage = new Stage($<HTMLCanvasElement>("game"));

type ScreenName = "menu" | "list" | "play" | "result" | "edit" | "settings";
function show(name: ScreenName): void {
  if (document.body.dataset.screen === "settings" && name !== "settings") settingsUi?.stop();
  for (const s of ["menu", "list", "play", "result", "edit", "settings"] as const) $(`screen-${s}`).hidden = s !== name;
  document.body.dataset.screen = name;
  document.body.classList.remove("running");
}

/** 지금 다루는 곡. 메트로놈 연습은 song이 null */
interface Current {
  song: SongRecord | null;
  title: string;
  buffer: AudioBuffer;
  difficulty: Difficulty | null;
}
let current: Current | null = null;
let playScene: PlayScene | null = null;
let editScene: EditScene | null = null;
/** 결과 화면에서 돌아갈 곳. 에디터에서 시험 플레이했으면 에디터로 */
let returnTo: "list" | "edit" = "list";
/** 구간 연습 중이면 시작 위치(초). 연습은 최고 기록에 남기지 않는다 */
let practiceFrom: number | null = null;
/** 연습 구간 앞에 두는 여유(초) */
const PRACTICE_LEAD_SEC = 2;

function chartFor(song: SongRecord, diff: Difficulty): Chart | null {
  if (diff === "user") return song.userChart;
  return song.auto?.[diff] ?? null;
}

function selectedChart(song: SongRecord): Chart | null {
  return chartFor(song, song.difficulty) ?? song.userChart ?? song.auto?.normal ?? null;
}

// 같은 곡을 다시 열 때 디코딩을 반복하지 않는다
let decoded: { id: string; buffer: AudioBuffer } | null = null;
async function bufferOf(song: SongRecord): Promise<AudioBuffer> {
  if (decoded?.id !== song.id) decoded = { id: song.id, buffer: await decodeAudio(audio().ctx, song.audio) };
  return decoded.buffer;
}

audio().clock.onEnded = () => {
  if (playScene) playScene.finish();
  else if (editScene) stopEditor();
};

function setStatus(el: HTMLElement, text: string, isError = false): void {
  el.textContent = text;
  el.classList.toggle("error", isError);
}

// ---------- 자동 채보 (한 번에 한 곡씩, 뒤에서) ----------

interface AnalysisState {
  ratio: number;
  stage: string;
  error?: string;
}
const analysis = new Map<string, AnalysisState>();
const queue: string[] = [];
let analyzing: string | null = null;

function requestAnalysis(id: string): void {
  if (analyzing === id || queue.includes(id)) return;
  queue.push(id);
  analysis.set(id, { ratio: 0, stage: "기다리는 중" });
  updateProgress(id);
  void pumpAnalysis();
}

async function pumpAnalysis(): Promise<void> {
  if (analyzing || queue.length === 0) return;
  const id = queue.shift()!;
  analyzing = id;
  try {
    const song = await getSong(id);
    if (!song) return;
    const buffer = await bufferOf(song);
    const result = await analyzeBuffer(buffer, song.title, (ratio, stage) => {
      analysis.set(id, { ratio, stage });
      updateProgress(id);
    });
    await updateSong(id, { auto: result.charts });
    analysis.delete(id);
    setStatus(
      list.status,
      `${song.title}: 자동 채보를 만들었어요. ${result.beatsPerBar}/4 · 약 ${Math.round(result.bpm)} BPM · NORMAL ${result.charts.normal.notes.length}개 · HARD ${result.charts.hard.notes.length}개`,
    );
  } catch (e) {
    analysis.set(id, { ratio: 0, stage: "", error: e instanceof Error ? e.message : String(e) });
  } finally {
    analyzing = null;
    if (document.body.dataset.screen === "list") await renderList();
    void pumpAnalysis();
  }
}

/** 목록을 다시 그리지 않고 진행 막대만 고친다 */
function updateProgress(id: string): void {
  const card = list.ul.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`);
  const st = analysis.get(id);
  if (!card || !st) return;
  const box = card.querySelector<HTMLElement>(".analyze")!;
  box.hidden = false;
  box.querySelector<HTMLElement>(".bar span")!.style.width = `${Math.round(st.ratio * 100)}%`;
  box.querySelector<HTMLElement>(".analyze-text")!.textContent = st.error
    ? `자동 채보를 만들지 못했어요: ${st.error}`
    : `자동 채보 만드는 중 · ${st.stage} ${Math.round(st.ratio * 100)}%`;
  box.classList.toggle("error", Boolean(st.error));
}

// ---------- 메뉴 ----------

/** 곡 목록을 연 목적: 플레이할 곡 고르기, 또는 채보를 만들 곡 고르기 */
let listMode: "play" | "edit" = "play";

function openList(mode: "play" | "edit"): void {
  listMode = mode;
  $("list-heading").textContent = mode === "play" ? "곡 선택" : "채보 만들기";
  $("list-sub").textContent = mode === "play" ? "플레이할 곡과 난이도를 골라주세요" : "채보를 만들거나 고칠 곡을 골라주세요";
  setStatus(list.status, "");
  show("list");
  void renderList();
}

$("menu-play").addEventListener("click", () => openList("play"));
$("menu-settings").addEventListener("click", () => {
  settingsUi.refresh();
  show("settings");
});
$("settings-back").addEventListener("click", () => show("menu"));
$("menu-edit").addEventListener("click", () => openList("edit"));
$("list-back").addEventListener("click", () => show("menu"));

// ---------- 곡 목록 ----------

const list = {
  ul: $("song-list"),
  status: $("list-status"),
  file: $<HTMLInputElement>("file"),
  importFile: $<HTMLInputElement>("import-file"),
  search: $<HTMLInputElement>("song-search"),
  sort: $<HTMLSelectElement>("song-sort"),
  favOnly: $<HTMLButtonElement>("fav-only"),
};

// 목록 검색/정렬 상태. 정렬과 즐겨찾기 보기는 다음에 열 때도 그대로 둔다
const LIST_PREFS_KEY = "rhythm.list.v1";
const listQuery: ListQuery = { sort: "recent", search: "", favoritesOnly: false };
try {
  const saved = JSON.parse(localStorage.getItem(LIST_PREFS_KEY) ?? "{}") as Partial<ListQuery>;
  if (saved.sort && ["recent", "added", "name", "score"].includes(saved.sort)) listQuery.sort = saved.sort;
  listQuery.favoritesOnly = saved.favoritesOnly === true;
} catch {
  // 저장된 값이 없거나 읽을 수 없으면 기본값
}
function saveListPrefs(): void {
  try {
    localStorage.setItem(LIST_PREFS_KEY, JSON.stringify({ sort: listQuery.sort, favoritesOnly: listQuery.favoritesOnly }));
  } catch {
    // 저장이 막혀도 이번 실행 동안은 유지된다
  }
}
list.sort.value = listQuery.sort;
list.favOnly.setAttribute("aria-pressed", String(listQuery.favoritesOnly));
list.search.addEventListener("input", () => {
  listQuery.search = list.search.value;
  void renderList();
});
list.sort.addEventListener("change", () => {
  listQuery.sort = list.sort.value as SongSort;
  saveListPrefs();
  void renderList();
});
list.favOnly.addEventListener("click", () => {
  listQuery.favoritesOnly = !listQuery.favoritesOnly;
  list.favOnly.setAttribute("aria-pressed", String(listQuery.favoritesOnly));
  saveListPrefs();
  void renderList();
});

/** 목록을 그리는 중에 또 그리라는 요청이 오면 앞의 것은 버린다 (늦게 끝난 옛 결과가 덮어쓰지 않게) */
let renderToken = 0;

async function renderList(): Promise<void> {
  const token = ++renderToken;
  const songs = await listSongs();
  if (token !== renderToken) return;
  list.ul.replaceChildren();
  if (songs.length === 0) {
    const li = document.createElement("li");
    li.className = "song-empty";
    li.textContent = "아직 곡이 없어요. 아래 + 음원 추가로 폰에 있는 음원을 골라주세요. 추가하면 자동으로 채보를 만들어요.";
    list.ul.append(li);
    return;
  }
  // 목록에 안 보이는 곡도 자동 채보는 만든다
  for (const song of songs) if (!song.auto && !analysis.get(song.id)?.error) requestAnalysis(song.id);
  const shown = querySongs(songs, listQuery);
  if (shown.length === 0) {
    const li = document.createElement("li");
    li.className = "song-empty";
    li.textContent = listQuery.favoritesOnly && !listQuery.search ? "즐겨찾기한 곡이 없어요. 곡 카드의 ☆를 눌러 추가해 보세요." : "검색한 이름의 곡이 없어요.";
    list.ul.append(li);
    return;
  }
  for (const song of shown) {
    list.ul.append(songCard(song));
    // 자동 채보가 없는 곡(예전에 추가한 곡 포함)은 알아서 분석을 시작한다
    if (!song.auto && !analysis.get(song.id)?.error) requestAnalysis(song.id);
    else if (analysis.has(song.id)) updateProgress(song.id);
  }
}

function songCard(song: SongRecord): HTMLLIElement {
  const li = document.createElement("li");
  li.className = "song-card";
  li.dataset.id = song.id;
  li.innerHTML = `
    <div class="song-top">
      <div class="song-info">
        <span class="song-title"></span>
        <form class="rename" hidden>
          <input class="rename-input" maxlength="60" aria-label="곡 이름" />
          <button class="btn small" type="submit">저장</button>
          <button class="btn ghost small" data-act="rename-cancel" type="button">취소</button>
        </form>
        <span class="song-meta"></span>
      </div>
      <div class="song-rank"><span class="rank-letter"></span><span class="rank-score"></span></div>
      <button class="fav" type="button" aria-label="즐겨찾기" aria-pressed="false">☆</button>
    </div>
    <div class="diff" role="radiogroup" aria-label="난이도"></div>
    <div class="analyze" hidden><div class="bar"><span></span></div><span class="analyze-text"></span></div>
    <div class="song-actions">
      <button class="btn small" data-act="main" type="button"></button>
      <button class="btn ghost small" data-act="second" type="button"></button>
      <button class="btn ghost small more" data-act="more" type="button" aria-label="더보기" aria-expanded="false">···</button>
    </div>
    <div class="song-more" hidden>
      <button class="btn ghost small" data-act="preview" type="button">자동 플레이로 미리 보기</button>
      <button class="btn ghost small" data-act="rename" type="button">이름 바꾸기</button>
      <button class="btn ghost small" data-act="reanalyze" type="button">자동 채보 다시 만들기</button>
      <button class="btn ghost small" data-act="export" type="button">채보 내보내기</button>
      <button class="btn ghost small" data-act="import" type="button">채보 가져오기</button>
      <button class="btn ghost small" data-act="delete" type="button">삭제</button>
    </div>`;
  const q = <T extends HTMLElement = HTMLElement>(sel: string) => li.querySelector(sel) as T;
  const chart = selectedChart(song);
  const hasNotes = Boolean(chart && chart.notes.length);

  q(".song-title").textContent = song.title;
  const ref = song.auto?.normal ?? song.userChart;
  const meter = ref?.bpm ? ` · ${ref.beatsPerBar}/4 · 약 ${Math.round(ref.bpm)} BPM` : "";
  const played = song.lastPlayedAt ? ` · ${timeAgo(song.lastPlayedAt)} 플레이` : "";
  q(".song-meta").textContent = `${formatTime(song.durationMs / 1000)}${meter}${played}`;
  const fav = q<HTMLButtonElement>(".fav");
  fav.textContent = song.favorite ? "★" : "☆";
  fav.setAttribute("aria-pressed", String(song.favorite));
  fav.classList.toggle("on", song.favorite);
  fav.addEventListener("click", async () => {
    await updateSong(song.id, { favorite: !song.favorite });
    await renderList();
  });

  // 난이도 고르기
  const diffBox = q(".diff");
  for (const d of ["normal", "hard", "user"] as const) {
    const c = chartFor(song, d);
    if (d === "user" && !c) continue;
    const b = document.createElement("button");
    b.type = "button";
    b.className = `diff-btn ${d}`;
    b.setAttribute("role", "radio");
    const on = song.difficulty === d && Boolean(c);
    b.setAttribute("aria-checked", String(on));
    b.classList.toggle("on", on);
    b.disabled = !c;
    b.innerHTML = `<span class="diff-name"></span><span class="diff-lv"></span>`;
    (b.firstElementChild as HTMLElement).textContent = DIFF_LABEL[d];
    (b.lastElementChild as HTMLElement).textContent = c ? (d === "user" ? `${c.notes.length}개` : `Lv.${c.difficulty.level}`) : "분석 중";
    b.addEventListener("click", async () => {
      await updateSong(song.id, { difficulty: d });
      await renderList();
    });
    diffBox.append(b);
  }

  // 그 난이도의 최고 기록
  const best = song.bests[song.difficulty];
  const rank = q(".rank-letter");
  if (best && chartFor(song, song.difficulty)) {
    rank.textContent = best.rank;
    q(".rank-score").textContent = best.score.toLocaleString("ko-KR") + (best.accuracy !== undefined ? ` · ${best.accuracy.toFixed(1)}%` : "");
  } else {
    rank.textContent = "–";
    rank.classList.add("none");
    q(".rank-score").textContent = hasNotes ? "기록 없음" : "";
  }

  const playBtn = listMode === "play" ? q<HTMLButtonElement>('[data-act="main"]') : q<HTMLButtonElement>('[data-act="second"]');
  const editBtn = listMode === "play" ? q<HTMLButtonElement>('[data-act="second"]') : q<HTMLButtonElement>('[data-act="main"]');
  playBtn.textContent = "플레이";
  playBtn.disabled = !hasNotes;
  playBtn.addEventListener("click", () => {
    unlockAudio();
    void startSong(song.id);
  });
  editBtn.textContent = hasNotes ? "채보 수정" : "채보 만들기";
  editBtn.addEventListener("click", () => {
    unlockAudio();
    void openEditor(song.id);
  });

  const more = q<HTMLButtonElement>('[data-act="more"]');
  more.addEventListener("click", () => {
    const panel = q(".song-more");
    panel.hidden = !panel.hidden;
    more.setAttribute("aria-expanded", String(!panel.hidden));
  });

  const preview = q<HTMLButtonElement>('[data-act="preview"]');
  preview.disabled = !hasNotes;
  preview.addEventListener("click", () => {
    unlockAudio();
    void startSong(song.id, true);
  });

  // 이름 바꾸기
  const form = q<HTMLFormElement>(".rename");
  const input = q<HTMLInputElement>(".rename-input");
  q('[data-act="rename"]').addEventListener("click", () => {
    q(".song-title").hidden = true;
    form.hidden = false;
    input.value = song.title;
    input.focus();
    input.select();
  });
  q('[data-act="rename-cancel"]').addEventListener("click", () => {
    form.hidden = true;
    q(".song-title").hidden = false;
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = input.value.trim();
    if (!title) {
      setStatus(list.status, "곡 이름을 입력해 주세요.", true);
      return;
    }
    await updateSong(song.id, { title });
    setStatus(list.status, `곡 이름을 "${title}"(으)로 바꿨어요.`);
    await renderList();
  });

  const reanalyze = q<HTMLButtonElement>('[data-act="reanalyze"]');
  reanalyze.disabled = analysis.has(song.id) && !analysis.get(song.id)?.error;
  reanalyze.addEventListener("click", () => {
    analysis.delete(song.id);
    requestAnalysis(song.id);
    q(".song-more").hidden = true;
  });
  const exportBtn = q<HTMLButtonElement>('[data-act="export"]');
  exportBtn.disabled = !hasNotes;
  exportBtn.addEventListener("click", () => void exportChart(song));
  q('[data-act="import"]').addEventListener("click", () => {
    importTarget = song.id;
    list.importFile.click();
  });
  confirmTwice(q<HTMLButtonElement>('[data-act="delete"]'), "한 번 더 누르면 삭제", async () => {
    await deleteSong(song.id);
    if (decoded?.id === song.id) decoded = null;
    setStatus(list.status, `${song.title}을(를) 목록에서 지웠어요.`);
    await renderList();
  });
  return li;
}

async function exportChart(song: SongRecord): Promise<void> {
  const chart = selectedChart(song);
  if (!chart) return;
  const name = chartFileName(`${song.title}-${song.difficulty}`);
  try {
    const result = await exportTextFile(name, JSON.stringify({ ...chart, title: song.title, durationMs: song.durationMs }), `${song.title} 채보`);
    if (result === "shared") setStatus(list.status, "채보 파일을 보냈어요.");
    else if (result === "downloaded") setStatus(list.status, `채보 파일(${name})을 내려받았어요.`);
  } catch {
    setStatus(list.status, "채보를 내보내지 못했어요. 다시 시도해 주세요.", true);
  }
}

/** 채보 가져오기를 누른 곡 */
let importTarget: string | null = null;
list.importFile.addEventListener("change", async () => {
  const file = list.importFile.files?.[0];
  list.importFile.value = "";
  const song = importTarget ? await getSong(importTarget) : undefined;
  importTarget = null;
  if (!file || !song) return;
  try {
    const chart = parseChart(await file.text());
    const diffSec = chart.durationMs ? Math.abs(chart.durationMs - song.durationMs) / 1000 : 0;
    const bests = { ...song.bests };
    delete bests.user;
    await updateSong(song.id, { userChart: { ...chart, title: song.title, durationMs: song.durationMs }, difficulty: "user", bests });
    setStatus(
      list.status,
      diffSec > 1.5
        ? `가져왔어요 (노트 ${chart.notes.length}개). 채보를 만든 음원과 길이가 ${diffSec.toFixed(1)}초 달라서 노트가 어긋날 수 있어요.`
        : `채보를 '내 채보'로 가져왔어요 (노트 ${chart.notes.length}개).`,
    );
    await renderList();
  } catch (e) {
    setStatus(list.status, e instanceof ChartFormatError ? e.message : "채보 파일을 읽지 못했어요.", true);
  }
});

/** 실수로 지우지 않도록 두 번 눌러야 실행되는 버튼. needsConfirm이 false면 바로 실행한다 */
function confirmTwice(
  btn: HTMLButtonElement,
  askLabel: string,
  action: () => void | Promise<void>,
  needsConfirm: () => boolean = () => true,
): void {
  const label = btn.textContent ?? "";
  let armed: number | null = null;
  const disarm = () => {
    if (armed !== null) window.clearTimeout(armed);
    armed = null;
    btn.textContent = label;
    btn.classList.remove("warn");
  };
  btn.addEventListener("click", () => {
    if (armed === null && needsConfirm()) {
      btn.textContent = askLabel;
      btn.classList.add("warn");
      armed = window.setTimeout(disarm, 3000);
      return;
    }
    disarm();
    void action();
  });
}

list.file.addEventListener("change", async () => {
  const file = list.file.files?.[0];
  list.file.value = ""; // 같은 파일을 다시 골라도 change가 오도록
  if (!file) return;
  unlockAudio();
  setStatus(list.status, "불러오는 중…");
  try {
    const buffer = await decodeAudio(audio().ctx, file);
    const songs = await listSongs();
    const dup = songs.find((s) => s.fileName === file.name && Math.abs(s.durationMs / 1000 - buffer.duration) < 0.1);
    if (dup) {
      setStatus(list.status, "이미 목록에 있는 음원이에요.");
      return;
    }
    const song: SongRecord = {
      id: newId(),
      title: stripExtension(file.name),
      fileName: file.name,
      durationMs: Math.round(buffer.duration * 1000),
      addedAt: Date.now(),
      audio: file,
      auto: null,
      userChart: null,
      difficulty: "normal",
      bests: {},
      favorite: false,
      lastPlayedAt: null,
      playCount: 0,
    };
    await putSong(song);
    decoded = { id: song.id, buffer };
    setStatus(list.status, "추가했어요. 자동 채보를 만들고 있어요. 이름은 ··· 에서 바꿀 수 있어요.");
    await renderList();
  } catch (e) {
    setStatus(list.status, e instanceof AudioLoadError ? e.message : "음원을 추가하지 못했어요.", true);
  }
});

$("menu-metronome").addEventListener("click", () => {
  unlockAudio();
  const buffer = createMetronomeBuffer(audio().ctx, METRONOME_BPM, 4, METRONOME_BARS);
  const demo = buildDemoChart(METRONOME_BPM, 4, METRONOME_BARS);
  current = { song: null, title: "메트로놈 연습", buffer, difficulty: null };
  returnTo = "list";
  void startPlay(demo);
});

// ---------- 플레이 ----------

const play = {
  title: $("play-title"),
  meta: $("play-meta"),
  clock: $("play-clock"),
  beats: $("play-beats"),
  bar: $("play-bar"),
  score: $("play-score"),
  pause: $<HTMLButtonElement>("play-pause"),
  menu: $("pause-menu"),
};

/** auto: 자동 플레이로 채보만 미리 본다 (기록, 플레이 횟수에 남기지 않음) */
async function startSong(id: string, auto = false): Promise<void> {
  const song = await getSong(id);
  const chart = song && selectedChart(song);
  if (!song || !chart) return;
  try {
    current = { song, title: song.title, buffer: await bufferOf(song), difficulty: song.difficulty };
  } catch (e) {
    setStatus(list.status, e instanceof AudioLoadError ? e.message : "음원을 열지 못했어요.", true);
    return;
  }
  editScene = null;
  returnTo = "list";
  if (!auto) await updateSong(song.id, { lastPlayedAt: Date.now(), playCount: song.playCount + 1 });
  await startPlay(chart, auto);
}

async function startPlay(chart: Chart, auto = false): Promise<void> {
  if (!current) return;
  practiceFrom = null;
  playScene = new PlayScene(chart, stage, auto);
  // 미리 보기는 결과 화면 없이 바로 목록으로
  playScene.onFinish = auto ? () => (audio().clock.pause(), leavePlay()) : (stats) => void showResult(stats);
  stage.setScene(playScene);
  const diff = current.difficulty ? ` · ${DIFF_LABEL[current.difficulty]}` : "";
  play.title.textContent = current.title.toUpperCase() + diff + (auto ? " · 자동 플레이" : "");
  play.meta.textContent = chart.bpm ? `${chart.beats ? "≈" : ""}${Math.round(chart.bpm)} BPM · ${chart.beatsPerBar}/4` : "";
  play.beats.replaceChildren(...Array.from({ length: chart.bpm ? chart.beatsPerBar : 0 }, () => document.createElement("span")));
  lastBeat = -2;
  lastScore = -1;
  play.menu.hidden = true;
  show("play");
  const { clock } = audio();
  clock.load(current.buffer);
  await clock.play(playScene.leadIn);
}

function pauseGame(): void {
  const { clock } = audio();
  if (!playScene || clock.state !== "playing") return;
  clock.pause();
  playScene.releaseAll(clock.time());
  play.menu.hidden = false;
}

play.pause.addEventListener("click", pauseGame);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) return;
  if (document.body.dataset.screen === "play") pauseGame(); // 앱을 내리면 자동으로 일시정지
  else if (editScene && editScene.mode !== "idle") stopEditor();
});
$("resume").addEventListener("click", () => {
  play.menu.hidden = true;
  void audio().clock.play();
});
$("restart").addEventListener("click", () => void restartPlay());
$("quit").addEventListener("click", () => {
  audio().clock.pause();
  leavePlay();
});

async function restartPlay(): Promise<void> {
  if (!playScene) return;
  const { clock } = audio();
  play.menu.hidden = true;
  show("play");
  stage.setScene(playScene);
  const from = practiceFrom ?? 0;
  playScene.restart(from);
  lastScore = -1;
  clock.seek(from);
  await clock.play(from > 0 ? 1 : playScene.leadIn);
}

function leavePlay(): void {
  playScene = null;
  practiceFrom = null;
  stage.setScene(null);
  if (returnTo === "edit") void backToEditor();
  else if (current?.song) openList(listMode);
  else show("menu"); // 메트로놈 연습
}

// ---------- 결과 ----------

async function showResult(stats: JudgeStats): Promise<void> {
  audio().clock.pause();
  stage.setScene(null);
  const rank = rankOf(stats.score);
  const diff = current?.difficulty ? ` · ${DIFF_LABEL[current.difficulty]}` : "";
  const mode = practiceFrom !== null ? ` · ${formatTime(practiceFrom)}부터 연습` : returnTo === "edit" ? " · 시험 플레이" : diff;
  $("result-title").textContent = (current?.title ?? "").toUpperCase() + mode;
  $("result-rank").textContent = rank;
  $("result-score").textContent = stats.score.toLocaleString("ko-KR");
  $("r-perfect").textContent = String(stats.perfect);
  $("r-great").textContent = String(stats.great);
  $("r-good").textContent = String(stats.good);
  $("r-miss").textContent = String(stats.miss);
  $("r-combo").textContent = String(stats.maxCombo);
  $("r-acc").textContent = `${stats.accuracy.toFixed(1)}%`;
  $("result-timing").textContent = timingText(stats.meanOffsetMs);
  $("result-fastslow").textContent = stats.early + stats.late ? `일찍 ${stats.early} · 늦게 ${stats.late}` : "";
  // 한쪽으로 꾸준히 치우쳤다면 실력보다 기기 지연일 가능성이 크다 → 판정 싱크를 바로 고칠 수 있게
  const hits = stats.perfect + stats.great + stats.good;
  const syncBtn = $<HTMLButtonElement>("apply-sync");
  syncBtn.hidden = !(stats.meanOffsetMs !== null && Math.abs(stats.meanOffsetMs) >= 15 && hits >= 20);
  if (!syncBtn.hidden) {
    const next = settings.audioOffsetMs + Math.round(stats.meanOffsetMs!);
    syncBtn.dataset.value = String(next);
    syncBtn.textContent = `판정 싱크를 ${next > 0 ? "+" : ""}${next}ms로 맞추기`;
  }
  $("result-back").textContent = returnTo === "edit" ? "편집으로" : "목록으로";

  // 끝까지 한 번도 안 놓쳤으면
  const fc = $("result-fc");
  const complete = stats.total > 0 && stats.judged >= stats.total;
  fc.hidden = !(complete && stats.miss === 0);
  fc.textContent = stats.great + stats.good === 0 ? "ALL PERFECT" : "FULL COMBO";

  // 가장 많이 흔들린 구간 → 바로 그 구간 연습
  const spot = playScene?.judge.troubleSpot() ?? null;
  const troubleBox = $("result-trouble");
  troubleBox.hidden = !spot;
  if (spot) {
    const parts = [spot.misses ? `MISS ${spot.misses}` : "", spot.goods ? `GOOD ${spot.goods}` : ""].filter(Boolean).join(" · ");
    $("trouble-text").textContent = `가장 많이 흔들린 구간 ${formatTime(spot.from)}~${formatTime(spot.to + 1)} · ${parts}`;
    troubleBox.dataset.from = String(Math.max(0, spot.from - PRACTICE_LEAD_SEC));
  }

  // 최고 기록은 목록의 곡을 플레이했을 때만, 난이도마다 따로 남긴다 (시험 플레이, 메트로놈 제외)
  const badge = $("result-best");
  const prevEl = $("result-prev");
  badge.hidden = true;
  prevEl.textContent = "";
  const song = current?.song;
  const d = current?.difficulty;
  let newBest = false;
  if (song && d && returnTo === "list" && practiceFrom === null) {
    const fresh = await getSong(song.id);
    const prev = fresh?.bests[d] ?? null;
    if (fresh && (!prev || stats.score > prev.score)) {
      await updateSong(song.id, { bests: { ...fresh.bests, [d]: { score: stats.score, rank, maxCombo: stats.maxCombo, at: Date.now(), accuracy: stats.accuracy } } });
      badge.hidden = false;
      newBest = true;
    }
    if (prev) {
      const gap = stats.score - prev.score;
      prevEl.textContent =
        gap > 0
          ? `이전 최고 ${prev.score.toLocaleString("ko-KR")}점 · +${gap.toLocaleString("ko-KR")}`
          : `최고 ${prev.score.toLocaleString("ko-KR")}점까지 ${(-gap).toLocaleString("ko-KR")}점`;
    }
  }
  show("result");
  if (newBest) stage.celebrate();
}

function timingText(meanMs: number | null): string {
  if (meanMs === null) return "친 노트가 없어서 타이밍을 잴 수 없어요.";
  const ms = Math.round(Math.abs(meanMs));
  if (ms <= 10) return `평균 타이밍 ${meanMs >= 0 ? "+" : "-"}${ms}ms · 박자에 잘 맞췄어요.`;
  return `평균 타이밍 ${meanMs > 0 ? "+" : "-"}${ms}ms · 평균적으로 조금 ${meanMs > 0 ? "늦게" : "일찍"} 쳤어요.`;
}

$("again").addEventListener("click", () => {
  unlockAudio();
  void restartPlay();
});
$("result-back").addEventListener("click", leavePlay);
$("practice").addEventListener("click", () => {
  unlockAudio();
  practiceFrom = Number($("result-trouble").dataset.from);
  void restartPlay();
});
$("apply-sync").addEventListener("click", () => {
  const btn = $<HTMLButtonElement>("apply-sync");
  const value = Number(btn.dataset.value);
  updateSettings({ audioOffsetMs: value });
  btn.hidden = true;
  $("result-fastslow").textContent += ` · 판정 싱크를 ${value > 0 ? "+" : ""}${value}ms로 바꿨어요`;
});

// ---------- 채보 만들기 ----------

const edit = {
  title: $("edit-title"),
  count: $("edit-count"),
  clock: $("edit-clock"),
  mode: $("edit-mode"),
  status: $("edit-status"),
  seek: $<HTMLInputElement>("edit-seek"),
  snap: $<HTMLSelectElement>("edit-snap"),
  undo: $<HTMLButtonElement>("edit-undo"),
};
let dirty = false;
const HINT = "멈춘 상태: 누르면 노트 추가/삭제, 노트를 위아래로 끌면 롱 노트 길이 조절. 녹음: 치는 대로 기록, 길게 누르면 롱 노트. 저장하면 '내 채보'가 돼요.";

async function openEditor(id: string): Promise<void> {
  const song = await getSong(id);
  if (!song) return;
  try {
    current = { song, title: song.title, buffer: await bufferOf(song), difficulty: "user" };
  } catch (e) {
    setStatus(list.status, e instanceof AudioLoadError ? e.message : "음원을 열지 못했어요.", true);
    return;
  }
  // 고른 난이도의 채보에서 시작한다. 박 정보는 자동 분석 결과를 빌려 쓴다
  const base = selectedChart(song) ?? { ...(song.auto?.normal ?? emptyChart(song.title, song.durationMs)), notes: [] };
  editScene = new EditScene(base, stage);
  editScene.onChange = () => {
    dirty = true;
    updateEditUi();
  };
  dirty = false;
  edit.snap.value = String(editScene.division);
  edit.snap.disabled = !editScene.meter.hasBeats;
  const from = chartFor(song, song.difficulty) ? DIFF_LABEL[song.difficulty] : "새 채보";
  edit.title.textContent = `${song.title.toUpperCase()} · ${from}에서 편집`;
  edit.seek.max = String(current.buffer.duration);
  setStatus(edit.status, editScene.meter.hasBeats ? HINT : `${HINT} 박 정보가 없어서 박 맞추기는 꺼져 있어요.`);
  await backToEditor();
}

async function backToEditor(): Promise<void> {
  if (!editScene || !current) return;
  playScene = null;
  returnTo = "list";
  current.difficulty = "user";
  stage.setScene(editScene);
  audio().clock.load(current.buffer);
  show("edit");
  updateEditUi();
}

function updateEditUi(): void {
  if (!editScene) return;
  edit.count.textContent = `노트 ${editScene.draft.notes.length}개${dirty ? " · 저장 안 됨" : ""}`;
  edit.count.classList.toggle("dirty", dirty);
  edit.undo.disabled = !editScene.draft.canUndo;
  edit.mode.textContent = editScene.mode === "record" ? "● 녹음 중" : editScene.mode === "preview" ? "▶ 듣는 중" : "";
  document.body.classList.toggle("running", editScene.mode !== "idle");
}

async function runEditor(mode: "record" | "preview"): Promise<void> {
  if (!editScene) return;
  const { clock } = audio();
  if (clock.state === "ended") clock.seek(0);
  editScene.begin(mode, clock.time());
  updateEditUi();
  await clock.play();
}

function stopEditor(): void {
  if (!editScene) return;
  const { clock } = audio();
  clock.pause();
  editScene.end(clock.time());
  updateEditUi();
}

function leaveEditor(): void {
  audio().clock.pause();
  editScene = null;
  stage.setScene(null);
  openList(listMode);
}

$("edit-record").addEventListener("click", () => void runEditor("record"));
$("edit-preview").addEventListener("click", () => void runEditor("preview"));
$("edit-stop").addEventListener("click", stopEditor);
$("edit-back").addEventListener("click", () => audio().clock.seek(audio().clock.time() - 2));
$("edit-fwd").addEventListener("click", () => audio().clock.seek(audio().clock.time() + 2));
edit.seek.addEventListener("input", () => audio().clock.seek(Number(edit.seek.value)));
edit.snap.addEventListener("change", () => {
  if (editScene) editScene.division = Number(edit.snap.value);
});
edit.undo.addEventListener("click", () => {
  if (editScene?.draft.undo()) {
    dirty = true;
    updateEditUi();
  }
});
confirmTwice($<HTMLButtonElement>("edit-clear"), "한 번 더 누르면 지움", () => {
  if (!editScene) return;
  editScene.draft.checkpoint();
  editScene.draft.clear();
  dirty = true;
  updateEditUi();
  setStatus(edit.status, "노트를 모두 지웠어요. 되돌리기로 살릴 수 있어요.");
});
$("edit-save").addEventListener("click", async () => {
  if (!editScene || !current?.song) return;
  const fresh = await getSong(current.song.id);
  const bests = { ...(fresh?.bests ?? {}) };
  delete bests.user;
  await updateSong(current.song.id, { userChart: editScene.toChart(), difficulty: "user", bests });
  dirty = false;
  updateEditUi();
  setStatus(edit.status, "'내 채보'로 저장했어요. 곡 목록에서 '내 채보'를 골라 플레이할 수 있어요.");
});
$("edit-test").addEventListener("click", () => {
  if (!editScene || editScene.draft.notes.length === 0) {
    setStatus(edit.status, "노트가 없어서 시험 플레이를 할 수 없어요.");
    return;
  }
  unlockAudio();
  returnTo = "edit";
  void startPlay(editScene.toChart());
});
confirmTwice($<HTMLButtonElement>("edit-exit"), "저장 안 하고 나가기", leaveEditor, () => dirty);

// ---------- 설정 ----------

const settingsUi = setupSettingsScreen($("screen-settings"), {
  confirmTwice,
  wipeAll: async () => {
    queue.length = 0;
    analysis.clear();
    decoded = null;
    await wipeAll();
  },
});
onSettingsChange(() => settingsUi.refresh());

// ---------- 매 프레임 글자 갱신 ----------

let lastText = "";
let lastBeat = -2;
let lastScore = -1;
stage.onFrame = (t) => {
  const screen = document.body.dataset.screen;
  if (screen === "play" && playScene) {
    const clockText = formatTime(Math.max(0, t), true);
    if (clockText !== lastText) play.clock.textContent = lastText = clockText;
    const pos = playScene.meter.at(t);
    const on = pos.beat >= 0 && pos.bar > 0 ? pos.beatInBar - 1 : -1;
    if (on !== lastBeat) {
      [...play.beats.children].forEach((d, i) => d.classList.toggle("on", i === on));
      play.bar.textContent = on >= 0 ? `마디 ${pos.bar} · ${pos.beatInBar}/${playScene.chart.beatsPerBar}` : "마디 -";
      lastBeat = on;
    }
    const score = playScene.judge.stats().score;
    if (score !== lastScore) play.score.textContent = String((lastScore = score)).padStart(7, "0");
  } else if (screen === "edit" && editScene) {
    const clockText = formatTime(Math.max(0, t), true);
    if (clockText !== lastText) edit.clock.textContent = lastText = clockText;
    if (document.activeElement !== edit.seek) edit.seek.value = String(t);
  }
};

function formatTime(sec: number, withHundredths = false): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const base = `${m}:${String(s).padStart(2, "0")}`;
  return withHundredths ? `${base}.${String(Math.floor((sec % 1) * 100)).padStart(2, "0")}` : base;
}

// 개발 서버에서만: 브라우저 자동 테스트가 상태를 읽을 수 있게 한다
if (import.meta.env.DEV) {
  Object.assign(window, {
    __game: { time: () => audio().clock.time(), play: () => playScene, edit: () => editScene, stage },
  });
}

show("menu");
