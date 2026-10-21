// 노년기와 나이를 가리지 않는 사건

import type { GameEvent } from "../../game/events";
import { ageOf, retired } from "../../game/life";
import { addFamily, o, surnameOf } from "./util";

export const SENIOR: GameEvent[] = [
  {
    id: "retirement",
    ages: [60, 69],
    milestone: true,
    when: (l) => l.job !== null && !retired(l),
    max: 3,
    cooldown: 3,
    text: (ctx) => `어느덧 ${ctx.life.age}살. 회사에서 은퇴 이야기가 나온다.`,
    choices: [
      {
        text: "은퇴한다",
        outcome: o((ctx) => `${ctx.life.flags.workYears ?? 0}년의 일을 마쳤다. 송별회에서 꽃다발을 받았다.`, {
          job: null,
          flags: { retired: true },
          stats: { happiness: 5 },
        }),
      },
      { text: "몇 년 더 일한다", outcome: o("아직은 일하는 게 좋다.", { stats: { happiness: 1 } }) },
    ],
  },
  {
    id: "grandchild",
    ages: [48, 100],
    max: 4,
    cooldown: 2,
    weight: 2,
    cast: { kid: { role: "자녀", filter: (p, l) => ageOf(l, p) >= 27 && l.flags[`wed_${p.id}`] === true } },
    text: "{kid}에게서 아기가 태어났다는 연락이 왔다!",
    choices: [
      {
        text: "당장 달려간다",
        outcome: o("손주 {grand}을(를) 처음 안아 봤다. 세상에서 제일 작고 따뜻했다.", {
          stats: { happiness: 8 },
          affinity: { kid: 5 },
          run: (ctx) => void addFamily(ctx, "grand", "손주", ctx.cast.kid.gender === "남" ? surnameOf(ctx.cast.kid.name) : "한"),
        }),
      },
      {
        text: "용돈 봉투를 보낸다",
        outcome: o("손주 {grand}의 사진을 휴대폰 배경 화면으로 바꿨다.", {
          money: -300,
          stats: { happiness: 5 },
          run: (ctx) => void addFamily(ctx, "grand", "손주", ctx.cast.kid.gender === "남" ? surnameOf(ctx.cast.kid.name) : "한"),
        }),
      },
    ],
  },
  {
    id: "old_friend",
    ages: [45, 100],
    max: 4,
    cooldown: 5,
    cast: { friend: { role: "친구" } },
    text: "[오랜만에|10년 만에|새해 첫날] {friend}에게서 [연락이 왔다.|전화가 왔다. \"나 기억나?\"|단톡방에 초대됐다.]",
    choices: [
      { text: "당장 만난다", outcome: o("{friend}와(과) [옛날이야기로 밤을 새웠다.|단골 국밥집에서 소주를 기울였다.|등산을 같이 갔다.]", { affinity: { friend: 10 }, stats: { happiness: 5 } }) },
      { text: "다음에 보자고 한다", outcome: o("다음은 오지 않았다.", { affinity: { friend: -5 } }) },
    ],
  },
  {
    id: "checkup",
    ages: [40, 100],
    max: 6,
    cooldown: 4,
    weight: (l) => (l.age >= 60 ? 2 : 1),
    text: "건강검진 결과지에 빨간 글씨가 있다. [혈압|간 수치|혈당|콜레스테롤]이 높다고 한다.",
    choices: [
      { text: "정밀 검사를 받고 치료한다", outcome: o("일찍 발견해서 다행이었다.", { money: [-800, -300], stats: { health: 5 } }) },
      {
        text: "대수롭지 않게 넘긴다",
        chance: (l) => l.stats.health / 100,
        success: o("별일 아니었다.", {}),
        fail: o("그때 검사를 받았어야 했다. 몸이 눈에 띄게 약해졌다.", { stats: { health: -10, happiness: -3 } }),
      },
    ],
  },
  {
    id: "scam",
    ages: [60, 100],
    max: 2,
    cooldown: 5,
    text: "\"가족이 사고를 당했다\"는 다급한 전화가 왔다. 당장 돈을 보내라고 한다.",
    choices: [
      {
        text: "의심하고 가족에게 직접 전화한다",
        check: { stat: "smarts", dc: 40 },
        success: o("보이스피싱이었다. 침착하게 신고했다.", { stats: { happiness: 1 } }),
        fail: o("당황한 나머지 돈을 보내고 말았다.", { money: [-2000, -500], stats: { happiness: -8 } }),
      },
      { text: "바로 송금한다", outcome: o("보이스피싱이었다. 분해서 잠이 오지 않는다.", { money: -1000, stats: { happiness: -8 } }) },
    ],
  },
  {
    id: "senior_class",
    ages: [62, 100],
    max: 2,
    cooldown: 5,
    text: "동네 [문화센터|복지관|주민센터]에서 새 강좌를 연다고 한다.",
    choices: [
      { text: "노래 교실에 등록한다", outcome: o("새 친구들과 트로트를 부르며 웃었다.", { stats: { happiness: 4, social: 3 } }) },
      {
        text: "유튜브를 시작해 본다",
        chance: (l) => (l.hidden.talent === "art" ? 0.5 : 0.2),
        success: o("\"할매·할배 유튜버\"로 구독자가 확 늘었다!", { fame: [5, 15], stats: { happiness: 6 } }),
        fail: o("조회수는 가족들뿐이었다. 그래도 재밌다.", { stats: { happiness: 2 } }),
      },
      { text: "집에서 쉰다", outcome: o("늘 보던 드라마를 봤다.") },
    ],
  },
  {
    id: "fall",
    ages: [70, 120],
    max: 4,
    cooldown: 3,
    text: "계단을 내려가다 발을 헛디뎠다!",
    choices: [
      {
        text: "난간을 붙잡는다",
        check: { stat: "fitness", dc: 35 },
        success: o("다행히 크게 다치진 않았다.", { stats: { health: -2 } }),
        fail: o("엉덩이뼈에 금이 갔다. 한동안 병원 신세를 졌다.", { stats: { health: -12, happiness: -4 }, money: -300 }),
      },
      {
        text: "몸을 웅크린다",
        check: { stat: "luck", dc: 40 },
        success: o("멍만 들었다.", { stats: { health: -1 } }),
        fail: o("손목이 부러졌다.", { stats: { health: -8, happiness: -3 }, money: -200 }),
      },
    ],
  },
  {
    id: "memories",
    ages: [70, 120],
    max: 8,
    cooldown: 3,
    text: "오래된 사진첩을 꺼냈다. 지나온 시간이 한 장 한 장 넘어간다.",
    choices: [
      { text: "추억에 잠긴다", outcome: o("참 많은 일이 있었다. 미소가 지어진다.", { stats: { happiness: 3 } }) },
      { text: "자서전을 써 본다", outcome: o("지나온 인생을 글로 남기기 시작했다.", { stats: { smarts: 1, happiness: 2 }, fame: [0, 2] }) },
    ],
  },
  {
    id: "accident",
    ages: [16, 85],
    max: 2,
    cooldown: 10,
    weight: 0.25,
    text: "횡단보도를 건너는데 차 한 대가 무섭게 달려온다!",
    choices: [
      {
        text: "몸을 날려 피한다",
        check: { stat: "fitness", dc: 50 },
        success: o("아슬아슬하게 피했다. 심장이 쿵쾅거린다.", { stats: { happiness: -1 } }),
        fail: o("크게 다쳐 몇 달을 병원에 누워 있었다.", { stats: { health: -20, happiness: -6 }, money: -500 }),
      },
      {
        text: "그 자리에 얼어붙는다",
        check: { stat: "luck", dc: 50 },
        success: o("차가 코앞에서 멈췄다.", { stats: { happiness: -2 }, reveal: ["luck"] }),
        fail: o("차에 부딪혔다. 긴 재활이 시작됐다.", { stats: { health: -25, happiness: -8 }, money: -800 }),
      },
    ],
  },
  {
    id: "volunteer",
    ages: [20, 90],
    max: 4,
    cooldown: 4,
    text: "주말에 연탄 봉사를 하자는 제안을 받았다.",
    choices: [
      { text: "참여한다", outcome: o("까만 얼굴로 웃었다. 이상하게 기분이 좋다.", { stats: { social: 2, happiness: 3, health: -1 }, fame: 1 }) },
      { text: "기부만 한다", outcome: o("작은 금액이지만 마음은 전했다.", { money: -100, stats: { happiness: 1 } }) },
      { text: "거절한다", outcome: o("주말엔 쉬고 싶다.") },
    ],
  },
];
