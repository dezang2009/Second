// 취업과 직장: 지원 분야 → 회사 고르기 → 서류 → 필기(GSAT·SKCT·코딩 테스트·NCS) → 1차 면접 → 임원 면접 → 합격
// 공무원·의사·변호사·교사 같은 다른 길, 진급 심사, 헤드헌터 이직 제안도 여기에 있다.
// 회사 이름은 실제 기업이지만 게임 속 사건은 모두 가상의 이야기다.

import type { Choice, Ctx, Effects, GameEvent, Outcome } from "../../game/events";
import { canWork, clamp, employed, inCollege, num } from "../../game/life";
import type { Job, Life } from "../../game/types";
import { CIVIL_RANKS, COMPANIES, KIND_LABEL, RANKS, SMALL_COMPANIES, STARTUPS, companyById, majorById, type Company, type CompanyKind } from "../companies";
import { cont, o, slots } from "./util";

const degree = (l: Life) => l.education === "대졸" || l.education === "명문대졸";
const major = (l: Life) => majorById(String(l.flags.major ?? ""));
const target = (l: Life) => companyById(String(l.flags.target ?? ""));

/** 직급이 있는 직업 */
const LADDER = ["big", "it", "finance", "public", "sme", "startup", "civil"];
export const ranksOf = (job: Job) => (job.id === "civil" && job.org !== "teacher" ? CIVIL_RANKS : RANKS);

function orgName(job: Job): string {
  if (job.org === "teacher") return "초등학교";
  return companyById(job.org)?.name ?? (job.org && !job.org.includes(":") ? job.org : "");
}

export function titleOf(job: Job): string {
  if (job.org === "teacher") return ["교사", "교사", "부장교사", "교감", "교장"][job.rank ?? 0] ?? "교사";
  const rank = ranksOf(job)[job.rank ?? 0];
  if (job.id === "civil") return rank;
  const org = orgName(job);
  return org ? `${org} ${rank}` : rank;
}

function hire(ctx: Ctx, c: Company): void {
  const kind = c.kind === "finance" ? "finance" : c.kind;
  const job: Job = { id: kind, title: "", salary: c.salary + (ctx.life.flags.master ? 300 : 0), years: 0, org: c.id, rank: 0 };
  job.title = titleOf(job);
  ctx.life.job = job;
  ctx.life.flags.promoAt = ctx.life.age;
  ctx.life.flags.hiredAt = c.name;
}

function hireSmall(ctx: Ctx, kind: "sme" | "startup"): void {
  const name = ctx.rng.pick(kind === "sme" ? SMALL_COMPANIES : STARTUPS);
  const job: Job = { id: kind, title: "", salary: kind === "sme" ? ctx.rng.int(2800, 3300) : ctx.rng.int(3300, 4000), years: 0, org: name, rank: 0 };
  job.title = titleOf(job);
  ctx.life.job = job;
  ctx.life.flags.promoAt = ctx.life.age;
  ctx.life.flags.hiredAt = name;
}

/** 이 분야에서 지원할 만한 회사 세 곳을 고른다. 인턴 했던 회사는 꼭 넣는다 */
function pickOpenings(kinds: CompanyKind[]) {
  return (ctx: Ctx) => {
    const l = ctx.life;
    const pool = COMPANIES.filter((c) => kinds.includes(c.kind));
    const picks: string[] = [];
    const intern = companyById(String(l.flags.internAt ?? ""));
    if (intern && kinds.includes(intern.kind)) picks.push(intern.id);
    const fit = major(l)?.field;
    while (picks.length < Math.min(3, pool.length)) {
      const c = ctx.rng.weighted(pool, (x) => (picks.includes(x.id) ? 0 : (fit && x.fit.includes(fit as never) ? 3 : 1)));
      if (!c) break;
      picks.push(c.id);
    }
    l.flags.openings = picks.join("|");
  };
}

