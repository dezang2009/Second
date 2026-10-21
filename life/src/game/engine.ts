// 1년의 흐름: 활동 고르기 → 사건과 선택지 → 연말 정산 → 다음 해. 사망하면 끝.
// 화면은 이 모듈의 함수만 부르고, 모든 상태는 Life 안에 있어서 언제든 저장했다 이어 할 수 있다.

import { ACTIVITIES, activitiesFor } from "../data/activities";
import { EVENTS, eventById } from "../data/events";
import { jobDef } from "../data/jobs";
import {
  addStat,
  ageOf,
  clamp,
  first,
  inCollege,
  inMilitary,
  netWorth,
  newPersonId,
  num,
  peopleWith,
  present,
  snapshotStats,
} from "./life";
import { amount, applyEffects, castEvent, choiceText, eligible, eventWeight, render, resolveCast, resolveOutcome, successChance, type Ctx } from "./events";
import { randomGivenName, randomName } from "./names";
import { createRng, type Rng } from "./rng";
import { formatMoney, josa } from "./text";
import { STATS, STAT_LABEL, TALENT_LABEL, type Change, type Gender, type Life, type Person, type Stat, type Talent, type Wealth } from "./types";

export interface Candidate {
  wealth: Wealth;
  stats: Record<Stat, number>;
  hidden: { grit: number; luck: number; talent: Talent };
  surname: string;
  mom: string;
  dad: string;
  momAge: number;
  dadAge: number;
  sibling: { name: string; gender: Gender; bornAt: number } | null;
}

const TALENTS: Talent[] = ["study", "sports", "art", "business"];
const SURNAMES = ["김", "이", "박", "최", "정", "강", "조", "윤", "장", "임", "한", "오", "서", "신"];

/** 출생 후보. 능력치 합은 모두 같고 구성만 다르다 */
export function rollCandidates(seed: number, count = 3): Candidate[] {
  const rng = createRng(seed);
  const out: Candidate[] = [];
  for (let i = 0; i < count; i++) {
    const keys: Stat[] = ["health", "smarts", "looks", "fitness", "social"];
    const stats = { health: 50, smarts: 50, looks: 50, fitness: 50, social: 50, happiness: 60 } as Record<Stat, number>;
    for (let n = 0; n < 60; n++) {
      const a = rng.pick(keys);
      const b = rng.pick(keys);
      const d = rng.int(1, 3);
      if (a === b || stats[a] + d > 80 || stats[b] - d < 25) continue;
      stats[a] += d;
      stats[b] -= d;
    }
    const wealth = rng.weighted<Wealth>(["poor", "normal", "rich"], (w) => ({ poor: 3, normal: 5, rich: 2 })[w])!;
    // 형편이 어려우면 끈기가 강하고, 넉넉하면 약한 편
    const gritBase = wealth === "poor" ? 60 : wealth === "rich" ? 40 : 50;
    const surname = rng.pick(SURNAMES);
    const siblingGender: Gender = rng.chance(0.5) ? "남" : "여";
    out.push({
      wealth,
      stats,
      hidden: { grit: clamp(gritBase + rng.int(-20, 20), 10, 90), luck: rng.int(20, 80), talent: rng.pick(TALENTS) },
      surname,
      dad: surname + randomGivenName(rng, "남"),
      mom: randomName(rng, "여"),
      dadAge: rng.int(27, 38),
      momAge: rng.int(26, 36),
      sibling: rng.chance(0.55)
        ? { name: surname + randomGivenName(rng, siblingGender), gender: siblingGender, bornAt: rng.chance(0.5) ? -rng.int(1, 5) : rng.int(2, 5) }
        : null,
    });
  }
  return out;
}

