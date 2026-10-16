// 엔진 밸런스 확인용: node tools/sim-test.js [경기수]
require('../src/util.js'); require('../src/data.js'); require('../src/world.js'); require('../src/engine.js');
const KM = globalThis.KM, D = KM.DATA;
const N = +process.argv[2] || 60;
const G = { players: {}, nextPid: 1 };
const rng = new KM.RNG(7);
const teams = [KM.World.createTeam(G, rng, D.CLUBS[0], 0, 1), KM.World.createTeam(G, rng, D.CLUBS[15], 1, 1), KM.World.createTeam(G, rng, D.CLUBS[5], 2, 1)];
function side(t) {
  const slots = D.FORMATIONS[t.tactics.formation];
  return { team: t, tactics: Object.assign({}, t.tactics), starters: t.lineup.map((id, i) => ({ p: G.players[id], role: slots[i][0], slot: slots[i] })), bench: t.bench.map((id) => G.players[id]) };
}
function run(a, b) {
  let goals = 0, w = [0, 0, 0], shots = 0, sot = 0, xg = 0, pass = 0, pok = 0, fouls = 0, cards = 0, corners = 0, poss = 0, tk = 0;
  const t0 = Date.now();
  for (let i = 0; i < N; i++) {
    const m = new KM.Engine.Match(side(a), side(b), { seed: 1000 + i });
    m.runToEnd();
    goals += m.score[0] + m.score[1];
    w[m.score[0] > m.score[1] ? 0 : m.score[0] === m.score[1] ? 1 : 2]++;
    for (const s of m.stats) { shots += s.shots; sot += s.sot; xg += s.xg; pass += s.pass; pok += s.passOk; fouls += s.fouls; cards += s.yel + s.red; corners += s.corners; tk += s.tkl; }
    poss += m.possPct();
  }
  const f = (x) => (x / N).toFixed(2);
  console.log(`${a.short}(${KM.World.teamRating(G, a)}) vs ${b.short}(${KM.World.teamRating(G, b)}) W/D/L ${w.join('/')} goals ${f(goals)} shots ${f(shots)} sot ${f(sot)} xg ${f(xg)} pass ${f(pass)} acc ${(pok / pass * 100).toFixed(0)}% fouls ${f(fouls)} cards ${f(cards)} corners ${f(corners)} tkl ${f(tk)} poss ${f(poss)} | ${((Date.now() - t0) / N).toFixed(0)}ms/match`);
}
run(teams[0], teams[1]); run(teams[2], teams[2]); run(teams[1], teams[0]);
// 평점 분포
{
  const m = new KM.Engine.Match(side(teams[2]), side(teams[0]), { seed: 5 });
  m.runToEnd();
  const r = m.ratings().map((x) => x.rating).sort((a, b) => a - b);
  console.log('평점', r.join(' '), '| 점수', m.score.join('-'));
}
