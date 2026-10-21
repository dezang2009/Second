// 연애와 결혼: 만남(소개팅·사내·동창 재회·결혼정보회사) → 데이트 장소 → 대화 주제 → 애프터·고백
// → 기념일 → 프러포즈 장소 → 상견례 → 예식장 → 신혼집. 상대마다 직업·연봉·성격·집안이 있다.

import type { CastSpec, Ctx, GameEvent, Outcome } from "../../game/events";
import { clamp, first, num, peopleWith, single } from "../../game/life";
import type { Rng } from "../../game/rng";
import { WEALTH_LABEL, type Life, type Person, type Wealth } from "../../game/types";
import { COMPANIES, companyById } from "../companies";
import { avgChance, cont, o } from "./util";

export const TRAITS = ["다정한", "털털한", "야망 있는", "알뜰한", "자유로운", "꼼꼼한", "유머러스한", "조용한"] as const;
type Topic = "일" | "취미" | "연애관" | "재테크";

/** 성격마다 좋아하는 대화 주제 */
const LIKES: Record<string, Topic[]> = {
  다정한: ["연애관", "취미"],
  털털한: ["취미", "일", "연애관", "재테크"],
  "야망 있는": ["일", "재테크"],
  알뜰한: ["재테크", "연애관"],
  자유로운: ["취미"],
  꼼꼼한: ["일", "재테크"],
  유머러스한: ["취미", "연애관"],
  조용한: ["취미", "연애관"],
};

/** 상대의 직업. 실제 기업 이름도 섞는다 */
function partnerJob(rng: Rng, upscale = false): { job: string; salary: number } {
  const c = rng.pick(COMPANIES);
  const jobs: [string, number, number][] = [
    [`${c.name} 회사원`, c.salary + 800, 3],
    ["초등학교 교사", 4000, 2],
    ["간호사", 4300, 2],
    ["공무원", 3600, 2],
    ["프리랜서 디자이너", 3000, 1],
    ["중소기업 회사원", 3300, 3],
    ["카페 사장", 3500, 1],
    ["대학원생", 1600, 1],
    ["스타트업 마케터", 4000, 1],
    ["약사", 7500, upscale ? 2 : 0.5],
    ["대학병원 의사", 13000, upscale ? 2 : 0.3],
    ["변호사", 9500, upscale ? 2 : 0.3],
  ];
  const [job, salary] = rng.weighted(jobs, (j) => j[2])!;
  return { job, salary: salary + rng.int(-300, 600) };
}

function makePartner(upscale = false) {
  return (p: Person, _life: Life, rng: Rng) => {
    Object.assign(p, partnerJob(rng, upscale));
    p.trait = rng.pick(TRAITS);
    p.wealth = rng.weighted<Wealth>(["poor", "normal", "rich"], (w) => ({ poor: 2, normal: 5, rich: upscale ? 3 : 1.5 })[w])!;
    p.affinity = 45;
  };
}

const date = (upscale = false): CastSpec => ({ new: "연인", gender: "opposite", age: [-3, 3], make: makePartner(upscale) });

/** 데이트 상대의 성격을 판정에서 쓰도록 남겨 둔다 */
const remember = (ctx: Ctx) => {
  const d = ctx.cast.date;
  if (d) ctx.life.flags.dateTrait = d.trait ?? "털털한";
};

function topicChance(l: Life, topic: Topic): number {
  const liked = LIKES[String(l.flags.dateTrait)]?.includes(topic) ?? false;
  return clamp((liked ? 0.7 : 0.3) + (l.stats.social - 50) / 150 + (l.stats.looks - 50) / 200, 0.05, 0.95);
}

const talk = (topic: Topic, line: string) => ({
  text: `${topic} 이야기`,
  chance: (l: Life) => topicChance(l, topic),
  success: cont("date_after", `${line} [이야기가 술술 풀렸다.|시간 가는 줄 몰랐다.|{date}의 눈이 반짝였다.]`, { affinity: { date: 12 } }),
  fail: o(`${line} [{date}이(가) 자꾸 시계를 봤다.|대화가 계속 엇나갔다.|어색한 침묵만 흘렀다.] 인연이 아니었나 보다.`, { stats: { happiness: -2 } }),
});

const lover = (l: Life) => first(l, "연인");
const loverTrait = (l: Life) => lover(l)?.trait ?? "털털한";