export function newLife(opts: { name: string; gender: Gender; seed: number; candidate: Candidate }): Life {
  const c = opts.candidate;
  const fullName = opts.name.startsWith(c.surname) && opts.name.length >= 2 ? opts.name : c.surname + opts.name;
  const life: Life = {
    version: 1,
    seed: opts.seed,
    rng: opts.seed ^ 0x9e3779b9,
    name: fullName,
    gender: opts.gender,
    wealth: c.wealth,
    age: 0,
    stats: { ...c.stats },
    money: 0,
    fame: 0,
    hidden: { ...c.hidden },
    revealed: { grit: false, luck: false, talent: false },
    people: [],
    education: "없음",
    job: null,
    flags: {},
    seen: {},
    lastSeen: {},
    practiced: {},
    phase: { kind: "activity" },
    year: { activity: null, queue: [], start: { stats: { ...c.stats }, money: 0, fame: 0 }, lines: [] },
    log: [],
    happinessSum: 0,
    yearsLived: 0,
    peakMoney: 0,
    alive: true,
    causeOfDeath: null,
    nextId: 0,
  };
  const person = (name: string, gender: Gender, role: Person["role"], bornAt: number, affinity: number): Person => ({
    id: newPersonId(life),
    name,
    gender,
    role,
    bornAt,
    affinity,
    alive: true,
  });
  life.people.push(person(c.mom, "여", "엄마", -c.momAge, 80), person(c.dad, "남", "아빠", -c.dadAge, 75));
  if (c.sibling) life.people.push(person(c.sibling.name, c.sibling.gender, "형제", c.sibling.bornAt, 60));
  withRng(life, (rng) => beginYear(life, rng));
  return life;
}

function withRng<T>(life: Life, fn: (rng: Rng) => T): T {
  const rng = createRng(life.rng);
  const r = fn(rng);
  life.rng = rng.state;
  return r;
}

function beginYear(life: Life, rng: Rng): void {
  life.year = {
    activity: null,
    queue: pickEvents(life, rng),
    start: { stats: snapshotStats(life), money: life.money, fame: life.fame },
    lines: [],
  };
  if (activitiesFor(life).length > 0) life.phase = { kind: "activity" };
  else nextEvent(life, rng);
}

function pickEvents(life: Life, rng: Rng): string[] {
  const milestones = EVENTS.filter((e) => e.milestone && !e.scene && eligible(e, life)).map((e) => e.id);
  const wanted = life.age < 6 ? (rng.chance(0.6) ? 1 : 0) : 1 + (rng.chance(0.45) ? 1 : 0);
  const picks: string[] = [...milestones];
  let normal = life.age < 6 ? wanted : Math.max(0, wanted - milestones.length);
  const pool = EVENTS.filter((e) => !e.milestone && !e.scene && eligible(e, life));
  while (normal > 0 && pool.length > 0) {
    const ev = rng.weighted(pool, (e) => eventWeight(e, life));
    if (!ev) break;
    picks.push(ev.id);
    pool.splice(pool.indexOf(ev), 1);
    normal--;
  }
  return picks;
}

function nextEvent(life: Life, rng: Rng): void {
  while (life.year.queue.length > 0) {
    const entry = life.year.queue.shift()!;
    // ">"로 시작하면 앞 선택에서 이어지는 장면
    const isScene = entry.startsWith(">");
    const id = isScene ? entry.slice(1) : entry;
    const ev = eventById(id);
    const carry = isScene ? life.year.carry : undefined;
    // 앞 사건의 결과로 조건이 바뀌었을 수 있으니 다시 확인
    if (!ev || !eligible(ev, life, Object.keys(carry?.cast ?? {}))) continue;
    if (!isScene) life.year.carry = undefined;
    life.seen[id] = (life.seen[id] ?? 0) + 1;
    life.lastSeen[id] = life.age;
    const { cast, pending } = castEvent(ev, life, rng, carry);
    ev.setup?.({ life, rng, cast: resolveCast(life, cast, pending) });
    life.phase = { kind: "event", eventId: id, cast, pending };
    return;
  }
  endYear(life, rng);
}

export function chooseActivity(life: Life, id: string): void {
  if (life.phase.kind !== "activity") return;
  const act = activitiesFor(life).find((a) => a.id === id);
  if (!act) return;
  withRng(life, (rng) => {
    life.year.activity = act.id;
    life.practiced[act.id] = (life.practiced[act.id] ?? 0) + 1;
    const gifted = act.talent === life.hidden.talent;
    // 재능이 맞으면 1.6배, 끈기가 강하면 조금 더
    const mult = (gifted ? 1.6 : 1) * (0.85 + life.hidden.grit / 330);
    for (const [stat, a] of Object.entries(act.stats ?? {}) as [Stat, number | [number, number]][]) {
      const v = amount(rng, a);
      addStat(life, stat, v > 0 ? Math.round(v * mult) : v);
    }
    if (act.money !== undefined) {
      const m = amount(rng, typeof act.money === "function" ? act.money(life) : act.money);
      life.money += gifted && m > 0 ? Math.round(m * 1.6) : m;
    }
    if (act.fame !== undefined) life.fame = clamp(life.fame + amount(rng, act.fame) * (gifted ? 2 : 1), 0, 100);
    if (act.family !== undefined) {
      for (const p of peopleWith(life, "엄마", "아빠", "배우자", "자녀", "손주", "형제")) {
        p.affinity = clamp(p.affinity + amount(rng, act.family), 0, 100);
      }
    }
    // 재능과 맞는 활동을 세 번째 하면 재능이 드러난다
    if (gifted && !life.revealed.talent) {
      const times = ACTIVITIES.filter((a) => a.talent === act.talent).reduce((n, a) => n + (life.practiced[a.id] ?? 0), 0);
      if (times >= 3) {
        life.revealed.talent = true;
        life.year.lines.push(josa(`${life.name.slice(1)}은(는) ${TALENT_LABEL[life.hidden.talent]}에 남다른 재능이 있는 것 같다.`));
      }
    }
    nextEvent(life, rng);
  });
}

