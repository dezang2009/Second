// 플레이 화면: 음원(또는 메트로놈)을 재생하면서 점 패턴 위에 노트를 떨어뜨리고,
// 레인 터치(또는 D F J K 키)를 판정해 콤보와 점수를 센다.

import { AudioClock } from "./audio/clock";
import { AudioLoadError, loadAudioFile } from "./audio/loader";
import { createMetronomeBuffer } from "./audio/metronome";
import { Judge, rankOf, type JudgeStats } from "./game/judge";
import { drawDotField, smoothPulse } from "./render/dotField";
import { drawCombo, Effects } from "./render/effects";
import { computeLayout, LANES, type Layout, laneCenterX } from "./render/layout";
import { Playfield } from "./render/playfield";
import { alwaysWithMe, matchesChart } from "./songs/always-with-me";
import { buildDemoChart } from "./songs/demo";
import { Meter } from "./songs/meter";
import type { Chart } from "./songs/types";

const METRONOME_BARS = 64;
/** 노트가 화면 위에서 판정선까지 내려오는 시간. 나중에 노트 속도 설정으로 바꾼다. */
const SCROLL_SEC = 1.6;
const KEY_LANES: Record<string, number> = { KeyD: 0, KeyF: 1, KeyJ: 2, KeyK: 3 };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>("game");
const ctx2d = canvas.getContext("2d")!;
const ui = {
  title: $("song-title"),
  meta: $("song-meta"),
  clock: $("clock"),
  bar: $("bar"),
  beats: $("beats"),
  pause: $<HTMLButtonElement>("pause"),
  score: $("score"),
  file: $<HTMLInputElement>("file"),
  metronome: $<HTMLButtonElement>("metronome"),
  track: $("track"),
  play: $<HTMLButtonElement>("play"),
  seek: $<HTMLInputElement>("seek"),
  duration: $("duration"),
  status: $("status"),
};

let layout: Layout = computeLayout(1, 1);
const effects = new Effects();
let chart: Chart = alwaysWithMe;
let meter = new Meter(chart);
let judge = new Judge(chart, LANES);
let playfield = new Playfield(judge.notes, meter);
let beatDots: HTMLElement[] = [];
/** 지금 눌려 있는 손가락(또는 키) → 레인 */
const held = new Map<number, number>();

function useChart(next: Chart): void {
  chart = next;
  meter = new Meter(chart);
  judge = new Judge(chart, LANES);
  judge.onJudge = (e) => effects.add(laneCenterX(layout, e.lane), layout.judgeY, e.grade, nowSec());
  playfield = new Playfield(judge.notes, meter);
  effects.clear();
  held.clear();
  ui.title.textContent = chart.title.toUpperCase();
  ui.meta.textContent = `${chart.beats ? "≈" : ""}${Math.round(chart.bpm)} BPM · ${chart.beatsPerBar}/4`;
  ui.beats.replaceChildren();
  beatDots = Array.from({ length: chart.beatsPerBar }, () => ui.beats.appendChild(document.createElement("span")));
  lastBeat = -1;
}

// AudioContext는 첫 터치 때 만든다 (모바일은 사용자 동작 없이 소리를 막음)
let clock: AudioClock | null = null;
function getClock(): AudioClock {
  if (!clock) {
    clock = new AudioClock(new AudioContext({ latencyHint: "interactive" }));
    clock.onEnded = () => {
      updatePlayState();
      if (judge.notes.length) setStatus(resultText(judge.stats()));
    };
  }
  return clock;
}

function setStatus(text: string, isError = false): void {
  ui.status.textContent = text;
  ui.status.classList.toggle("error", isError);
}

function onLoaded(name: string, buffer: AudioBuffer, nextChart: Chart, note: string): void {
  const c = getClock();
  c.load(buffer);
  useChart(nextChart);
  ui.track.textContent = name;
  ui.track.classList.add("loaded");
  ui.seek.max = String(buffer.duration);
  ui.seek.value = "0";
  ui.seek.disabled = false;
  ui.play.disabled = false;
  ui.duration.textContent = formatTime(buffer.duration, false);
  updatePlayState();
  setStatus(note);
}

