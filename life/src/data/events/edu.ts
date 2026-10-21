// 입시: 고등학교 원서 → 문과·이과 → 내신 → 수시 원서 → 수능 → 합격 발표 → 전공 → 대학 생활 → 졸업
// 장면이 이어지며 갈라지고(next), 결과는 flags에 남아 몇 년 뒤의 사건(취업 등)을 바꾼다.

import type { Ctx, Effects, GameEvent, Outcome } from "../../game/events";
import { clamp, inCollege, num } from "../../game/life";
import type { Education, Life } from "../../game/types";
import { COMPANIES, MAJORS, MED_SCHOOLS, TIER_CUTOFF, UNIVERSITIES, companyById, majorById, type HighSchool } from "../companies";
import { cont, listFlag, o, slots } from "./util";

const hs = (l: Life) => l.flags.hs as HighSchool | undefined;
const academic = (l: Life) => hs(l) !== undefined && hs(l) !== "vocational";
export const companyName = (id: string) => companyById(id)?.name ?? id;

/** 내신 등급 (1.0이 가장 좋음). 지능, 시험 기간의 노력, 학교 분위기로 정해진다 */
export function gpaOf(l: Life): number {
  const harder = hs(l) === "science" || hs(l) === "foreign" ? 1.1 : hs(l) === "private" ? 0.6 : 0;
  return Math.round(clamp(9 - (l.stats.smarts - 22) / 8.5 - num(l, "gpaBoost") * 0.25 + harder, 1, 9) * 10) / 10;
}

function gpaTier(gpa: number): number {
  const i = [1.3, 1.7, 2.2, 2.7, 3.3, 4.2, 5.5].findIndex((s) => gpa <= s);
  return i < 0 ? 7 : i;
}

interface Offer {
  name: string;
  tier: number;
  med: boolean;
  how: string;
}

const encode = (x: Offer) => `${x.name}:${x.tier}:${x.med ? 1 : 0}:${x.how}`;
function decode(item: string): Offer {
  const [name, tier, med, how] = item.split(":");
  return { name, tier: Number(tier), med: med === "1", how };
}
const offerName = (x: Offer) => `${x.name}${x.med ? " 의예과" : ""}`;

/** 수시와 정시 결과로 붙은 대학 목록을 만든다 */
function decideOffers(ctx: Ctx): void {
  const l = ctx.life;
  const r = ctx.rng;
  const offers: Offer[] = [];
  const liberal = l.flags.track === "문과" || hs(l) === "arts";
  const add = (tier: number, how: string, med = false) => {
    if (tier < 0 || tier > 7) return;
    const name = med ? r.pick(MED_SCHOOLS) : r.pick(UNIVERSITIES.filter((u) => u.tier === tier && !(liberal && u.science))).name;
    if (!offers.some((x) => x.name === name && x.med === med)) offers.push({ name, tier, med, how });
  };
  const gt = gpaTier(gpaOf(l));
  switch (l.flags.susiPlan) {
    case "up":
      if (r.chance(0.3)) add(gt - 1, "수시");
      if (r.chance(0.6)) add(gt, "수시");
      break;
    case "fit":
      if (r.chance(0.7)) add(gt, "수시");
      if (r.chance(0.95)) add(gt + 1, "수시");
      break;
    case "safe":
      add(gt + 1, "수시");
      add(gt + 2, "수시");
      break;
  }
  const pct = num(l, "suneungPct");
  const jt = TIER_CUTOFF.findIndex((c) => pct >= c);
  if (r.chance(0.85)) add(jt, "정시");
  add(jt + 1, "정시");
  // 최상위권 이과는 의대도 노려 볼 수 있다
  if ((pct >= 99.2 || gpaOf(l) <= 1.1) && l.flags.track !== "문과") add(r.int(0, 2), pct >= 99.2 ? "정시" : "수시", true);
  offers.sort((a, b) => Number(b.med) - Number(a.med) || a.tier - b.tier);
  l.flags.offers = offers.slice(0, 4).map(encode).join("|");
}