/** 지금 사건에서 고를 수 있는 선택지와 원래 번호 */
export function currentChoices(life: Life) {
  if (life.phase.kind !== "event") return [];
  const ev = eventById(life.phase.eventId)!;
  // 선택지 이름에도 {이름} 같은 빈칸을 쓸 수 있다
  const ctx: Ctx = { life, rng: createRng(life.rng), cast: resolveCast(life, life.phase.cast, life.phase.pending) };
  return ev.choices
    .filter((choice) => !choice.when || choice.when(life))
    .map((choice) => ({ choice, index: ev.choices.indexOf(choice), chance: successChance(life, choice), text: render(choiceText(choice, life), ctx) }));
}

export function currentEventText(life: Life): string {
  if (life.phase.kind !== "event") return "";
  const ev = eventById(life.phase.eventId)!;
  const ctx: Ctx = { life, rng: createRng(life.rng), cast: resolveCast(life, life.phase.cast, life.phase.pending) };
  return render(ev.text, ctx);
}

export function choose(life: Life, index: number): void {
  const phase = life.phase;
  if (phase.kind !== "event") return;
  const ev = eventById(phase.eventId)!;
  const choice = ev.choices[index];
  if (!choice || (choice.when && !choice.when(life))) return;
  withRng(life, (rng) => {
    const before = snapshot(life);
    const ctx: Ctx = { life, rng, cast: resolveCast(life, phase.cast, phase.pending) };
    let outcome = resolveOutcome(choice.outcome, life);
    let result: "success" | "fail" | undefined;
    if (choice.check || choice.chance) {
      const ok = rng.chance(successChance(life, choice));
      result = ok ? "success" : "fail";
      outcome = resolveOutcome(ok ? choice.success : choice.fail, life);
    }
    applyEffects(outcome?.effects, ctx, phase.pending);
    const text = outcome ? render(outcome.text, ctx) : "";
    if (text && !outcome?.quiet) life.year.lines.push(text);
    const next = typeof outcome?.next === "function" ? outcome.next(ctx) : outcome?.next;
    if (next && life.alive) {
      life.year.queue.unshift(`>${next}`);
      life.year.carry = { cast: phase.cast, pending: phase.pending.filter((p) => !life.people.includes(p)) };
    }
    const changes = diff(before, snapshot(life));
    // 글도 변화도 없는 연결 장면은 결과 화면 없이 바로 다음 장면으로
    if (!text && changes.length === 0 && next) {
      nextEvent(life, rng);
      return;
    }
    life.phase = { kind: "outcome", text, changes, result };
  });
}

/** 결과나 한 해 요약을 보고 다음으로 넘어갈 때 */
export function proceed(life: Life): void {
  withRng(life, (rng) => {
    if (life.phase.kind === "outcome") {
      if (!life.alive) finishLife(life);
      else nextEvent(life, rng);
    } else if (life.phase.kind === "yearEnd") {
      if (!life.alive) {
        life.phase = { kind: "dead" };
        return;
      }
      life.age += 1;
      beginYear(life, rng);
    }
  });
}

function finishLife(life: Life): void {
  life.happinessSum += life.stats.happiness;
  life.yearsLived += 1;
  life.log.push({ age: life.age, lines: [...life.year.lines, `${life.causeOfDeath}(으)로 세상을 떠났다.`].map(josa) });
  life.phase = { kind: "dead" };
}

