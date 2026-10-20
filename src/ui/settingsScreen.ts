import { audio, unlockAudio } from "../audio/audio";
import { createMetronomeBuffer } from "../audio/metronome";
import { estimateOffset, MIN_TAPS } from "../game/calibrate";
import { DEFAULT_SETTINGS, type EffectLevel, LIMITS, scrollSecFor, settings, updateSettings } from "../settings";

// 설정 화면: 싱크(판정/화면) + 자동 맞추기, 노트 속도와 크기, 이펙트 세기, 소리 크기, 데이터 지우기.

const CALIB_BPM = 100;
const CALIB_BEATS = 24;
const CALIB_LEAD_SEC = 1;

interface SliderSpec {
  key: "audioOffsetMs" | "visualOffsetMs" | "noteSpeed" | "noteSize" | "musicVolume" | "hitVolume";
  label: string;
  help: string;
  step: number;
  /** -/+ 버튼으로 움직이는 양 */
  nudge: number;
  format: (v: number) => string;
}

const SYNC: SliderSpec[] = [
  {
    key: "audioOffsetMs",
    label: "판정 싱크",
    help: "결과 화면에서 계속 '늦게'(+)로 나오면 그만큼 올리고, '일찍'(-)이면 내려요. 블루투스 이어폰은 보통 +100~250ms.",
    step: 1,
    nudge: 5,
    format: (v) => `${v > 0 ? "+" : ""}${v}ms`,
  },
  {
    key: "visualOffsetMs",
    label: "화면 싱크",
    help: "판정은 맞는데 노트가 소리보다 늦게 판정선에 닿아 보이면 올려요. 대부분 0이면 돼요.",
    step: 1,
    nudge: 5,
    format: (v) => `${v > 0 ? "+" : ""}${v}ms`,
  },
];
const DISPLAY: SliderSpec[] = [
  { key: "noteSpeed", label: "노트 속도", help: "클수록 노트가 빨리 내려와요.", step: 0.5, nudge: 0.5, format: (v) => `${v.toFixed(1)} · ${scrollSecFor(v).toFixed(1)}초` },
  { key: "noteSize", label: "노트 크기", help: "노트 두께를 바꿔요.", step: 0.05, nudge: 0.05, format: (v) => `${Math.round(v * 100)}%` },
];
const SOUND: SliderSpec[] = [
  { key: "musicVolume", label: "음악 크기", help: "", step: 0.05, nudge: 0.05, format: (v) => `${Math.round(v * 100)}%` },
  { key: "hitVolume", label: "타격음 크기", help: "", step: 0.05, nudge: 0.05, format: (v) => `${Math.round(v * 100)}%` },
];

export interface SettingsScreenHooks {
  /** 모든 곡과 기록을 지운다 */
  wipeAll: () => Promise<void>;
  confirmTwice: (btn: HTMLButtonElement, askLabel: string, action: () => void | Promise<void>) => void;
}

