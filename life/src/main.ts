import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./style.css";

import { activitiesFor } from "./data/activities";
import { choose, chooseActivity, currentChoices, currentEventText, newLife, proceed, rollCandidates, type Candidate } from "./game/engine";
import { netWorth, num, present } from "./game/life";
import { ACHIEVEMENTS, judge } from "./game/score";
import { formatMoney, josa } from "./game/text";
import { STATS, STAT_LABEL, TALENT_LABEL, WEALTH_LABEL, type Gender, type Life } from "./game/types";
import { addToHall, clearCurrent, exportSave, importSave, loadCurrent, loadHall, saveCurrent, unlockedAchievements, type HallEntry } from "./storage/save";
import { changeChips, choiceHint, esc, highlights, personLine, stageOf, visiblePeople } from "./ui/format";

type Screen =
  | { kind: "title" }
  | { kind: "create"; name: string; gender: Gender; seed: number; candidates: Candidate[] }
  | { kind: "play"; tab: "now" | "people" | "log" }
  | { kind: "hall" }
  | { kind: "hallEntry"; id: string }
  | { kind: "settings"; message?: string };

const app = document.getElementById("app")!;
let screen: Screen = { kind: "title" };
let life: Life | null = loadCurrent();

const newSeed = () => (Math.random() * 2 ** 32) >>> 0;

function go(next: Screen): void {
  screen = next;
  render();
  window.scrollTo({ top: 0 });
}

function render(): void {
  switch (screen.kind) {
    case "title":
      app.innerHTML = titleView();
      break;
    case "create":
      app.innerHTML = createView(screen);
      break;
    case "play":
      app.innerHTML = life ? (life.phase.kind === "dead" && screen.tab === "now" ? deathView(life) : playView(life, screen.tab)) : titleView();
      break;
    case "hall":
      app.innerHTML = hallView();
      break;
    case "hallEntry":
      app.innerHTML = hallEntryView(screen.id);
      break;
    case "settings":
      app.innerHTML = settingsView(screen.message);
      break;
  }
}

// ── 화면 ──────────────────────────────────────────────

function titleView(): string {
  const canContinue = life && life.phase.kind !== "dead";
  return `
    <section class="screen title-screen">
      <div class="title-block">
        <p class="kicker">TEXT LIFE SIMULATION</p>
        <h1 class="game-title">한 번뿐인 인생</h1>
        <p class="muted">선택이 모여 한 사람의 일생이 됩니다</p>
      </div>
      <nav class="menu">
        ${canContinue ? `<button class="btn primary" data-act="continue">이어 하기<span class="sub">${esc(life!.name)} · ${life!.age}살</span></button>` : ""}
        <button class="btn ${canContinue ? "" : "primary"}" data-act="new">새 인생 시작</button>
        <button class="btn" data-act="hall">명예의 전당<span class="sub">${loadHall().length}명의 인생</span></button>
        <button class="btn ghost" data-act="settings">설정</button>
      </nav>
    </section>`;
}

function createView(s: Extract<Screen, { kind: "create" }>): string {
  const cards = s.candidates
    .map((c, i) => {
      const bars = (["health", "smarts", "looks", "fitness", "social"] as const)
        .map((k) => statBar(STAT_LABEL[k], c.stats[k]))
        .join("");
      const sib = c.sibling ? `<li>${c.sibling.bornAt < 0 ? "손위" : "손아래"} ${c.sibling.gender === "남" ? "남자" : "여자"} 형제 ${esc(c.sibling.name)}</li>` : "<li>외동</li>";
      return `
        <article class="card candidate">
          <header><h3>${esc(c.surname)}씨 집안의 아이</h3><span class="tag">${WEALTH_LABEL[c.wealth]}</span></header>
          <ul class="facts">
            <li>아빠 ${esc(c.dad)} (${c.dadAge}살) · 엄마 ${esc(c.mom)} (${c.momAge}살)</li>
            ${sib}
            <li>타고난 재능 <b>???</b></li>
          </ul>
          <div class="bars">${bars}</div>
          <button class="btn primary" data-act="pick" data-i="${i}">이 아이로 태어나기</button>
        </article>`;
    })
    .join("");
  return `
    <section class="screen">
      <header class="topbar"><button class="link" data-act="home">← 처음으로</button></header>
      <h2>새 인생</h2>
      <div class="card form">
        <label>이름 <span class="muted">(성은 집안을 따라요)</span>
          <input id="name" maxlength="6" value="${esc(s.name)}" placeholder="예: 지민" autocomplete="off" />
        </label>
        <div class="seg" role="radiogroup" aria-label="성별">
          ${(["남", "여"] as Gender[]).map((g) => `<button class="seg-btn ${s.gender === g ? "on" : ""}" data-act="gender" data-g="${g}" role="radio" aria-checked="${s.gender === g}">${g === "남" ? "남자" : "여자"}</button>`).join("")}
        </div>
      </div>
      <div class="row-between"><h3>어디에서 태어날까요?</h3><button class="link" data-act="reroll">다시 뽑기</button></div>
      <p class="muted small">세 아이의 능력치 합은 모두 같아요. 구성만 다릅니다.</p>
      <div class="stack">${cards}</div>
    </section>`;
}

