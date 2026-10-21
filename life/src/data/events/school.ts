// 학창 시절(8~18살)과 수능

import type { Ctx, GameEvent } from "../../game/events";

/** 첫사랑을 기억해 두면 어른이 되어 동창회에서 다시 만날 수 있다 (love.ts의 reunion) */
const firstLove = (how: string) => (ctx: Ctx) => {
  ctx.life.flags.firstLove = ctx.cast.crush.name;
  ctx.life.flags.firstLoveHow = how;
};
import { single } from "../../game/life";
import { avgChance, o } from "./util";

export const SCHOOL: GameEvent[] = [
  {
    id: "school_start",
    ages: [7, 7],
    milestone: true,
    cast: { mate: { new: "친구", age: [0, 0] } },
    text: "[초등학교 입학식.|노란 가방을 메고 처음 학교에 간 날.] [옆자리에|짝꿍으로] {mate}이(가) 앉았다.",
    choices: [
      {
        text: "먼저 말을 건다",
        check: { stat: "social", dc: 40 },
        success: o("\"나랑 친구 할래?\" 금세 단짝이 되었다.", { meet: ["mate"], affinity: { mate: 15 }, stats: { social: 2, happiness: 2 } }),
        fail: o("어색하게 웃기만 했다. 그래도 얼굴은 익혔다.", { meet: ["mate"], affinity: { mate: -5 } }),
      },
      { text: "조용히 앉아 있는다", outcome: o("선생님 말씀에 귀를 기울였다. 학교생활이 기대된다.", { stats: { smarts: 1 } }) },
    ],
  },
  {
    id: "bully",
    ages: [9, 16],
    cast: { victim: { new: "친구", age: [0, 0] } },
    text: "같은 반 {victim}이(가) 몇몇 아이들에게 괴롭힘을 당하고 있다.",
    choices: [
      {
        text: "나서서 막는다",
        check: { stat: "fitness", dc: 55 },
        success: o("{victim}을(를) 지켜 냈다. 그날부터 {victim}은(는) {me}의 든든한 친구가 됐다.", {
          meet: ["victim"],
          affinity: { victim: 30 },
          stats: { social: 3, happiness: 3 },
        }),
        fail: o("같이 얻어맞았다. 하지만 {victim}은(는) 그 일을 평생 잊지 않을 것이다.", {
          meet: ["victim"],
          affinity: { victim: 25 },
          stats: { health: -4, happiness: -3 },
        }),
      },
      { text: "선생님께 알린다", outcome: o("선생님이 나서서 일이 정리됐다. {victim}이(가) 고맙다고 했다.", { meet: ["victim"], affinity: { victim: 15 }, stats: { social: 1 } }) },
      { text: "모른 척한다", outcome: o("못 본 척했다. 마음 한구석이 계속 불편했다.", { stats: { happiness: -3 } }) },
    ],
  },
  {
    id: "cheat",
    ages: [10, 18],
    max: 2,
    cooldown: 3,
    text: "시험 시간. 앞자리 친구의 답안지가 훤히 보인다.",
    choices: [
      {
        text: "슬쩍 베낀다",
        check: { stat: "luck", dc: 50 },
        success: o("들키지 않았다. 점수는 올랐지만 남은 건 없다.", { stats: { happiness: 1 }, flags: { cheated: true } }),
        fail: o("선생님께 딱 걸렸다. 부모님까지 학교에 불려 오셨다.", { stats: { happiness: -6, social: -3 }, flags: { cheated: true } }),
      },
      {
        text: "내 실력으로 푼다",
        check: { stat: "smarts", dc: 50 },
        success: o("스스로 푼 만큼 결과도 괜찮았다.", { stats: { happiness: 3, smarts: 1 } }),
        fail: o("점수는 아쉬웠지만 떳떳했다.", { stats: { happiness: -1, smarts: 1 } }),
      },
    ],
  },
  {
    id: "president",
    ages: [10, 17],
    max: 2,
    cooldown: 3,
    text: "반장 선거가 열린다.",
    choices: [
      {
        text: "출마한다",
        check: { stat: "social", dc: 55 },
        success: o("반장이 되었다! 반 친구들 앞에서 떨리는 목소리로 첫 연설을 했다.", { stats: { social: 3, happiness: 3 }, fame: 2, flags: { president: true } }),
        fail: o("몇 표 차이로 떨어졌다. 그래도 용기 낸 게 어디야.", { stats: { social: 1, happiness: -3 } }),
      },
      { text: "친한 친구를 밀어 준다", outcome: o("선거 운동을 도왔다. 친구들과 더 가까워졌다.", { stats: { social: 2 } }) },
      { text: "관심 없다", outcome: o("조용히 지켜봤다.") },
    ],
  },
  {
    id: "crush",
    ages: [13, 18],
    when: single,
    cast: { crush: { new: "연인", gender: "opposite", age: [0, 0] } },
    text: "같은 반 {crush}이(가) 자꾸 눈에 들어온다.",
    choices: [
      {
        text: "용기 내서 고백한다",
        chance: (l) => avgChance(l.stats.looks, l.stats.social, 55),
        success: o("{crush}이(가) 수줍게 고개를 끄덕였다. 첫 연애가 시작됐다.", { meet: ["crush"], affinity: { crush: 20 }, stats: { happiness: 8 }, run: firstLove("첫 연애를 했던") }),
        fail: o("\"미안, 그냥 친구로 지내자.\" 그날 밤 이불을 걷어찼다.", { stats: { happiness: -6 }, run: firstLove("고백했다가 차였던") }),
      },
      {
        text: "사물함에 편지를 몰래 넣는다",
        chance: () => 0.35,
        success: o("편지를 읽은 {crush}이(가) 먼저 말을 걸어왔다!", { meet: ["crush"], affinity: { crush: 15 }, stats: { happiness: 6 } }),
        fail: o("답장은 끝내 오지 않았다.", { stats: { happiness: -2 } }),
      },
      { text: "마음을 접는다", outcome: o("공부에 집중하기로 했다. 가끔 창밖을 보며 한숨을 쉰다.", { stats: { smarts: 1 }, run: firstLove("혼자 좋아했던") }) },
    ],
  },
  {
    id: "game_night",
    ages: [11, 18],
    max: 2,
    cooldown: 2,
    text: "새로 나온 게임에 푹 빠졌다. 벌써 새벽 2시다.",
    choices: [
      { text: "한 판만 더!", outcome: o("결국 해가 뜰 때까지 했다. 수업 시간 내내 졸았다.", { stats: { happiness: 3, health: -2, smarts: -2 } }) },
      { text: "끄고 잔다", outcome: o("아쉽지만 컴퓨터를 껐다. 다음 날 개운했다.", { stats: { health: 1, smarts: 1 } }) },
      {
        text: "게임 대회에 나가 본다",
        check: { stat: "smarts", dc: 60 },
        success: o("지역 대회에서 입상했다! 상금도 받았다.", { stats: { happiness: 5 }, fame: 4, money: 50 }),
        fail: o("예선에서 탈락했다. 세상엔 고수가 많다.", { stats: { happiness: -2 } }),
      },
    ],
  },
  {
    id: "puberty",
    ages: [13, 15],
    cast: { parent: { role: ["엄마", "아빠"] } },
    text: "요즘 따라 {parent}의 잔소리가 견딜 수 없이 싫다.",
    choices: [
      { text: "방문을 쾅 닫는다", outcome: o("방문을 쾅 닫았다. 그날 저녁 식탁은 조용했다.", { affinity: { parent: -8 }, stats: { happiness: 1 } }) },
      {
        text: "솔직하게 대화해 본다",
        check: { stat: "social", dc: 50 },
        success: o("생각보다 {parent}은(는) {me}의 마음을 잘 알아주었다.", { affinity: { parent: 8 }, stats: { social: 2 } }),
        fail: o("말이 자꾸 엇나갔다. 그래도 노력은 했다.", { affinity: { parent: -2 } }),
      },
      { text: "일기장에 털어놓는다", outcome: o("일기장에 마음을 쏟아냈다. 조금 후련해졌다.", { stats: { happiness: 2, smarts: 1 } }) },
    ],
  },
  {
    id: "sports_day",
    ages: [8, 17],
    max: 3,
    cooldown: 2,
    text: "체육대회 날, 반 대표 계주 선수로 뽑혔다.",
    choices: [
      {
        text: "전력 질주한다",
        check: { stat: "fitness", dc: 55 },
        success: o("마지막 주자를 제치고 1등으로 들어왔다! 반 전체가 환호했다.", { stats: { happiness: 5, social: 2 }, fame: 1 }),
        fail: o("바통을 떨어뜨리고 말았다...", { stats: { happiness: -3 } }),
      },
      { text: "다른 친구에게 양보한다", outcome: o("응원석에서 목이 터져라 응원했다.", { stats: { social: 1 } }) },
    ],
  },
  {
    id: "contest",
    ages: [9, 18],
    max: 2,
    cooldown: 3,
    text: "교내 그림 그리기·글짓기 대회가 열린다.",
    choices: [
      {
        text: "그림을 그린다",
        chance: (l) => (l.hidden.talent === "art" ? 0.75 : 0.3),
        success: o("최우수상을 받았다! 작품이 복도에 걸렸다.", { stats: { happiness: 5 }, fame: 3, reveal: ["talent"] }),
        fail: o("상은 못 받았지만 그리는 동안 즐거웠다.", { stats: { happiness: 1 } }),
      },
      {
        text: "글을 쓴다",
        check: { stat: "smarts", dc: 60 },
        success: o("글짓기 대상을 받았다. 교장 선생님이 조회 시간에 읽어 주셨다.", { stats: { happiness: 5, smarts: 1 }, fame: 3 }),
        fail: o("원고지 다섯 장을 겨우 채웠다.", { stats: { smarts: 1 } }),
      },
      { text: "나가지 않는다", outcome: o("대회 날 운동장에서 축구를 했다.", { stats: { fitness: 1 } }) },
    ],
  },
  {
    id: "cram",
    ages: [12, 18],
    max: 3,
    cooldown: 2,
    cast: { parent: { role: ["엄마", "아빠"] } },
    text: "{parent}이(가) 유명한 학원에 다녀 보라고 하신다.",
    choices: [
      {
        text: "다닌다",
        when: (l) => l.wealth !== "poor",
        outcome: o("밤 10시까지 학원에 있었다. 실력은 늘었지만 지쳤다.", { stats: { smarts: [3, 5], happiness: -3, health: -1 } }),
      },
      {
        text: "혼자 해 보겠다고 한다",
        check: { stat: "grit", dc: 55 },
        success: o("스스로 계획을 세워 공부했다. 끈기가 대단하다는 소리를 들었다.", { stats: { smarts: 3 }, reveal: ["grit"] }),
        fail: o("결심은 사흘을 못 갔다.", { stats: { happiness: 1 }, reveal: ["grit"] }),
      },
      { text: "그냥 쉬고 싶다고 한다", outcome: o("{parent}이(가) 한숨을 쉬셨다. 그래도 쉬는 건 좋았다.", { stats: { happiness: 3 }, affinity: { parent: -3 } }) },
    ],
  },
  {
    id: "transfer",
    ages: [10, 18],
    cast: { friend: { role: "친구" } },
    text: "친한 친구 {friend}이(가) 먼 곳으로 전학을 간다고 한다.",
    choices: [
      { text: "꼭 연락하자고 약속한다", outcome: o("자주 연락하자며 새끼손가락을 걸었다.", { affinity: { friend: 10 }, stats: { happiness: -2 } }) },
      { text: "담담하게 보낸다", outcome: o("\"잘 가\"라는 말밖에 못 했다. 그렇게 조금씩 멀어졌다.", { affinity: { friend: -15 } }) },
    ],
  },
  {
    id: "club",
    ages: [14, 18],
    cast: { pal: { new: "친구", age: [-1, 1] } },
    text: "동아리 홍보 기간이다. 어디에 들어갈까?",
    choices: [
      { text: "밴드부", outcome: o("기타를 처음 잡았다. 같은 파트 {pal}와(과) 친해졌다.", { meet: ["pal"], affinity: { pal: 10 }, stats: { happiness: 3, looks: 1 } }) },
      { text: "축구부", outcome: o("땀 흘리며 공을 찼다. {pal}와(과) 환상의 콤비가 됐다.", { meet: ["pal"], affinity: { pal: 10 }, stats: { fitness: 3 } }) },
      { text: "독서 토론부", outcome: o("책을 읽고 토론했다. {pal}의 날카로운 질문에 자극을 받았다.", { meet: ["pal"], affinity: { pal: 10 }, stats: { smarts: 3 } }) },
      { text: "귀가부", outcome: o("수업이 끝나면 곧장 집에 갔다.", { stats: { happiness: 2 } }) },
    ],
  },
];

