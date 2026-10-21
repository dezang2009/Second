// 장년기: 직장, 돈, 집, 가족

import type { Ctx, GameEvent } from "../../game/events";
import { ageOf, employed, first, married, peopleWith } from "../../game/life";
import { formatMoney } from "../../game/text";
import { addFamily, doing, o, surnameOf } from "./util";


/** 투자 결과 금액을 정하고 문장에서 쓰도록 flags.lastAmount에 적어 둔다 */
const invest = (share: number, win: boolean) => (ctx: Ctx) => {
  const stake = Math.max(50, Math.floor(ctx.life.money * share));
  const delta = win ? Math.round(stake * (0.5 + ctx.rng.next() * 2)) : -Math.round(stake * (0.5 + ctx.rng.next() * 0.4));
  ctx.life.money += delta;
  ctx.life.flags.lastAmount = Math.abs(delta);
};
const lastAmount = (ctx: Ctx) => formatMoney(Number(ctx.life.flags.lastAmount));

export const ADULT: GameEvent[] = [
  {
    id: "burnout",
    ages: [25, 62],
    max: 3,
    cooldown: 5,
    when: employed,
    weight: (l) => (doing(l, "work_hard") ? 3 : 0.8),
    text: "[아침에 눈을 뜨기가 너무 힘들다.|출근길 지하철에서 숨이 막혔다.|주말 내내 누워만 있었다.|월요일이 무섭다.] 번아웃이 온 것 같다.",
    choices: [
      {
        text: "휴직한다",
        outcome: o("몇 달 쉬면서 몸과 마음을 돌봤다.", {
          stats: { happiness: 6, health: 3 },
          run: (ctx) => {
            ctx.life.money -= Math.round((ctx.life.job?.salary ?? 0) * 0.4);
          },
        }),
      },
      { text: "참고 버틴다", outcome: o("꾸역꾸역 출근했다. [몸이 먼저 신호를 보냈다.|위염 진단을 받았다.|머리카락이 한 움큼씩 빠졌다.]", { stats: { health: -5, happiness: -4 } }) },
      { text: "사표를 던진다", outcome: o("[사표를 던졌다.|팀장님 책상에 사직서를 올려놓았다.] 속이 시원하다. 통장은 춥다.", { job: null, stats: { happiness: 5 } }) },
    ],
  },
  {
    id: "layoff",
    ages: [40, 60],
    weight: 0.6,
    when: (l) => ["big", "it", "finance", "sme", "startup"].includes(l.job?.id ?? ""),
    text: "[실적 악화로|경기가 나빠져|회사가 합병되면서] 구조조정이 시작됐다. 명단에 {me}의 이름이 있다.",
    choices: [
      {
        text: "희망퇴직을 받아들인다",
        outcome: o("위로금을 받고 회사를 나왔다. 허전하다.", {
          stats: { happiness: -6 },
          run: (ctx) => {
            ctx.life.money += Math.round((ctx.life.job?.salary ?? 0) * 1.5);
            ctx.life.job = null;
          },
        }),
      },
      {
        text: "어떻게든 버틴다",
        check: { stat: "social", dc: 50 },
        success: o("평소 쌓아 둔 신뢰 덕에 자리를 지켰다.", { stats: { happiness: -2 } }),
        fail: o("결국 회사를 떠나야 했다.", { job: null, stats: { happiness: -8 } }),
      },
    ],
  },
  {
    id: "shop_trouble",
    ages: [20, 75],
    max: 5,
    cooldown: 3,
    when: (l) => l.job?.id === "shop",
    text: "[가게 근처에 대형 프랜차이즈가 들어왔다.|월세가 크게 올랐다.|배달 앱 수수료가 올랐다.] 손님이 눈에 띄게 줄었다.",
    choices: [
      {
        text: "메뉴를 새로 개발한다",
        chance: (l) => (l.hidden.talent === "business" ? 0.7 : 0.4),
        success: o("새 메뉴가 입소문을 탔다! 줄 서는 가게가 됐다.", { money: [1000, 3000], fame: 2, stats: { happiness: 6 }, reveal: ["talent"] }),
        fail: o("반응이 시원찮다. 재료비만 날렸다.", { money: [-800, -300], stats: { happiness: -3 } }),
      },
      { text: "버티며 기다린다", outcome: o("단골손님들 덕분에 겨우 버텼다.", { money: [-500, 0] }) },
      { text: "가게를 정리한다", outcome: o("간판을 내렸다. 시원섭섭하다.", { job: null, money: 1000, stats: { happiness: -4 } }) },
    ],
  },
  {
    id: "artist_break",
    ages: [20, 80],
    max: 5,
    cooldown: 3,
    when: (l) => l.job?.id === "artist",
    text: "큰 공모전 마감이 다가온다.",
    choices: [
      {
        text: "모든 걸 쏟아붓는다",
        chance: (l) => (l.hidden.talent === "art" ? 0.45 : 0.15) + l.fame / 200,
        success: o("대상을 받았다! 이름이 조금씩 알려지기 시작했다.", { fame: [8, 15], money: 1000, stats: { happiness: 8 } }),
        fail: o("이번에도 떨어졌다. 그래도 붓을 놓을 순 없다.", { stats: { happiness: -4 } }),
      },
      { text: "생계를 위해 꿈을 접는다", outcome: o("작업실을 정리했다. 언젠가 다시 그릴 날이 올까.", { job: null, stats: { happiness: -6 } }) },
    ],
  },
  {
    id: "athlete_match",
    ages: [19, 40],
    max: 15,
    cooldown: 1,
    when: (l) => l.job?.id === "athlete",
    text: "중요한 결승전이다. 관중석이 꽉 찼다.",
    choices: [
      {
        text: "온 힘을 다한다",
        check: { stat: "fitness", dc: 70 },
        success: o("결승골의 주인공이 됐다! 뉴스에 이름이 나왔다.", { fame: [5, 10], money: 1500, stats: { happiness: 6 } }),
        fail: o("부상을 당해 교체됐다.", { stats: { health: -4, happiness: -3 } }),
      },
      {
        text: "은퇴를 선언한다",
        when: (l) => l.age >= 32,
        outcome: o("박수 속에 은퇴했다. 선수 생활에 후회는 없다.", { job: null, fame: 3, stats: { happiness: 2 } }),
      },
    ],
  },
  {
    id: "drinking",
    ages: [25, 60],
    max: 4,
    cooldown: 3,
    when: employed,
    text: "[삼겹살집|횟집|치킨집] 회식 자리. [부장님이|팀장님이|거래처 사장님이] 계속 술잔을 돌린다.",
    choices: [
      { text: "끝까지 달린다", outcome: o("[다음 날 기억이 없다.|노래방까지 3차를 갔다.|택시에서 잠들었다.] 동료들과는 가까워졌다.", { stats: { social: 2, health: -3 } }) },
      { text: "적당히 빠진다", outcome: o("[눈치껏 먼저 일어났다.|막차를 핑계로 빠져나왔다.|사이다로 버텼다.]", { stats: { social: -1, health: 1 } }) },
    ],
  },
  {
    id: "coin",
    ages: [22, 65],
    max: 4,
    cooldown: 4,
    when: (l) => l.money >= 500,
    cast: { friend: { role: "친구" } },
    text: "{friend}이(가) 무조건 오른다는 [코인|테마주|해외 주식|비상장 주식]을 추천한다. \"[이번엔 진짜야.|나만 믿어.|벌써 세 배 올랐어.]\"",
    choices: [
      {
        text: "재산 절반을 넣는다",
        check: { stat: "luck", dc: 60 },
        success: o((ctx) => `대박이 났다! ${lastAmount(ctx)}을(를) 벌었다.`, { run: invest(0.5, true), stats: { happiness: 8 }, reveal: ["luck"] }),
        fail: o((ctx) => `폭락했다. ${lastAmount(ctx)}이(가) 사라졌다.`, { run: invest(0.5, false), stats: { happiness: -8 }, reveal: ["luck"] }),
      },
      {
        text: "조금만 넣어 본다",
        check: { stat: "luck", dc: 50 },
        success: o((ctx) => `${lastAmount(ctx)}을(를) 벌었다. 소소한 행복이다.`, { run: invest(0.1, true), stats: { happiness: 2 } }),
        fail: o((ctx) => `${lastAmount(ctx)}을(를) 잃었다. 수업료라 치자.`, { run: invest(0.1, false), stats: { happiness: -2 } }),
      },
      { text: "거절한다", outcome: o("{friend}은(는) [조금 섭섭해했다.|\"나중에 후회하지 마.\"라며 웃었다.]", { affinity: { friend: -3 } }) },
    ],
  },
  {
    id: "lottery",
    ages: [20, 95],
    max: 3,
    cooldown: 5,
    weight: 0.3,
    text: "[편의점에서|출근길 복권방에서|꿈자리가 좋아서] 로또를 한 장 샀다. 오늘은 왠지 느낌이 좋다.",
    choices: [
      {
        text: "두근거리며 번호를 맞춰 본다",
        chance: (l) => 0.01 + l.hidden.luck / 2500,
        success: o("1등 당첨!!! 손이 덜덜 떨린다.", { money: 150000, stats: { happiness: 15 }, reveal: ["luck"], flags: { lotteryWin: true } }),
        fail: o("역시나 꽝이다.", { stats: { happiness: -1 } }),
      },
    ],
  },
  {
    id: "house",
    ages: [30, 65],
    max: 6,
    cooldown: 2,
    when: (l) => !l.flags.houseValue && (married(l) || l.age >= 35),
    text: "[회사 근처|아이 학교 앞|역세권] 아파트가 5억 원에 매물로 나왔다. [부동산 사장님이 오늘 안에 결정하라고 한다.|집값이 오를 거라는 뉴스가 나온다.]",
    choices: [
      {
        text: "대출을 끼고 산다",
        when: (l) => l.money >= 15000,
        outcome: o("드디어 내 집이 생겼다! 집들이를 했다.", { money: -15000, stats: { happiness: 8 }, flags: { houseValue: 50000, mortgageLeft: 25 } }),
      },
      {
        text: "영혼까지 끌어모아 산다",
        when: (l) => l.money >= 5000 && l.money < 15000,
        outcome: o("영끌로 집을 샀다. 대출 이자가 무섭다.", { money: -5000, stats: { happiness: 4 }, flags: { houseValue: 50000, mortgageLeft: 35 } }),
      },
      { text: "아직은 전세로 산다", outcome: o("아직은 때가 아니다. 다음 기회를 보기로 했다.", { stats: { happiness: -1 } }) },
    ],
  },
  {
    id: "baby",
    ages: [26, 44],
    max: 4,
    cooldown: 2,
    weight: 3,
    when: (l) => married(l) && peopleWith(l, "자녀").length < 4,
    cast: { spouse: { role: "배우자" } },
    text: "[주말 아침,|조카를 보고 온 날,|산책하다가] {spouse}와(과) 아이 이야기를 나눴다.",
    choices: [
      {
        text: "아이를 갖는다",
        chance: (l) => (l.age < 38 ? 0.8 : 0.45),
        success: o("{baby}이(가) 태어났다! 작은 손이 {me}의 손가락을 꼭 쥐었다.", {
          stats: { happiness: 10 },
          affinity: { spouse: 5 },
          run: (ctx) => {
            const surname = ctx.life.gender === "남" ? surnameOf(ctx.life.name) : surnameOf(ctx.cast.spouse.name);
            addFamily(ctx, "baby", "자녀", surname);
          },
        }),
        fail: o("아직 소식이 없다. 조금 더 기다려 보기로 했다.", { stats: { happiness: -2 } }),
      },
      { text: "지금은 둘이 좋다", outcome: o("지금은 둘만의 시간을 더 즐기기로 했다.", { affinity: { spouse: 2 } }) },
    ],
  },
  {
    id: "spouse_trouble",
    ages: [28, 90],
    max: 5,
    cooldown: 3,
    cast: { spouse: { role: "배우자" } },
    text: "{spouse}와(과) 사이가 예전 같지 않다. [대화가 줄었다.|각자 휴대폰만 본다.|사소한 일로 자꾸 부딪친다.]",
    choices: [
      { text: "둘이 여행을 간다", outcome: o("[강릉 바다|경주 한옥 마을|일본 온천]에 다녀왔다. 오랜만에 둘이 손을 잡고 걸었다.", { money: -300, affinity: { spouse: 10 }, stats: { happiness: 3 } }) },
      {
        text: "진지하게 대화한다",
        check: { stat: "social", dc: 50 },
        success: o("밤새 이야기를 나눴다. 서로를 다시 이해하게 됐다.", { affinity: { spouse: 8 } }),
        fail: o("대화가 싸움으로 번졌다.", { affinity: { spouse: -10 }, stats: { happiness: -3 } }),
      },
      {
        text: "이혼한다",
        when: (l) => (first(l, "배우자")?.affinity ?? 100) < 40,
        outcome: o("{spouse}와(과) 각자의 길을 가기로 했다.", {
          role: { spouse: null },
          stats: { happiness: -10 },
          run: (ctx) => {
            if (ctx.life.money > 0) ctx.life.money = Math.round(ctx.life.money / 2);
            ctx.life.flags.divorced = true;
            ctx.life.flags.spouseWorks = false;
          },
        }),
      },
    ],
  },
  {
    id: "child_school",
    ages: [30, 75],
    max: 3,
    cooldown: 3,
    cast: { kid: { role: "자녀", filter: (p, l) => ageOf(l, p) >= 8 && ageOf(l, p) <= 18 } },
    text: "{kid}의 [성적표|담임 선생님 상담|모의고사 결과]를 보니 걱정이 된다.",
    choices: [
      { text: "학원을 보낸다", outcome: o("학원비가 만만치 않다. {kid}은(는) 조금 지쳐 보인다.", { money: [-800, -500], affinity: { kid: -2 } }) },
      { text: "하고 싶은 걸 하게 둔다", outcome: o("{kid}은(는) 신이 나서 [춤 학원|드럼 학원|코딩 학원|야구부]에 들어갔다.", { affinity: { kid: 8 }, stats: { happiness: 2 } }) },
      {
        text: "직접 가르친다",
        check: { stat: "smarts", dc: 55 },
        success: o("{kid}의 성적이 쑥 올랐다. 둘이 하이파이브를 했다.", { affinity: { kid: 6 }, stats: { happiness: 3 } }),
        fail: o("가르치다 언성이 높아졌다.", { affinity: { kid: -5 } }),
      },
    ],
  },
  {
    id: "child_wedding",
    ages: [45, 95],
    max: 3,
    cooldown: 2,
    cast: { kid: { role: "자녀", filter: (p, l) => ageOf(l, p) >= 27 && l.flags[`wed_${p.id}`] !== true } },
    text: "{kid}이(가) [회사에서 만난|대학 동기인|소개팅으로 만난] 결혼할 사람을 데려왔다.",
    choices: [
      {
        text: "반갑게 맞이한다",
        outcome: o("{kid}의 결혼식에서 눈물을 훔쳤다.", {
          affinity: { kid: 8 },
          stats: { happiness: 5 },
          run: (ctx) => {
            ctx.life.money -= Math.min(3000, Math.max(0, Math.round(ctx.life.money * 0.1)));
            ctx.life.flags[`wed_${ctx.cast.kid.id}`] = true;
          },
        }),
      },
      { text: "반대한다", outcome: o("{kid}은(는) 결국 집을 나가 결혼했다.", { affinity: { kid: -20 }, stats: { happiness: -5 }, run: (ctx) => void (ctx.life.flags[`wed_${ctx.cast.kid.id}`] = true) }) },
    ],
  },
  {
    id: "midlife",
    ages: [42, 55],
    text: "문득 거울을 보니 낯선 중년이 서 있다.",
    choices: [
      { text: "새로운 취미를 시작한다", outcome: o("늦게 배운 [기타|골프|수영|클라이밍|베이킹]이(가) 이렇게 재밌을 줄이야.", { money: -300, stats: { happiness: 6 } }) },
      { text: "스포츠카를 산다", when: (l) => l.money >= 6000, outcome: o("빨간 스포츠카를 샀다. 가족들은 어이없어했다.", { money: -5000, stats: { happiness: 8, looks: 1 } }) },
      {
        text: "가족에게 집중한다",
        outcome: o("가족과 보내는 시간을 늘렸다. 이게 행복이구나 싶다.", {
          stats: { happiness: 4 },
          run: (ctx) => {
            for (const p of peopleWith(ctx.life, "배우자", "자녀")) p.affinity = Math.min(100, p.affinity + 5);
          },
        }),
      },
    ],
  },
  {
    id: "parent_ill",
    ages: [30, 75],
    max: 2,
    cooldown: 5,
    cast: { parent: { role: ["엄마", "아빠"], filter: (p, l) => ageOf(l, p) >= 62 } },
    text: "[회의 중에|새벽에|출근길에] {parent}이(가) 쓰러지셨다는 연락을 받았다.",
    choices: [
      { text: "직접 간병한다", outcome: o("몇 달을 병원에서 지냈다. {parent}이(가) 손을 꼭 잡아 주셨다.", { affinity: { parent: 15 }, stats: { happiness: -5, health: -2 }, money: -500 }) },
      { text: "요양 병원에 모신다", outcome: o("주말마다 찾아뵙기로 했다.", { money: -1500, affinity: { parent: -3 } }) },
      { text: "병원비만 보낸다", outcome: o("바빠서 찾아뵙지 못했다. 마음이 무겁다.", { money: -800, affinity: { parent: -6 }, stats: { happiness: -2 } }) },
    ],
  },
  {
    id: "friend_wedding",
    ages: [24, 45],
    max: 3,
    cooldown: 2,
    cast: { friend: { role: "친구" } },
    text: "{friend}이(가) [모바일|종이] 청첩장을 보냈다. \"[꼭 와 줘!|축가 부탁해도 돼?|사회 좀 봐 줄래?]\"",
    choices: [
      { text: "축의금을 넉넉히 한다", outcome: o("[축의금을 넉넉히 냈다.|축가까지 불러 줬다.] {friend}이(가) 두고두고 고마워했다.", { money: -50, affinity: { friend: 8 } }) },
      { text: "기본만 한다", outcome: o("[밥은 맛있었다.|뷔페 줄이 길었다.|오랜만에 동창들을 봤다.]", { money: -10 }) },
      { text: "바빠서 못 간다", outcome: o("{friend}에게서 서운하다는 문자가 왔다.", { affinity: { friend: -10 } }) },
    ],
  },
];
