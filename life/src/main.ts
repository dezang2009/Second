import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./style.css";

import { activitiesFor } from "./data/activities";
import { choose, chooseActivity, currentChoices, currentEventText, newLife, proceed, rollCandidates, type Candidate } from "./game/engine";
import { ageOf, num, present } from "./game/life";
import { COMPANIES, companyById } from "./data/companies";
import { ACHIEVEMENTS, judge, type Verdict } from "./game/score";
import { formatMoney, formatMoneyShort, josa } from "./game/text";
import { STATS, STAT_LABEL, TALENT_LABEL, WEALTH_LABEL, type Gender, type Life, type Person } from "./game/types";
import { addToHall, clearCurrent, exportSave, importSave, loadCurrent, loadHall, saveCurrent, unlockedAchievements, type HallEntry } from "./storage/save";
import { avatarSvg, lifeAvatar } from "./ui/avatar";
import { changeChips, choiceHint, esc, highlights, stageOf, visiblePeople } from "./ui/format";
import { ICONS } from "./ui/icons";

type Tab = "home" | "stats" | "people" | "log";
type Screen =
  | { kind: "title" }
  | { kind: "create"; name: string; gender: Gender; seed: number; candidates: Candidate[] }
  | { kind: "play"; tab: Tab }
  | { kind: "hall" }
  | { kind: "hallEntry"; id: string }
  | { kind: "settings"; message?: string };

const app = document.getElementById("app")!;
let screen: Screen = { kind: "title" };
let life: Life | null = loadCurrent();

const DISCLAIMER = "실제 기업·대학 이름과 로고는 각 소유자의 상표이며, 게임 속 사건은 모두 가상입니다. 어떤 기업과도 관계가 없습니다.";

const newSeed = () => (Math.random() * 2 ** 32) >>> 0;

function go(next: Screen): void {
  screen = next;
  render();
  window.scrollTo({ top: 0 });
}

// ── 공통 틀 ──────────────────────────────────────────

interface Page {
  title: string;
  sub?: string;
  /** 있으면 왼쪽에 뒤로 가기 버튼 */
  back?: string;
  body: string;
  /** 아래에 떠 있는 큰 파란 버튼 */
  action?: { label: string; act: string };
  nav?: Tab | "hall";
}

function page(p: Page): string {
  const back = p.back ? `<button class="icon-btn" data-act="${p.back}" aria-label="뒤로">${ICONS.back}</button>` : "";
  return `
    <header class="appbar">
      ${back}
      <div class="appbar-title">
        <h1>${esc(p.title)}</h1>
        ${p.sub ? `<p>${p.sub}</p>` : ""}
      </div>
      <button class="icon-btn" data-act="settings" aria-label="설정">${ICONS.gear}</button>
    </header>
    <div class="content ${p.action ? "has-action" : ""} ${p.nav ? "has-nav" : ""}">${p.body}</div>
    ${p.action ? `<div class="action-bar ${p.nav ? "above-nav" : ""}"><button class="btn primary" data-act="${p.action.act}">${esc(p.action.label)}</button></div>` : ""}
    ${p.nav ? navBar(p.nav) : ""}`;
}

function navBar(active: Tab | "hall"): string {
  const items: [Tab | "hall", string, string][] = [
    ["home", "홈", ICONS.home],
    ["stats", "능력치", ICONS.stats],
    ["people", "사람들", ICONS.people],
    ["log", "연표", ICONS.log],
    ["hall", "기록", ICONS.trophy],
  ];
  return `<nav class="tabbar">${items
    .map(([k, label, icon]) => `<button class="tabbar-item ${active === k ? "on" : ""}" data-act="nav" data-tab="${k}">${icon}<span>${label}</span></button>`)
    .join("")}</nav>`;
}

function row(opts: { act?: string; data?: string; icon: string; title: string; sub?: string; extra?: string; chevron?: boolean }): string {
  const tag = opts.act ? "button" : "div";
  return `
    <${tag} class="row-item" ${opts.act ? `data-act="${opts.act}" ${opts.data ?? ""}` : ""}>
      <span class="row-icon">${opts.icon}</span>
      <span class="row-text">
        <span class="row-title">${opts.title}</span>
        ${opts.sub ? `<span class="row-sub">${opts.sub}</span>` : ""}
        ${opts.extra ?? ""}
      </span>
      ${opts.chevron === false ? "" : `<span class="row-chevron">${ICONS.chevron}</span>`}
    </${tag}>`;
}

