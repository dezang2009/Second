// 직업과 기본 연봉(만 원). 연봉은 해마다 조금씩 오르고 승진 사건으로 크게 오른다.

export interface JobDef {
  id: string;
  title: string;
  salary: number;
  /** 해마다 벌이가 크게 흔들리는 일 (자영업, 예술가 등) */
  volatile?: boolean;
}

export const JOBS = {
  parttime: { id: "parttime", title: "아르바이트", salary: 1500 },
  sme: { id: "sme", title: "중소기업 사원", salary: 3000 },
  big: { id: "big", title: "대기업 사원", salary: 4800 },
  civil: { id: "civil", title: "공무원", salary: 3200 },
  pro: { id: "pro", title: "전문직", salary: 7000 },
  shop: { id: "shop", title: "자영업자", salary: 3500, volatile: true },
  artist: { id: "artist", title: "예술가", salary: 1800, volatile: true },
  athlete: { id: "athlete", title: "운동선수", salary: 3500, volatile: true },
} satisfies Record<string, JobDef>;

export type JobId = keyof typeof JOBS;

export function jobDef(id: string): JobDef | undefined {
  return (JOBS as Record<string, JobDef>)[id];
}

export function hire(id: JobId) {
  const j = JOBS[id];
  return { id: j.id, title: j.title, salary: j.salary };
}