/** 1년치 생활비·월급·노화·주변 사람의 변화·사망 판정 */
function endYear(life: Life, rng: Rng): void {
  const lines = life.year.lines;
  const me = life.name.slice(1);

  // 동생이 태어남
  for (const p of life.people) {
    if (p.role === "형제" && p.bornAt === life.age && life.age > 0) lines.push(josa(`동생 ${p.name.slice(1)}이(가) 태어났다.`));
  }

  money(life, rng, lines);
  aging(life, rng);
  // 일흔이 되면 일을 놓고, 일이 없으면 예순다섯부터 은퇴 생활로 친다
  if (!life.flags.retired && (life.age >= 70 || (life.age >= 65 && !life.job))) {
    if (life.job) lines.push(`${life.job.title} 일을 마치고 은퇴했다.`);
    life.job = null;
    life.flags.retired = true;
  }
  others(life, rng, lines);

  // 행복은 천천히 보통으로 돌아온다
  addStat(life, "happiness", Math.round((55 - life.stats.happiness) * 0.1));
  if (life.money < 0) addStat(life, "happiness", -3);
  if (life.stats.health < 30) addStat(life, "happiness", -2);
  if (life.fame > 0 && rng.chance(0.5)) life.fame -= 1;

  // 사망 판정
  if (life.alive) {
    const q = deathChance(life);
    if (life.stats.health <= 0 || rng.chance(q)) {
      life.alive = false;
      life.causeOfDeath = causeOfDeath(life, rng);
    }
  }

  life.happinessSum += life.stats.happiness;
  life.yearsLived += 1;
  life.peakMoney = Math.max(life.peakMoney, netWorth(life));

  const changes = diff(life.year.start, snapshot(life));
  if (!life.alive) lines.push(`${life.causeOfDeath}(으)로 세상을 떠났다.`);
  const finalLines = lines.map(josa);
  life.log.push({ age: life.age, lines: finalLines });
  if (finalLines.length === 0) finalLines.push(josa(`${me}은(는) 조용한 한 해를 보냈다.`));
  life.phase = { kind: "yearEnd", lines: finalLines, changes };
}

function money(life: Life, rng: Rng, lines: string[]): void {
  const me = life.name.slice(1);
  // 성인이 되면 부모님이 형편껏 보태 준다
  if (life.age === 19) {
    const gift = { poor: 0, normal: 500, rich: 5000 }[life.wealth];
    if (gift > 0) {
      life.money += gift;
      lines.push(`성인이 된 ${me}에게 부모님이 ${formatMoney(gift)}을(를) 보태 주셨다.`);
    }
  }
  if (life.job) {
    const def = jobDef(life.job.id);
    let pay = life.job.salary;
    if (def?.volatile) {
      const swing = 0.4 + rng.next() * 1.2 + (life.hidden.luck - 50) / 200 + (life.job.id === "artist" ? life.fame / 100 : 0);
      pay = Math.round(pay * Math.max(0.1, swing));
    }
    life.money += pay;
    life.job.years += 1;
    life.flags.workYears = num(life, "workYears") + 1;
    if (!def?.volatile) life.job.salary = Math.round(life.job.salary * 1.03);
  }
  if (life.age >= 19) {
    // 생활비: 기본 비용 + 버는 만큼 늘어나는 씀씀이 + 배우자 + 아직 어린 자녀
    let cost = 1200 + (life.job ? Math.round(life.job.salary * 0.55) : 0);
    if (inMilitary(life)) cost = 0;
    if (inCollege(life)) cost += life.wealth === "poor" ? 700 : 0;
    const spouse = first(life, "배우자");
    // 맞벌이면 배우자 연봉의 절반쯤이 살림에 보탬이 된다
    if (spouse) cost += 800 - Math.round(num(life, "spouseSalary") * 0.5 || (life.flags.spouseWorks ? 1300 : 0));
    cost += peopleWith(life, "자녀").filter((c) => ageOf(life, c) < 22).length * 1000;
    if (num(life, "mortgageLeft") > 0) {
      cost += 1200;
      life.flags.mortgageLeft = num(life, "mortgageLeft") - 1;
      if (num(life, "mortgageLeft") === 0) lines.push("드디어 주택 대출을 다 갚았다.");
    }
    if (life.flags.retired) {
      const pension = num(life, "workYears") >= 10 ? 1400 : 600;
      life.money += pension;
      cost = Math.round(cost * 0.8);
    }
    life.money -= cost;
  }
  // 이자: 저축은 조금 불고, 빚은 빠르게 늘어난다
  if (life.money > 0) life.money = Math.round(life.money * 1.01);
  else if (life.money < 0) life.money = Math.round(life.money * 1.03);
  // 감당할 수 없는 빚은 개인회생으로 줄인다
  if (life.money < -20000 && life.age - num(life, "rehabAt") >= 10) {
    life.money = -5000;
    life.flags.rehabAt = life.age;
    addStat(life, "happiness", -10);
    lines.push("빚을 감당할 수 없어 개인회생을 신청했다.");
  }
  if (num(life, "houseValue") > 0) life.flags.houseValue = Math.round(num(life, "houseValue") * (1 + rng.int(-2, 5) / 100));
}

