// 청년기: 대학, 군대, 취업, 연애

import type { Ctx, GameEvent } from "../../game/events";
import { canWork, employed, inCollege, single } from "../../game/life";
import type { Education } from "../../game/types";
import { hire } from "../jobs";
import { avgChance, doing, o } from "./util";

const degree = (l: { education: Education }) => l.education === "대졸" || l.education === "명문대졸";

export const YOUTH: GameEvent[] = [
  {
    id: "college_life",
    ages: [19, 30],
    max: 3,
    when: inCollege,
    cast: { pal: { new: "친구", age: [-1, 1] } },
    text: "새 학기가 시작됐다. 이번 학기엔 무엇에 힘을 쏟을까?",
    choices: [
      { text: "학점 관리", outcome: o("도서관에서 살다시피 했다. 장학금을 받았다!", { stats: { smarts: 3, happiness: -1 }, money: 200 }) },
      { text: "동아리 활동", outcome: o("동아리 방에서 {pal}와(과) 밤새 수다를 떨었다.", { meet: ["pal"], affinity: { pal: 12 }, stats: { social: 3, happiness: 3 } }) },
      {
        text: "휴학하고 여행 간다",
        outcome: o("배낭 하나 메고 떠났다. 세상은 넓었다.", {
          stats: { happiness: 6 },
          money: -300,
          run: (ctx) => {
            ctx.life.flags.collegeUntil = Number(ctx.life.flags.collegeUntil) + 1;
          },
        }),
      },
    ],
  },
  {
    id: "graduation",
    ages: [20, 35],
    milestone: true,
    when: (l) => l.flags.collegeUntil === l.age && l.flags.graduated !== true,
    cast: { parent: { role: ["엄마", "아빠"] } },
    text: "졸업식 날이다. 학사모가 어색하다.",
    choices: [
      {
        text: "학사모를 하늘 높이 던진다",
        outcome: o("{parent}이(가) 꽃다발을 안겨 주며 눈시울을 붉혔다.", {
          stats: { happiness: 5 },
          affinity: { parent: 5 },
          flags: { graduated: true },
          run: (ctx) => {
            ctx.life.education = ctx.life.flags.collegeKind as Education;
          },
        }),
      },
      {
        text: "대학원에 진학한다",
        when: (l) => l.flags.collegeKind !== "전문대졸" && l.stats.smarts >= 60,
        outcome: o("공부를 조금 더 하기로 했다. 2년 뒤를 기약한다.", {
          stats: { smarts: 4 },
          run: (ctx) => {
            ctx.life.flags.collegeUntil = ctx.life.age + 2;
          },
        }),
      },
    ],
  },
  {
    id: "military",
    ages: [20, 28],
    milestone: true,
    when: (l) => l.gender === "남" && l.flags.militaryDone !== true,
    text: "입영 통지서가 날아왔다.",
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
    text: "전역이다! 위병소를 나서는데 하늘이 유난히 파랗다.",
    choices: [
      { text: "바로 다음을 준비한다", outcome: o("곧바로 책을 폈다. 시간이 아깝다.", { stats: { smarts: 2 } }) },
      { text: "일단 여행부터 간다", outcome: o("친구들과 바다를 보러 갔다. 이 자유가 얼마 만인지.", { stats: { happiness: 6 }, money: -200 }) },
    ],
  },
  {
    id: "job_hunt",
    ages: [19, 55],
    milestone: true,
    max: 40,
    when: (l) => canWork(l) && !employed(l) && l.flags.suneungDone !== false && l.flags.collegeDecided !== undefined,
    text: (ctx) => (ctx.life.job ? "아르바이트만으로는 불안하다. 제대로 된 일자리를 찾아볼까?" : "일자리를 구해야 한다. 어디에 지원할까?"),
    choices: [
      {
        text: "대기업 공채에 지원한다",
        when: degree,
        chance: (l) => avgChance(l.stats.smarts, l.stats.social, l.education === "명문대졸" ? 52 : 65),
        success: o("대기업 합격! 부모님께 제일 먼저 전화를 드렸다.", { job: hire("big"), stats: { happiness: 6 } }),
        fail: o("서류에서 떨어졌다. 다음 기회를 노리자.", { stats: { happiness: -4 } }),
      },
      {
        text: "전문직 시험을 준비한다",
        when: (l) => degree(l) && l.stats.smarts >= 65,
        check: { stat: "smarts", dc: 80 },
        success: o("몇 년을 매달린 끝에 전문직 자격을 땄다!", { job: hire("pro"), stats: { happiness: 10 }, fame: 3, flags: { wasPro: true } }),
        fail: o("올해도 낙방이다. 책상 앞에서 한숨만 나온다.", { stats: { happiness: -5 }, money: -300 }),
      },
      {
        text: "공무원 시험을 본다",
        check: { stat: "grit", dc: 60 },
        success: o("고시원 생활 끝에 공무원 시험에 합격했다.", { job: hire("civil"), stats: { happiness: 6 }, reveal: ["grit"] }),
        fail: o("아깝게 떨어졌다. 컵밥이 유난히 짰다.", { stats: { happiness: -4 }, money: -200, reveal: ["grit"] }),
      },
      {
        text: "작은 회사에 들어간다",
        chance: () => 0.85,
        success: o("작은 회사에 입사했다. 사람들이 따뜻하다.", { job: hire("sme"), stats: { happiness: 3 } }),
        fail: o("면접을 봤지만 연락이 오지 않았다.", { stats: { happiness: -2 } }),
      },
      {
        text: "모은 돈으로 가게를 차린다",
        when: (l) => l.money >= 2000,
        outcome: o("작은 가게를 열었다. 이제 사장님이다.", { job: hire("shop"), money: -2000, stats: { happiness: 4 } }),
      },
      {
        text: "예술가의 길을 걷는다",
        when: (l) => (l.revealed.talent && l.hidden.talent === "art") || (l.practiced.hobby ?? 0) + (l.practiced.arts ?? 0) >= 3,
        outcome: o("가난해도 좋다. 하고 싶은 걸 하며 살기로 했다.", { job: hire("artist"), stats: { happiness: 6 } }),
      },
      {
        text: "프로 선수 입단 테스트를 본다",
        when: (l) => l.age <= 26 && l.stats.fitness >= 65,
        check: { stat: "fitness", dc: 75 },
        success: o("입단 테스트 통과! 프로 선수가 되었다.", { job: hire("athlete"), stats: { happiness: 8 }, fame: 5 }),
        fail: o("마지막 테스트에서 떨어졌다. 꿈이 멀어진다.", { stats: { happiness: -5 } }),
      },
      {
        text: "아르바이트로 버틴다",
        when: (l) => !l.job,
        outcome: o("당장은 아르바이트로 생활비를 벌기로 했다.", { job: hire("parttime") }),
      },
      { text: "올해는 쉰다", outcome: o("조금 쉬어 가기로 했다. 통장이 걱정이다.", { stats: { happiness: 2 } }) },
    ],
  },
  {
    id: "blind_date",
    ages: [20, 50],
    max: 12,
    cooldown: 1,
    when: single,
    weight: (l) => (doing(l, "dating") ? 5 : 1.2),
    cast: { date: { new: "연인", gender: "opposite", age: [-3, 3] } },
    text: "친구 소개로 {date}을(를) 만났다.",
    choices: [
      {
        text: "적극적으로 다가간다",
        chance: (l) => avgChance(l.stats.looks, l.stats.social, 50),
        success: o("몇 번의 만남 끝에 {date}와(과) 사귀게 됐다.", { meet: ["date"], affinity: { date: 15 }, stats: { happiness: 6 } }),
        fail: o("연락이 점점 뜸해지더니 끊겼다.", { stats: { happiness: -3 } }),
      },
      {
        text: "천천히 알아간다",
        chance: () => 0.4,
        success: o("{date}와(과) 천천히 가까워졌다. 어느새 연인이 됐다.", { meet: ["date"], affinity: { date: 10 }, stats: { happiness: 5 } }),
        fail: o("좋은 사람이었지만 인연은 아니었다.", { stats: { happiness: -1 } }),
      },
      { text: "지금은 연애할 때가 아니다", outcome: o("정중하게 거절했다. 지금은 나에게 집중할 때다.", { stats: { smarts: 1 } }) },
    ],
  },
  {
    id: "lover_fight",
    ages: [14, 70],
    max: 6,
    cooldown: 2,
    weight: (l) => (l.age < 20 ? 3 : 1),
    cast: { lover: { role: "연인" } },
    text: "{lover}와(과) 사소한 일로 크게 다퉜다.",
    choices: [
      { text: "먼저 사과한다", outcome: o("먼저 손을 내밀었다. 둘 사이가 더 단단해졌다.", { affinity: { lover: 8 }, stats: { happiness: 1 } }) },
      {
        text: "솔직하게 내 생각을 말한다",
        check: { stat: "social", dc: 55 },
        success: o("솔직하게 이야기한 덕에 서로를 더 잘 알게 됐다.", { affinity: { lover: 5 } }),
        fail: o("말이 날카롭게 나갔다. 며칠째 연락이 없다.", { affinity: { lover: -15 }, stats: { happiness: -3 } }),
      },
      { text: "헤어지자고 한다", outcome: o("{lover}와(과) 헤어졌다. 한동안 노래 가사가 다 내 얘기 같았다.", { role: { lover: null }, stats: { happiness: -6 } }) },
    ],
  },
  {
    id: "proposal",
    ages: [25, 60],
    max: 3,
    cooldown: 2,
    weight: 3,
    cast: { lover: { role: "연인", filter: (p) => p.affinity >= 60 } },
    text: "{lover}와(과) 함께한 지 꽤 됐다. 슬슬 결혼 이야기가 나온다.",
    choices: [
      {
        text: "프러포즈한다",
        chance: (l) => Math.max(...l.people.filter((p) => p.role === "연인").map((p) => p.affinity)) / 100,
        success: o("{lover}이(가) 눈물을 글썽이며 반지를 받았다. 결혼식은 따뜻했다.", {
          role: { lover: "배우자" },
          affinity: { lover: 10 },
          money: [-3000, -1500],
          stats: { happiness: 12 },
          run: (ctx) => {
            ctx.life.flags.spouseWorks = ctx.rng.chance(0.65);
            ctx.life.flags.marriedAt = ctx.life.age;
          },
        }),
        fail: o("\"아직은 아닌 것 같아.\" {lover}은(는) 조금 더 시간이 필요하다고 했다.", { affinity: { lover: -10 }, stats: { happiness: -6 } }),
      },
      { text: "아직은 이르다", outcome: o("결혼은 조금 더 나중에 생각하기로 했다.", { affinity: { lover: -3 } }) },
    ],
  },
  {
    id: "new_friend",
    ages: [19, 75],
    max: 6,
    cooldown: 3,
    cast: { pal: { new: "친구", age: [-5, 5] } },
    text: "모임에서 만난 {pal}와(과) 이야기가 잘 통했다.",
    choices: [
      { text: "연락처를 주고받는다", outcome: o("{pal}와(과) 종종 만나는 사이가 됐다.", { meet: ["pal"], affinity: { pal: 5 }, stats: { social: 1, happiness: 2 } }) },
      { text: "그냥 헤어진다", outcome: o("즐거운 대화였다. 다시 만날 일은 없겠지만.") },
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