function statBar(label: string, v: number, delta?: number): string {
  const d = delta ? `<span class="delta ${delta > 0 ? "up" : "down"}">${delta > 0 ? "+" : "−"}${Math.abs(delta)}</span>` : "";
  return `<div class="bar"><span class="bar-label">${esc(label)}</span><span class="bar-track"><span class="bar-fill" style="width:${v}%"></span></span><span class="bar-num">${v}${d}</span></div>`;
}

function playView(l: Life, tab: "now" | "people" | "log"): string {
  const header = `
    <header class="life-head">
      <div class="row-between">
        <button class="link" data-act="home">☰</button>
        <div class="who"><b>${esc(l.name)}</b> <span class="muted">${l.gender === "남" ? "남" : "여"} · ${esc(stageOf(l))}</span></div>
        <div class="age">${l.age}<small>살</small></div>
      </div>
      <div class="money-row">
        <span>재산 <b>${formatMoney(l.money)}</b></span>
        ${num(l, "houseValue") > 0 ? `<span>집 <b>${formatMoney(num(l, "houseValue"))}</b></span>` : ""}
        <span>명성 <b>${l.fame}</b></span>
      </div>
      <div class="bars compact">${STATS.map((s) => statBar(STAT_LABEL[s], l.stats[s])).join("")}</div>
      <div class="hidden-row muted small">
        재능 <b>${l.revealed.talent ? TALENT_LABEL[l.hidden.talent] : "???"}</b> ·
        끈기 <b>${l.revealed.grit ? l.hidden.grit : "???"}</b> ·
        운 <b>${l.revealed.luck ? l.hidden.luck : "???"}</b>
      </div>
      <nav class="tabs">
        ${(
          [
            ["now", l.alive ? "올해" : "돌아보기"],
            ["people", "사람들"],
            ["log", "연표"],
          ] as const
        )
          .map(([k, t]) => `<button class="tab ${tab === k ? "on" : ""}" data-act="tab" data-tab="${k}">${t}</button>`)
          .join("")}
      </nav>
    </header>`;
  const body = tab === "people" ? peopleView(l) : tab === "log" ? logView(l) : phaseView(l);
  return `<section class="screen play">${header}<div class="play-body">${body}</div></section>`;
}

function phaseView(l: Life): string {
  const ph = l.phase;
  switch (ph.kind) {
    case "activity": {
      const acts = activitiesFor(l);
      return `
        <article class="card">
          <p class="eyebrow">${l.age}살의 한 해</p>
          <h3>올해는 무엇에 시간을 쓸까요?</h3>
          <div class="choices">
            ${acts.map((a) => `<button class="choice" data-act="activity" data-id="${a.id}"><span>${esc(a.label)}</span><span class="muted small">${esc(a.desc)}</span></button>`).join("")}
          </div>
        </article>`;
    }
    case "event": {
      const cs = currentChoices(l);
      return `
        <article class="card event">
          <p class="eyebrow">${l.age}살</p>
          <p class="story">${esc(currentEventText(l))}</p>
          <div class="choices">
            ${cs.map((c) => `<button class="choice" data-act="choose" data-i="${c.index}"><span>${esc(c.choice.text)}</span>${choiceHint(l, c.choice, c.chance)}</button>`).join("")}
          </div>
        </article>`;
    }
    case "outcome":
      return `
        <article class="card outcome">
          ${ph.result ? `<p class="result ${ph.result}">${ph.result === "success" ? "성공" : "실패"}</p>` : ""}
          <p class="story">${esc(ph.text)}</p>
          ${changeChips(ph.changes)}
          <button class="btn primary" data-act="next">계속</button>
        </article>`;
    case "yearEnd":
      return `
        <article class="card year-end">
          <p class="eyebrow">${l.age}살을 마치며</p>
          <ul class="lines">${ph.lines.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
          ${changeChips(ph.changes)}
          <button class="btn primary" data-act="next">${l.alive ? `${l.age + 1}살로` : "인생을 돌아보기"}</button>
        </article>`;
    default:
      return "";
  }
}

function peopleView(l: Life): string {
  const people = visiblePeople(l);
  if (people.length === 0) return `<p class="empty muted">아직 아는 사람이 없어요.</p>`;
  return `<ul class="people">${people
    .map(
      (p) => `
      <li class="person ${present(l, p) ? "" : "gone"}">
        <div>${personLine(l, p)}</div>
        ${p.alive ? `<span class="bar-track small" title="호감도 ${p.affinity}"><span class="bar-fill warm" style="width:${p.affinity}%"></span></span>` : ""}
      </li>`,
    )
    .join("")}</ul>`;
}

