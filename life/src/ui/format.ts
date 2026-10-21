// 화면에 보여 줄 글자 만들기

import type { Choice } from "../game/events";
import { ageOf, inCollege, inMilitary, present } from "../game/life";
import { formatMoney } from "../game/text";
import { STAT_LABEL, type Change, type Life, type Person } from "../game/types";

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function stageOf(life: Life): string {
  const a = life.age;
  if (!life.alive) return "고인";
  if (a <= 2) return "아기";
  if (a <= 7) return "어린이";
  if (a <= 13) return "초등학생";
  if (a <= 16) return "중학생";
  if (a <= 18) return "고등학생";
  if (inMilitary(life)) return "군인";
  if (inCollege(life)) return "대학생";
  if (life.flags.retired) return "은퇴";
  if (life.job) return life.job.title;
  return "구직 중";
}

export function changeChips(changes: Change[]): string {
  if (changes.length === 0) return "";
  return `<ul class="chips">${changes
    .map((c) => {
      const v = c.unit === "money" ? formatMoney(Math.abs(c.delta)) : String(Math.abs(c.delta));
      return `<li class="chip ${c.delta > 0 ? "up" : "down"}">${esc(c.label)} ${c.delta > 0 ? "+" : "−"}${v}</li>`;
    })
    .join("")}</ul>`;
}

const CHECK_LABEL: Record<string, string> = { ...STAT_LABEL, grit: "끈기", luck: "운", fame: "명성" };

/** 판정이 있는 선택지에 붙이는 작은 안내: 어떤 능력치로, 얼마나 쉬운지 */
export function choiceHint(life: Life, choice: Choice, chance: number): string {
  if (!choice.check && !choice.chance) return "";
  const stat = choice.check?.stat;
  const hidden = (stat === "grit" && !life.revealed.grit) || (stat === "luck" && !life.revealed.luck);
  const what = stat ? (hidden ? "???" : CHECK_LABEL[stat]) : "운명";
  const level = chance >= 0.7 ? "쉬움" : chance >= 0.4 ? "보통" : "어려움";
  return `<span class="hint ${level === "쉬움" ? "easy" : level === "보통" ? "mid" : "hard"}">${esc(what)} · ${level}</span>`;
}

export function personLine(life: Life, p: Person): string {
  const age = ageOf(life, p);
  const status = p.alive ? `${age}살` : "고인";
  return `${esc(p.role)} · ${esc(p.name)} <span class="muted">${status}</span>`;
}

export function visiblePeople(life: Life): Person[] {
  const order = ["배우자", "연인", "자녀", "손주", "엄마", "아빠", "형제", "친구"];
  return life.people
    .filter((p) => life.age >= p.bornAt && (p.alive || p.role !== "친구"))
    .sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role) || Number(present(life, b)) - Number(present(life, a)));
}

/** 명예의 전당에 남길 만한 문장 */
export function highlights(life: Life): string[] {
  const keys = /합격|결혼|태어났|졸업|은퇴|당첨|대상|승진|내 집|입대|명찰|사장님|선수가|자격|유튜버|반장|첫 연애|세상을 떠났다/;
  const out: string[] = [];
  for (const y of life.log) for (const line of y.lines) if (keys.test(line)) out.push(`${y.age}살 · ${line}`);
  if (out.length <= 10) return out;
  // 너무 많으면 처음과 끝을 살리고 가운데를 고르게 덜어 낸다
  const step = out.length / 10;
  return Array.from({ length: 10 }, (_, i) => out[Math.min(out.length - 1, Math.round(i * step))]).concat(out.at(-1)!).filter((v, i, a) => a.indexOf(v) === i);
}
