// 시즌 진행 확인: node tools/season-test.js [시즌수]
for (const f of ['util', 'data', 'world', 'engine', 'season']) require('../src/' + f + '.js');
const KM = globalThis.KM, S = KM.Season;
const G = S.newGame({ teamId: 3, name: '테스트', seed: 42 });
const seasons = +process.argv[2] || 2;
const t0 = Date.now();
for (let s = 0; s < seasons; s++) {
  let userEngine = 0;
  while (G.week < G.calendar.length) {
    const fx = S.userFixture(G);
    let m = null;
    if (fx && userEngine < 3) { m = S.createMatch(G, fx); m.runToEnd(); userEngine++; }
    S.playWeek(G, m);
  }
  const t1 = S.table(G, 0);
  console.log('시즌', G.year, '1부 1위', S.team(G, t1[0].id).name, t1[0].pts + '점', '꼴찌', t1[15].pts + '점', '총골/경기', (t1.reduce((a, r) => a + r.gf, 0) / 240).toFixed(2), '내 순위', S.position(G, G.user.teamId), '잔고', KM.money(S.userTeam(G).balance), '신뢰', G.board.conf.toFixed(0));
  const r = S.endSeason(G);
  console.log('  득점왕', r.awards.scorer.name, r.awards.scorer.season.goals, '승격', r.promoted.map((id) => S.team(G, id).short).join(','), '강등', r.relegated.map((id) => S.team(G, id).short).join(','), 'sacked', !!G.user.sacked);
  const ovr = G.teams.map((t) => KM.World.squadOvr(G, t));
  console.log('  팀 OVR 범위', Math.min(...ovr), Math.max(...ovr), '선수수', Object.keys(G.players).length, 'JSON', (JSON.stringify(G).length / 1024).toFixed(0) + 'KB');
  if (G.user.sacked) { S.takeJob(G, S.jobOffers(G)[0]); }
}
console.log('time', Date.now() - t0, 'ms');
