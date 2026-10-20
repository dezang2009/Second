// 1단계 화면: 음원 불러오기 + 오디오 시계 확인.
// 시계가 맞는지 눈과 귀로 확인할 수 있게 마디/박 표시와 점 격자 맥박을 같이 보여준다.

import { AudioClock } from "./audio/clock";
import { AudioLoadError, loadAudioFile } from "./audio/loader";
import { createMetronomeBuffer } from "./audio/metronome";
import { drawDotField, smoothPulse } from "./render/dotField";
import { alwaysWithMe } from "./songs/always-with-me";
import { beatAt } from "./songs/types";

const chart = alwaysWithMe;
const METRONOME_BARS = 64;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>("game");
const ctx2d = canvas.getContext("2d")!;
const ui = {
  title: $("song-title"),
  meta: $("song-meta"),
  clock: $("clock"),
  bar: $("bar"),
  beats: $("beats"),
  file: $<HTMLInputElement>("file"),
  metronome: $<HTMLButtonElement>("metronome"),
  track: $("track"),
  play: $<HTMLButtonElement>("play"),
  seek: $<HTMLInputElement>("seek"),
  duration: $("duration"),
  status: $("status"),
};

ui.title.textContent = chart.title.toUpperCase();
ui.meta.textContent = `${chart.bpm} BPM · ${chart.beatsPerBar}/4`;
const beatDots = Array.from({ length: chart.beatsPerBar }, () => ui.beats.appendChild(document.createElement("span")));

// AudioContext는 첫 터치 때 만든다 (모바일은 사용자 동작 없이 소리를 막음)
let clock: AudioClock | null = null;
function getClock(): AudioClock {
  if (!clock) {
    clock = new AudioClock(new AudioContext({ latencyHint: "interactive" }));
    clock.onEnded = () => updatePlayButton();
  }
  return clock;
}

function setStatus(text: string, isError = false): void {
  ui.status.textContent = text;
  ui.status.classList.toggle("error", isError);
}

// 박자 표시 기준이 되는 첫 박 위치. 메트로놈은 0, 사용자 음원은 채보의 offsetMs
let meterOffsetMs = chart.offsetMs;

function onLoaded(name: string, buffer: AudioBuffer, offsetMs: number, note: string): void {
  const c = getClock();
  c.load(buffer);
  meterOffsetMs = offsetMs;
  ui.track.textContent = name;
  ui.track.classList.add("loaded");
  ui.seek.max = String(buffer.duration);
  ui.seek.value = "0";
  ui.seek.disabled = false;
  ui.play.disabled = false;
  ui.duration.textContent = formatTime(buffer.duration, false);
  updatePlayButton();
  setStatus(note);
}

ui.file.addEventListener("change", async () => {
  const file = ui.file.files?.[0];
  ui.file.value = ""; // 같은 파일을 다시 골라도 change가 오도록
  if (!file) return;
  const c = getClock();
  c.pause();
  setStatus("불러오는 중…");
  try {
    const track = await loadAudioFile(c.ctx, file);
    onLoaded(track.name, track.buffer, chart.offsetMs, "박자 표시는 아직 이 음원에 맞추지 않았어요. 탭 녹음 단계에서 맞춰요.");
  } catch (e) {
    setStatus(e instanceof AudioLoadError ? e.message : "음원을 불러오지 못했어요.", true);
  }
});

ui.metronome.addEventListener("click", () => {
  const c = getClock();
  c.pause();
  const buffer = createMetronomeBuffer(c.ctx, chart.bpm, chart.beatsPerBar, METRONOME_BARS);
  onLoaded(
    `메트로놈 · ${chart.bpm} BPM · ${chart.beatsPerBar}/4`,
    buffer,
    0,
    "딸깍 소리와 가운데 점이 동시에 움직이면 시계가 맞는 거예요.",
  );
});

ui.play.addEventListener("click", async () => {
  const c = getClock();
  if (c.state === "playing") c.pause();
  else await c.play();
  updatePlayButton();
});

let seeking = false;
ui.seek.addEventListener("input", () => {
  seeking = true;
  ui.clock.textContent = formatTime(Number(ui.seek.value), true);
});
ui.seek.addEventListener("change", () => {
  seeking = false;
  getClock().seek(Number(ui.seek.value));
  updatePlayButton();
});

function updatePlayButton(): void {
  ui.play.textContent = clock?.state === "playing" ? "일시정지" : clock?.state === "ended" ? "처음부터" : "재생";
}

// ---------- 화면 ----------

let width = 0;
let height = 0;
function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  width = canvas.clientWidth;
  height = canvas.clientHeight;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
}

let lastClockText = "";
let lastBarText = "";
let lastBeat = -1;

function frame(): void {
  const t = clock?.time() ?? 0;
  const playing = clock?.state === "playing";
  const pos = beatAt(t, chart.bpm, chart.beatsPerBar, meterOffsetMs);
  const started = pos.beat >= 0 && clock !== null && clock.duration > 0;

  const pulse = playing && started ? smoothPulse(pos.phase) * (pos.beatInBar === 1 ? 1 : 0.6) : 0;
  drawDotField(ctx2d, width, height, { x: width * 0.14, width: width * 0.72, bottom: height * 0.8 }, pulse);

  if (!seeking) {
    const clockText = formatTime(Math.max(0, t), true);
    if (clockText !== lastClockText) ui.clock.textContent = lastClockText = clockText;
    if (playing) ui.seek.value = String(t);
  }
  const barText = started ? `마디 ${pos.bar} · ${pos.beatInBar}/${chart.beatsPerBar}` : `마디 - · -/${chart.beatsPerBar}`;
  if (barText !== lastBarText) ui.bar.textContent = lastBarText = barText;
  const beat = started ? pos.beatInBar - 1 : -1;
  if (beat !== lastBeat) {
    beatDots.forEach((d, i) => d.classList.toggle("on", i === beat));
    lastBeat = beat;
  }

  requestAnimationFrame(frame);
}

function formatTime(sec: number, withHundredths: boolean): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const base = `${m}:${String(s).padStart(2, "0")}`;
  return withHundredths ? `${base}.${String(Math.floor((sec % 1) * 100)).padStart(2, "0")}` : base;
}

window.addEventListener("resize", resize);
resize();
requestAnimationFrame(frame);