/** 서류 합격 확률: 대학 등급이 회사 기준보다 높을수록, 스펙이 많을수록, 전공이 맞을수록 */
function docChance(l: Life, extra = 0): number {
  const c = target(l);
  if (!c) return 0.5;
  const tierGap = c.tier - num(l, "univTier");
  const fit = major(l) && c.fit.includes(major(l)!.field as never) ? 0.1 : -0.1;
  const intern = l.flags.internAt === c.id ? 0.25 : 0;
  return clamp(0.58 + tierGap * 0.1 + num(l, "spec") * 0.05 + fit + intern + (l.stats.smarts - 55) / 200 + extra, 0.05, 0.95);
}

const docFail: Outcome = o("{f_targetName} 서류 탈락. [\"귀하의 뛰어난 역량에도 불구하고…\"|불합격 메일은 늘 같은 말로 시작한다.|자소서를 다시 읽어 보니 오타가 있었다.]", { stats: { happiness: -3 } });

const civilJob = (rank: number, salary: number): Effects => ({
  run: (ctx) => {
    const job: Job = { id: "civil", title: "", salary, years: 0, org: "civil", rank };
    job.title = titleOf(job);
    ctx.life.job = job;
    ctx.life.flags.promoAt = ctx.life.age;
  },
});

const proJob = (org: string, title: string, salary: number): Effects => ({
  run: (ctx) => {
    ctx.life.job = { id: "pro", title, salary, years: 0, org, rank: 0 };
  },
});