function statBar(label: string, v: number): string {
  return `<div class="bar"><span class="bar-label">${esc(label)}</span><span class="bar-track"><span class="bar-fill" style="width:${v}%"></span></span><span class="bar-num">${v}</span></div>`;
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
      app.innerHTML = life ? playView(life, screen.tab) : titleView();
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

// ── 처음 화면 ────────────────────────────────────────

function titleView(): string {
  const playing = life !== null && life.phase.kind !== "dead";
  const hall = loadHall();
  const top =
    life && playing
      ? `
      <article class="card">
        <h3 class="card-title">이어서 살기</h3>
        <div class="profile-top">
          <div class="avatar">${lifeAvatar(life)}</div>
          <div class="profile-info">
            <p class="meta">${esc(stageOf(life))} · ${life.age}세</p>
            <p class="profile-name">${esc(life.name)}</p>
            <p class="meta">재산 ${formatMoneyShort(life.money)} · 행복 ${life.stats.happiness}</p>
          </div>
        </div>
      </article>`
      : `
      <article class="card hero">
        <div class="hero-avatars">
          ${avatarSvg({ gender: "남", age: 1, shirt: "#ffd166", pants: "#8ecae6" })}
          ${avatarSvg({ gender: "여", age: 16, shirt: "#ffffff", pants: "#3d4a7a" })}
          ${avatarSvg({ gender: "남", age: 35, shirt: "#3a4256", pants: "#2c3242" })}
          ${avatarSvg({ gender: "여", age: 80, shirt: "#b08968", pants: "#6b5b4e" })}
        </div>
        <p class="hero-text">태어나서 눈을 감을 때까지,<br />선택이 모여 한 사람의 일생이 됩니다.</p>
      </article>`;
  const recent = hall.slice(0, 3);
  return page({
    title: "한 번뿐인 인생",
    sub: "나만의 인생 기록",
    body: `
      ${top}
      <article class="card">
        <h3 class="card-title">메뉴</h3>
        ${row({ act: "new", icon: ICONS.spark, title: "새 인생 시작", sub: "어떤 집에서 태어날지 골라요" })}
        ${row({ act: "hall", icon: ICONS.trophy, title: "명예의 전당", sub: `지금까지 ${hall.length}명의 인생` })}
      </article>
      ${recent.length ? `<article class="card"><h3 class="card-title">최근 끝난 인생</h3>${recent.map(hallRow).join("")}</article>` : ""}
      <p class="disclaimer">${DISCLAIMER}</p>`,
    action: life && playing ? { label: `${life.name.slice(1)}의 인생 이어 하기`, act: "continue" } : { label: "새 인생 시작", act: "new" },
  });
}

// ── 새 인생 ──────────────────────────────────────────

function createView(s: Extract<Screen, { kind: "create" }>): string {
  const cards = s.candidates
    .map((c, i) => {
      const bars = (["health", "smarts", "looks", "fitness", "social"] as const).map((k) => statBar(STAT_LABEL[k], c.stats[k])).join("");
      const sib = c.sibling ? `${c.sibling.bornAt < 0 ? "손위" : "손아래"} ${c.sibling.gender === "남" ? "남자" : "여자"} 형제 ${esc(c.sibling.name)}` : "외동";
      return `
        <article class="card candidate">
          <div class="profile-top">
            <div class="avatar">${avatarSvg({ gender: s.gender, age: 0, shirt: "#ffd166", pants: "#8ecae6" })}</div>
            <div class="profile-info">
              <p class="meta">${WEALTH_LABEL[c.wealth]}</p>
              <p class="profile-name">${esc(c.surname)}${esc(s.name.trim() || "○○")}</p>
              <p class="meta">타고난 재능 ???</p>
            </div>
          </div>
          <div class="divider"></div>
          <ul class="facts">
            <li><span>아빠</span>${esc(c.dad)} (${c.dadAge}살)</li>
            <li><span>엄마</span>${esc(c.mom)} (${c.momAge}살)</li>
            <li><span>형제</span>${sib}</li>
          </ul>
          <div class="bars">${bars}</div>
          <button class="btn primary" data-act="pick" data-i="${i}">이 집에서 태어나기</button>
        </article>`;
    })
    .join("");
  return page({
    title: "새 인생",
    sub: "이름을 짓고 태어날 집을 골라요",
    back: "home",
    body: `
      <article class="card form">
        <label class="field">이름 <span class="muted small">성은 집안을 따라요</span>
          <input id="name" maxlength="6" value="${esc(s.name)}" placeholder="예: 지민" autocomplete="off" />
        </label>
        <div class="seg" role="radiogroup" aria-label="성별">
          ${(["남", "여"] as Gender[])
            .map((g) => `<button class="seg-btn ${s.gender === g ? "on" : ""}" data-act="gender" data-g="${g}" role="radio" aria-checked="${s.gender === g}">${g === "남" ? "남자" : "여자"}</button>`)
            .join("")}
        </div>
      </article>
      <div class="section-head"><h3>어디에서 태어날까요?</h3><button class="text-btn" data-act="reroll">다시 뽑기</button></div>
      <p class="muted small pad">세 집 아이의 능력치 합은 모두 같아요. 구성만 다릅니다.</p>
      ${cards}`,
  });
}

// ── 플레이 ──────────────────────────────────────────

function profileCard(l: Life): string {
  const meta = l.alive ? `${esc(stageOf(l))} · ${l.age}세` : `${l.age}세 · ${esc(l.causeOfDeath ?? "")}`;
  const org = companyById(l.job?.org);
  return `
    <article class="card profile">
      <div class="avatar">${lifeAvatar(l)}</div>
      <div class="profile-info">
        <p class="meta">${org ? `${logoTag(org.id)} ` : ""}${meta}</p>
        <h2 class="profile-name">${esc(l.name)}</h2>
        <div class="kpis">
          <span>재산 <b>${formatMoneyShort(l.money)}</b></span>
          <span>행복 <b>${l.stats.happiness}</b></span>
          <span>명성 <b>${l.fame}</b></span>
        </div>
      </div>
    </article>`;
}

/** 로고 파일이 있으면 그림, 없으면 대표색 배지 */
function logoTag(icon: string | undefined): string {
  if (!icon) return "";
  const id = icon.startsWith("badge:") ? icon.slice(6) : icon.replace(/\.(svg|png)$/, "");
  const c = companyById(id) ?? COMPANIES.find((x) => x.logo === icon);
  if (!c) return "";
  const badge = (hidden: boolean) => `<span class="logo-badge" style="background:${c.color}${hidden ? ";display:none" : ""}">${esc(c.name.slice(0, 2))}</span>`;
  // 로고 파일을 못 불러오면 대표색 배지로 바꾼다
  if (c.logo) return `<img class="logo" src="./logos/${c.logo}" alt="${esc(c.name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='inline-grid'" />${badge(true)}`;
  return badge(false);
}

function tile(opts: { act: string; data: string; title: string; sub?: string; icon?: string }): string {
  return `
    <button class="tile" data-act="${opts.act}" ${opts.data}>
      ${opts.icon ? `<span class="tile-icon">${opts.icon}</span>` : ""}
      <span class="tile-title">${opts.title}</span>
      ${opts.sub ? `<span class="tile-sub">${opts.sub}</span>` : ""}
    </button>`;
}

function playView(l: Life, tab: Tab): string {
  const title = "한 번뿐인 인생";
  const sub = undefined;
  if (tab === "stats") return page({ title, sub, nav: tab, body: profileCard(l) + statsView(l) });
  if (tab === "people") return page({ title, sub, nav: tab, body: peopleView(l) });
  if (tab === "log") return page({ title, sub, nav: tab, body: logView(l) });
  if (l.phase.kind === "dead") return deathView(l);
  const ph = l.phase;
  const action =
    ph.kind === "outcome"
      ? { label: "계속", act: "next" }
      : ph.kind === "yearEnd"
        ? { label: l.alive ? `${l.age + 1}살로` : "인생을 돌아보기", act: "next" }
        : undefined;
  return page({ title, sub, nav: "home", action, body: profileCard(l) + phaseCard(l) });
}

function phaseCard(l: Life): string {
  const ph = l.phase;
  switch (ph.kind) {
    case "activity":
      return `
        <article class="card play-card">
          <h3 class="card-title">${l.age}살, 올해는 무엇에 시간을 쓸까요?</h3>
          <div class="tiles">
            ${activitiesFor(l)
              .map((a) => tile({ act: "activity", data: `data-id="${a.id}"`, title: esc(a.label), sub: esc(a.desc) }))
              .join("")}
          </div>
        </article>`;
    case "event": {
      const choices = currentChoices(l);
      return `
        <article class="card play-card">
          <p class="story">${esc(currentEventText(l))}</p>
          <div class="tiles ${choices.length <= 2 ? "two" : ""}">
            ${choices
              .map((c) => {
                const icon = typeof c.choice.icon === "function" ? c.choice.icon(l) : c.choice.icon;
                return tile({ act: "choose", data: `data-i="${c.index}"`, title: esc(c.text), sub: choiceHint(l, c.choice, c.chance), icon: logoTag(icon) });
              })
              .join("")}
          </div>
        </article>`;
    }
    case "outcome":
      return `
        <article class="card play-card">
          ${ph.result ? `<span class="result ${ph.result}">${ph.result === "success" ? "성공" : "실패"}</span>` : ""}
          <p class="story">${esc(ph.text)}</p>
          ${changeChips(ph.changes)}
        </article>`;
    case "yearEnd":
      return `
        <article class="card play-card">
          <h3 class="card-title">${l.age}살을 마치며</h3>
          <ul class="lines">${ph.lines.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
          ${changeChips(ph.changes)}
        </article>`;
    default:
      return "";
  }
}

function statsView(l: Life): string {
  const hidden = [
    ["타고난 재능", l.revealed.talent ? TALENT_LABEL[l.hidden.talent] : "???"],
    ["끈기", l.revealed.grit ? String(l.hidden.grit) : "???"],
    ["운", l.revealed.luck ? String(l.hidden.luck) : "???"],
  ];
  return `
    <article class="card">
      <h3 class="card-title">능력치</h3>
      <div class="bars">${STATS.map((s) => statBar(STAT_LABEL[s], l.stats[s])).join("")}</div>
    </article>
    <article class="card">
      <h3 class="card-title">숨겨진 성향</h3>
      <p class="muted small">살아가면서 조금씩 드러나요.</p>
      <div class="kpis">${hidden.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join("")}</div>
    </article>
    <article class="card">
      <h3 class="card-title">살림</h3>
      <ul class="facts">
        <li><span>재산</span>${formatMoney(l.money)}</li>
        ${num(l, "houseValue") > 0 ? `<li><span>집</span>${formatMoney(num(l, "houseValue"))}</li>` : ""}
        <li><span>하는 일</span>${esc(l.job ? `${l.job.title} · 연봉 ${formatMoney(l.job.salary)}` : stageOf(l))}</li>
        <li><span>학력</span>${esc(l.education)}</li>
      </ul>
    </article>`;
}

function personAvatar(l: Life, p: Person): string {
  const age = Math.max(0, ageOf(l, p));
  const adultShirt: Partial<Record<Person["role"], string>> = { 배우자: "#f28fad", 연인: "#f28fad", 친구: "#7fb3ff" };
  const look =
    age <= 7
      ? { shirt: "#ffd166", pants: "#8ecae6" }
      : age <= 18
        ? { shirt: "#ffffff", pants: "#3d4a7a" }
        : age >= 65
          ? { shirt: "#b08968", pants: "#6b5b4e" }
          : { shirt: adultShirt[p.role] ?? "#9aa4b2", pants: "#4b5563" };
  return avatarSvg({ gender: p.gender, age, ...look, alive: p.alive });
}

function peopleView(l: Life): string {
  const people = visiblePeople(l);
  if (people.length === 0) return `<article class="card"><p class="empty muted">아직 아는 사람이 없어요.</p></article>`;
  const groups: [string, Person[]][] = [
    ["가족", people.filter((p) => ["배우자", "자녀", "손주", "엄마", "아빠", "형제"].includes(p.role))],
    ["연인과 친구", people.filter((p) => p.role === "연인" || p.role === "친구")],
  ];
  return groups
    .filter(([, ps]) => ps.length > 0)
    .map(
      ([name, ps]) => `
      <article class="card">
        <h3 class="card-title">${name}</h3>
        ${ps
          .map((p) =>
            row({
              icon: `<span class="mini-avatar">${personAvatar(l, p)}</span>`,
              title: `${esc(p.name)} <span class="muted small">${esc(p.role)}</span>`,
              sub: present(l, p) ? `${ageOf(l, p)}살 · 호감도 ${p.affinity}` : "세상을 떠났어요",
              extra: present(l, p) ? `<span class="bar-track thin"><span class="bar-fill warm" style="width:${p.affinity}%"></span></span>` : "",
              chevron: false,
            }),
          )
          .join("")}
      </article>`,
    )
    .join("");
}

function logView(l: Life): string {
  if (l.log.length === 0) return `<article class="card"><p class="empty muted">아직 기록이 없어요.</p></article>`;
  return `
    <article class="card">
      <h3 class="card-title">연표</h3>
      <ol class="timeline">${[...l.log]
        .reverse()
        .map((y) => `<li><span class="t-age">${y.age}살</span><div>${y.lines.map((t) => `<p>${esc(t)}</p>`).join("") || `<p class="muted">조용한 한 해</p>`}</div></li>`)
        .join("")}</ol>
    </article>`;
}

function verdictCard(v: Verdict): string {
  const names = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));
  return `
    <article class="card verdict">
      <div class="grade-block">
        <div class="grade g-${v.grade}">${v.grade}</div>
        <div><p class="v-title">${esc(v.title)}</p><p class="muted">종합 ${v.total}점</p></div>
      </div>
      <div class="score-row">${v.scores.map((s) => `<div><span>${esc(s.label)}</span><b>${s.value}</b></div>`).join("")}</div>
      ${
        v.achievements.length
          ? `<ul class="badges">${v.achievements.map((id) => `<li title="${esc(names.get(id)?.desc ?? "")}">${esc(names.get(id)?.name ?? id)}</li>`).join("")}</ul>`
          : ""
      }
    </article>`;
}

