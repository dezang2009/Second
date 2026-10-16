// 엔진 밸런스 확인용: node tools/sim-test.js [경기수]
for (const f of ['util', 'data', 'realdata', 'world', 'engine', 'season']) require('../src/' + f + '.js');
const KM = globalThis.KM, S = KM.Season;
const N = +process.argv[2] || 40;
const G = S.createWorld(7);
const find = (n) => G.teams.find((t) => t.name.includes(n));
function run(a, b) {
  let goals = 0, w = [0, 0, 0], shots = 0, xg = 0, cards = 0, poss = 0;
  const t0 = Date.now();
  for (let i = 0; i < N; i++) {
    const m = new KM.Engine.Match(S.buildSide(G, a), S.buildSide(G, b), { seed: 1000 + i });
    m.runToEnd();
    goals += m.score[0] + m.score[1];
    w[m.score[0] > m.score[1] ? 0 : m.score[0] === m.score[1] ? 1 : 2]++;
    for (const s of m.stats) { shots += s.shots; xg += s.xg; cards += s.yel + s.red; }
    poss += m.possPct();
  }
  const f = (x) => (x / N).toFixed(2);
  console.log(`${a.name}(${KM.World.teamRating(G, a)}) vs ${b.name}(${KM.World.teamRating(G, b)}) 승/무/패 ${w.join('/')} 골 ${f(goals)} 슈팅 ${f(shots)} xG ${f(xg)} 카드 ${f(cards)} 점유 ${f(poss)} | ${((Date.now() - t0) / N).toFixed(0)}ms/경기`);
}
run(find('맨체스터 시티'), find('헐 시티'));
run(find('토트넘'), find('뉴캐슬'));
run(find('울산'), find('전북'));