export const CAREER: GameEvent[] = [
  {
    id: "job_hunt",
    ages: [19, 55],
    milestone: true,
    max: 40,
    when: (l) => canWork(l) && !employed(l) && l.flags.collegeDecided === true && !inCollege(l),
    text: (ctx) => {
      const l = ctx.life;
      const tries = num(l, "huntYears");
      const who = l.flags.univ ? `${l.flags.univ}${major(l) ? ` ${major(l)!.name}` : ""}` : l.education;
      const intern = l.flags.internAt ? ` · ${companyById(String(l.flags.internAt))?.name} 인턴` : "";
      return `${tries === 0 ? "[졸업을 앞두고|드디어 취업 시즌]" : `취업 준비 ${tries + 1}년 차.`} ${who} · 스펙 ${num(l, "spec")}${intern}. 어디로 갈까?`;
    },
    choices: (<Choice[]>[
      { text: "대기업·은행 공채", when: degree, outcome: cont("apply_pick", "", { run: pickOpenings(["big", "finance"]) }) },
      { text: "IT 기업 개발자", when: (l) => degree(l) && (["cs", "ee"].includes(String(l.flags.major)) || (l.practiced.selfdev ?? 0) >= 3), outcome: cont("apply_pick", "", { run: pickOpenings(["it"]) }) },
      { text: "공기업 (NCS)", when: (l) => l.age <= 38, outcome: cont("apply_pick", "", { run: pickOpenings(["public"]) }) },
      { text: "공무원 시험", when: (l) => l.age <= 45, outcome: cont("civil_exam") },
      { text: "의사 국가고시", when: (l) => l.flags.major === "med" && l.flags.graduated === true && l.flags.doctor !== true, outcome: cont("med_exam") },
      { text: "로스쿨 진학", when: (l) => degree(l) && l.stats.smarts >= 68 && !l.flags.lawSchool && l.age <= 35, outcome: cont("leet") },
      { text: "교원 임용고시", when: (l) => l.flags.major === "edu" && l.flags.graduated === true, outcome: cont("teacher_exam") },
      { text: "중소기업", outcome: cont("small_interview", "", { flags: { smallKind: "sme" } }) },
      { text: "스타트업", when: degree, outcome: cont("small_interview", "", { flags: { smallKind: "startup" } }) },
      { text: "가게 창업", when: (l) => l.money >= 2000, outcome: o("작은 가게를 열었다. [간판을 다는 날 친구들이 화분을 보냈다.|이제 사장님이다.]", { job: { id: "shop", title: "자영업자", salary: 3500 }, money: -2000, stats: { happiness: 4 } }) },
      {
        text: "예술가의 길",
        when: (l) => (l.revealed.talent && l.hidden.talent === "art") || (l.practiced.hobby ?? 0) + (l.practiced.arts ?? 0) >= 6,
        outcome: o("가난해도 좋다. 하고 싶은 걸 하며 살기로 했다.", { job: { id: "artist", title: "예술가", salary: 1800 }, stats: { happiness: 6 } }),
      },
      {
        text: "프로 입단 테스트",
        when: (l) => l.age <= 26 && l.stats.fitness >= 65,
        check: { stat: "fitness", dc: 75 },
        success: o("입단 테스트 통과! 프로 선수가 되었다.", { job: { id: "athlete", title: "운동선수", salary: 3500 }, stats: { happiness: 8 }, fame: 5 }),
        fail: o("마지막 테스트에서 떨어졌다. 꿈이 멀어진다.", { stats: { happiness: -5 } }),
      },
      { text: "아르바이트", when: (l) => !l.job, outcome: o("당장은 [편의점|카페|물류센터] 아르바이트로 생활비를 벌기로 했다.", { job: { id: "parttime", title: "아르바이트", salary: 1500 } }) },
      { text: "올해는 쉰다", outcome: o("조금 쉬어 가기로 했다. [통장이 걱정이다.|부모님 눈치가 보인다.]", { stats: { happiness: 2 } }) },
    ]).map((c) => (c.outcome && typeof c.outcome !== "function" ? { ...c, outcome: withHuntYear(c.outcome) } : c)),
  },
  {
    id: "apply_pick",
    ages: [0, 120],
    scene: true,
    text: "채용 공고를 훑어본다. 어디에 지원할까?",
    choices: slots(
      "openings",
      3,
      (id) => {
        const c = companyById(id)!;
        return `${c.name} · ${KIND_LABEL[c.kind]}`;
      },
      (id) => {
        const c = companyById(id)!;
        return cont("doc_screen", "", { flags: { target: c.id, targetName: c.name, targetTest: c.test, targetInterview: c.kind === "it" ? "기술 면접" : "실무 면접" } });
      },
      (id) => companyById(id)?.logo ?? `badge:${id}`,
    ),
  },
  {
    id: "doc_screen",
    ages: [0, 120],
    scene: true,
    text: "{f_targetName} 서류 전형. [자기소개서 마감이 내일이다.|자소서 문항이 네 개나 된다.|'지원 동기를 1000자 이내로' 앞에서 한참을 멍하니 있었다.]",
    choices: [
      { text: "경험을 숫자로 정리한다", chance: (l) => docChance(l, (l.stats.smarts - 55) / 150), success: cont("written_test", "{f_targetName} 서류 합격! [메일함을 열자마자 소리를 질렀다.|문자 알림에 손이 떨렸다.]"), fail: docFail },
      { text: "진심을 담아 쓴다", chance: (l) => docChance(l, (l.stats.social - 55) / 150), success: cont("written_test", "서류 합격! [진심이 통했나 보다.|읽는 사람의 마음을 움직였다.]"), fail: docFail },
      { text: "합격 자소서를 참고한다", chance: (l) => docChance(l, (l.hidden.luck - 60) / 200), success: cont("written_test", "서류 합격! 운이 좋았다."), fail: docFail },
    ],
  },
  {
    id: "written_test",
    ages: [0, 120],
    scene: true,
    text: "{f_targetTest} 시험장. [문제가 생각보다 어렵다.|시간이 턱없이 부족하다.|옆자리 지원자의 한숨이 들린다.|감독관의 발소리만 들린다.]",
    choices: [
      { text: "아는 것부터 빠르게", check: { stat: "smarts", dc: 50 }, success: cont("interview1", "{f_targetTest} 통과! 이제 {f_targetInterview}이다."), fail: o("{f_targetTest}에서 떨어졌다. [커트라인 바로 아래였다.|시간 배분에 실패했다.]", { stats: { happiness: -3 } }) },
      { text: "한 문제도 버리지 않는다", check: { stat: "grit", dc: 48 }, success: cont("interview1", "끝까지 붙잡은 덕에 통과했다!", { reveal: ["grit"] }), fail: o("마지막 장을 넘기지도 못했다. 불합격.", { stats: { happiness: -3 }, reveal: ["grit"] }) },
      { text: "모르면 과감히 찍는다", check: { stat: "luck", dc: 50 }, success: cont("interview1", "찍은 게 다 맞았다. 통과!", { reveal: ["luck"] }), fail: o("찍은 게 다 틀렸다. 불합격.", { stats: { happiness: -3 }, reveal: ["luck"] }) },
    ],
  },
  {
    id: "interview1",
    ages: [0, 120],
    scene: true,
    text: "{f_targetName} {f_targetInterview}. 면접관이 묻는다. \"[우리 회사에 지원한 이유가 뭔가요?|가장 크게 실패한 경험은 무엇인가요?|입사하면 어떤 일을 하고 싶나요?|최근 관심 있게 본 업계 뉴스는?|팀에서 갈등이 생기면 어떻게 하나요?]\"",
    choices: [
      { text: "준비한 답을 논리적으로", check: { stat: "smarts", dc: 50 }, success: cont("interview2", "1차 면접 합격! [다음은 임원 면접이다.|넥타이를 다시 맸다.]"), fail: o("1차 면접에서 떨어졌다. [꼬리 질문에 말문이 막혔다.|면접관 표정이 처음부터 굳어 있었다.]", { stats: { happiness: -4 } }) },
      { text: "솔직한 경험담으로", check: { stat: "social", dc: 48 }, success: cont("interview2", "면접관이 메모를 하며 웃었다. 1차 합격!"), fail: o("이야기가 길어져 시간이 끊겼다. 불합격.", { stats: { happiness: -4 } }) },
      {
        text: "회사 자료를 줄줄 꿰며",
        chance: (l) => clamp(0.35 + num(l, "spec") * 0.08 + (l.flags.internAt === l.flags.target ? 0.3 : 0), 0.1, 0.9),
        success: cont("interview2", "\"우리 회사를 정말 잘 아시네요.\" 1차 합격!"),
        fail: o("외운 티가 났다. 불합격.", { stats: { happiness: -4 } }),
      },
    ],
  },
  {
    id: "interview2",
    ages: [0, 120],
    scene: true,
    text: "임원 면접. [임원이 이력서를 넘기다 고개를 든다.|분위기가 싸늘하다.|임원 한 명이 팔짱을 끼고 있다.] \"[주말 출근도 괜찮겠어요?|우리 회사 단점이 뭐라고 생각해요?|다른 회사도 붙으면 어디 갈 거예요?|10년 뒤에 뭘 하고 있을 것 같아요?]\"",
    choices: [
      { text: "열정을 보여 준다", check: { stat: "social", dc: 50 }, success: final(), fail: finalFail() },
      { text: "소신 있게 답한다", chance: (l) => clamp(0.5 + ((l.stats.smarts + l.stats.social) / 2 - 60) / 50, 0.1, 0.9), success: final(), fail: finalFail() },
      { text: "겸손하게 배우겠다고 한다", chance: () => 0.6, success: final(), fail: finalFail() },
    ],
  },
  {
    id: "small_interview",
    ages: [0, 120],
    scene: true,
    text: (ctx) =>
      ctx.life.flags.smallKind === "startup"
        ? "스타트업 대표와 커피 미팅. \"[우리는 가족 같은 회사예요.|스톡옵션도 드려요.|월요일부터 바로 나올 수 있어요?]\""
        : "중소기업 면접. [사장님이 직접 면접을 보신다.|사무실이 생각보다 깔끔하다.|면접관이 한 명뿐이다.]",
    choices: [
      {
        text: "적극적으로 어필한다",
        chance: () => 0.85,
        success: o((ctx) => `${ctx.life.flags.hiredAt}에 입사했다. [사람들이 따뜻하다.|첫 출근 날 환영 회식이 있었다.|할 일이 산더미다.]`, {
          run: (ctx) => hireSmall(ctx, ctx.life.flags.smallKind === "startup" ? "startup" : "sme"),
          stats: { happiness: 3 },
        }),
        fail: o("연락이 오지 않았다.", { stats: { happiness: -2 } }),
      },
      { text: "연봉부터 협상한다", check: { stat: "social", dc: 55 }, success: o("연봉을 올려 받고 입사했다.", { run: (ctx) => { hireSmall(ctx, ctx.life.flags.smallKind === "startup" ? "startup" : "sme"); ctx.life.job!.salary += 400; }, stats: { happiness: 4 } }), fail: o("\"생각해 보고 연락드릴게요.\" 끝이었다.", { stats: { happiness: -2 } }) },
    ],
  },

  // ── 다른 길 ──
  {
    id: "civil_exam",
    ages: [0, 120],
    scene: true,
    text: "[노량진|고시원] 책상 앞. 어떤 시험을 볼까?",
    choices: [
      { text: "9급 공무원", check: { stat: "grit", dc: 55 }, success: o("9급 공무원 합격! [합격자 명단에서 내 이름을 세 번 확인했다.|부모님이 동네에 떡을 돌리셨다.]", { ...civilJob(0, 2800), stats: { happiness: 7 }, reveal: ["grit"] }), fail: o("[커트라인에서 2점 모자랐다.|1년이 그렇게 지나갔다.] 컵밥이 유난히 짰다.", { stats: { happiness: -5 }, money: -300, reveal: ["grit"] }) },
      {
        text: "7급 공무원",
        chance: (l) => clamp(0.15 + (l.stats.smarts - 60) / 80 + (l.hidden.grit - 50) / 150, 0.05, 0.8),
        success: o("7급 공무원 합격! 정부세종청사로 첫 출근을 했다.", { ...civilJob(2, 3400), stats: { happiness: 9 } }),
        fail: o("7급은 역시 어려웠다. 내년을 기약한다.", { stats: { happiness: -5 }, money: -300 }),
      },
      {
        text: "5급 행정고시",
        when: (l) => l.stats.smarts >= 72,
        chance: (l) => clamp(0.05 + (l.stats.smarts - 72) / 60, 0.03, 0.5),
        success: o("행정고시 합격! 사무관이 됐다. [뉴스에 출신 학교가 나왔다.|합격 수기를 써 달라는 연락이 왔다.]", { ...civilJob(4, 4200), stats: { happiness: 12 }, fame: 5 }),
        fail: o("행시는 2차에서 떨어졌다. 몇 년을 더 해야 할지 모르겠다.", { stats: { happiness: -7 }, money: -500 }),
      },
    ],
  },
  {
    id: "med_exam",
    ages: [0, 120],
    scene: true,
    text: "의사 국가고시. [6년의 공부가 이 하루에 달렸다.|실기 시험장 문이 열린다.]",
    choices: [
      {
        text: "차분하게 푼다",
        check: { stat: "smarts", dc: 55 },
        success: o("의사 면허를 받았다! 대학병원 인턴이 됐다.", { ...proJob("doctor", "인턴", 4500), flags: { doctor: true }, stats: { happiness: 10 }, fame: 2 }),
        fail: o("국시에 떨어졌다. 1년을 더 준비해야 한다.", { stats: { happiness: -8 } }),
      },
    ],
  },
  {
    id: "med_specialty",
    ages: [20, 60],
    milestone: true,
    when: (l) => l.job?.org === "doctor" && (l.job?.years ?? 0) >= 1 && !l.flags.specialty,
    text: "인턴이 끝났다. 어느 과 레지던트를 지원할까?",
    choices: (
      [
        ["내과", 45, 13000],
        ["외과", 40, 14000],
        ["소아청소년과", 35, 11000],
        ["정형외과", 70, 17000],
        ["피부과", 78, 20000],
        ["정신건강의학과", 55, 14000],
      ] as const
    ).map(([name, dc, pay]) => ({
      text: name,
      check: { stat: "smarts" as const, dc },
      success: o(`${name} 레지던트가 됐다. [당직이 끝이 없다.|병원에서 먹고 자는 날이 많아졌다.]`, {
        flags: { specialty: name, specialtyPay: pay },
        run: (ctx: Ctx) => {
          ctx.life.job = { id: "pro", title: `${name} 레지던트`, salary: 6000, years: 0, org: "doctor", rank: 1 };
        },
      }),
      fail: o(`${name}는 경쟁이 치열했다. 내년에 다시 지원하기로 했다.`, { stats: { happiness: -4 } }),
    })),
  },
  {
    id: "med_board",
    ages: [24, 70],
    milestone: true,
    when: (l) => l.job?.org === "doctor" && (l.job?.rank ?? 0) === 1 && (l.job?.years ?? 0) >= 4,
    text: "{f_specialty} 전문의 시험. 그 다음엔 어디서 일할까?",
    choices: [
      { text: "대학병원에 남는다", check: { stat: "smarts", dc: 50 }, success: o("{f_specialty} 전문의가 됐다. 대학병원 임상강사로 남았다.", { run: doctor(0.8, "대학병원"), fame: 3, stats: { happiness: 6 } }), fail: o("전문의 시험에 떨어졌다. 1년 더.", { stats: { happiness: -6 } }) },
      { text: "종합병원 봉직의", check: { stat: "smarts", dc: 45 }, success: o("{f_specialty} 전문의가 됐다. 종합병원에서 진료를 시작했다.", { run: doctor(1, "종합병원"), stats: { happiness: 6 } }), fail: o("전문의 시험에 떨어졌다. 1년 더.", { stats: { happiness: -6 } }) },
      {
        text: "대출받아 개원한다",
        check: { stat: "smarts", dc: 45 },
        success: o("{f_specialty} 의원을 열었다. [개원 축하 화환이 늘어섰다.|대출이 무섭지만 내 병원이다.]", { run: doctor(1.4, "개원의"), money: -30000, stats: { happiness: 8 } }),
        fail: o("전문의 시험에 떨어졌다. 개원은 미뤄졌다.", { stats: { happiness: -6 } }),
      },
    ],
  },
  {
    id: "leet",
    ages: [0, 120],
    scene: true,
    text: "로스쿨 입시. LEET 시험지가 [두껍다.|생각보다 길다.]",
    choices: [
      {
        text: "논리 문제부터 푼다",
        check: { stat: "smarts", dc: 70 },
        success: o("로스쿨 합격! 3년 동안 법을 공부한다.", {
          stats: { happiness: 6 },
          money: -2000,
          run: (ctx) => {
            ctx.life.flags.lawSchool = true;
            ctx.life.flags.collegeUntil = ctx.life.age + 4;
          },
        }),
        fail: o("LEET 점수가 모자랐다.", { stats: { happiness: -4 } }),
      },
    ],
  },
  {
    id: "bar_exam",
    ages: [22, 60],
    milestone: true,
    when: (l) => l.flags.lawSchool === true && l.flags.collegeUntil === l.age && !l.flags.lawyer,
    text: "변호사시험. 닷새 동안 이어지는 긴 시험이다.",
    choices: [
      { text: "대형 로펌을 노린다", when: (l) => num(l, "univTier") <= 2, check: { stat: "smarts", dc: 68 }, success: o("변호사시험 합격! 대형 로펌에 들어갔다. [야근이 일상이다.|연봉이 놀랍다.]", { ...proJob("law", "대형 로펌 변호사", 12000), flags: { lawyer: true }, stats: { happiness: 10 }, fame: 3 }), fail: o("시험은 붙었지만 로펌은 떨어졌다. 작은 법률사무소에서 시작한다.", { ...proJob("law", "변호사", 6500), flags: { lawyer: true }, stats: { happiness: 3 } }) },
      { text: "공익 변호사가 된다", check: { stat: "smarts", dc: 58 }, success: o("변호사시험 합격! 공익 변호사로 일하기 시작했다.", { ...proJob("law", "공익 변호사", 4500), flags: { lawyer: true }, stats: { happiness: 9 }, fame: 2 }), fail: o("변호사시험에 떨어졌다. 1년 더 준비한다.", { stats: { happiness: -8 }, run: (ctx) => void (ctx.life.flags.collegeUntil = ctx.life.age + 1) }) },
    ],
  },
  {
    id: "teacher_exam",
    ages: [0, 120],
    scene: true,
    text: "초등 임용고시. [수업 시연 차례가 다가온다.|면접관 앞에서 동화책을 펼쳤다.]",
    choices: [
      {
        text: "아이들 눈높이로 수업한다",
        check: { stat: "social", dc: 52 },
        success: o("임용고시 합격! 3월부터 초등학교 담임이 된다.", { run: (ctx) => void (ctx.life.job = { id: "civil", title: "교사", salary: 3200, years: 0, org: "teacher", rank: 0 }), stats: { happiness: 9 } }),
        fail: o("수업 시연에서 떨어졌다. 기간제 교사로 1년을 보내기로 했다.", { stats: { happiness: -4 }, run: (ctx) => void (ctx.life.job = { id: "parttime", title: "기간제 교사", salary: 2600, years: 0 }) }),
      },
    ],
  },

  // ── 직장 생활 ──
  {
    id: "promotion_review",
    ages: [24, 64],
    weight: 5,
    cooldown: 2,
    max: 10,
    when: (l) => !!l.job && LADDER.includes(l.job.id) && l.age - num(l, "promoAt") >= 4 && (l.job.rank ?? 0) < ranksOf(l.job).length - 1,
    text: (ctx) => {
      const job = ctx.life.job!;
      const next = { ...job, rank: (job.rank ?? 0) + 1 };
      return `[연말 인사 시즌.|진급 심사 발표가 다가온다.|팀장님이 면담을 하자고 하신다.] ${titleOf(job)}에서 ${titleOf(next)}(으)로 올라갈 수 있을까?`;
    },
    choices: [
      { text: "성과로 승부한다", chance: (l) => promoChance(l, 0.45 + (l.stats.smarts - 50) / 120 + (l.year.activity === "work_hard" ? 0.2 : 0)), success: promoted(), fail: notPromoted() },
      { text: "윗사람에게 잘 보인다", chance: (l) => promoChance(l, 0.5 + (l.stats.social - 55) / 60), success: promoted(), fail: notPromoted() },
      { text: "마음 비우고 기다린다", chance: (l) => promoChance(l, 0.35), success: promoted(), fail: notPromoted() },
    ],
  },
  {
    id: "headhunt",
    ages: [27, 55],
    cooldown: 4,
    max: 3,
    when: (l) => ["big", "it", "finance"].includes(l.job?.id ?? "") && (l.job?.years ?? 0) >= 3,
    setup: (ctx) => {
      const l = ctx.life;
      const c = ctx.rng.pick(COMPANIES.filter((x) => x.id !== l.job?.org && x.kind !== "public"));
      l.flags.hhTarget = c.id;
      l.flags.hhName = c.name;
    },
    text: "헤드헌터에게서 전화가 왔다. \"{f_hhName}에서 경력직을 찾는데, 연봉 [20|25|30]% 올려 드릴 수 있어요.\"",
    choices: [
      {
        text: "옮긴다",
        chance: () => 0.7,
        success: o("{f_hhName}(으)로 이직했다. [진작 옮길 걸 그랬다.|새 사원증이 낯설다.]", { run: moveTo(1.25), stats: { happiness: 4 } }),
        fail: o("{f_hhName}(으)로 옮겼지만 [분위기가 숨 막힌다.|텃세가 심하다.]", { run: moveTo(1.25), stats: { happiness: -5 } }),
      },
      { text: "이 제안으로 연봉 협상", check: { stat: "social", dc: 55 }, success: o("회사가 붙잡았다. 연봉이 올랐다.", { run: (ctx) => void (ctx.life.job!.salary = Math.round(ctx.life.job!.salary * 1.1)), stats: { happiness: 3 } }), fail: o("\"그럼 가시든가요.\" 분위기만 어색해졌다.", { stats: { happiness: -3 } }) },
      { text: "거절한다", outcome: o("지금 회사가 좋다. 정중히 거절했다.", { stats: { happiness: 1 } }) },
    ],
  },
];