export function setupSettingsScreen(root: HTMLElement, hooks: SettingsScreenHooks): { refresh: () => void; stop: () => void } {
  const status = root.querySelector<HTMLElement>("#settings-status")!;
  const refreshers: (() => void)[] = [];
  const say = (text: string, error = false) => {
    status.textContent = text;
    status.classList.toggle("error", error);
  };

  const sliderRow = (spec: SliderSpec): HTMLElement => {
    const [lo, hi] = LIMITS[spec.key];
    const row = document.createElement("div");
    row.className = "set-row";
    row.innerHTML = `
      <div class="set-head"><span class="set-label"></span><span class="set-value num"></span></div>
      <div class="set-control">
        <button class="btn ghost small step" type="button" aria-label="줄이기">−</button>
        <input type="range" />
        <button class="btn ghost small step" type="button" aria-label="늘리기">+</button>
      </div>
      <p class="set-help"></p>`;
    row.querySelector(".set-label")!.textContent = spec.label;
    const help = row.querySelector<HTMLElement>(".set-help")!;
    help.textContent = spec.help;
    help.hidden = !spec.help;
    const input = row.querySelector("input")!;
    input.id = `set-${spec.key}`;
    input.min = String(lo);
    input.max = String(hi);
    input.step = String(spec.step);
    input.setAttribute("aria-label", spec.label);
    const value = row.querySelector<HTMLElement>(".set-value")!;
    const refresh = () => {
      input.value = String(settings[spec.key]);
      value.textContent = spec.format(settings[spec.key]);
    };
    input.addEventListener("input", () => updateSettings({ [spec.key]: Number(input.value) }));
    const [minus, plus] = row.querySelectorAll<HTMLButtonElement>(".step");
    minus.addEventListener("click", () => updateSettings({ [spec.key]: round(settings[spec.key] - spec.nudge) }));
    plus.addEventListener("click", () => updateSettings({ [spec.key]: round(settings[spec.key] + spec.nudge) }));
    refreshers.push(refresh);
    return row;
  };

  const effectsRow = (): HTMLElement => {
    const row = document.createElement("div");
    row.className = "set-row";
    row.innerHTML = `<div class="set-head"><span class="set-label">이펙트</span></div><div class="seg" role="radiogroup" aria-label="이펙트"></div><p class="set-help">타격 물결, 고리, 박자 맥박의 세기예요.</p>`;
    const seg = row.querySelector(".seg")!;
    const options: [EffectLevel, string][] = [
      ["off", "끄기"],
      ["low", "약하게"],
      ["normal", "보통"],
    ];
    const buttons = options.map(([level, label]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "seg-btn";
      b.textContent = label;
      b.setAttribute("role", "radio");
      b.addEventListener("click", () => updateSettings({ effects: level }));
      seg.append(b);
      return [level, b] as const;
    });
    refreshers.push(() => {
      for (const [level, b] of buttons) {
        b.classList.toggle("on", settings.effects === level);
        b.setAttribute("aria-checked", String(settings.effects === level));
      }
    });
    return row;
  };

  const toggleRow = (): HTMLElement => {
    const row = document.createElement("div");
    row.className = "set-row";
    row.innerHTML = `<label class="toggle"><span class="set-label">타격음</span><input id="set-hitSound" type="checkbox" role="switch" /><span class="switch" aria-hidden="true"></span></label><p class="set-help">레인을 누를 때 짧게 '톡' 소리가 나요.</p>`;
    const input = row.querySelector("input")!;
    input.addEventListener("change", () => updateSettings({ hitSound: input.checked }));
    refreshers.push(() => (input.checked = settings.hitSound));
    return row;
  };

  const group = (title: string, ...rows: HTMLElement[]) => {
    const g = document.createElement("section");
    g.className = "set-group";
    const h = document.createElement("h2");
    h.textContent = title;
    g.append(h, ...rows);
    return g;
  };

  // 자동 맞추기
  const calib = document.createElement("div");
  calib.className = "calib";
  calib.innerHTML = `
    <div class="set-head"><span class="set-label">자동 맞추기</span><span class="calib-count num"></span></div>
    <p class="set-help">딸깍 소리에 맞춰 아래 버튼을 눌러주세요 (${CALIB_BEATS}번). 이어폰으로 플레이한다면 이어폰을 낀 채로 하세요.</p>
    <button class="btn calib-pad" type="button">시작</button>
    <div class="calib-result" hidden><span class="calib-text"></span><button class="btn small calib-apply" type="button">적용</button></div>`;
  const pad = calib.querySelector<HTMLButtonElement>(".calib-pad")!;
  const count = calib.querySelector<HTMLElement>(".calib-count")!;
  const resultBox = calib.querySelector<HTMLElement>(".calib-result")!;
  const resultText = calib.querySelector<HTMLElement>(".calib-text")!;
  const applyBtn = calib.querySelector<HTMLButtonElement>(".calib-apply")!;
  let running = false;
  let taps: number[] = [];
  let measured: number | null = null;
  let raf = 0;
  const beats = Array.from({ length: CALIB_BEATS }, (_, i) => (i * 60) / CALIB_BPM);

  const finish = () => {
    if (!running) return;
    running = false;
    cancelAnimationFrame(raf);
    audio().clock.pause();
    pad.textContent = "다시 하기";
    pad.classList.remove("tapping");
    count.textContent = "";
    const r = estimateOffset(beats, taps);
    resultBox.hidden = false;
    if (!r) {
      measured = null;
      resultText.textContent = `박에 맞춘 탭이 ${MIN_TAPS}번보다 적어서 잴 수 없어요. 다시 해 주세요.`;
      applyBtn.hidden = true;
      return;
    }
    measured = r.offsetMs;
    resultText.textContent = `측정값 ${r.offsetMs > 0 ? "+" : ""}${r.offsetMs}ms (탭 ${r.taps}번, 흔들림 ±${r.spreadMs}ms)`;
    applyBtn.hidden = false;
  };

  pad.addEventListener("pointerdown", (e) => {
    if (!running) return;
    e.preventDefault();
    const { clock } = audio();
    const lag = Math.min(0.1, Math.max(0, (performance.now() - e.timeStamp) / 1000));
    taps.push(clock.time() - lag);
    count.textContent = `${taps.length} / ${CALIB_BEATS}`;
  });
  pad.addEventListener("click", async () => {
    if (running) return;
    unlockAudio();
    const { ctx, clock } = audio();
    clock.load(createMetronomeBuffer(ctx, CALIB_BPM, 4, CALIB_BEATS / 4));
    taps = [];
    running = true;
    resultBox.hidden = true;
    pad.textContent = "딸깍 소리에 맞춰 누르기";
    pad.classList.add("tapping");
    count.textContent = `0 / ${CALIB_BEATS}`;
    await clock.play(CALIB_LEAD_SEC);
    const watch = () => {
      if (!running) return;
      if (clock.time() > beats[beats.length - 1] + 0.8 || clock.state === "ended") finish();
      else raf = requestAnimationFrame(watch);
    };
    raf = requestAnimationFrame(watch);
  });
  applyBtn.addEventListener("click", () => {
    if (measured === null) return;
    updateSettings({ audioOffsetMs: measured });
    say(`판정 싱크를 ${measured > 0 ? "+" : ""}${measured}ms로 맞췄어요.`);
  });

  // 데이터
  const data = document.createElement("div");
  data.className = "set-row data-row";
  data.innerHTML = `
    <button class="btn ghost small" data-act="reset-settings" type="button">설정 기본값으로</button>
    <button class="btn ghost small" data-act="wipe" type="button">모든 곡과 기록 지우기</button>
    <p class="set-help">곡을 지우면 이 기기에 보관한 음원, 채보, 최고 기록이 모두 사라지고 되돌릴 수 없어요.</p>`;
  data.querySelector('[data-act="reset-settings"]')!.addEventListener("click", () => {
    updateSettings({ ...DEFAULT_SETTINGS });
    say("설정을 기본값으로 되돌렸어요.");
  });
  hooks.confirmTwice(data.querySelector<HTMLButtonElement>('[data-act="wipe"]')!, "한 번 더 누르면 모두 지움", async () => {
    try {
      await hooks.wipeAll();
      say("모든 곡과 기록을 지웠어요.");
    } catch {
      say("지우지 못했어요. 앱을 다시 열고 시도해 주세요.", true);
    }
  });

  const body = root.querySelector<HTMLElement>(".settings-body")!;
  body.append(
    group("싱크", ...SYNC.map(sliderRow), calib),
    group("화면", ...DISPLAY.map(sliderRow), effectsRow()),
    group("소리", sliderRow(SOUND[0]), toggleRow(), sliderRow(SOUND[1])),
    group("데이터", data),
  );

  const refresh = () => refreshers.forEach((r) => r());
  refresh();
  return {
    refresh,
    stop: () => {
      if (running) finish();
      status.textContent = "";
    },
  };
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}