function aging(life: Life, rng: Rng): void {
  const a = life.age;
  const loss =
    a >= 85 ? rng.int(1, 3) : a >= 70 ? rng.int(0, 2) + (rng.chance(0.3) ? 1 : 0) : a >= 55 ? (rng.chance(0.7) ? 1 : 0) : a >= 40 ? (rng.chance(0.4) ? 1 : 0) : 0;
  addStat(life, "health", -loss);
  // 몸은 저절로 조금씩 회복된다. 나이가 들수록 회복하는 기준이 낮아진다
  const base = a < 40 ? 65 : a < 60 ? 55 : 45;
  if (life.stats.health < base) addStat(life, "health", Math.ceil((base - life.stats.health) * 0.08));
  if (a >= 35) addStat(life, "fitness", -rng.int(0, a >= 60 ? 2 : 1));
  if (a >= 45 && rng.chance(0.4)) addStat(life, "looks", -1);
  // 어릴 때는 저절로 조금씩 자란다
  if (a <= 7) {
    addStat(life, "smarts", rng.int(0, 2));
    addStat(life, "fitness", rng.int(0, 2));
  }
}

/** 부모님과 주변 사람도 나이를 먹고, 언젠가 떠난다 */
function others(life: Life, rng: Rng, lines: string[]): void {
  for (const p of life.people) {
    if (!present(life, p) || p.role === "연인") continue;
    const age = ageOf(life, p);
    if (age < 50) continue;
    if (rng.chance(baseMortality(age))) {
      p.alive = false;
      const who = p.role === "엄마" || p.role === "아빠" ? p.role : `${p.role} ${p.name.slice(1)}`;
      lines.push(`${who}이(가) ${age}세로 세상을 떠났다.`);
      addStat(life, "happiness", -Math.round(p.affinity / 8));
    }
  }
  // 오래 연락하지 않으면 친구와는 조금씩 멀어진다
  for (const p of peopleWith(life, "친구")) if (rng.chance(0.3)) p.affinity = clamp(p.affinity - 1, 0, 100);
}

/** 나이에 따른 한 해 사망 확률(대략 한국 생명표 모양) */
export function baseMortality(age: number): number {
  if (age < 1) return 0.002;
  return Math.min(0.6, 3.7e-5 * Math.exp(0.09 * age));
}

export function deathChance(life: Life): number {
  const healthFactor = Math.exp((50 - life.stats.health) / 35);
  return Math.min(0.8, baseMortality(life.age) * healthFactor);
}

function causeOfDeath(life: Life, rng: Rng): string {
  if (life.stats.health <= 0) return "건강 악화";
  if (life.age < 15) return rng.pick(["갑작스러운 병", "사고"]);
  if (life.age < 50) return rng.pick(["교통사고", "갑작스러운 심장마비", "암", "사고"]);
  if (life.age < 85) return rng.pick(["암", "심장병", "뇌졸중", "폐렴"]);
  return rng.pick(["노환", "노환", "폐렴", "심장병"]);
}

interface Snap {
  stats: Record<Stat, number>;
  money: number;
  fame: number;
}

function snapshot(life: Life): Snap {
  return {
    stats: snapshotStats(life),
    money: life.money,
    fame: life.fame,
  };
}

function diff(a: Snap, b: Snap): Change[] {
  const out: Change[] = [];
  for (const s of STATS) if (b.stats[s] !== a.stats[s]) out.push({ label: STAT_LABEL[s], delta: b.stats[s] - a.stats[s] });
  if (b.money !== a.money) out.push({ label: "돈", delta: b.money - a.money, unit: "money" });
  if (b.fame !== a.fame) out.push({ label: "명성", delta: b.fame - a.fame });
  return out;
}
