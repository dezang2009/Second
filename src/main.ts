// 화면 흐름: 곡 목록 → 플레이 → 결과, 곡 목록 → 채보 만들기 (→ 시험 플레이 → 결과 → 채보 만들기).
// 음원과 직접 만든 채보, 최고 기록은 이 기기에만 보관한다.

import { audio, unlockAudio } from "./audio/audio";
import { AudioLoadError, decodeAudio, stripExtension } from "./audio/loader";
import { createMetronomeBuffer } from "./audio/metronome";
import { EditScene } from "./game/editScene";
import { rankOf, type JudgeStats } from "./game/judge";
import { PlayScene } from "./game/playScene";
import { Stage } from "./game/stage";
import { BUILTIN_CHARTS, builtinById, emptyChart, findBuiltinFor } from "./songs/catalog";
import { buildDemoChart } from "./songs/demo";
import type { Chart } from "./songs/types";
import { deleteSong, getSong, listSongs, newId, putSong, type SongRecord, updateSong } from "./storage/library";

const METRONOME_BARS = 64;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const stage = new Stage($<HTMLCanvasElement>("game"));

type ScreenName = "list" | "play" | "result" | "edit";
function show(name: ScreenName): void {
  for (const s of ["list", "play", "result", "edit"] as const) $(`screen-${s}`).hidden = s !== name;
  document.body.dataset.screen = name;
  document.body.classList.remove("running");
}

/** 지금 다루는 곡. 메트로놈 연습은 song이 null */
interface Current {
  song: SongRecord | null;
  title: string;
  buffer: AudioBuffer;
}
let current: Current | null = null;
let playScene: PlayScene | null = null;
let editScene: EditScene | null = null;
/** 결과 화면에서 돌아갈 곳. 에디터에서 시험 플레이했으면 에디터로 */
let returnTo: "list" | "edit" = "list";

function chartOf(song: SongRecord): Chart {
  return song.userChart ?? builtinById(song.builtinId)?.chart ?? emptyChart(song.title, song.durationMs);
}

function chartLabel(song: SongRecord): string {
  if (song.userChart) return `직접 만든 채보 · 노트 ${song.userChart.notes.length}개`;
  const b = builtinById(song.builtinId);
  return b ? `기본 채보 · 노트 ${b.chart.notes.length}개` : "채보 없음";
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

// ---------- 곡 목록 ----------

const list = {
  ul: $("song-list"),
  status: $("list-status"),
  file: $<HTMLInputElement>("file"),
};

function setStatus(el: HTMLElement, text: string, isError = false): void {
  el.textContent = text;
  el.classList.toggle("error", isError);
}

async function renderList(): Promise<void> {
  const songs = await listSongs();
  list.ul.replaceChildren();
  if (songs.length === 0) {
    const li = document.createElement("li");
    li.className = "song-empty";
    li.textContent = "아직 곡이 없어요. 아래 + 음원 추가로 폰에 있는 음원을 골라주세요.";
    list.ul.append(li);
    return;
  }
  for (const song of songs) list.ul.append(songRow(song));
}

function songRow(song: SongRecord): HTMLLIElement {
  const li = document.createElement("li");
  li.className = "song";
  const chart = chartOf(song);
  const hasNotes = chart.notes.length > 0;
  li.innerHTML = `
    <div class="song-main">
      <span class="song-title"></span>
      <span class="song-meta"></span>
      <span class="song-best"></span>
    </div>
    <div class="song-actions">
      <button class="btn small" data-act="play" type="button">플레이</button>
      <button class="btn ghost small" data-act="edit" type="button"></button>
      <button class="btn ghost small" data-act="delete" type="button">삭제</button>
    </div>`;
  const q = (sel: string) => li.querySelector(sel) as HTMLElement;
  q(".song-title").textContent = song.title;
  q(".song-meta").textContent = `${formatTime(song.durationMs / 1000)} · ${chartLabel(song)}`;
  const best = q(".song-best");
  if (song.best) {
    best.textContent = `최고 ${song.best.score.toLocaleString("ko-KR")}점 · ${song.best.rank} · 최대 콤보 ${song.best.maxCombo}`;
    best.classList.add("has");
  } else {
    best.textContent = hasNotes ? "아직 기록 없음" : "채보 만들기로 노트를 찍어주세요";
  }
  const playBtn = q('[data-act="play"]') as HTMLButtonElement;
  playBtn.disabled = !hasNotes;
  playBtn.addEventListener("click", () => {
    unlockAudio();
    void startSong(song.id);
  });
  const editBtn = q('[data-act="edit"]') as HTMLButtonElement;
  editBtn.textContent = hasNotes ? "채보 수정" : "채보 만들기";
  editBtn.addEventListener("click", () => {
    unlockAudio();
    void openEditor(song.id);
  });
  const del = q('[data-act="delete"]') as HTMLButtonElement;
  confirmTwice(del, "한 번 더 누르면 삭제", async () => {
    await deleteSong(song.id);
    if (decoded?.id === song.id) decoded = null;
    setStatus(list.status, `${song.title}을(를) 목록에서 지웠어요.`);
    await renderList();
  });
  return li;
}

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
    const builtin = findBuiltinFor(buffer.duration);
    const song: SongRecord = {
      id: newId(),
      title: builtin?.chart.title ?? stripExtension(file.name),
      fileName: file.name,
      durationMs: Math.round(buffer.duration * 1000),
      addedAt: Date.now(),
      audio: file,
      builtinId: builtin?.id ?? null,
      userChart: null,
      best: null,
    };
    await putSong(song);
    decoded = { id: song.id, buffer };
    setStatus(
      list.status,
      builtin
        ? `추가했어요. 기본 채보를 연결했어요 (노트 ${builtin.chart.notes.length}개).`
        : "추가했어요. 이 음원은 채보가 없어서 채보 만들기로 직접 만들 수 있어요.",
    );
    await renderList();
  } catch (e) {
    setStatus(list.status, e instanceof AudioLoadError ? e.message : "음원을 추가하지 못했어요.", true);
  }
});