/** 취업 준비 햇수를 세어 문장에 쓴다 */
function withHuntYear(out: Outcome): Outcome {
  const prev = out.effects?.run;
  return {
    ...out,
    effects: {
      ...out.effects,
      run: (ctx) => {
        ctx.life.flags.huntYears = num(ctx.life, "huntYears") + 1;
        prev?.(ctx);
      },
    },
  };
}

function final(): Outcome {
  return o("최종 합격! {f_targetName} 신입사원이 됐다. [부모님께 제일 먼저 전화했다.|합격 메일을 열 번은 다시 읽었다.|친구들이 한턱 쏘라고 난리다.]", {
    stats: { happiness: 10 },
    run: (ctx) => {
      const c = target(ctx.life);
      if (c) hire(ctx, c);
    },
  });
}

function finalFail(): Outcome {
  return o("최종 면접에서 떨어졌다. [이번엔 정말 될 줄 알았다.|하루 종일 방에서 나오지 않았다.|합격자 발표 날, 휴대폰을 꺼 버렸다.]", { stats: { happiness: -6 } });
}

/** 임원(상무 이상)은 훨씬 어렵다 */
function promoChance(l: Life, base: number): number {
  const rank = l.job?.rank ?? 0;
  return clamp(rank >= 4 ? base * 0.35 : base, 0.05, 0.9);
}

