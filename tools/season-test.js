// 시즌 진행 확인: node tools/season-test.js [시즌수] [구단 이름 일부]
for (const f of ['util', 'data', 'realdata', 'world', 'engine', 'season']) require('../src/' + f + '.js');
const KM = globalThis.KM, S = KM.Season, W = KM.World;
const seasons = +process.argv[2] || 2;
const t0 = Date.now();
const G = S.createWorld(42);
const pick = G.teams.find((t) => t.name.includes(process.argv[3] || '토트넘')) || G.teams[0];
S.startCareer(G, pick.id, '테스트');
console.log('생성', Date.now() - t0, 'ms', '구단', G.teams.length, '선수', Object.keys(G.players).length, '내 팀', pick.name, '목표', G.board.goal.text);
for (const li of [0, 5]) {
  const ts = G.leagues[li].teams.map((id) => G.teams[id]).sort((a, b) => W.squadOvr(G, b) - W.squadOvr(G, a));
  console.log(G.leagues[li].name, ts.slice(0, 3).map((t) => `${t.name} ${W.squadOvr(G, t)} rep${t.rep} ${KM.money(t.balance)} wage${KM.money(t.wage0)}`).join(' | '), '… 최하', W.squadOvr(G, ts[ts.length - 1]));
}
const top = Object.values(G.players).sort((a, b) => b.ovr - a.ovr).slice(0, 8);
console.log('최고 선수', top.map((p) => `${p.name}(${p.role} ${p.ovr}/${p.pot} ${KM.money(p.value)})`).join(', '));
for (let s = 0; s < seasons; s++) {
  const bal0 = G.teams.map((t) => t.balance);
  let eng = 0;
  let guard = 0;
  while (G.week < G.calendar.length && guard++ < 2000) {
    const fx = S.userFixture(G);
    if (fx && S.currentEvent(G).day <= G.day) {
      let m = null;
      if (eng < 2) { m = S.createMatch(G, fx); m.runToEnd(); eng++; }
      S.playWeek(G, m);
    } else S.advanceDay(G);
  }
  console.log('  진행 일수', G.day, '이벤트', G.week + '/' + G.calendar.length);
  for (const li of [0, 5]) {
    const tb = S.table(G, li);
    console.log(G.year, G.leagues[li].name, '우승', S.team(G, tb[0].id).name, tb[0].pts + '점', '꼴찌', tb[tb.length - 1].pts, '경기수', tb[0].p, '골/경기', (tb.reduce((a, r) => a + r.gf, 0) / (tb.reduce((a, r) => a + r.p, 0) / 2)).toFixed(2));
  }
  const d = G.teams.map((t, i) => (t.balance - bal0[i]) / Math.max(1, t.wage0 * 40));
  console.log('  잔고 변화/연봉총액 평균', (d.reduce((a, b) => a + b, 0) / d.length).toFixed(2), '최소', Math.min(...d).toFixed(2), '최대', Math.max(...d).toFixed(2), '내 순위', S.position(G, G.user.teamId), '컵', G.cup.winner != null ? S.team(G, G.cup.winner).name : '-');
  const r = S.endSeason(G);
  console.log('  득점왕', r.awards.scorer.name, r.awards.scorerGoals, 'sacked', !!G.user.sacked, 'JSON', (JSON.stringify(G).length / 1024).toFixed(0) + 'KB');
  if (G.user.sacked) S.takeJob(G, S.jobOffers(G)[0]);
}
console.log('time', Date.now() - t0, 'ms');
