// 청년기: 군대, 연애 갈등, 새 친구 (입시·취업·결혼은 edu.ts, career.ts, love.ts)

import type { Ctx, GameEvent } from "../../game/events";
import { o } from "./util";

export const YOUTH: GameEvent[] = [
  {
    id: "military",
    ages: [20, 28],
    milestone: true,
    when: (l) => l.gender === "남" && l.flags.militaryDone !== true,
    text: "[입영 통지서가 날아왔다.|병무청 문자가 왔다. 입대 날짜가 정해졌다.|친구들이 하나둘 군대에 간다. 이제 내 차례다.]",
    choices: [
      {
        text: "현역으로 입대한다",
        when: (l) => l.stats.health >= 35,
        outcome: o("머리를 짧게 자르고 훈련소에 들어갔다.", { stats: { fitness: 3, happiness: -5 }, reveal: ["grit"], run: enlist }),
      },
      {
        text: "해병대에 지원한다",
        when: (l) => l.stats.health >= 35,
        check: { stat: "fitness", dc: 60 },
        success: o("빨간 명찰을 달았다. 누구보다 강해진 기분이다.", { stats: { fitness: 6, happiness: -3 }, fame: 1, reveal: ["grit"], flags: { marine: true }, run: enlist }),
        fail: o("해병대에 떨어져 육군 현역으로 입대했다.", { stats: { fitness: 3, happiness: -6 }, run: enlist }),
      },
      {
        text: "사회복무요원으로 근무한다",
        when: (l) => l.stats.health < 35,
        outcome: o("건강 문제로 사회복무요원으로 근무하게 됐다.", { flags: { militaryDone: true } }),
      },
    ],
  },
  {
    id: "discharge",
    ages: [21, 31],
    milestone: true,
    when: (l) => l.flags.militaryUntil === l.age,
    text: "전역이다! [위병소를 나서는데 하늘이 유난히 파랗다.|후임들이 경례를 해 줬다.|전역모를 하늘로 던졌다.]",
    choices: [
      { text: "바로 다음을 준비한다", outcome: o("[곧바로 책을 폈다. 시간이 아깝다.|복학 신청서부터 냈다.|자격증 학원에 등록했다.]", { stats: { smarts: 2 } }) },
      { text: "일단 여행부터 간다", outcome: o("[친구들과 바다를 보러 갔다.|혼자 기차 여행을 떠났다.|제주도 게스트하우스에서 한 달을 살았다.] 이 자유가 얼마 만인지.", { stats: { happiness: 6 }, money: -200 }) },
    ],
  },
  {
    id: "lover_fight",
    ages: [14, 70],
    max: 6,
    cooldown: 2,
    weight: (l) => (l.age < 20 ? 3 : 1),
    cast: { lover: { role: "연인" } },
    text: "{lover}와(과) [연락 문제로|약속 시간 때문에|친구 문제로|돈 문제로|사소한 말 한마디로] 크게 다퉜다.",
    choices: [
      { text: "먼저 사과한다", outcome: o("[먼저 손을 내밀었다.|좋아하는 떡볶이를 사 들고 찾아갔다.|긴 문자를 보냈다.] 둘 사이가 더 단단해졌다.", { affinity: { lover: 8 }, stats: { happiness: 1 } }) },
      {
        text: "솔직하게 내 생각을 말한다",
        check: { stat: "social", dc: 55 },
        success: o("솔직하게 이야기한 덕에 서로를 더 잘 알게 됐다.", { affinity: { lover: 5 } }),
        fail: o("말이 날카롭게 나갔다. 며칠째 연락이 없다.", { affinity: { lover: -15 }, stats: { happiness: -3 } }),
      },
      { text: "헤어지자고 한다", outcome: o("{lover}와(과) 헤어졌다. [한동안 노래 가사가 다 내 얘기 같았다.|사진을 지우다 밤을 새웠다.|친구들과 술을 마시며 울었다.]", { role: { lover: null }, stats: { happiness: -6 } }) },
    ],
  },
  {
    id: "new_friend",
    ages: [19, 75],
    max: 6,
    cooldown: 3,
    cast: { pal: { new: "친구", age: [-5, 5] } },
    text: "[동호회|헬스장|독서 모임|동네 카페|등산 모임]에서 만난 {pal}와(과) 이야기가 잘 통했다.",
    choices: [
      { text: "연락처를 주고받는다", outcome: o("{pal}와(과) 종종 만나는 사이가 됐다.", { meet: ["pal"], affinity: { pal: 5 }, stats: { social: 1, happiness: 2 } }) },
      { text: "그냥 헤어진다", outcome: o("[즐거운 대화였다. 다시 만날 일은 없겠지만.|연락처를 물어볼 걸 그랬나.]") },
    ],
  },
];

function enlist(ctx: Ctx) {
  const f = ctx.life.flags;
  ctx.life.job = null;
  f.militaryDone = true;
  f.militaryUntil = ctx.life.age + 2;
  // 대학생이면 휴학하고 다녀온다
  if (Number(f.collegeUntil) > ctx.life.age) f.collegeUntil = Number(f.collegeUntil) + 2;
}