function enroll(ctx: Ctx, x: Offer): void {
  const f = ctx.life.flags;
  f.univ = x.name;
  f.univTier = x.tier;
  f.collegeDecided = true;
  f.collegeKind = x.tier <= 1 ? "명문대졸" : x.tier <= 6 ? "대졸" : "전문대졸";
  f.collegeUntil = ctx.life.age + 1 + (x.med ? 6 : x.tier === 7 ? 2 : 4);
  if (x.med) f.major = "med";
  ctx.life.education = "고졸";
}

/** 수능 점수(백분위)를 정하고 합격한 대학을 고른다 */
function takeSuneung(ctx: Ctx): void {
  const l = ctx.life;
  const bonus = { science: 6, foreign: 4, private: 3, general: 0, arts: -4, vocational: -8 }[hs(l) ?? "general"];
  const retake = l.flags.retakeAt === l.age ? 4 : 0;
  const pct = clamp(l.stats.smarts * 1.05 + (l.hidden.grit - 50) / 6 + bonus + retake + num(l, "prep") + ctx.rng.int(-7, 7), 1, 99.9);
  l.flags.suneungPct = Math.round(pct * 10) / 10;
  l.flags.suneungDone = true;
  decideOffers(ctx);
}

/** 수능 전날 선택의 결과: 컨디션(prep)을 남기고 수능을 치른 뒤 성적표 장면으로 */
const exam = (prep: number, effects: Effects = {}): Outcome => cont("suneung_result", "", { ...effects, flags: { prep }, run: takeSuneung });

const boost = (n: number) => (ctx: Ctx) => {
  ctx.life.flags.gpaBoost = num(ctx.life, "gpaBoost") + n;
};
const spec = (n: number) => (ctx: Ctx) => {
  ctx.life.flags.spec = num(ctx.life, "spec") + n;
};

function majorOpen(l: Life, field: string, id: string): boolean {
  if (hs(l) === "arts") return field === "예체능" || field === "인문";
  if (id === "pharm") return num(l, "suneungPct") >= 93;
  const track = l.flags.track ?? (hs(l) === "science" ? "이과" : "문과");
  if (track === "이과") return ["공학", "자연", "의약", "교육", "예체능"].includes(field);
  return ["인문", "상경", "교육", "예체능"].includes(field) || id === "nursing";
}

function pickInterns(ctx: Ctx): void {
  const picks: string[] = [];
  while (picks.length < 3) {
    const c = ctx.rng.pick(COMPANIES).id;
    if (!picks.includes(c)) picks.push(c);
  }
  ctx.life.flags.internOffers = picks.join("|");
}

/** 인턴 합격 확률: 대학 등급, 스펙, 지능 */
const internChance = (l: Life) => clamp(0.65 - num(l, "univTier") * 0.06 + num(l, "spec") * 0.05 + (l.stats.smarts - 50) / 150, 0.1, 0.9);
const internWin = (ctx: Ctx) => {
  ctx.life.flags.internAt = String(ctx.life.flags.internTry);
  spec(2)(ctx);
};

