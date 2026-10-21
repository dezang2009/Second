// 유년기(0~7살)

import type { GameEvent } from "../../game/events";
import { addStat } from "../../game/life";
import { TALENT_LABEL, WEALTH_LABEL, type Stat, type Talent } from "../../game/types";
import { o } from "./util";

const lesson = (text: string, talent: Talent, stat: Stat) => ({
  text,
  outcome: o(
    (ctx) =>
      ctx.life.hidden.talent === talent
        ? `선생님이 "${TALENT_LABEL[talent]}에 소질이 있네요!" 하며 놀라셨다.`
        : "열심히 다녔다. 아주 잘하진 않았지만 즐거웠다.",
    {
      stats: { [stat]: [1, 3], happiness: 1 },
      run: (ctx) => {
        if (ctx.life.hidden.talent === talent) {
          addStat(ctx.life, stat, 3);
          ctx.life.revealed.talent = true;
        }
      },
    },
  ),
});

export const CHILDHOOD: GameEvent[] = [
  {
    id: "birth",
    ages: [0, 0],
    milestone: true,
    cast: { mom: { role: "엄마" }, dad: { role: "아빠" } },
    text: (ctx) => `{fullname}이(가) ${WEALTH_LABEL[ctx.life.wealth]}에서 태어났다. 엄마 아빠가 번갈아 안아 준다.`,
    choices: [
      { text: "우렁차게 운다", outcome: o("병원이 떠나가라 울었다. 아주 건강한 아이라며 모두 웃었다.", { stats: { health: 3 } }) },
      { text: "방긋 웃는다", outcome: o("방긋 웃는 얼굴에 가족 모두가 녹아내렸다.", { stats: { social: 2, happiness: 2 }, affinity: { mom: 3, dad: 3 } }) },
      { text: "새근새근 잔다", outcome: o("태어나자마자 곤히 잠들었다. 순한 아이가 될 것 같다.", { stats: { happiness: 3 } }) },
    ],
  },
  {
    id: "first_word",
    ages: [1, 2],
    cast: { mom: { role: "엄마" }, dad: { role: "아빠" } },
    weight: 3,
    text: "{me}이(가) 처음으로 말을 하려고 입을 오물거린다.",
    choices: [
      { text: "\"엄마\"", outcome: o("첫마디는 \"엄마\"였다. 엄마는 그날 하루 종일 웃었다.", { affinity: { mom: 8 } }) },
      { text: "\"아빠\"", outcome: o("첫마디는 \"아빠\"였다. 아빠는 동영상을 백 번쯤 돌려 봤다.", { affinity: { dad: 8 } }) },
      { text: "\"맘마\"", outcome: o("첫마디는 \"맘마\"였다. 말보다 밥이 먼저였다.", { stats: { happiness: 3, health: 1 } }) },
    ],
  },
  {
    id: "toy_fight",
    ages: [3, 6],
    cast: { kid: { new: "친구", age: [0, 0] } },
    text: "어린이집에서 {kid}이(가) {me}의 장난감을 가져가려 한다.",
    choices: [
      { text: "양보한다", outcome: o("장난감을 내밀자 {kid}이(가) 활짝 웃었다. 둘은 친구가 되었다.", { meet: ["kid"], affinity: { kid: 15 }, stats: { social: 3 } }) },
      {
        text: "끝까지 지킨다",
        check: { stat: "fitness", dc: 50 },
        success: o("장난감을 지켜 냈다. 대신 {kid}이(가) 울어 버렸다.", { stats: { happiness: 2, social: -1 } }),
        fail: o("결국 장난감을 뺏기고 엉엉 울었다.", { stats: { happiness: -3 } }),
      },
      { text: "선생님께 이른다", outcome: o("선생님이 둘을 화해시켜 주셨다.", { meet: ["kid"], stats: { social: 1 } }) },
    ],
  },
  {
    id: "bedtime",
    ages: [2, 6],
    max: 2,
    cooldown: 2,
    cast: { mom: { role: "엄마" } },
    text: "잠들기 전, 엄마가 동화책을 들고 왔다.",
    choices: [
      { text: "책을 읽어 달라고 한다", outcome: o("이야기를 듣다 스르르 잠들었다. 꿈속에서도 모험을 했다.", { stats: { smarts: 3 }, affinity: { mom: 3 } }) },
      { text: "만화를 보고 싶다고 떼쓴다", outcome: o("결국 만화를 한 편 더 봤다. 신났다.", { stats: { happiness: 3 }, affinity: { mom: -2 } }) },
      { text: "엄마 어릴 적 이야기를 해 달라고 한다", outcome: o("엄마의 어린 시절 이야기에 깔깔 웃었다.", { stats: { social: 1 }, affinity: { mom: 6 } }) },
    ],
  },
  {
    id: "fever",
    ages: [0, 7],
    max: 2,
    cooldown: 3,
    weight: 0.8,
    text: "{me}이(가) 밤새 열이 펄펄 끓는다.",
    choices: [
      { text: "응급실에 간다", outcome: o("응급실에서 해열 주사를 맞고 금방 나았다.", { stats: { health: 2 } }) },
      {
        text: "집에서 지켜본다",
        chance: (l) => l.stats.health / 100,
        success: o("다음 날 아침, 거짓말처럼 열이 내렸다.", { stats: { health: 1 } }),
        fail: o("며칠을 앓아누웠다. 한동안 기운이 없었다.", { stats: { health: -6, happiness: -2 } }),
      },
    ],
  },
  {
    id: "lessons",
    ages: [5, 7],
    weight: 3,
    text: "부모님이 학원을 하나 보내 주신다고 한다.",
    choices: [
      lesson("피아노", "art", "happiness"),
      lesson("태권도", "sports", "fitness"),
      lesson("수학 학원", "study", "smarts"),
      lesson("어린이 경제 교실", "business", "social"),
      { text: "싫어, 놀래!", outcome: o("하루 종일 놀이터에서 놀았다. 최고의 하루였다.", { stats: { happiness: 4 } }) },
    ],
  },
  {
    id: "sibling_fight",
    ages: [4, 14],
    max: 2,
    cooldown: 3,
    cast: { sib: { role: "형제" } },
    text: "{sib}이(가) {me}의 간식을 몰래 먹어 버렸다!",
    choices: [
      { text: "불같이 화낸다", outcome: o("한바탕 싸우고 둘 다 엄마한테 혼났다.", { affinity: { sib: -6 }, stats: { happiness: 1 } }) },
      { text: "이번만 봐준다", outcome: o("다음 날, {sib}이(가) 자기 간식을 반으로 나눠 줬다.", { affinity: { sib: 8 }, stats: { social: 1 } }) },
    ],
  },
  {
    id: "stray_cat",
    ages: [6, 15],
    text: "학교 가는 길에 떨고 있는 새끼 고양이를 발견했다.",
    choices: [
      {
        text: "집에 데려가 키우자고 조른다",
        chance: (l) => (l.wealth === "poor" ? 0.35 : 0.6),
        success: o("부모님을 겨우 설득했다. 고양이는 금세 가족이 되었다.", { stats: { happiness: 6 }, flags: { pet: true } }),
        fail: o("부모님이 안 된다고 하셨다. 대신 동물보호센터에 맡겼다.", { stats: { happiness: -3 } }),
      },
      { text: "우유만 주고 간다", outcome: o("고양이가 우유를 할짝할짝 먹었다. 마음이 따뜻해졌다.", { stats: { happiness: 2 } }) },
      { text: "그냥 지나간다", outcome: o("하루 종일 그 고양이가 생각났다.", { stats: { happiness: -1 } }) },
    ],
  },
];