function promoted(): Outcome {
  return o((ctx) => `${ctx.life.job!.title}(으)로 진급했다! [축하 화분이 책상에 놓였다.|명함을 새로 찍었다.|팀 회식에서 건배사를 했다.]`, {
    stats: { happiness: 6 },
    run: (ctx) => {
      const job = ctx.life.job!;
      job.rank = (job.rank ?? 0) + 1;
      job.salary = Math.round(job.salary * (job.rank >= 5 ? 1.5 : 1.15));
      job.title = titleOf(job);
      ctx.life.flags.promoAt = ctx.life.age;
      if (job.rank >= 5) {
        ctx.life.fame = Math.min(100, ctx.life.fame + 5);
        ctx.life.flags.wasExec = true;
      }
    },
  });
}

function notPromoted(): Outcome {
  return o("이번 진급에서 빠졌다. [동기가 먼저 올라갔다.|명단에 내 이름이 없었다.]", {
    stats: { happiness: -4 },
    run: (ctx) => {
      ctx.life.flags.promoAt = ctx.life.age - 3;
    },
  });
}

function moveTo(rate: number) {
  return (ctx: Ctx) => {
    const c = companyById(String(ctx.life.flags.hhTarget));
    const job = ctx.life.job;
    if (!c || !job) return;
    job.org = c.id;
    job.id = c.kind;
    job.salary = Math.round(job.salary * rate);
    job.title = titleOf(job);
    job.years = 0;
  };
}

function doctor(rate: number, where: string) {
  return (ctx: Ctx) => {
    const name = String(ctx.life.flags.specialty);
    const pay = num(ctx.life, "specialtyPay");
    ctx.life.job = { id: "pro", title: `${name} 전문의 (${where})`, salary: Math.round(pay * rate), years: 0, org: "doctor", rank: 2 };
  };
}