/** 결혼 확정: 연인을 배우자로 */
const wed = (text: string, money: number, extra: Record<string, number | boolean> = {}): Outcome =>
  o(text, {
    role: { lover: "배우자" },
    affinity: { lover: 10 },
    stats: { happiness: 12 },
    money,
    flags: extra,
    run: (ctx) => {
      ctx.life.flags.marriedAt = ctx.life.age;
      ctx.life.flags.spouseSalary = ctx.cast.lover?.salary ?? 0;
      ctx.life.flags.spouseWorks = (ctx.cast.lover?.salary ?? 0) > 2000;
    },
  });

export const LOVE: GameEvent[] = [
  // ── 만남 ──
  {
    id: "blind_date",
    ages: [20, 48],
    max: 14,
    cooldown: 1,
    when: single,
    weight: (l) => (l.year.activity === "dating" ? 5 : 1.3),
    cast: { date: date() },
    setup: remember,
    text: "[친구가|회사 선배가|엄마 친구가|대학 동기가] 소개해 준 {date}. {date_trait} 성격에 {date_job}(이)라고 한다. 어디서 만날까?",
    choices: [
      { text: "분위기 좋은 파스타집", outcome: cont("date_talk", "", { flags: { datePlace: "파스타집" } }) },
      { text: "편한 이자카야", outcome: cont("date_talk", "", { flags: { datePlace: "이자카야" } }) },
      { text: "한강 산책", outcome: cont("date_talk", "", { flags: { datePlace: "한강" } }) },
      { text: "전시회 관람", outcome: cont("date_talk", "", { flags: { datePlace: "전시회" } }) },
    ],
  },
  {
    id: "date_talk",
    ages: [0, 120],
    scene: true,
    text: "{f_datePlace}. [어색한 정적이 흐른다.|{date}이(가) 먼저 웃었다.|둘 다 메뉴판만 보고 있다.|{date}이(가) 휴대폰을 내려놓는다.] 무슨 이야기를 할까?",
    choices: [
      talk("일", "요즘 하는 일 이야기를 꺼냈다."),
      talk("취미", "주말에 뭘 하는지 물었다."),
      talk("연애관", "어떤 연애를 하고 싶은지 이야기했다."),
      talk("재테크", "적금과 주식 이야기를 꺼냈다."),
    ],
  },
  {
    id: "date_after",
    ages: [0, 120],
    scene: true,
    text: "헤어질 시간. [지하철역 앞|카페 앞|버스 정류장]에서 {date}이(가) 머뭇거린다.",
    choices: [
      {
        text: "다음 주에 또 보자고 한다",
        chance: (l) => avgChance(l.stats.looks, l.stats.social, 42),
        success: o("{date}이(가) 웃으며 고개를 끄덕였다. [몇 번의 만남 끝에|벚꽃이 필 무렵] 연인이 됐다.", { meet: ["date"], affinity: { date: 10 }, stats: { happiness: 6 } }),
        fail: o("\"[좋은 분 같은데… 저랑은 안 맞는 것 같아요.|오늘 즐거웠어요. 조심히 가세요.]\" 연락은 거기까지였다.", { stats: { happiness: -3 } }),
      },
      {
        text: "오늘 바로 고백한다",
        chance: (l) => avgChance(l.stats.looks, l.stats.social, 55),
        success: o("\"사실 저도요.\" 그날부터 {date}와(과) 사귀게 됐다.", { meet: ["date"], affinity: { date: 20 }, stats: { happiness: 9 } }),
        fail: o("\"너무 빠른 것 같아요.\" {date}이(가) 뒷걸음질 쳤다.", { stats: { happiness: -5 } }),
      },
      {
        text: "연락처만 받고 지켜본다",
        chance: () => 0.4,
        success: o("며칠 뒤 {date}에게서 먼저 연락이 왔다. 천천히 가까워져 연인이 됐다.", { meet: ["date"], affinity: { date: 8 }, stats: { happiness: 5 } }),
        fail: o("서로 연락을 미루다 흐지부지됐다.", { stats: { happiness: -1 } }),
      },
    ],
  },
  {
    id: "office_romance",
    ages: [24, 48],
    max: 3,
    cooldown: 3,
    when: (l) => single(l) && !!l.job && l.job.id !== "parttime",
    cast: {
      date: {
        new: "연인",
        gender: "opposite",
        age: [-3, 3],
        make: (p, life, rng) => {
          makePartner()(p, life, rng);
          const org = companyById(life.job?.org)?.name ?? life.flags.hiredAt;
          p.job = org ? `${org} 옆 팀 동료` : "같은 회사 동료";
          p.salary = life.job?.salary ?? 3500;
        },
      },
    },
    setup: remember,
    text: "야근하는 밤, 옆 팀 {date}이(가) 커피를 건넨다. \"[아직 안 가셨어요?|이거 드시고 하세요.|저녁 같이 드실래요?]\"",
    choices: [
      { text: "같이 퇴근한다", outcome: cont("date_talk", "같이 회사를 나섰다. 근처 식당으로 향했다.", { flags: { datePlace: "회사 앞 식당" } }) },
      { text: "고맙다고만 한다", outcome: o("커피를 받아 들고 고맙다고 했다. {date}이(가) 살짝 아쉬운 얼굴이었다.") },
      { text: "사내 연애는 위험해", outcome: o("선을 그었다. 다음 날부터 {date}이(가) 조금 어색해졌다.", { stats: { social: -1 } }) },
    ],
  },
  {
    id: "reunion",
    ages: [24, 42],
    max: 1,
    when: (l) => single(l) && typeof l.flags.firstLove === "string" && !l.people.some((p) => p.name === l.flags.firstLove),
    cast: {
      date: {
        new: "연인",
        gender: "opposite",
        age: [0, 0],
        make: (p, life, rng) => {
          makePartner()(p, life, rng);
          p.name = String(life.flags.firstLove);
          p.affinity = 55;
        },
      },
    },
    setup: remember,
    text: "[동창회|친구 결혼식|고향 카페]에서 {date_full}을(를) 다시 만났다. 학창 시절 {f_firstLoveHow} 사람이다. 지금은 {date_job}(이)라고 한다.",
    choices: [
      { text: "그때 이야기를 꺼낸다", chance: (l) => avgChance(l.stats.social, 60, 45), success: cont("date_after", "둘 다 웃음이 터졌다. \"사실 나도 그때…\"", { affinity: { date: 15 } }), fail: o("{date}이(가) 기억을 못 하는 눈치였다. 조금 서운했다.", { stats: { happiness: -2 } }) },
      { text: "반갑게 인사만 한다", outcome: o("\"잘 지냈어?\" 짧은 인사를 나눴다. 마음이 잠깐 흔들렸다.") },
      { text: "모른 척 피한다", outcome: o("괜히 가슴이 뛰어서 자리를 피했다.", { stats: { happiness: -1 } }) },
    ],
  },
  {
    id: "matchmaking",
    ages: [30, 48],
    max: 2,
    cooldown: 3,
    when: (l) => single(l) && l.money >= 500,
    cast: { date: date(true) },
    setup: remember,
    text: (ctx) => {
      const l = ctx.life;
      const score = (l.job?.salary ?? 0) / 100 + (7 - num(l, "univTier")) * 5 + l.stats.looks / 2 + { poor: 0, normal: 10, rich: 25 }[l.wealth];
      const grade = score >= 110 ? "다이아몬드" : score >= 85 ? "골드" : score >= 60 ? "실버" : "브론즈";
      return `결혼정보회사 상담실. 매니저가 서류를 넘기며 말한다. "회원님은 ${grade} 등급이세요. [딱 맞는 분이 있어요.|이분 어떠세요?]" 소개받은 사람은 {date_trait} {date_job}.`;
    },
    choices: [
      { text: "가입비 300만 원 내고 만난다", outcome: cont("date_talk", "", { money: -300, flags: { datePlace: "호텔 라운지" } }) },
      { text: "이런 건 나랑 안 맞아", outcome: o("정중히 거절하고 나왔다. 사랑은 자연스럽게 오는 거라고 믿는다.") },
    ],
  },

  // ── 연애 ──
  {
    id: "couple_moment",
    ages: [16, 70],
    max: 15,
    cooldown: 1,
    weight: 2,
    cast: { lover: { role: "연인" } },
    text: "[{lover}의 생일|크리스마스|사귄 지 100일|1주년 기념일]이 다가온다. {lover}은(는) {lover_trait} 사람이다.",
    choices: [
      {
        text: "깜짝 이벤트를 준비한다",
        outcome: (l) =>
          ["다정한", "자유로운", "유머러스한"].includes(loverTrait(l))
            ? o("{lover}이(가) 깜짝 놀라 눈물을 보였다. [평생 잊지 못할 거래.|사진을 백 장은 찍었다.]", { money: [-150, -50], affinity: { lover: 12 }, stats: { happiness: 4 } })
            : o("{lover}은(는) 고마워했지만 [돈을 너무 썼다고 걱정했다.|조금 부담스러워했다.]", { money: [-150, -50], affinity: { lover: 3 } }),
      },
      {
        text: "손편지를 쓴다",
        outcome: (l) =>
          ["다정한", "조용한", "꼼꼼한"].includes(loverTrait(l))
            ? o("{lover}이(가) 편지를 지갑에 넣고 다닌다고 했다.", { affinity: { lover: 10 }, stats: { happiness: 3 } })
            : o("{lover}이(가) 웃으며 읽었다. [\"글씨 귀엽다.\"|\"선물은?\"]", { affinity: { lover: 4 } }),
      },
      { text: "둘이 여행을 떠난다", outcome: o("[제주도|부산|강릉|오사카]로 여행을 다녀왔다. [바다를 보며 오래 이야기했다.|길을 잃었지만 그것도 추억이다.]", { money: [-300, -100], affinity: { lover: 8 }, stats: { happiness: 5 } }) },
      { text: "바빠서 평소처럼 보낸다", outcome: o("특별한 날인데 평소처럼 보냈다. {lover}이(가) 서운한 눈치다.", { affinity: { lover: -6 } }) },
    ],
  },
  {
    id: "proposal",
    ages: [25, 55],
    max: 3,
    cooldown: 2,
    weight: 3,
    cast: { lover: { role: "연인", filter: (p) => p.affinity >= 60 } },
    text: "{lover}와(과) 만난 지 [2년|3년|꽤 오래]. [친구들이 하나둘 결혼한다.|{lover}의 부모님이 안부를 물으셨다.|결혼 이야기가 자연스럽게 나왔다.]",
    choices: [
      { text: "프러포즈를 준비한다", outcome: cont("propose_place") },
      { text: "아직은 이르다", outcome: o("결혼은 조금 더 나중에 생각하기로 했다.", { affinity: { lover: -3 } }) },
    ],
  },
  {
    id: "propose_place",
    ages: [0, 120],
    scene: true,
    text: "어디서 프러포즈할까?",
    choices: (
      [
        ["한강 유람선 위에서", -100, ["다정한", "자유로운"]],
        ["호텔 레스토랑에서", -200, ["야망 있는", "꼼꼼한"]],
        ["처음 만난 곳에서", 0, ["다정한", "조용한", "유머러스한"]],
        ["집에서 소박하게", 0, ["알뜰한", "털털한", "조용한"]],
      ] as const
    ).map(([where, cost, fits]) => ({
      text: where,
      chance: (l: Life) => clamp((lover(l)?.affinity ?? 50) / 100 + ((fits as readonly string[]).includes(loverTrait(l)) ? 0.15 : -0.05), 0.1, 0.95),
      success: cont("meet_parents", `${where} 반지를 내밀었다. {lover}이(가) [눈물을 글썽이며|활짝 웃으며|한참 말을 잇지 못하다가] 고개를 끄덕였다!`, { money: cost }),
      fail: o(`${where} 반지를 내밀었지만 "조금만 더 생각해 볼게." {lover}은(는) 아직 확신이 없다고 했다.`, { money: cost, affinity: { lover: -8 }, stats: { happiness: -5 } }),
    })),
  },
  {
    id: "meet_parents",
    ages: [0, 120],
    scene: true,
    text: (ctx) => {
      const w = ctx.cast.lover?.wealth ?? "normal";
      return `상견례 날. {lover}의 부모님은 [깐깐해 보이신다.|인자해 보이신다.|말이 없으시다.] (${WEALTH_LABEL[w]})`;
    },
    choices: [
      { text: "예의 바르게 정석대로", check: { stat: "social", dc: 48 }, success: cont("wedding_plan", "상견례가 [화기애애하게|무사히] 끝났다."), fail: cont("wedding_plan", "말실수를 했다. 분위기가 싸늘했지만 결혼은 진행하기로 했다.", { flags: { inLawCold: true }, stats: { happiness: -3 } }) },
      {
        text: "내 직업과 계획을 어필한다",
        chance: (l) => clamp(0.3 + (l.job?.salary ?? 0) / 12000, 0.1, 0.9),
        success: cont("wedding_plan", "\"믿음직하네.\" 부모님이 흐뭇해하셨다."),
        fail: cont("wedding_plan", "자랑처럼 들렸나 보다. 표정이 굳으셨다.", { flags: { inLawCold: true } }),
      },
      { text: "솔직하게 형편을 이야기한다", chance: () => 0.6, success: cont("wedding_plan", "솔직함을 좋게 봐 주셨다."), fail: cont("wedding_plan", "걱정 어린 눈빛이 오갔다.", { flags: { inLawCold: true } }) },
    ],
  },
  {
    id: "wedding_plan",
    ages: [0, 120],
    scene: true,
    text: "결혼식은 어떻게 할까? [웨딩 박람회 팸플릿이 책상에 쌓였다.|스드메 견적이 생각보다 비싸다.]",
    choices: [
      { text: "호텔 웨딩", when: (l) => l.money >= 3000, outcome: cont("newlywed_home", "[호텔 연회장에 샹들리에가 반짝였다.|하객들이 감탄했다.]", { money: -6000, fame: 1 }) },
      { text: "일반 웨딩홀", outcome: cont("newlywed_home", "[30분마다 바뀌는 웨딩홀이었지만 행복했다.|친구들이 축가를 불러 줬다.]", { money: -2500 }) },
      { text: "가족끼리 스몰웨딩", outcome: cont("newlywed_home", "[마당 있는 카페에서 가족끼리 조촐하게 했다.|직접 만든 부케를 들었다.]", { money: -800, stats: { happiness: 2 } }) },
      { text: "식 없이 혼인신고만", outcome: cont("newlywed_home", "구청에서 혼인신고서를 냈다. 둘이 짜장면을 먹으며 축하했다.", { stats: { happiness: 1 } }) },
    ],
  },
  {
    id: "newlywed_home",
    ages: [0, 120],
    scene: true,
    text: "신혼집은 어디로 할까?",
    choices: [
      {
        text: "대출 끼고 아파트 매매",
        when: (l) => l.money >= 12000 && !l.flags.houseValue,
        outcome: wed("대출을 끼고 아파트를 샀다. [둘이 벽지 색을 골랐다.|집들이에 친구들이 몰려왔다.] 이제 부부다!", -12000, { houseValue: 45000, mortgageLeft: 25 }),
      },
      { text: "전세로 시작", when: (l) => l.money >= 3000, outcome: wed("전세 대출을 받아 작은 아파트에서 시작했다. 이제 부부다!", -3000, { jeonse: true }) },
      { text: "월세 투룸", outcome: wed("월세 투룸에서 신혼을 시작했다. 좁지만 둘이라 좋다. 이제 부부다!", -500) },
      { text: "부모님 집에 들어간다", outcome: wed("당분간 부모님 집에서 살기로 했다. [눈치가 보이지만 돈은 모인다.|매일 아침 밥상이 차려져 있다.] 이제 부부다!", 0, { withParents: true }) },
    ],
  },
  {
    id: "inlaw_conflict",
    ages: [25, 80],
    max: 3,
    cooldown: 4,
    when: (l) => l.flags.inLawCold === true && peopleWith(l, "배우자").length > 0,
    cast: { spouse: { role: "배우자" } },
    text: "[설날|추석|시댁·처가 생신]. [잔소리가 쏟아진다.|분위기가 차갑다.|\"애는 언제 낳니?\" 질문이 날아왔다.]",
    choices: [
      { text: "웃으며 넘긴다", check: { stat: "social", dc: 50 }, success: o("능청스럽게 넘겼다. 분위기가 조금 풀렸다.", { affinity: { spouse: 4 }, flags: { inLawCold: false } }), fail: o("웃음이 굳어 버렸다. 돌아오는 차 안이 조용했다.", { stats: { happiness: -4 } }) },
      { text: "{spouse}에게 중재를 부탁한다", outcome: (l) => ((first(l, "배우자")?.affinity ?? 50) >= 60 ? o("{spouse}이(가) 든든하게 편을 들어 줬다.", { affinity: { spouse: 6 } }) : o("{spouse}이(가) 난처해하기만 했다. 서운했다.", { affinity: { spouse: -6 }, stats: { happiness: -3 } })) },
      { text: "할 말은 한다", chance: () => 0.4, success: o("솔직하게 말씀드렸더니 오히려 사이가 좋아졌다.", { flags: { inLawCold: false } }), fail: o("큰 싸움이 됐다. 한동안 연락을 끊었다.", { affinity: { spouse: -8 }, stats: { happiness: -6 } }) },
    ],
  },
];