ui.file.addEventListener("change", async () => {
  const file = ui.file.files?.[0];
  ui.file.value = ""; // 같은 파일을 다시 골라도 change가 오도록
  if (!file) return;
  const c = getClock();
  c.pause();
  updatePlayState();
  setStatus("불러오는 중…");
  try {
    const track = await loadAudioFile(c.ctx, file);
    if (matchesChart(alwaysWithMe, track.buffer.duration)) {
      onLoaded(track.name, track.buffer, alwaysWithMe, `채보를 연결했어요. 노트 ${alwaysWithMe.notes.length}개`);
    } else {
      onLoaded(
        track.name,
        track.buffer,
        { ...alwaysWithMe, notes: [], beats: undefined, bars: undefined, durationMs: track.buffer.duration * 1000 },
        `채보를 만든 음원과 길이가 달라서 노트를 끄고 재생해요. (채보 ${formatTime(alwaysWithMe.durationMs / 1000, false)} · 고른 파일 ${formatTime(track.buffer.duration, false)})`,
      );
    }
  } catch (e) {
    setStatus(e instanceof AudioLoadError ? e.message : "음원을 불러오지 못했어요.", true);
  }
});

ui.metronome.addEventListener("click", () => {
  const c = getClock();
  c.pause();
  const bpm = Math.round(alwaysWithMe.bpm);
  const { beatsPerBar } = alwaysWithMe;
  const buffer = createMetronomeBuffer(c.ctx, bpm, beatsPerBar, METRONOME_BARS);
  const demo = buildDemoChart(bpm, beatsPerBar, METRONOME_BARS);
  onLoaded(
    `메트로놈 연습 · ${bpm} BPM · ${beatsPerBar}/4 · 노트 ${demo.notes.length}개`,
    buffer,
    demo,
    "두 마디 뒤부터 노트가 내려와요. 딸깍 소리와 고리가 퍼지는 순간이 같으면 싱크가 맞는 거예요.",
  );
});

async function togglePlay(): Promise<void> {
  const c = getClock();
  if (c.state === "playing") {
    c.pause();
    releaseAll();
  } else {
    if (c.state === "ended") restartJudge(0);
    await c.play();
  }
  updatePlayState();
}

function restartJudge(fromSec: number): void {
  judge.reset(fromSec);
  effects.clear();
  releaseAll();
}
ui.play.addEventListener("click", togglePlay);
ui.pause.addEventListener("click", togglePlay);

let seeking = false;
ui.seek.addEventListener("input", () => {
  seeking = true;
  ui.clock.textContent = formatTime(Number(ui.seek.value), true);
});
ui.seek.addEventListener("change", () => {
  seeking = false;
  getClock().seek(Number(ui.seek.value));
  restartJudge(Number(ui.seek.value));
  updatePlayState();
});

function updatePlayState(): void {
  const state = clock?.state;
  document.body.classList.toggle("playing", state === "playing");
  ui.play.textContent = state === "playing" ? "일시정지" : state === "ended" ? "처음부터" : "재생";
}

// ---------- 입력 ----------

/** 이벤트가 실제로 일어난 순간의 곡 시각. 프레임을 기다린 만큼 되돌린다 */
function songTimeOf(eventTimeStamp: number): number {
  const lag = Math.min(0.1, Math.max(0, (performance.now() - eventTimeStamp) / 1000));
  return (clock?.time() ?? 0) - lag;
}

function laneAtX(x: number): number {
  const lane = Math.floor((x - layout.laneLeft) / layout.laneWidth);
  return Math.min(LANES - 1, Math.max(0, lane)); // 레인 바깥을 눌러도 가장 가까운 레인으로
}

function press(id: number, lane: number, timeStamp: number): void {
  if (clock?.state !== "playing") return;
  held.set(id, lane);
  judge.press(lane, songTimeOf(timeStamp), id);
}

function release(id: number, timeStamp: number): void {
  if (!held.delete(id)) return;
  judge.release(id, songTimeOf(timeStamp));
}