function logView(l: Life): string {
  if (l.log.length === 0) return `<p class="empty muted">아직 기록이 없어요.</p>`;
  return `<ol class="timeline">${[...l.log]
    .reverse()
    .map((y) => `<li><span class="t-age">${y.age}살</span><div>${y.lines.map((t) => `<p>${esc(t)}</p>`).join("") || `<p class="muted">조용한 한 해</p>`}</div></li>`)
    .join("")}</ol>`;
}

function verdictBlock(v: ReturnType<typeof judge>): string {
  const names = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));
  return `
    <div class="grade-block">
      <div class="grade g-${v.grade}">${v.grade}</div>
      <div><p class="v-title">${esc(v.title)}</p><p class="muted">종합 ${v.total}점</p></div>
    </div>
    <div class="bars">${v.scores.map((s) => statBar(s.label, s.value)).join("")}</div>
    ${
      v.achievements.length
        ? `<h4>얻은 업적</h4><ul class="badges">${v.achievements.map((id) => `<li title="${esc(names.get(id)?.desc ?? "")}">${esc(names.get(id)?.name ?? id)}</li>`).join("")}</ul>`
        : ""
    }`;
}

function deathView(l: Life): string {
  const v = judge(l);
  archive(l, v);
  const lines = highlights(l);
  return `
    <section class="screen">
      <article class="card death">
        <p class="eyebrow">${esc(l.name)} · ${l.age}세</p>
        <h2>${esc(josa(`${l.causeOfDeath}(으)로 눈을 감았다`))}</h2>
        <p class="muted small">최종 재산 ${formatMoney(netWorth(l))} · 학력 ${esc(l.education)} · ${esc(l.job?.title ?? (l.flags.retired ? "은퇴" : "무직"))}</p>
        ${verdictBlock(v)}
        <h4>인생의 순간들</h4>
        <ul class="lines">${lines.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
      </article>
      <div class="stack">
        <button class="btn primary" data-act="new">새 인생 시작</button>
        <button class="btn" data-act="tab" data-tab="log">전체 연표 보기</button>
        <button class="btn ghost" data-act="finish">처음으로</button>
      </div>
    </section>`;
}

function archive(l: Life, v: ReturnType<typeof judge>): void {
  if (l.flags.archived) return;
  l.flags.archived = true;
  const entry: HallEntry = {
    id: `${l.seed}-${l.name}`,
    name: l.name,
    gender: l.gender,
    age: l.age,
    cause: l.causeOfDeath ?? "",
    job: l.job?.title ?? (l.flags.retired ? "은퇴" : "무직"),
    education: l.education,
    verdict: v,
    highlights: highlights(l),
    endedAt: Date.now(),
  };
  addToHall(entry);
  saveCurrent(l);
}

function hallView(): string {
  const hall = loadHall();
  const unlocked = unlockedAchievements();
  return `
    <section class="screen">
      <header class="topbar"><button class="link" data-act="home">← 처음으로</button></header>
      <h2>명예의 전당</h2>
      ${
        hall.length === 0
          ? `<p class="empty muted">아직 끝난 인생이 없어요.</p>`
          : `<ul class="hall">${hall
              .map(
                (e) => `
            <li><button class="hall-row" data-act="hallEntry" data-id="${esc(e.id)}">
              <span class="grade small g-${e.verdict.grade}">${e.verdict.grade}</span>
              <span class="hall-main"><b>${esc(e.name)}</b> <span class="muted">${e.age}세 · ${esc(e.job)}</span><br /><span class="small">${esc(e.verdict.title)}</span></span>
              <span class="muted small">${e.verdict.total}점</span>
            </button></li>`,
              )
              .join("")}</ul>`
      }
      <h3>업적 <span class="muted small">${unlocked.size} / ${ACHIEVEMENTS.length}</span></h3>
      <ul class="badges all">${ACHIEVEMENTS.map((a) => `<li class="${unlocked.has(a.id) ? "" : "locked"}"><b>${esc(a.name)}</b><span class="small">${esc(a.desc)}</span></li>`).join("")}</ul>
    </section>`;
}

function hallEntryView(id: string): string {
  const e = loadHall().find((x) => x.id === id);
  if (!e) return hallView();
  return `
    <section class="screen">
      <header class="topbar"><button class="link" data-act="hall">← 명예의 전당</button></header>
      <article class="card death">
        <p class="eyebrow">${esc(e.name)} · ${e.age}세 · ${esc(e.job)} · ${esc(e.education)}</p>
        <h2>${esc(josa(`${e.cause}(으)로 눈을 감았다`))}</h2>
        ${verdictBlock(e.verdict)}
        <h4>인생의 순간들</h4>
        <ul class="lines">${e.highlights.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
      </article>
    </section>`;
}

