// 밸런스 점검: (1) 예상 수입 공식과 실제 시뮬레이션 비교 (2) 등급별 도달 시간 추정
//   node cafe/tools/sim.js
const D = require('../src/data.js');
const G = require('../src/game.js');

function rng(seed) { let a = seed; return () => { a = (a * 1664525 + 1013904223) % 4294967296; return a / 4294967296; }; }

function measure(s, secs) {
  const st = JSON.parse(JSON.stringify(s));
  const rt = G.newRuntime(st, rng(7));
  for (let t = 0; t < 120; t += 0.05) G.tick(st, rt, 0.05); // 예열
  const before = st.totalEarned;
  for (let t = 0; t < secs; t += 0.05) G.tick(st, rt, 0.05);
  return (st.totalEarned - before) / secs;
}

console.log('== 예상 수입 공식 vs 실제 시뮬레이션 (코인/초) ==');
const ST = G.ST;
function mk(o) {
  const s = G.newState(0);
  for (const k in o) {
    if (k === 'staff') for (const id in o.staff) Object.assign(s.staff[ST[id]], o.staff[id]);
    else if (k === 'menuLv') s.menu = s.menu.map(() => o.menuLv);
    else s[k] = o[k];
  }
  return s;
}
const cases = [
  ['시작', {}],
  ['초반', { grade: 2, interiorLv: 3, menuLv: 8, staff: { alba: { lv: 3 }, barista: { lv: 4 } } }],
  ['손님 많음', { grade: 3, interiorLv: 10, tables: 3 }],
  ['파티시에', { grade: 4, interiorLv: 10, tables: 4, staff: { patissier: { n: 1, lv: 3 }, mom: { n: 1 }, barista: { lv: 6 }, alba: { lv: 6 } } }],
  ['중반', { grade: 5, interiorLv: 12, tables: 5, machineLv: 6, staff: { alba: { n: 2, lv: 12 }, mom: { n: 1, lv: 8 }, barista: { n: 2, lv: 12 }, patissier: { n: 1, lv: 8 }, manager: { n: 1, lv: 3 } } }],
  ['후반', { grade: 9, interiorLv: 25, tables: 6, machineLv: 15, menuLv: 100, staff: { alba: { n: 2, lv: 30 }, mom: { n: 1, lv: 30 }, barista: { n: 2, lv: 30 }, patissier: { n: 1, lv: 30 }, manager: { n: 1, lv: 30 } } }]
];
for (const [name, o] of cases) {
  const s = mk(o);
  const est = G.estimateRate(s), real = measure(s, 1800);
  console.log(name.padEnd(8), '예상', est.toFixed(2).padStart(12), '실제', real.toFixed(2).padStart(12), '비율', (est / real).toFixed(2));
}

console.log('\n== 계속 접속해서 최적에 가깝게 투자했을 때 등급 도달 시간 ==');
const CAL = !!process.env.CAL, calOut = [];
// 보정 목표: 계속 접속 기준 각 등급 도달 시간(시간). 인덱스 = 현재 등급
const TARGET_H = [0, 0.17, 0.75, 3, 10, 30, 72, 168, 336, 720];
const s = G.newState(0);
let t = 0;
function options() {
  const out = [];
  for (let i = 0; i < D.MENUS.length; i++) out.push(['menu', i]);
  for (let i = 0; i < D.STAFF.length; i++) { out.push(['train', i]); out.push(['hire', i]); }
  for (const k of ['table', 'machine', 'interior', 'grade']) out.push([k, 0]);
  return out;
}
let steps = 0;
while (s.grade < D.GRADES.length && steps++ < 2000000) {
  const rate = G.estimateRate(s);
  let best = null, bestScore = Infinity;
  for (const [k, i] of options()) {
    const c = G.costOf(s, k, i);
    if (c === null) continue;
    if (CAL && k === 'grade') {
      // 보정 모드: 목표 시간이 되면 그때의 누적 수입을 승급 조건으로 삼는다
      if (t < TARGET_H[s.grade] * 3600) continue;
      const r2 = (x) => Number(x.toPrecision(2));
      D.GRADES[s.grade].need = r2(s.totalEarned); D.GRADES[s.grade].cost = r2(s.totalEarned * 0.4);
      calOut.push(`{ need: ${D.GRADES[s.grade].need}, cost: ${D.GRADES[s.grade].cost} }`);
      best = [k, i, D.GRADES[s.grade].cost, Math.max(0, D.GRADES[s.grade].cost - s.coins) / rate]; break;
    }
    let wait = Math.max(0, c - s.coins) / rate;
    if (k === 'grade') wait = Math.max(wait, Math.max(0, D.GRADES[s.grade].need - s.totalEarned) / rate);
    const s2 = JSON.parse(JSON.stringify(s));
    s2.coins = 1e300; s2.totalEarned = 1e300; G.buy(s2, k, i);
    const gain = G.estimateRate(s2) - rate;
    if (gain <= 0) continue;
    const score = wait + c / gain; // 기다리는 시간 + 본전 뽑는 시간
    if (score < bestScore) { bestScore = score; best = [k, i, c, wait]; }
  }
  if (!best) break;
  const [k, i, c, wait] = best;
  if (process.env.TRACE && steps < 60) console.log(steps, k, i, c, wait.toFixed(1), bestScore.toFixed(1));
  t += wait; G.earn(s, rate * wait);
  const g0 = s.grade;
  if (!G.buy(s, k, i)) { G.earn(s, c); G.buy(s, k, i); }
  if (s.grade !== g0) {
    const h = t / 3600;
    console.log(`등급 ${s.grade} ${D.GRADES[s.grade - 1].name.padEnd(8)} ${h < 1 ? (t / 60).toFixed(1) + '분' : h < 48 ? h.toFixed(1) + '시간' : (h / 24).toFixed(1) + '일'}  초당 ${G.fmt(G.estimateRate(s))}  메뉴Lv ${Math.min(...s.menu.filter((_, j) => G.menuUnlocked(s, j)))}~${Math.max(...s.menu)}`);
  }
}
if (CAL) console.log(calOut.join("\n"));
console.log("steps", steps, "t", t, "coins", s.coins, "staff", JSON.stringify(s.staff));
console.log('최종 상태:', JSON.stringify({ grade: s.grade, tables: s.tables, machine: s.machineLv, interior: s.interiorLv }));