function releaseAll(): void {
  for (const id of [...held.keys()]) release(id, performance.now());
}

canvas.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  press(e.pointerId, laneAtX(e.clientX), e.timeStamp);
});
canvas.addEventListener("pointerup", (e) => release(e.pointerId, e.timeStamp));
canvas.addEventListener("pointercancel", (e) => release(e.pointerId, e.timeStamp));

// 컴퓨터에서 시험할 때: D F J K
const keyId = (lane: number) => -1 - lane;
window.addEventListener("keydown", (e) => {
  const lane = KEY_LANES[e.code];
  if (lane === undefined || e.repeat) return;
  press(keyId(lane), lane, e.timeStamp);
});
window.addEventListener("keyup", (e) => {
  const lane = KEY_LANES[e.code];
  if (lane !== undefined) release(keyId(lane), e.timeStamp);
});

// ---------- 화면 ----------

const nowSec = () => performance.now() / 1000;

function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
  layout = computeLayout(w, h);
}

let lastClockText = "";
let lastScore = -1;
let lastBarText = "";
let lastBeat = -1;

function frame(): void {
  const t = clock?.time() ?? 0;
  const playing = clock?.state === "playing";
  const pos = meter.at(t);
  const started = pos.beat >= 0 && clock !== null && clock.duration > 0;

  if (playing) judge.update(t);
  const stats = judge.stats();
  const now = nowSec();

  const pulse = playing && started ? smoothPulse(pos.phase) * (pos.beatInBar === 1 ? 1 : 0.6) : 0;
  drawDotField(
    ctx2d,
    layout.width,
    layout.height,
    { x: layout.laneLeft, width: layout.laneWidth * LANES, bottom: layout.judgeY },
    pulse,
    effects.waves(now),
  );
  playfield.draw(ctx2d, layout, t, { scrollSec: SCROLL_SEC, heldLanes: new Set(held.values()) });
  effects.draw(ctx2d, now, layout.width / 2, layout.judgeY - 28);
  drawCombo(ctx2d, stats.combo, layout.width / 2, layout.judgeY + (layout.height - layout.judgeY) * 0.55);

  if (stats.score !== lastScore) {
    ui.score.textContent = String(stats.score).padStart(7, "0");
    lastScore = stats.score;
  }

  if (!seeking) {
    const clockText = formatTime(Math.max(0, t), true);
    if (clockText !== lastClockText) ui.clock.textContent = lastClockText = clockText;
    if (playing) ui.seek.value = String(t);
  }
  const barText = started && pos.bar > 0 ? `마디 ${pos.bar} · ${pos.beatInBar}/${chart.beatsPerBar}` : "마디 -";
  if (barText !== lastBarText) ui.bar.textContent = lastBarText = barText;
  const beat = started && pos.bar > 0 ? pos.beatInBar - 1 : -1;
  if (beat !== lastBeat) {
    beatDots.forEach((d, i) => d.classList.toggle("on", i === beat));
    lastBeat = beat;
  }

  requestAnimationFrame(frame);
}

function resultText(s: JudgeStats): string {
  return `결과 · ${s.score.toLocaleString("ko-KR")}점 (${rankOf(s.score)}) · 최대 콤보 ${s.maxCombo} · perfect ${s.perfect} · great ${s.great} · good ${s.good} · miss ${s.miss}`;
}

function formatTime(sec: number, withHundredths: boolean): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const base = `${m}:${String(s).padStart(2, "0")}`;
  return withHundredths ? `${base}.${String(Math.floor((sec % 1) * 100)).padStart(2, "0")}` : base;
}

// 개발 서버에서만: 브라우저 자동 테스트가 시계와 판정 상태를 읽을 수 있게 한다
if (import.meta.env.DEV) {
  Object.assign(window, { __game: { time: () => clock?.time() ?? 0, judge: () => judge, layout: () => layout } });
}

useChart(chart);
window.addEventListener("resize", resize);
resize();
requestAnimationFrame(frame);