export const EDU: GameEvent[] = [
  // ── 중학교 ──
  {
    id: "middle_start",
    ages: [13, 13],
    milestone: true,
    cast: { mate: { new: "친구", age: [0, 0] } },
    text: "[중학교 입학식 날|교복을 처음 입은 날]. [반 배정표 앞에서|낯선 교실 맨 뒷자리에서] {mate}이(가) 말을 걸어온다. \"[너 몇 반이야?|너 어느 초등학교 나왔어?|우리 같은 반이네!]\"",
    choices: [
      { text: "반갑게 맞장구친다", outcome: o("[금세 쉬는 시간마다 붙어 다니게 됐다.|매점에 같이 가는 사이가 됐다.|첫날부터 단짝이 생겼다.]", { meet: ["mate"], affinity: { mate: 12 }, stats: { social: 2, happiness: 2 } }) },
      {
        text: "농담으로 웃겨 본다",
        check: { stat: "social", dc: 50 },
        success: o("{mate}이(가) 배를 잡고 웃었다. 반 아이들이 하나둘 모여들었다.", { meet: ["mate"], affinity: { mate: 15 }, stats: { social: 3 }, flags: { popular: true } }),
        fail: o("농담이 허공에 흩어졌다. {mate}이(가) 어색하게 웃었다.", { meet: ["mate"], affinity: { mate: -3 }, stats: { happiness: -2 } }),
      },
      { text: "짧게 대답하고 책을 편다", outcome: o("조용한 아이로 첫인상이 굳었다. 그래도 공부는 잘된다.", { stats: { smarts: 2, social: -1 } }) },
    ],
  },

  // ── 고등학교 원서 (15살) ──
  {
    id: "hs_apply",
    ages: [15, 15],
    milestone: true,
    text: (ctx) => {
      const top = clamp(Math.round(100 - ctx.life.stats.smarts), 1, 90);
      return `중3 가을, 고등학교 원서를 써야 한다. 성적은 [전교|학년] 상위 ${top}% 정도. [담임 선생님이|엄마 아빠가] 어디로 갈지 물으신다.`;
    },
    choices: [
      { text: "집 근처 일반고", outcome: o("[집에서 걸어서 10분 거리 일반고에 배정됐다.|친구들 대부분과 같은 일반고에 가게 됐다.]", { flags: { hs: "general" } }) },
      {
        text: "자율형 사립고",
        when: (l) => l.stats.smarts >= 55 && l.wealth !== "poor",
        check: { stat: "smarts", dc: 60 },
        success: o("자사고 합격! 학비는 비싸지만 분위기가 다르다.", { flags: { hs: "private" }, stats: { happiness: 4 } }),
        fail: o("자사고는 떨어지고 일반고에 배정됐다.", { flags: { hs: "general" }, stats: { happiness: -3 } }),
      },
      { text: "과학고 도전", when: (l) => l.stats.smarts >= 65, outcome: cont("hs_science") },
      { text: "외국어고 도전", when: (l) => l.stats.smarts >= 60, outcome: cont("hs_foreign") },
      { text: "예술고 실기 지원", when: (l) => (l.revealed.talent && l.hidden.talent === "art") || (l.practiced.arts ?? 0) >= 2, outcome: cont("hs_arts") },
      { text: "특성화고에서 기술 배우기", outcome: cont("hs_voc") },
    ],
  },
  {
    id: "hs_science",
    ages: [0, 120],
    scene: true,
    text: "과학고 면접장. 면접관이 문제를 내민다. \"[물 위에 뜬 얼음이 다 녹으면 수면은 어떻게 될까요?|달에서 깃털과 망치를 떨어뜨리면?|이 실험 결과의 오류를 찾아보세요.]\"",
    choices: [
      {
        text: "원리부터 차근차근 설명한다",
        check: { stat: "smarts", dc: 72 },
        success: o("면접관이 고개를 끄덕였다. 과학고 합격!", { flags: { hs: "science" }, stats: { happiness: 6 }, fame: 1 }),
        fail: o("중간에 말이 꼬였다. 일반고로 가게 됐다.", { flags: { hs: "general" }, stats: { happiness: -4 } }),
      },
      {
        text: "엉뚱한 아이디어로 승부한다",
        chance: (l) => 0.25 + l.hidden.luck / 250,
        success: o("\"재밌는 생각이네요.\" 창의성을 인정받아 합격했다!", { flags: { hs: "science" }, stats: { happiness: 7 } }),
        fail: o("면접관이 웃기만 했다. 불합격.", { flags: { hs: "general" }, stats: { happiness: -4 } }),
      },
      {
        text: "모르는 건 모른다고 한다",
        chance: () => 0.2,
        success: o("솔직함이 통했다. 기적처럼 합격!", { flags: { hs: "science" } }),
        fail: o("솔직했지만 떨어졌다.", { flags: { hs: "general" }, stats: { happiness: -2 } }),
      },
    ],
  },
  {
    id: "hs_foreign",
    ages: [0, 120],
    scene: true,
    text: "외고 영어 면접. \"[Tell me about your role model.|What would you change about your school?|Why do you want to study languages?]\"",
    choices: [
      {
        text: "외워 온 답변을 말한다",
        check: { stat: "smarts", dc: 62 },
        success: o("막힘없이 말했다. 외고 합격!", { flags: { hs: "foreign" }, stats: { happiness: 5 } }),
        fail: o("긴장해서 외운 문장이 기억나지 않았다. 일반고로 간다.", { flags: { hs: "general" }, stats: { happiness: -4 } }),
      },
      {
        text: "즉흥으로 자연스럽게",
        check: { stat: "social", dc: 60 },
        success: o("면접관과 웃으며 대화했다. 합격!", { flags: { hs: "foreign" }, stats: { happiness: 6, social: 1 } }),
        fail: o("말은 많이 했지만 문법이 엉망이었다. 불합격.", { flags: { hs: "general" }, stats: { happiness: -3 } }),
      },
    ],
  },
  {
    id: "hs_arts",
    ages: [0, 120],
    scene: true,
    text: "예고 실기 시험. 주제는 \"[나의 하루|기억 속의 장소|소리]\". 시간은 [세|네] 시간.",
    choices: [
      {
        text: "준비한 기법으로 완성도를 높인다",
        chance: (l) => (l.hidden.talent === "art" ? 0.75 : 0.35),
        success: o("심사위원이 작품 앞에 오래 머물렀다. 예고 합격!", { flags: { hs: "arts" }, stats: { happiness: 7 }, reveal: ["talent"] }),
        fail: o("시간이 모자라 끝내지 못했다. 일반고로 간다.", { flags: { hs: "general" }, stats: { happiness: -4 } }),
      },
      {
        text: "과감한 실험을 한다",
        chance: (l) => (l.hidden.talent === "art" ? 0.6 : 0.2) + l.hidden.luck / 500,
        success: o("독특한 시도가 눈에 띄었다. 수석 합격!", { flags: { hs: "arts" }, stats: { happiness: 9 }, fame: 2 }),
        fail: o("너무 낯선 작품이었다. 불합격.", { flags: { hs: "general" }, stats: { happiness: -4 } }),
      },
    ],
  },
  {
    id: "hs_voc",
    ages: [0, 120],
    scene: true,
    text: "특성화고 어느 과에 갈까?",
    choices: [
      { text: "전자과", outcome: o("특성화고 전자과에 입학했다. 납땜 냄새가 익숙해질 것 같다.", { flags: { hs: "vocational", vocMajor: "전자" } }) },
      { text: "조리과", outcome: o("특성화고 조리과에 입학했다. 하얀 조리복이 잘 어울린다.", { flags: { hs: "vocational", vocMajor: "조리" } }) },
      { text: "디자인과", outcome: o("특성화고 디자인과에 입학했다. 태블릿 펜을 손에 쥐었다.", { flags: { hs: "vocational", vocMajor: "디자인" } }) },
      { text: "금융과", outcome: o("특성화고 금융과에 입학했다. 은행 취업반이 있다고 한다.", { flags: { hs: "vocational", vocMajor: "금융" } }) },
    ],
  },

  // ── 고등학교 ──
  {
    id: "hs_track",
    ages: [16, 16],
    milestone: true,
    when: (l) => academic(l) && hs(l) !== "science" && hs(l) !== "arts",
    text: "[고1 겨울|2학년 올라가기 전], 문과와 이과 중 하나를 골라야 한다.",
    choices: [
      { text: "이과 (수학·과학)", outcome: o("이과를 골랐다. [미적분 문제집을 샀다.|이과반 교실이 조금 더 시끄럽다.]", { flags: { track: "이과" } }) },
      { text: "문과 (국어·사회)", outcome: o("문과를 골랐다. [사회탐구 과목을 고르느라 한참 고민했다.|토론 수업이 많아졌다.]", { flags: { track: "문과" } }) },
      {
        text: "친한 친구를 따라간다",
        outcome: (l) =>
          l.stats.smarts % 2 === 0
            ? o("친구 따라 이과에 왔다. 수학이 어렵다.", { flags: { track: "이과" }, stats: { happiness: 2 } })
            : o("친구 따라 문과에 왔다. 같이 있어서 좋다.", { flags: { track: "문과" }, stats: { happiness: 2 } }),
      },
    ],
  },
  {
    id: "hs_exam",
    ages: [16, 18],
    max: 4,
    cooldown: 1,
    weight: 3,
    when: academic,
    text: (ctx) => `[중간고사|기말고사|모의고사] 일주일 전. 지금 내신은 ${gpaOf(ctx.life)}등급. [교실 공기가 무겁다.|친구들 눈이 다 빨갛다.|단톡방이 조용하다.]`,
    choices: [
      { text: "밤새워 공부한다", outcome: o("[해 뜨는 걸 보며 공식을 외웠다.|커피 세 잔으로 버텼다.] 성적은 올랐지만 몸이 축났다.", { stats: { smarts: 2, health: -2, happiness: -1 }, run: boost(1) }) },
      {
        text: "계획표대로 꾸준히",
        check: { stat: "grit", dc: 50 },
        success: o("계획대로 해냈다. [등수가 쑥 올랐다.|선생님이 칭찬하셨다.]", { stats: { smarts: 2 }, reveal: ["grit"], run: boost(2) }),
        fail: o("계획표는 사흘 만에 무너졌다.", { reveal: ["grit"], stats: { happiness: -1 } }),
      },
      {
        text: "친구들과 스터디 카페에",
        check: { stat: "social", dc: 45 },
        success: o("서로 문제를 내 주며 공부했다. 의외로 효과 만점.", { stats: { social: 1, smarts: 1 }, run: boost(1) }),
        fail: o("수다만 떨다 왔다.", { stats: { happiness: 2 } }),
      },
      { text: "이번엔 그냥 논다", outcome: o("[PC방에서 하루를 보냈다.|노래방에서 목이 쉬었다.] 성적표는 보고 싶지 않다.", { stats: { happiness: 3 }, run: boost(-1) }) },
    ],
  },

  // ── 수시 원서와 수능 (18살) ──
  {
    id: "college_apply",
    ages: [18, 18],
    milestone: true,
    when: (l) => academic(l) && l.flags.suneungDone !== true,
    text: (ctx) => `고3 가을. 내신 ${gpaOf(ctx.life)}등급으로 수시 원서 6장을 써야 한다. [담임 선생님은 안정 지원을 권하신다.|학원 선생님은 상향을 노려 보라고 한다.|엄마는 일단 서울로 가라고 하신다.]`,
    choices: [
      { text: "상향 지원 (꿈의 대학)", outcome: cont("suneung_eve", "", { flags: { susiPlan: "up" } }) },
      { text: "적정 지원", outcome: cont("suneung_eve", "", { flags: { susiPlan: "fit" } }) },
      { text: "안정 지원", outcome: cont("suneung_eve", "", { flags: { susiPlan: "safe" } }) },
      { text: "정시에 올인", outcome: cont("suneung_eve", "", { flags: { susiPlan: "none" } }) },
    ],
  },
  {
    id: "suneung_retake",
    ages: [19, 22],
    milestone: true,
    when: (l) => l.flags.retakeAt === l.age && l.flags.suneungDone !== true,
    text: "재수 1년이 지났다. [독서실 책상 위 달력에 X가 빼곡하다.|학원 자습실 불이 꺼질 때까지 앉아 있었다.]",
    choices: [{ text: "다시 수능장으로", outcome: cont("suneung_eve", "", { flags: { susiPlan: "none" } }) }],
  },
  {
    id: "suneung_eve",
    ages: [0, 120],
    scene: true,
    text: "[수능 전날 밤.|내일이 수능이다.] [창밖에 첫눈이 내린다.|엄마가 찹쌀떡을 내밀었다.|심장이 쿵쾅거려 잠이 오지 않는다.]",
    choices: [
      { text: "일찍 잠자리에 든다", outcome: exam(2) },
      { text: "오답 노트를 한 번 더 본다", check: { stat: "grit", dc: 55 }, success: exam(4), fail: exam(-3) },
      { text: "가볍게 산책한다", outcome: exam(1, { stats: { happiness: 2 } }) },
    ],
  },
  {
    id: "suneung_result",
    ages: [0, 120],
    scene: true,
    text: (ctx) => {
      const l = ctx.life;
      const offers = listFlag(l, "offers").map(decode);
      const pct = num(l, "suneungPct");
      const mood = pct >= 95 ? "[믿을 수 없는 점수다!|손이 덜덜 떨린다.]" : pct >= 80 ? "[준비한 만큼 나왔다.|나쁘지 않다.]" : "[생각보다 많이 낮다.|눈앞이 캄캄하다.]";
      const list = offers.length ? `합격: ${offers.map((x) => `${offerName(x)}(${x.how})`).join(", ")}` : "합격한 곳이 없다.";
      return `수능 백분위 평균 ${pct}. ${mood} ${list}`;
    },
    choices: [
      ...slots(
        "offers",
        4,
        (item) => offerName(decode(item)),
        (item) => {
          const x = decode(item);
          return {
            text: x.med
              ? `${x.name} 의예과 합격! [동네에 현수막이 걸렸다.|친척들 단톡방이 난리가 났다.]`
              : x.tier <= 1
                ? `${x.name}에 진학한다. [합격 소식에 엄마가 울었다.|학교 정문에 이름이 걸렸다.]`
                : `${x.name}에 진학하기로 했다.`,
            effects: { stats: { happiness: x.tier <= 1 ? 10 : x.tier <= 4 ? 5 : 2 }, fame: x.tier <= 1 ? 2 : 0, run: (ctx: Ctx) => enroll(ctx, x) },
            next: x.med ? undefined : "major_pick",
          };
        },
      ),
      {
        text: "재수한다",
        when: (l) => l.flags.retakeAt === undefined,
        outcome: o("1년 더 해 보기로 했다. 독서실 책상에 \"한 번 더\"라고 써 붙였다.", {
          stats: { happiness: -4 },
          run: (ctx) => {
            ctx.life.flags.retakeAt = ctx.life.age + 1;
            ctx.life.flags.suneungDone = false;
          },
        }),
      },
      { text: "대학 대신 사회로", outcome: o("대학 대신 일찍 사회에 나가기로 했다.", { education: "고졸", flags: { collegeDecided: true } }) },
    ],
  },
  {
    id: "major_pick",
    ages: [0, 120],
    scene: true,
    text: (ctx) => `${ctx.life.flags.univ}, 어느 학과로 갈까?`,
    choices: MAJORS.filter((m) => m.id !== "med").map((m) => ({
      text: m.name,
      when: (l: Life) => majorOpen(l, m.field, m.id),
      outcome: o(`{f_univ} ${m.name} [새내기가 됐다.|신입생이 됐다.|OT에서 동기들을 만났다.]`, { flags: { major: m.id } }),
    })),
  },

  // ── 특성화고 졸업반 ──
  {
    id: "voc_hire",
    ages: [18, 18],
    milestone: true,
    when: (l) => hs(l) === "vocational",
    text: (ctx) => `특성화고 ${ctx.life.flags.vocMajor}과 3학년. 고졸 채용 공고가 붙었다.`,
    choices: [
      {
        text: "삼성전자 고졸 공채",
        when: (l) => l.flags.vocMajor === "전자",
        check: { stat: "smarts", dc: 55 },
        success: o("삼성전자 고졸 공채 합격! 반도체 라인에서 일하게 됐다.", { job: { id: "big", title: "삼성전자 사원", salary: 3800, org: "samsung", rank: 0 }, education: "고졸", flags: { collegeDecided: true }, stats: { happiness: 8 } }),
        fail: o("GSAT에서 떨어졌다.", { education: "고졸", flags: { collegeDecided: true }, stats: { happiness: -4 } }),
      },
      {
        text: "은행 고졸 채용",
        when: (l) => l.flags.vocMajor === "금융",
        check: { stat: "social", dc: 55 },
        success: o("{f_bankName} 고졸 채용 합격! 창구 업무를 맡게 됐다.", {
          education: "고졸",
          flags: { collegeDecided: true },
          stats: { happiness: 8 },
          run: (ctx) => {
            const org = ctx.rng.chance(0.5) ? "kb" : "shinhan";
            ctx.life.flags.bankName = companyName(org);
            ctx.life.job = { id: "big", title: `${companyName(org)} 사원`, salary: 3600, org, rank: 0, years: 0 };
          },
        }),
        fail: o("면접에서 떨어졌다.", { education: "고졸", flags: { collegeDecided: true }, stats: { happiness: -4 } }),
      },
      {
        text: "한국전력 고졸 채용",
        check: { stat: "grit", dc: 55 },
        success: o("한국전력공사 고졸 채용 합격! 공기업 직원이 됐다.", { job: { id: "public", title: "한국전력공사 사원", salary: 3400, org: "kepco", rank: 0 }, education: "고졸", flags: { collegeDecided: true }, stats: { happiness: 8 }, reveal: ["grit"] }),
        fail: o("NCS 점수가 모자랐다.", { education: "고졸", flags: { collegeDecided: true }, stats: { happiness: -4 }, reveal: ["grit"] }),
      },
      {
        text: "식당·디자인 회사 취업",
        when: (l) => l.flags.vocMajor === "조리" || l.flags.vocMajor === "디자인",
        outcome: o((ctx) => (ctx.life.flags.vocMajor === "조리" ? "호텔 주방에 막내로 들어갔다." : "작은 디자인 회사에 들어갔다."), {
          job: { id: "sme", title: "사원", salary: 2800, rank: 0 },
          education: "고졸",
          flags: { collegeDecided: true },
        }),
      },
      { text: "전문대에 진학한다", outcome: o("조금 더 배우기로 했다. 전문대에 입학했다.", { flags: { univ: "전문대학", univTier: 7, collegeKind: "전문대졸", collegeDecided: true, collegeUntil: 21, major: "art" } }) },
    ],
  },

  // ── 대학 생활 ──
  {
    id: "college_year",
    ages: [19, 30],
    max: 5,
    cooldown: 1,
    weight: 4,
    when: (l) => inCollege(l) && l.flags.major !== undefined,
    text: (ctx) => `${ctx.life.flags.univ} ${majorById(String(ctx.life.flags.major))?.name ?? ""}. [새 학기|이번 방학]엔 무엇에 집중할까?`,
    choices: [
      { text: "학점 관리", outcome: o("[도서관 4층 창가가 내 자리가 됐다.|A+가 줄줄이 찍혔다.] [장학금도 받았다!|교수님이 연구실에 와 보라고 하셨다.]", { stats: { smarts: 3, happiness: -1 }, money: [0, 300], run: spec(1) }) },
      {
        text: "토익·자격증",
        check: { stat: "smarts", dc: 50 },
        success: o("[토익 900점을 넘겼다.|자격증을 두 개나 땄다.] 이력서 한 줄이 늘었다.", { run: spec(1) }),
        fail: o("[점수가 제자리다.|시험 당일 늦잠을 잤다.]", { stats: { happiness: -2 } }),
      },
      { text: "기업 인턴 지원", outcome: cont("intern_pick", "", { run: pickInterns }) },
      { text: "동아리와 연애", outcome: o("[동아리 MT에서 밤새 웃었다.|축제 무대에 섰다.|과 CC가 될 뻔했다.]", { stats: { social: 3, happiness: 4 }, flags: { campusLife: true } }) },
      {
        text: "휴학하고 워킹홀리데이",
        outcome: o("[호주|캐나다|일본] 워킹홀리데이를 다녀왔다. [농장에서 일하며 영어가 늘었다.|카페에서 일하며 친구를 사귀었다.|생각보다 고생만 했다.]", {
          stats: { happiness: 5, social: 2 },
          money: [-300, 300],
          run: (ctx) => {
            ctx.life.flags.collegeUntil = num(ctx.life, "collegeUntil") + 1;
            spec(1)(ctx);
          },
        }),
      },
    ],
  },
  {
    id: "intern_pick",
    ages: [0, 120],
    scene: true,
    text: "방학 인턴 공고가 떴다. 어디에 지원할까?",
    choices: [
      ...slots("internOffers", 3, (id) => companyName(id), (id) => cont("intern_result", "", { flags: { internTry: id, internTryName: companyName(id) } })),
      { text: "올해는 쉰다", outcome: o("이번 방학은 쉬기로 했다.", { stats: { happiness: 2 } }) },
    ],
  },
  {
    id: "intern_result",
    ages: [0, 120],
    scene: true,
    text: "{f_internTryName} 인턴 면접. [면접관 셋이 나란히 앉아 있다.|화상 면접이다. 카메라가 어색하다.|대기실에 지원자가 가득하다.]",
    choices: [
      {
        text: "준비한 대로 침착하게",
        chance: internChance,
        success: o("{f_internTryName} 인턴 합격! [두 달 동안 회의록을 썼다.|사원증을 목에 걸었다.] 나중에 큰 도움이 될 것 같다.", { stats: { happiness: 4 }, money: 400, run: internWin }),
        fail: o("인턴은 떨어졌다. [경험이라 생각하자.|다음엔 더 잘할 수 있다.]", { stats: { happiness: -2 } }),
      },
      {
        text: "열정을 어필한다",
        check: { stat: "social", dc: 55 },
        success: o("열정이 통했다. {f_internTryName} 인턴 합격!", { money: 400, run: internWin }),
        fail: o("\"열정은 좋은데요…\" 탈락이었다.", { stats: { happiness: -2 } }),
      },
    ],
  },
  {
    id: "graduation",
    ages: [20, 40],
    milestone: true,
    when: (l) => l.flags.collegeUntil === l.age && l.flags.graduated !== true,
    cast: { parent: { role: ["엄마", "아빠"] } },
    text: "{f_univ} 졸업식. [학사모가 어색하다.|캠퍼스에 꽃이 피었다.|동기들과 마지막 사진을 찍었다.]",
    choices: [
      {
        text: "학사모를 하늘 높이 던진다",
        outcome: o("{parent}이(가) 꽃다발을 안겨 주며 눈시울을 붉혔다.", {
          stats: { happiness: 5 },
          affinity: { parent: 5 },
          flags: { graduated: true },
          run: (ctx) => {
            ctx.life.education = (ctx.life.flags.collegeKind as Education) ?? "대졸";
          },
        }),
      },
      {
        text: "대학원에 진학한다",
        when: (l) => num(l, "univTier") <= 5 && l.stats.smarts >= 60 && l.flags.major !== "med",
        outcome: o("공부를 조금 더 하기로 했다. 연구실 생활이 시작됐다.", {
          stats: { smarts: 4 },
          run: (ctx) => {
            ctx.life.flags.collegeUntil = ctx.life.age + 2;
            spec(2)(ctx);
          },
        }),
      },
    ],
  },
];