function settingsView(message?: string): string {
  return `
    <section class="screen">
      <header class="topbar"><button class="link" data-act="home">← 처음으로</button></header>
      <h2>설정</h2>
      <article class="card">
        <h3>저장 파일</h3>
        <p class="muted small">진행 상황은 이 기기에 자동으로 저장돼요. 다른 기기로 옮길 때는 저장 파일을 내보내서 가져오세요.</p>
        <div class="stack">
          <button class="btn" data-act="export">저장 파일 내보내기</button>
          <label class="btn">저장 파일 가져오기<input id="import" type="file" accept=".json,application/json" hidden /></label>
        </div>
        <h3>복사해서 옮기기</h3>
        <p class="muted small">앱에서 파일 저장이 안 될 때는 저장 내용을 복사해서 메모나 메신저에 붙여 두고, 다른 기기에서 아래 칸에 붙여넣으세요.</p>
        <div class="stack">
          <button class="btn" data-act="copy">저장 내용 복사하기</button>
          <textarea id="paste" class="paste" rows="4" placeholder="복사한 저장 내용을 여기에 붙여넣기"></textarea>
          <button class="btn" data-act="paste">붙여넣은 내용 가져오기</button>
        </div>
        ${message ? `<p class="notice">${esc(message)}</p>` : ""}
      </article>
    </section>`;
}

// ── 입력 ──────────────────────────────────────────────

function startCreate(): void {
  const seed = newSeed();
  go({ kind: "create", name: "", gender: "여", seed, candidates: rollCandidates(seed) });
}

function act(target: HTMLElement): void {
  const a = target.dataset.act;
  switch (a) {
    case "home":
      return go({ kind: "title" });
    case "continue":
      return go({ kind: "play", tab: "now" });
    case "new":
      return startCreate();
    case "hall":
      return go({ kind: "hall" });
    case "hallEntry":
      return go({ kind: "hallEntry", id: target.dataset.id! });
    case "settings":
      return go({ kind: "settings" });
    case "finish":
      clearCurrent();
      life = null;
      return go({ kind: "title" });
    case "gender":
      if (screen.kind === "create") {
        screen.gender = target.dataset.g as Gender;
        render();
      }
      return;
    case "reroll":
      if (screen.kind === "create") {
        screen.seed = newSeed();
        screen.candidates = rollCandidates(screen.seed);
        render();
      }
      return;
    case "pick": {
      if (screen.kind !== "create") return;
      const name = screen.name.trim() || "지민";
      life = newLife({ name, gender: screen.gender, seed: screen.seed + Number(target.dataset.i), candidate: screen.candidates[Number(target.dataset.i)] });
      saveCurrent(life);
      return go({ kind: "play", tab: "now" });
    }
    case "tab":
      if (life) go({ kind: "play", tab: target.dataset.tab as "now" | "people" | "log" });
      return;
    case "activity":
      if (life) step(() => chooseActivity(life!, target.dataset.id!));
      return;
    case "choose":
      if (life) step(() => choose(life!, Number(target.dataset.i)));
      return;
    case "next":
      if (life) step(() => proceed(life!));
      return;
    case "export":
      return download(exportSave());
    case "copy":
      navigator.clipboard
        .writeText(exportSave())
        .then(() => go({ kind: "settings", message: "저장 내용을 복사했어요." }))
        .catch(() => go({ kind: "settings", message: "복사하지 못했어요." }));
      return;
    case "paste": {
      const text = (document.getElementById("paste") as HTMLTextAreaElement | null)?.value ?? "";
      const ok = importSave(text.trim());
      life = loadCurrent();
      return go({ kind: "settings", message: ok ? "저장 내용을 불러왔어요." : "올바른 저장 내용이 아니에요." });
    }
  }
}

/** 게임을 한 단계 진행하고 저장한 뒤 다시 그린다 */
function step(fn: () => void): void {
  fn();
  saveCurrent(life!);
  if (screen.kind === "play") screen.tab = "now";
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function download(text: string): void {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `life-save-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

app.addEventListener("click", (e) => {
  const target = (e.target as HTMLElement).closest<HTMLElement>("[data-act]");
  if (target) act(target);
});

app.addEventListener("input", (e) => {
  const el = e.target as HTMLInputElement;
  if (el.id === "name" && screen.kind === "create") screen.name = el.value;
});

app.addEventListener("change", async (e) => {
  const el = e.target as HTMLInputElement;
  if (el.id !== "import" || !el.files?.[0]) return;
  const ok = importSave(await el.files[0].text());
  life = loadCurrent();
  go({ kind: "settings", message: ok ? "저장 파일을 불러왔어요." : "올바른 저장 파일이 아니에요." });
});

render();