$("metronome").addEventListener("click", () => {
  unlockAudio();
  const bpm = Math.round(BUILTIN_CHARTS[0].chart.bpm);
  const beatsPerBar = BUILTIN_CHARTS[0].chart.beatsPerBar;
  const buffer = createMetronomeBuffer(audio().ctx, bpm, beatsPerBar, METRONOME_BARS);
  const demo = buildDemoChart(bpm, beatsPerBar, METRONOME_BARS);
  current = { song: null, title: "메트로놈 연습", buffer };
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

async function startSong(id: string): Promise<void> {
  const song = await getSong(id);
  if (!song) return;
  try {
    current = { song, title: song.title, buffer: await bufferOf(song) };
  } catch (e) {
    setStatus(list.status, e instanceof AudioLoadError ? e.message : "음원을 열지 못했어요.", true);
    return;
  }
  editScene = null;
  returnTo = "list";
  await startPlay(chartOf(song));
}

async function startPlay(chart: Chart): Promise<void> {
  if (!current) return;
  playScene = new PlayScene(chart, stage);
  playScene.onFinish = (stats) => void showResult(stats);
  stage.setScene(playScene);
  play.title.textContent = current.title.toUpperCase();
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
  playScene.restart();
  lastScore = -1;
  clock.seek(0);
  await clock.play(playScene.leadIn);
}

function leavePlay(): void {
  playScene = null;
  stage.setScene(null);
  if (returnTo === "edit") void backToEditor();
  else {
    show("list");
    void renderList();
  }
}

// ---------- 결과 ----------

async function showResult(stats: JudgeStats): Promise<void> {
  audio().clock.pause();
  stage.setScene(null);
  const rank = rankOf(stats.score);
  $("result-title").textContent = (current?.title ?? "").toUpperCase() + (returnTo === "edit" ? " · 시험 플레이" : "");
  $("result-rank").textContent = rank;
  $("result-score").textContent = stats.score.toLocaleString("ko-KR");
  $("r-perfect").textContent = String(stats.perfect);
  $("r-great").textContent = String(stats.great);
  $("r-good").textContent = String(stats.good);
  $("r-miss").textContent = String(stats.miss);
  $("r-combo").textContent = String(stats.maxCombo);
  $("r-acc").textContent = `${stats.accuracy.toFixed(1)}%`;
  $("result-timing").textContent = timingText(stats.meanOffsetMs);
  $("result-back").textContent = returnTo === "edit" ? "편집으로" : "목록으로";

  // 최고 기록은 목록의 곡을 플레이했을 때만 남긴다 (시험 플레이, 메트로놈 제외)
  const badge = $("result-best");
  const prevEl = $("result-prev");
  badge.hidden = true;
  prevEl.textContent = "";
  const song = current?.song;
  if (song && returnTo === "list") {
    const prev = (await getSong(song.id))?.best ?? null;
    if (!prev || stats.score > prev.score) {
      await updateSong(song.id, { best: { score: stats.score, rank, maxCombo: stats.maxCombo, at: Date.now() } });
      badge.hidden = false;
    }
    if (prev) prevEl.textContent = `이전 최고 ${prev.score.toLocaleString("ko-KR")}점`;
  }
  show("result");
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
const HINT = "멈춘 상태에서 빈 곳을 누르면 노트 추가, 노트를 누르면 삭제. 녹음 중에는 치는 대로 기록되고, 길게 누르면 롱 노트가 돼요.";

async function openEditor(id: string): Promise<void> {
  const song = await getSong(id);
  if (!song) return;
  try {
    current = { song, title: song.title, buffer: await bufferOf(song) };
  } catch (e) {
    setStatus(list.status, e instanceof AudioLoadError ? e.message : "음원을 열지 못했어요.", true);
    return;
  }
  editScene = new EditScene(chartOf(song), stage);
  editScene.onChange = () => {
    dirty = true;
    updateEditUi();
  };
  dirty = false;
  edit.snap.value = String(editScene.division);
  edit.snap.disabled = !editScene.meter.hasBeats;
  edit.title.textContent = song.title.toUpperCase();
  edit.seek.max = String(current.buffer.duration);
  setStatus(edit.status, editScene.meter.hasBeats ? HINT : `${HINT} 이 곡은 박 정보가 없어서 박 맞추기는 꺼져 있어요.`);
  await backToEditor();
}

async function backToEditor(): Promise<void> {
  if (!editScene || !current) return;
  playScene = null;
  returnTo = "list";
  stage.setScene(editScene);
  audio().clock.load(current.buffer);
  show("edit");
  updateEditUi();
}

function updateEditUi(): void {
  if (!editScene) return;
  edit.count.textContent = `노트 ${editScene.draft.notes.length}개${dirty ? " · 저장 안 됨" : ""}`;
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
  show("list");
  void renderList();
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
  await updateSong(current.song.id, { userChart: editScene.toChart(), best: null });
  dirty = false;
  updateEditUi();
  setStatus(edit.status, "저장했어요. 채보가 바뀌어서 이 곡의 최고 기록은 지웠어요.");
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

show("list");
void renderList();
