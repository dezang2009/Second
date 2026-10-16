// 전술 프리셋별 효과 확인: node tools/tactic-test.js [경기수]
for (const f of ['util', 'data', 'realdata', 'world', 'engine', 'season']) require('../src/' + f + '.js');
const KM = globalThis.KM, S = KM.Season, D = KM.DATA;
const N = +process.argv[2] || 30;
const G = S.createWorld(7);
const a = G.teams.find((t) => t.name.includes('토트넘')), b = G.teams.find((t) => t.name.includes('뉴캐슬'));
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
for (const [key, name, , preset] of D.TACTIC_PRESETS) {
  if (ONLY && !ONLY.includes(key)) continue;
  let w = [0, 0, 0], gf = 0, ga = 0, poss = 0, shots = 0, pass = 0, tkl = 0, fouls = 0, stam = 0;
  for (let i = 0; i < N; i++) {
    const sa = S.buildSide(G, a), sb = S.buildSide(G, process.env.MIRROR ? a : b);
    Object.assign(sa.tactics, preset);
    Object.assign(sb.tactics, D.TACTIC_DEFAULT);
    const m = new KM.Engine.Match(sa, sb, { seed: (+process.env.SEED || 500) + i });
    m.runToEnd();
    w[m.score[0] > m.score[1] ? 0 : m.score[0] === m.score[1] ? 1 : 2]++;
    gf += m.score[0]; ga += m.score[1]; poss += m.possPct(); shots += m.stats[0].shots; pass += m.stats[0].pass; tkl += m.stats[0].tkl; fouls += m.stats[0].fouls;
    stam += m.mp[0].filter((x) => x.startT === 0).reduce((s, x) => s + x.st, 0) / 11;
  }
  const f = (x, d = 1) => (x / N).toFixed(d);
  console.log(`${name.padEnd(8)} 승무패 ${w.join('/')} 득 ${f(gf, 2)} 실 ${f(ga, 2)} 점유 ${f(poss)}% 슈팅 ${f(shots)} 패스 ${f(pass, 0)} 태클 ${f(tkl)} 파울 ${f(fouls)} 남은체력 ${(stam / N * 100).toFixed(0)}%`);
}