function deathView(l: Life): string {
  const v = judge(l);
  archive(l, v);
  return page({
    title: "한 번뿐인 인생",
    nav: "home",
    action: { label: "새 인생 시작", act: "new" },
    body: `
      ${profileCard(l)}
      ${verdictCard(v)}
      <article class="card play-card">
        <h3 class="card-title">인생의 순간들 <button class="text-btn small" data-act="nav" data-tab="log">전체 연표</button></h3>
        <ul class="lines">${highlights(l)
          .slice(-4)
          .map((t) => `<li>${esc(t)}</li>`)
          .join("")}</ul>
      </article>`,
  });
}

function archive(l: Life, v: Verdict): void {
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

// ── 명예의 전당 ───────────────────────────────────────

function hallRow(e: HallEntry): string {
  return row({
    act: "hallEntry",
    data: `data-id="${esc(e.id)}"`,
    icon: `<span class="grade tiny g-${e.verdict.grade}">${e.verdict.grade}</span>`,
    title: `${esc(e.name)} <span class="muted small">${e.age}세 · ${esc(e.job)}</span>`,
    sub: `${esc(e.verdict.title)} · ${e.verdict.total}점`,
  });
}

function hallView(): string {
  const hall = loadHall();
  const unlocked = unlockedAchievements();
  return page({
    title: "명예의 전당",
    sub: `지금까지 ${hall.length}명의 인생`,
    back: life ? undefined : "home",
    nav: life ? "hall" : undefined,
    body: `
      <article class="card">
        <h3 class="card-title">끝난 인생</h3>
        ${hall.length === 0 ? `<p class="empty muted">아직 끝난 인생이 없어요.</p>` : hall.map(hallRow).join("")}
      </article>
      <article class="card">
        <h3 class="card-title">업적 <span class="muted small">${unlocked.size} / ${ACHIEVEMENTS.length}</span></h3>
        <ul class="badges all">${ACHIEVEMENTS.map((a) => `<li class="${unlocked.has(a.id) ? "" : "locked"}"><b>${esc(a.name)}</b><span class="small">${esc(a.desc)}</span></li>`).join("")}</ul>
      </article>`,
  });
}

function hallEntryView(id: string): string {
  const e = loadHall().find((x) => x.id === id);
  if (!e) return hallView();
  return page({
    title: e.name,
    sub: `${e.age}세 · ${esc(e.job)} · ${esc(e.education)}`,
    back: "hall",
    body: `
      <article class="card">
        <h3 class="card-title">${esc(josa(`${e.cause}(으)로 눈을 감았다`))}</h3>
      </article>
      ${verdictCard(e.verdict)}
      <article class="card">
        <h3 class="card-title">인생의 순간들</h3>
        <ul class="lines">${e.highlights.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
      </article>`,
  });
}

// ── 설정 ────────────────────────────────────────────

function settingsView(message?: string): string {
  return page({
    title: "설정",
    sub: "저장 파일 관리",
    back: life && life.phase.kind !== "dead" ? "continue" : "home",
    body: `
      <article class="card">
        <h3 class="card-title">저장 파일</h3>
        <p class="muted small">진행 상황은 이 기기에 자동으로 저장돼요. 다른 기기로 옮길 때는 저장 파일을 내보내서 가져오세요.</p>
        ${row({ act: "export", icon: ICONS.log, title: "저장 파일 내보내기" })}
        <label class="row-item">
          <span class="row-icon">${ICONS.log}</span>
          <span class="row-text"><span class="row-title">저장 파일 가져오기</span></span>
          <span class="row-chevron">${ICONS.chevron}</span>
          <input id="import" type="file" accept=".json,application/json" hidden />
        </label>
        ${message ? `<p class="notice">${esc(message)}</p>` : ""}
      </article>
      <article class="card">
        <h3 class="card-title">복사해서 옮기기</h3>
        <p class="muted small">앱에서 파일 저장이 안 될 때는 저장 내용을 복사해서 메모나 메신저에 붙여 두고, 다른 기기에서 아래 칸에 붙여넣으세요.</p>
        ${row({ act: "copy", icon: ICONS.star, title: "저장 내용 복사하기" })}
        <textarea id="paste" class="paste" rows="4" placeholder="복사한 저장 내용을 여기에 붙여넣기"></textarea>
        <button class="btn soft" data-act="paste">붙여넣은 내용 가져오기</button>
      </article>
      <article class="card">${row({ act: "home", icon: ICONS.home, title: "처음 화면으로" })}</article>
      <p class="disclaimer">${DISCLAIMER}</p>`,
  });
}

// ── 입력 ──────────────────────────────────────────────

function startCreate(): void {
  const seed = newSeed();
  go({ kind: "create", name: "", gender: "여", seed, candidates: rollCandidates(seed) });
}

function act(target: HTMLElement): void {
  switch (target.dataset.act) {
    case "home":
      return go({ kind: "title" });
    case "continue":
      return go({ kind: "play", tab: "home" });
    case "new":
      return startCreate();
    case "hall":
      return go({ kind: "hall" });
    case "hallEntry":
      return go({ kind: "hallEntry", id: target.dataset.id! });
    case "settings":
      return go({ kind: "settings" });
    case "nav": {
      const tab = target.dataset.tab as Tab | "hall";
      return go(tab === "hall" ? { kind: "hall" } : { kind: "play", tab });
    }
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
      const i = Number(target.dataset.i);
      life = newLife({ name: screen.name.trim() || "지민", gender: screen.gender, seed: screen.seed + i, candidate: screen.candidates[i] });
      saveCurrent(life);
      return go({ kind: "play", tab: "home" });
    }
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
  screen = { kind: "play", tab: "home" };
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
  if (el.id !== "name" || screen.kind !== "create") return;
  screen.name = el.value;
  // 입력 중 커서가 튀지 않도록 전체를 다시 그리지 않고 후보 카드의 이름만 바꾼다
  const { candidates } = screen;
  document.querySelectorAll<HTMLElement>(".candidate .profile-name").forEach((n, i) => {
    n.textContent = candidates[i].surname + (el.value.trim() || "○○");
  });
});

app.addEventListener("change", async (e) => {
  const el = e.target as HTMLInputElement;
  if (el.id !== "import" || !el.files?.[0]) return;
  const ok = importSave(await el.files[0].text());
  life = loadCurrent();
  go({ kind: "settings", message: ok ? "저장 파일을 불러왔어요." : "올바른 저장 파일이 아니에요." });
});

render();
