// 커리어 진행: 일정, 결과 반영, 이적, 재정, 훈련, 시즌 종료
(function (KM) {
  'use strict';
  const { clamp, RNG, money, josa } = KM;
  const D = KM.DATA, W = KM.World;

  const CUP_AFTER = [3, 8, 14, 21, 27];         // 리그 n라운드 뒤에 컵 라운드
  const CUP_NAMES = ['32강', '16강', '8강', '준결승', '결승'];
  const WINDOW_WEEKS = (w) => w < 4 || (w >= 17 && w <= 20);

  function rngOf(G) {
    const r = new RNG(1); r.s = G.rngS; return r;
  }
  function saveRng(G, r) { G.rngS = r.s; }

  // ── 새 게임 ─────────────────────────────────────────────────
  function newGame(opts) {
    const seed = opts.seed || ((Date.now() ^ (Math.random() * 1e9)) >>> 0);
    const rng = new RNG(seed);
    const G = {
      v: 1, seed, rngS: 0, year: 2026, season: 1, week: 0,
      players: {}, nextPid: 1, teams: [], divs: [[], []],
      user: { teamId: opts.teamId, name: opts.name || '감독', rep: 40, sacked: false, history: [], trophies: [], seasons: 0, wins: 0, draws: 0, losses: 0 },
      news: [], offers: [], nego: {}, freeAgents: [], records: { bigWin: null, recordFee: 0 },
      ach: {}, training: { focus: 'bal', intensity: 1 }, settings: { speed: 1 },
      board: { conf: 65, goal: null },
      fin: { log: [], seasonIncome: 0, seasonSpend: 0, cat: {} },
      unbeaten: 0, lastMatch: null, transfers: [],
    };
    D.CLUBS.forEach((def, i) => {
      const div = i < 16 ? 1 : 2;
      const t = W.createTeam(G, rng, def, i, div);
      G.teams.push(t);
      G.divs[div - 1].push(i);
    });
    for (let i = 0; i < 30; i++) {
      const p = W.createPlayer(G, rng, rng.pick(['GK', 'DF', 'DF', 'MF', 'MF', 'FW']), rng.int(52, 68), rng.int(19, 33));
      G.freeAgents.push(p.id);
    }
    G.rngS = rng.s;
    // 사용자 팀은 OVR 기반 대신 실제 감독 판단 — 기본 전술 유지
    setupSeason(G);
    news(G, 'board', `${G.user.name} 감독 부임`, `${josa(userTeam(G).name, '이/가')} ${G.user.name} 감독을 새 사령탑으로 선임했습니다. 구단주는 이번 시즌 목표로 '${goalText(G.board.goal)}'를 제시했습니다.`);
    return G;
  }

  function userTeam(G) { return G.teams[G.user.teamId]; }
  function team(G, id) { return G.teams[id]; }

  // ── 시즌 설정 ───────────────────────────────────────────────
  function roundRobin(ids, rng) {
    const n = ids.length;
    const arr = rng.shuffle(ids.slice());
    const rounds = [];
    for (let r = 0; r < n - 1; r++) {
      const games = [];
      for (let i = 0; i < n / 2; i++) {
        const a = arr[i], b = arr[n - 1 - i];
        games.push(r % 2 === 0 ? { h: a, a: b } : { h: b, a: a });
      }
      rounds.push(games);
      arr.splice(1, 0, arr.pop());
    }
    const second = rounds.map((g) => g.map((m) => ({ h: m.a, a: m.h })));
    return rounds.concat(second).map((g) => g.map((m) => Object.assign(m, { hs: null, as: null })));
  }

  function setupSeason(G) {
    const rng = rngOf(G);
    G.fixtures = G.divs.map((ids) => roundRobin(ids, rng));
    // 컵: 32팀 토너먼트
    const all = rng.shuffle(G.teams.map((t) => t.id));
    G.cup = { rounds: [pairUp(all)], winner: null };
    G.calendar = [];
    let c = 0;
    for (let r = 0; r < 30; r++) {
      G.calendar.push({ k: 'L', r });
      if (r === CUP_AFTER[c]) { G.calendar.push({ k: 'C', r: c }); c++; }
    }
    G.week = 0;
    for (const t of G.teams) { t.form = []; W.validateLineup(G, t); }
    for (const id in G.players) { const p = G.players[id]; p.season = W.blankStats(); p.ratings = []; p.yAcc = 0; }
    G.board.goal = boardGoal(G);
    G.board.conf = clamp(G.board.conf, 45, 80);
    G.fin.seasonIncome = 0; G.fin.seasonSpend = 0; G.fin.cat = {};
    saveRng(G, rng);
  }

  function pairUp(ids) {
    const out = [];
    for (let i = 0; i < ids.length; i += 2) out.push({ h: ids[i], a: ids[i + 1], hs: null, as: null, w: null, pens: null });
    return out;
  }

  function strengthRank(G, teamId) {
    const t = team(G, teamId);
    const ids = G.divs[t.div - 1].slice().sort((a, b) => W.squadOvr(G, team(G, b)) - W.squadOvr(G, team(G, a)));
    return ids.indexOf(teamId) + 1;
  }

  function boardGoal(G) {
    const t = userTeam(G);
    const rank = strengthRank(G, t.id);
    if (t.div === 1) {
      if (rank <= 2) return { code: 'title', pos: 1, text: '리그 우승' };
      if (rank <= 5) return { code: 'top4', pos: 4, text: '4위 이내' };
      if (rank <= 10) return { code: 'mid', pos: 9, text: '중위권(9위 이내)' };
      return { code: 'survive', pos: 13, text: '1부 잔류(13위 이내)' };
    }
    if (rank <= 4) return { code: 'promote', pos: 3, text: '1부 승격(3위 이내)' };
    if (rank <= 10) return { code: 'top8', pos: 8, text: '8위 이내' };
    return { code: 'mid2', pos: 12, text: '12위 이내' };
  }
  function goalText(g) { return g ? g.text : ''; }

  // ── 순위표 ─────────────────────────────────────────────────
  function table(G, div) {
    const rows = {};
    for (const id of G.divs[div]) rows[id] = { id, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, form: [] };
    for (const round of G.fixtures[div]) {
      for (const m of round) {
        if (m.hs == null) continue;
        const h = rows[m.h], a = rows[m.a];
        h.p++; a.p++; h.gf += m.hs; h.ga += m.as; a.gf += m.as; a.ga += m.hs;
        if (m.hs > m.as) { h.w++; a.l++; h.pts += 3; h.form.push('W'); a.form.push('L'); }
        else if (m.hs < m.as) { a.w++; h.l++; a.pts += 3; h.form.push('L'); a.form.push('W'); }
        else { h.d++; a.d++; h.pts++; a.pts++; h.form.push('D'); a.form.push('D'); }
      }
    }
    return Object.values(rows).sort((x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf || x.id - y.id);
  }
  function position(G, teamId) {
    const t = team(G, teamId);
    return table(G, t.div - 1).findIndex((r) => r.id === teamId) + 1;
  }

  // ── 이번 주 일정 ───────────────────────────────────────────
  function currentEvent(G) { return G.calendar[G.week] || null; }

  function userFixture(G) {
    const ev = currentEvent(G);
    if (!ev) return null;
    const uid = G.user.teamId;
    if (ev.k === 'L') {
      const div = userTeam(G).div - 1;
      const m = G.fixtures[div][ev.r].find((x) => x.h === uid || x.a === uid);
      return m ? { ev, m, comp: '리그', label: `${userTeam(G).div}부 리그 ${ev.r + 1}라운드` } : null;
    }
    const round = G.cup.rounds[ev.r];
    if (!round) return null;
    const m = round.find((x) => x.h === uid || x.a === uid);
    return m ? { ev, m, comp: '컵', label: `코리아 컵 ${CUP_NAMES[ev.r]}` } : null;
  }

  function windowOpen(G) { return G.week < G.calendar.length && WINDOW_WEEKS(G.week); }

  // ── 엔진용 팀 구성 ─────────────────────────────────────────
  function buildSide(G, t) {
    W.validateLineup(G, t);
    const slots = D.FORMATIONS[t.tactics.formation];
    return {
      team: t,
      tactics: Object.assign({}, t.tactics),
      baseMent: t.tactics.mentality,
      starters: t.lineup.map((id, i) => ({ p: G.players[id], role: slots[i][0], slot: slots[i] })),
      bench: t.bench.map((id) => G.players[id]),
    };
  }

  function createMatch(G, fx) {
    const h = team(G, fx.m.h), a = team(G, fx.m.a);
    const rng = rngOf(G);
    const seed = rng.int(1, 2e9);
    saveRng(G, rng);
    // AI 팀은 상대에 따라 전술 조정
    aiPrepare(G, h, a); aiPrepare(G, a, h);
    const user = fx.m.h === G.user.teamId ? 0 : 1;
    return new KM.Engine.Match(buildSide(G, h), buildSide(G, a), { seed, user });
  }

  function aiPrepare(G, t, opp) {
    if (t.id === G.user.teamId) return;
    W.autoLineup(G, t);
    const diff = W.teamRating(G, t) - W.teamRating(G, opp);
    t.tactics.mentality = diff > 5 ? 3 : diff < -5 ? 1 : 2;
    t.tactics.press = diff > 3 ? 2 : diff < -6 ? 0 : 1;
  }

  // ── 빠른 시뮬레이션 (AI 대 AI) ─────────────────────────────
  function quickSim(G, h, a, rng, knockout) {
    aiPrepare(G, h, a); aiPrepare(G, a, h);
    const rH = effRating(G, h), rA = effRating(G, a);
    const diff = rH - rA + 2.2; // 홈 어드밴티지
    const lh = clamp(1.2 * Math.exp(0.044 * diff) * mentF(h) * (1.08 - (a.tactics.mentality - 2) * 0.04), 0.15, 5);
    const la = clamp(1.2 * Math.exp(-0.044 * diff) * mentF(a) * (1.08 - (h.tactics.mentality - 2) * 0.04), 0.15, 5);
    const hs = poisson(rng, lh), as = poisson(rng, la);
    const res = { hs, as, pens: null, players: [] };
    for (const [t, goals, conceded] of [[h, hs, as], [a, as, hs]]) {
      const slots = D.FORMATIONS[t.tactics.formation];
      const xi = t.lineup.map((id, i) => ({ p: G.players[id], role: slots[i][0] }));
      const subs = t.bench.slice(0, 3).map((id) => G.players[id]).filter(Boolean);
      const rec = new Map();
      xi.forEach((x) => rec.set(x.p.id, { p: x.p, role: x.role, mins: 90, goals: 0, ast: 0, yel: 0, red: false, inj: 0, cond: 0 }));
      // 교체 3명
      const outs = rng.shuffle(xi.filter((x) => x.role !== 'GK').slice()).slice(0, subs.length);
      outs.forEach((o, i) => {
        const m = rng.int(55, 85);
        rec.get(o.p.id).mins = m;
        rec.set(subs[i].id, { p: subs[i], role: o.role, mins: 90 - m, goals: 0, ast: 0, yel: 0, red: false, inj: 0 });
      });
      const list = [...rec.values()];
      for (let g = 0; g < goals; g++) {
        const sc = weighted(rng, list, (r) => (r.role === 'GK' ? 0.01 : (r.p.attr.sho / 40) ** 3 * roleGoalW(r.role)) * r.mins);
        sc.goals++;
        if (rng.chance(0.72)) {
          const as = weighted(rng, list.filter((r) => r !== sc), (r) => (r.role === 'GK' ? 0.02 : (r.p.attr.pas / 40) ** 3 * roleAstW(r.role)) * r.mins);
          if (as) as.ast++;
        }
      }
      for (const r of list) {
        if (rng.chance(0.09 * r.mins / 90)) r.yel = 1;
        if (rng.chance(0.004)) r.red = true;
        if (rng.chance(0.006)) r.inj = rng.int(1, 6);
        let rt = 6.4 + rng.gauss(0, 0.55) + r.goals * 0.9 + r.ast * 0.55 + (goals > conceded ? 0.3 : goals < conceded ? -0.3 : 0);
        if ((r.role === 'GK' || ['CB', 'LB', 'RB'].includes(r.role))) rt += conceded === 0 ? 0.5 : -conceded * 0.2;
        r.rating = clamp(Math.round(rt * 10) / 10, 4, 10);
        r.endSt = clamp(r.p.cond / 100 - 0.28 * r.mins / 90, 0.3, 1);
        r.cs = conceded === 0 && (r.role === 'GK' || ['CB', 'LB', 'RB'].includes(r.role));
        res.players.push(r);
      }
    }
    if (knockout && hs === as) res.pens = shootout(rng);
    return res;
  }
  function roleGoalW(r) { return r === 'ST' ? 3.2 : r === 'LW' || r === 'RW' ? 2.2 : r === 'AM' ? 1.6 : r === 'LM' || r === 'RM' || r === 'CM' ? 0.8 : r === 'DM' ? 0.4 : 0.3; }
  function roleAstW(r) { return r === 'AM' ? 2.2 : r === 'LW' || r === 'RW' || r === 'LM' || r === 'RM' ? 1.9 : r === 'CM' ? 1.3 : r === 'ST' ? 1.2 : r === 'LB' || r === 'RB' ? 0.8 : 0.4; }
  function mentF(t) { return 1 + (t.tactics.mentality - 2) * 0.07; }
  function effRating(G, t) {
    const base = W.teamRating(G, t);
    const cond = t.lineup.reduce((s, id) => s + G.players[id].cond, 0) / t.lineup.length;
    const mor = t.lineup.reduce((s, id) => s + G.players[id].morale, 0) / t.lineup.length;
    return base + (cond - 85) * 0.08 + (mor - 60) * 0.04;
  }
  function poisson(rng, l) {
    const L = Math.exp(-l); let k = 0, p = 1;
    do { k++; p *= rng.next(); } while (p > L && k < 12);
    return k - 1;
  }
  function weighted(rng, arr, f) {
    let sum = 0; const w = arr.map((x) => { const v = Math.max(0, f(x)); sum += v; return v; });
    if (sum <= 0) return arr[0];
    let r = rng.next() * sum;
    for (let i = 0; i < arr.length; i++) { r -= w[i]; if (r <= 0) return arr[i]; }
    return arr[arr.length - 1];
  }
  function shootout(rng) {
    let h = 0, a = 0;
    for (let i = 0; i < 5; i++) { if (rng.chance(0.76)) h++; if (rng.chance(0.76)) a++; }
    while (h === a) { if (rng.chance(0.76)) h++; if (rng.chance(0.76)) a++; }
    return [h, a];
  }

  // 엔진 결과 → 공통 결과 형식
  function engineResult(G, match) {
    const res = { hs: match.score[0], as: match.score[1], pens: null, players: [], engine: true };
    for (const m of match.ratings()) {
      res.players.push({
        p: m.p, role: m.role, mins: m.mins, goals: m.s.goals, ast: m.s.ast,
        yel: m.yellow ? 1 : 0, red: !!m.red, inj: m.injured ? m.injWeeks : 0, rating: m.rating, endSt: m.st,
        cs: match.score[1 - m.side] === 0 && (m.grp === 'GK' || m.grp === 'DF') && m.mins >= 60,
      });
    }
    return res;
  }

  // ── 결과 반영 ───────────────────────────────────────────────
  function applyResult(G, fxm, res, comp) {
    fxm.hs = res.hs; fxm.as = res.as;
    if (res.pens) fxm.pens = res.pens;
    const played = new Set();
    for (const r of res.players) {
      const p = r.p;
      played.add(p.id);
      for (const st of [p.season, p.career]) {
        st.apps++; st.goals += r.goals; st.assists += r.ast; st.yel += r.yel; st.red += r.red ? 1 : 0; st.rsum += r.rating;
        if (r.cs) st.cs++;
      }
      p.ratings.push(r.rating); if (p.ratings.length > 6) p.ratings.shift();
      p.form = p.ratings.reduce((a, b) => a + b, 0) / p.ratings.length;
      p.cond = Math.round(clamp(r.endSt * 100, 25, 100));
      if (r.yel) { p.yAcc = (p.yAcc || 0) + 1; if (p.yAcc >= 5) { p.yAcc = 0; p.sus = Math.max(p.sus, 1); } }
      if (r.red) p.sus = Math.max(p.sus, 2);
      if (r.inj) p.inj = Math.max(p.inj, r.inj);
      p.morale = clamp(p.morale + (r.rating >= 7.5 ? 3 : r.rating < 5.8 ? -2 : 0.5), 5, 100);
    }
    for (const [tid, gf, ga] of [[fxm.h, res.hs, res.as], [fxm.a, res.as, res.hs]]) {
      const t = team(G, tid);
      const won = gf > ga || (res.pens && (tid === fxm.h ? res.pens[0] > res.pens[1] : res.pens[1] > res.pens[0]));
      const r = gf > ga ? 'W' : gf < ga ? 'L' : 'D';
      t.form.push(r); if (t.form.length > 6) t.form.shift();
      for (const id of t.squad) {
        const p = G.players[id];
        if (!played.has(id)) {
          if (p.ovr >= W.squadOvr(G, t) && p.inj <= 0) p.morale = clamp(p.morale - 1.5, 5, 100);
        }
        p.morale = clamp(p.morale + (r === 'W' ? 2.5 : r === 'L' ? -2.5 : 0), 5, 100);
      }
      t.fans = clamp(t.fans + (r === 'W' ? 1.2 : r === 'L' ? -1.2 : 0), 10, 100);
    }
  }

  // ── 한 주 진행 ─────────────────────────────────────────────
  // userMatch: 사용자 경기를 엔진으로 치렀을 때의 Match 객체 (없으면 빠른 시뮬)
  function playWeek(G, userMatch) {
    const ev = currentEvent(G);
    if (!ev) return null;
    const rng = rngOf(G);
    const uid = G.user.teamId;
    const summary = { ev, results: [], user: null };
    // 출전 정지 소진은 이번 주 경기 전에 판정된 상태로 처리
    const teamsPlaying = new Set();
    let fixtures;
    if (ev.k === 'L') fixtures = G.fixtures[0][ev.r].map((m) => ({ m, div: 0 })).concat(G.fixtures[1][ev.r].map((m) => ({ m, div: 1 })));
    else fixtures = G.cup.rounds[ev.r].map((m) => ({ m, div: -1 }));
    for (const { m, div } of fixtures) {
      teamsPlaying.add(m.h); teamsPlaying.add(m.a);
      const isUser = m.h === uid || m.a === uid;
      let res;
      if (isUser && userMatch) {
        res = engineResult(G, userMatch);
        if (ev.k === 'C' && res.hs === res.as) res.pens = shootout(rng);
      } else {
        res = quickSim(G, team(G, m.h), team(G, m.a), rng, ev.k === 'C');
      }
      // 징계 소진: 경기에 나서지 못한 징계 선수
      for (const tid of [m.h, m.a]) for (const id of team(G, tid).squad) { const p = G.players[id]; if (p.sus > 0 && !res.players.some((r) => r.p === p)) p.sus--; }
      applyResult(G, m, res, ev.k);
      if (ev.k === 'C') m.w = res.hs > res.as ? m.h : res.hs < res.as ? m.a : (res.pens[0] > res.pens[1] ? m.h : m.a);
      const item = { m, div, res };
      summary.results.push(item);
      if (isUser) summary.user = item;
      // 홈 경기 수입
      gateIncome(G, team(G, m.h), ev.k === 'C', rng);
    }
    if (ev.k === 'C') advanceCup(G, ev.r);
    if (summary.user) afterUserMatch(G, summary.user, ev, rng);
    weekly(G, rng, teamsPlaying);
    G.week++;
    saveRng(G, rng);
    if (G.week >= G.calendar.length) summary.seasonOver = true;
    return summary;
  }

  function advanceCup(G, r) {
    const winners = G.cup.rounds[r].map((m) => m.w);
    if (winners.length === 1) {
      G.cup.winner = winners[0];
      const t = team(G, winners[0]);
      news(G, 'cup', `${t.name}, 코리아 컵 우승!`, `${josa(t.name, '이/가')} 결승에서 승리하며 컵을 들어 올렸습니다.`);
      if (t.id === G.user.teamId) { G.user.trophies.push({ year: G.year, name: '코리아 컵' }); unlock(G, 'cup'); G.board.conf = clamp(G.board.conf + 15, 0, 100); }
      return;
    }
    G.cup.rounds.push(pairUp(winners));
  }

  function afterUserMatch(G, item, ev, rng) {
    const uid = G.user.teamId;
    const { m, res } = item;
    const home = m.h === uid;
    const gf = home ? res.hs : res.as, ga = home ? res.as : res.hs;
    const opp = team(G, home ? m.a : m.h);
    let r = gf > ga ? 'W' : gf < ga ? 'L' : 'D';
    if (r === 'W') G.user.wins++; else if (r === 'L') G.user.losses++; else G.user.draws++;
    // 구단주 신뢰도
    const exp = W.teamRating(G, userTeam(G)) - W.teamRating(G, opp);
    const delta = r === 'W' ? 2.5 - exp * 0.05 : r === 'L' ? -2.2 - exp * 0.07 : -0.2 - exp * 0.04;
    G.board.conf = clamp(G.board.conf + delta, 0, 100);
    G.unbeaten = r === 'L' ? 0 : G.unbeaten + 1;
    if (r === 'W') unlock(G, 'firstWin');
    if (G.unbeaten >= 10) unlock(G, 'unbeaten10');
    if (gf - ga >= 4) unlock(G, 'thrash');
    if (r === 'W' && W.squadOvr(G, opp) - W.squadOvr(G, userTeam(G)) >= 5) unlock(G, 'giant');
    const scorers = res.players.filter((x) => x.goals > 0 && x.p.teamId === uid).map((x) => x.p.name + (x.goals > 1 ? ` ${x.goals}골` : '')).join(', ');
    const label = ev.k === 'L' ? `리그 ${ev.r + 1}R` : `컵 ${CUP_NAMES[ev.r]}`;
    const word = r === 'W' ? '승리' : r === 'L' ? '패배' : '무승부';
    news(G, 'match', `[${label}] ${opp.name}전 ${gf}-${ga} ${word}`, scorers ? `득점: ${scorers}` : '득점 없이 경기를 마쳤습니다.');
    const best = res.players.slice().sort((a, b) => b.rating - a.rating)[0];
    G.lastMatch = { opp: opp.id, home, gf, ga, r, label, motm: best ? best.p.id : null, pens: res.pens };
    for (const x of res.players) {
      if (x.inj && x.p.teamId === uid) news(G, 'injury', `${x.p.name} 부상`, `${josa(x.p.name, '이/가')} 부상으로 약 ${x.inj}주간 결장합니다.`);
    }
  }

  function gateIncome(G, t, cup, rng) {
    const fill = clamp(0.45 + t.fans / 200 + (t.form.filter((f) => f === 'W').length - 2) * 0.03 + rng.gauss(0, 0.04), 0.3, 1);
    const cap = Math.round(t.cap * (1 + (t.facilities.stadium - 1) * 0.15));
    const att = Math.round(cap * fill);
    const ticket = t.div === 1 ? 0.65 : 0.45; // 만 원 (구단 몫)
    const inc = Math.round(att * ticket * (cup ? 1.2 : 1));
    t.balance += inc;
    if (t.id === G.user.teamId) { addFin(G, '입장 수입', inc); G.lastAttendance = att; }
  }

  const CAT = { '입장 수입': '입장 수입', '중계권·스폰서': '중계권·스폰서', '상품 판매': '상품 판매', '선수 주급': '선수 주급', '리그 상금': '상금' };
  function addFin(G, label, amount) {
    G.fin.log.unshift({ w: G.week, s: G.season, label, amount });
    if (G.fin.log.length > 60) G.fin.log.pop();
    const cat = CAT[label] || (amount >= 0 ? '이적 수입' : / 공사$/.test(label) ? '시설 투자' : / 영입$/.test(label) ? '이적 지출' : '기타 지출');
    G.fin.cat[cat] = (G.fin.cat[cat] || 0) + amount;
    if (amount >= 0) G.fin.seasonIncome += amount; else G.fin.seasonSpend -= amount;
  }

  // 주간 처리: 회복, 훈련, 재정, 이적
  function weekly(G, rng, teamsPlaying) {
    const uid = G.user.teamId;
    for (const t of G.teams) {
      const isUser = t.id === uid;
      const intensity = isUser ? G.training.intensity : 1;
      const focus = isUser ? G.training.focus : 'bal';
      for (const id of t.squad) {
        const p = G.players[id];
        if (p.inj > 0) p.inj--;
        const rec = [26, 19, 13][intensity] + p.attr.phy / 20;
        p.cond = Math.round(clamp(p.cond + rec, 0, 100));
        // 훈련 부상
        if (intensity === 2 && rng.chance(0.004)) { p.inj = rng.int(1, 3); if (isUser) news(G, 'injury', `${p.name} 훈련 중 부상`, `강도 높은 훈련 도중 부상을 입어 ${p.inj}주 결장합니다.`); }
        develop(G, p, t, rng, intensity, focus);
        p.morale = clamp(p.morale + (70 - p.morale) * 0.04, 5, 100);
      }
      // 재정: 주급, 중계권/스폰서
      const wages = W.wageBill(G, t);
      const tv = t.div === 1 ? 3000 + t.rep * 30 : 1200 + t.rep * 12;
      const merch = Math.round(t.fans * (t.div === 1 ? 20 : 8));
      t.balance += tv + merch - wages;
      if (isUser) { addFin(G, '중계권·스폰서', tv); addFin(G, '상품 판매', merch); addFin(G, '선수 주급', -wages); }
      if (!isUser) W.validateLineup(G, t);
    }
    // 시설 공사 진행
    const ut = userTeam(G);
    if (ut.build) {
      ut.build.weeks--;
      if (ut.build.weeks <= 0) {
        ut.facilities[ut.build.k]++;
        news(G, 'club', `${FAC[ut.build.k].name} 공사 완료`, `${josa(FAC[ut.build.k].name, '이/가')} ${ut.facilities[ut.build.k]}단계로 업그레이드되었습니다.`);
        ut.build = null;
      }
    }
    if (windowOpen(G)) { aiTransfers(G, rng); incomingOffers(G, rng); }
    // 만료된 제안 정리
    G.offers = G.offers.filter((o) => o.exp > G.week);
    if (G.board.conf < 10 && G.week > 10 && position(G, G.user.teamId) > G.board.goal.pos + 2) G.user.sacked = true;
  }

  // 선수 성장/노화
  function develop(G, p, t, rng, intensity, focus) {
    const fac = 1 + (t.facilities.train - 1) * 0.12;
    const intF = [0.6, 1, 1.4][intensity];
    const playF = 0.75 + Math.min(1, p.season.apps / Math.max(1, G.week * 0.7)) * 0.5;
    let pts = 0;
    if (p.age <= 29 && p.ovr < p.pot) {
      const gap = p.pot - p.ovr;
      const ageF = p.age <= 20 ? 1.3 : p.age <= 23 ? 1 : p.age <= 26 ? 0.6 : 0.3;
      pts = gap * 0.018 * ageF * fac * intF * playF;
    }
    if (p.age >= 31) pts -= (p.age - 29) * 0.012 * (intensity === 2 ? 1.2 : 1);
    p._dev = (p._dev || 0) + pts * 3.2;
    while (p._dev >= 1 || p._dev <= -1) {
      const sign = p._dev > 0 ? 1 : -1;
      p._dev -= sign;
      const k = pickAttr(p, focus, rng, sign < 0);
      p.attr[k] = clamp(p.attr[k] + sign, 10, 99);
    }
    W.refreshPlayer(p);
  }
  const FOCUS = {
    bal: null,
    atk: ['sho', 'dri', 'pac'],
    def: ['def', 'phy'],
    tec: ['pas', 'dri'],
    phy: ['pac', 'phy'],
  };
  function pickAttr(p, focus, rng, decline) {
    if (decline) return rng.pick(['pac', 'pac', 'phy', 'dri', p.pos === 'GK' ? 'gk' : 'def']);
    if (p.pos === 'GK') return rng.chance(0.75) ? 'gk' : rng.pick(['pas', 'phy']);
    const pool = FOCUS[focus];
    if (pool && rng.chance(0.65)) return rng.pick(pool);
    const w = { DF: ['def', 'def', 'phy', 'pac', 'pas'], MF: ['pas', 'pas', 'dri', 'def', 'sho', 'phy'], FW: ['sho', 'sho', 'dri', 'pac', 'phy'] }[p.pos];
    return rng.pick(w);
  }

  // ── 이적 ───────────────────────────────────────────────────
  function aiTransfers(G, rng) {
    const n = rng.int(1, 3);
    for (let i = 0; i < n; i++) {
      const buyer = rng.pick(G.teams.filter((t) => t.id !== G.user.teamId && t.squad.length < 28));
      if (!buyer) return;
      const pos = rng.pick(['GK', 'DF', 'MF', 'FW']);
      const mine = buyer.squad.map((id) => G.players[id]).filter((p) => p.pos === pos).sort((a, b) => b.ovr - a.ovr);
      const need = mine[pos === 'GK' ? 0 : 2] ? mine[pos === 'GK' ? 0 : 2].ovr : 55;
      const cands = Object.values(G.players).filter((p) => p.teamId != null && p.teamId !== buyer.id && p.teamId !== G.user.teamId && p.pos === pos && p.ovr > need + 1 && p.value < buyer.balance * 0.6);
      if (!cands.length) continue;
      const p = rng.pick(cands.slice(0, 40));
      const seller = team(G, p.teamId);
      if (seller.squad.length <= 20) continue;
      const fee = Math.round(p.value * rng.range(0.95, 1.3) / 100) * 100;
      movePlayer(G, p, seller, buyer, fee);
      news(G, 'transfer', `${p.name}, ${buyer.name} 이적`, `${seller.name}에서 ${josa(buyer.name, '으로/로')} 이적 (이적료 ${money(fee)})`);
    }
  }

  function movePlayer(G, p, from, to, fee) {
    if (from) {
      from.squad = from.squad.filter((id) => id !== p.id);
      from.lineup = from.lineup.map((id) => (id === p.id ? null : id));
      from.bench = from.bench.filter((id) => id !== p.id);
      from.balance += fee;
    } else {
      G.freeAgents = G.freeAgents.filter((id) => id !== p.id);
    }
    if (to) {
      to.squad.push(p.id);
      to.balance -= fee;
      p.teamId = to.id;
      p.num = 0;
      W.assignNumbers(G, to);
    } else {
      p.teamId = null;
      G.freeAgents.push(p.id);
    }
    p.listed = false;
    p.morale = clamp(p.morale + 8, 5, 100);
    G.transfers.unshift({ s: G.season, w: G.week, pid: p.id, from: from ? from.id : null, to: to ? to.id : null, fee });
    if (G.transfers.length > 80) G.transfers.pop();
    if (from) W.validateLineup(G, from);
    if (to) W.validateLineup(G, to);
  }

  // 사용자 선수에 대한 영입 제의
  function incomingOffers(G, rng) {
    const ut = userTeam(G);
    for (const id of ut.squad) {
      const p = G.players[id];
      const pr = p.listed ? 0.35 : 0.025 * (p.ovr > 72 ? 2 : 1);
      if (!rng.chance(pr)) continue;
      if (G.offers.some((o) => o.pid === id)) continue;
      const buyers = G.teams.filter((t) => t.id !== ut.id && t.balance > p.value * 0.8);
      if (!buyers.length) continue;
      const b = rng.pick(buyers);
      const amount = Math.round(p.value * (p.listed ? rng.range(0.75, 1.05) : rng.range(0.95, 1.35)) / 100) * 100;
      G.offers.push({ id: G.season * 1000 + G.week * 10 + G.offers.length, pid: id, from: b.id, amount, exp: G.week + 2 });
      news(G, 'offer', `${b.name}, ${p.name} 영입 제안`, `${josa(b.name, '이/가')} ${p.name}에게 ${money(amount)}를 제시했습니다. 이적 탭에서 응답하세요.`);
    }
  }

  function acceptOffer(G, offerId) {
    const o = G.offers.find((x) => x.id === offerId);
    if (!o) return { ok: false, msg: '제안이 만료되었습니다.' };
    const p = G.players[o.pid];
    const ut = userTeam(G);
    if (ut.squad.length <= 18) return { ok: false, msg: '선수단이 18명 이하라 더 팔 수 없어요.' };
    const buyer = team(G, o.from);
    movePlayer(G, p, ut, buyer, o.amount);
    addFin(G, `${p.name} 이적료`, o.amount);
    G.offers = G.offers.filter((x) => x.id !== offerId && x.pid !== o.pid);
    news(G, 'transfer', `${p.name}, ${buyer.name}로 떠나다`, `이적료 ${money(o.amount)}에 합의했습니다.`);
    return { ok: true, msg: `${josa(p.name, '을/를')} ${money(o.amount)}에 판매했습니다.` };
  }
  function rejectOffer(G, offerId) { G.offers = G.offers.filter((x) => x.id !== offerId); }

  // 영입 협상: 구단 간 이적료
  function askingPrice(G, p) {
    if (p.teamId == null) return 0;
    const t = team(G, p.teamId);
    const starter = t.lineup.includes(p.id);
    const f = (p.listed ? 0.9 : 1.15) + (starter ? 0.25 : 0) + (t.squad.length <= 20 ? 0.3 : 0);
    return Math.round(p.value * f / 100) * 100;
  }
  function wageDemand(G, p, toTeam) {
    const repGap = (p.teamId != null ? team(G, p.teamId).rep : 55) - toTeam.rep;
    const f = 1.1 + Math.max(0, repGap) * 0.03 + (p.teamId == null ? -0.05 : 0);
    return Math.round(W.wageOf(p) * f / 5) * 5;
  }
  function willingToJoin(G, p, toTeam) {
    const from = p.teamId != null ? team(G, p.teamId) : null;
    if (!from) return true;
    // 2부 팀이 1부 주전급을 데려오기 어려움
    if (toTeam.div > from.div && p.ovr > W.squadOvr(G, toTeam) + 6) return false;
    return toTeam.rep >= from.rep - 14;
  }

  function makeBid(G, pid, amount) {
    const p = G.players[pid];
    const ut = userTeam(G);
    if (!windowOpen(G) && p.teamId != null) return { status: 'closed', msg: '이적시장이 닫혀 있어요. 자유계약 선수만 영입할 수 있어요.' };
    if (amount > ut.balance) return { status: 'money', msg: '구단 잔고가 부족해요.' };
    if (ut.squad.length >= 30) return { status: 'full', msg: '선수단이 30명으로 가득 찼어요. 먼저 정리하세요.' };
    if (!willingToJoin(G, p, ut)) return { status: 'refuse', msg: `${josa(p.name, '은/는')} 우리 구단 이적에 관심이 없어요.` };
    const ask = askingPrice(G, p);
    const n = G.nego[pid] || (G.nego[pid] = { tries: 0 });
    n.tries++;
    if (n.tries > 3) return { status: 'refuse', msg: '상대 구단이 협상을 중단했어요. 다음 이적시장에 다시 시도하세요.' };
    if (amount >= ask) return { status: 'accept', fee: amount, wage: wageDemand(G, p, ut), msg: '이적료 합의! 이제 선수와 연봉 협상을 하세요.' };
    if (amount >= ask * 0.8) { n.counter = ask; return { status: 'counter', counter: ask, msg: `상대 구단이 ${money(ask)}를 역제안했어요.` }; }
    return { status: 'reject', msg: '제안이 너무 낮다며 거절했어요.' };
  }

  function completeSigning(G, pid, fee, wage, years) {
    const p = G.players[pid];
    const ut = userTeam(G);
    if (fee > ut.balance) return { ok: false, msg: '잔고가 부족해요.' };
    const from = p.teamId != null ? team(G, p.teamId) : null;
    movePlayer(G, p, from, ut, fee);
    p.wage = wage; p.contract = years;
    if (fee > 0) addFin(G, `${p.name} 영입`, -fee);
    delete G.nego[pid];
    if (fee > G.records.recordFee) { G.records.recordFee = fee; if (fee >= 300000) unlock(G, 'bigSpender'); }
    unlock(G, 'firstSigning');
    news(G, 'transfer', `오피셜: ${p.name} 영입`, `${from ? from.name + '에서 ' : '자유계약으로 '}${josa(p.name, '을/를')} 영입했습니다. 계약 ${years}년, 주급 ${money(wage)}.`);
    return { ok: true, msg: `${p.name} 영입 완료!` };
  }

  function releasePlayer(G, pid) {
    const p = G.players[pid];
    const ut = userTeam(G);
    if (ut.squad.length <= 18) return { ok: false, msg: '선수단이 18명 이하라 방출할 수 없어요.' };
    const comp = Math.round(p.wage * 16 * Math.max(1, p.contract) / 5) * 5;
    if (comp > ut.balance) return { ok: false, msg: `위약금 ${money(comp)}가 부족해요.` };
    movePlayer(G, p, ut, null, 0);
    ut.balance -= comp;
    addFin(G, `${p.name} 계약 해지`, -comp);
    return { ok: true, msg: `${p.name} 방출 (위약금 ${money(comp)})` };
  }

  function renewDemand(G, p) {
    const base = W.wageOf(p);
    const moraleF = p.morale < 40 ? 1.35 : p.morale < 60 ? 1.15 : 1;
    return Math.round(Math.max(p.wage, base) * moraleF * 1.05 / 5) * 5;
  }
  function renew(G, pid, years) {
    const p = G.players[pid];
    if (p.morale < 25) return { ok: false, msg: `${josa(p.name, '이/가')} 재계약을 거부했어요. 사기를 올려보세요.` };
    p.wage = renewDemand(G, p);
    p.contract = years;
    p.morale = clamp(p.morale + 6, 5, 100);
    return { ok: true, msg: `${p.name} 재계약 (${years}년, 주급 ${money(p.wage)})` };
  }

  // ── 시설 ───────────────────────────────────────────────────
  const FAC = {
    train: { name: '훈련장', desc: '선수 성장 속도 +12%/단계' },
    youth: { name: '유스 아카데미', desc: '유스 유망주 잠재력 상승' },
    stadium: { name: '경기장', desc: '수용 인원 +15%/단계' },
  };
  function facCost(t, k) { return 150000 * t.facilities[k] * (k === 'stadium' ? 2 : 1); }
  function upgradeFacility(G, k) {
    const t = userTeam(G);
    if (t.build) return { ok: false, msg: '이미 공사가 진행 중이에요.' };
    if (t.facilities[k] >= 5) return { ok: false, msg: '최고 단계예요.' };
    const cost = facCost(t, k);
    if (cost > t.balance) return { ok: false, msg: '잔고가 부족해요.' };
    t.balance -= cost;
    addFin(G, `${FAC[k].name} 공사`, -cost);
    t.build = { k, weeks: 6 + t.facilities[k] * 2 };
    return { ok: true, msg: `${FAC[k].name} 공사 시작 (${t.build.weeks}주)` };
  }

  // ── 시즌 종료 ───────────────────────────────────────────────
  function endSeason(G) {
    const rng = rngOf(G);
    const report = { year: G.year, champions: [], promoted: [], relegated: [], awards: {}, user: {} };
    const t1 = table(G, 0), t2 = table(G, 1);
    report.champions = [t1[0].id, t2[0].id];
    const relegated = t1.slice(-3).map((r) => r.id), promoted = t2.slice(0, 3).map((r) => r.id);
    report.promoted = promoted; report.relegated = relegated;
    // 상금
    t1.forEach((r, i) => { const prize = (16 - i) * 12000 + (i === 0 ? 150000 : 0); team(G, r.id).balance += prize; if (r.id === G.user.teamId) addFin(G, '리그 상금', prize); });
    t2.forEach((r, i) => { const prize = (16 - i) * 4000 + (i === 0 ? 40000 : 0); team(G, r.id).balance += prize; if (r.id === G.user.teamId) addFin(G, '리그 상금', prize); });
    // 개인상
    const all = Object.values(G.players).filter((p) => p.teamId != null);
    const top = (div, key) => all.filter((p) => team(G, p.teamId).div === div).sort((a, b) => b.season[key] - a.season[key] || b.ovr - a.ovr)[0];
    report.awards = {
      scorer: top(1, 'goals'), assist: top(1, 'assists'),
      mvp: all.filter((p) => team(G, p.teamId).div === 1 && p.season.apps >= 15).sort((a, b) => b.season.rsum / b.season.apps - a.season.rsum / a.season.apps)[0],
    };
    // 사용자 성적
    const ut = userTeam(G);
    const pos = position(G, ut.id);
    const goal = G.board.goal;
    report.user = { pos, div: ut.div, goal, met: pos <= goal.pos };
    const cupRound = G.cup.rounds.findIndex((rd) => !rd.some((m) => m.w === ut.id && true) && rd.some((m) => m.h === ut.id || m.a === ut.id));
    report.user.cup = G.cup.winner === ut.id ? '우승' : cupRound >= 0 ? CUP_NAMES[cupRound] + ' 탈락' : '-';
    G.user.history.push({ year: G.year, team: ut.name, div: ut.div, pos, cup: report.user.cup, w: t1.concat(t2).find((r) => r.id === ut.id) });
    if (pos === 1) { G.user.trophies.push({ year: G.year, name: ut.div === 1 ? '1부 리그 우승' : '2부 리그 우승' }); unlock(G, ut.div === 1 ? 'title' : 'title2'); }
    if (promoted.includes(ut.id)) unlock(G, 'promotion');
    // 구단주 평가
    const diff = goal.pos - pos;
    G.board.conf = clamp(G.board.conf + diff * 6 + (report.user.met ? 10 : -10), 0, 100);
    if (relegated.includes(ut.id)) G.board.conf = clamp(G.board.conf - 25, 0, 100);
    report.user.conf = G.board.conf;
    if (G.board.conf < 20) { G.user.sacked = true; report.user.sacked = true; }
    G.user.rep = clamp(G.user.rep + (report.user.met ? 6 : -4) + (pos === 1 ? 8 : 0), 0, 100);
    G.user.seasons++;
    if (G.user.seasons >= 5) unlock(G, 'legend');
    if (ut.squad.some((id) => G.players[id].youth && G.players[id].ovr >= 70)) unlock(G, 'youth');
    // 승강
    for (const id of relegated) { team(G, id).div = 2; }
    for (const id of promoted) { team(G, id).div = 1; }
    G.divs = [G.teams.filter((t) => t.div === 1).map((t) => t.id), G.teams.filter((t) => t.div === 2).map((t) => t.id)];
    // 평판 갱신
    t1.forEach((r, i) => { const t = team(G, r.id); t.rep = clamp(Math.round(t.rep * 0.8 + (82 - i * 1.2) * 0.2), 40, 95); });
    t2.forEach((r, i) => { const t = team(G, r.id); t.rep = clamp(Math.round(t.rep * 0.8 + (64 - i * 0.8) * 0.2), 35, 90); });
    // 노화, 은퇴, 계약
    report.retired = [];
    report.left = [];
    for (const p of Object.values(G.players)) {
      p.age++;
      if (p.teamId == null && !G.freeAgents.includes(p.id)) continue;
      const retire = p.age >= 37 || (p.age >= 34 && rng.chance(0.35 + (p.age - 34) * 0.2)) || (p.teamId == null && p.age >= 32 && rng.chance(0.5));
      if (retire) {
        if (p.teamId === ut.id) report.retired.push(p.name);
        removePlayer(G, p);
        continue;
      }
      if (p.teamId != null) {
        p.contract--;
        if (p.contract <= 0) {
          if (p.teamId === ut.id) { report.left.push(p.name); movePlayer(G, p, ut, null, 0); }
          else if (rng.chance(0.75)) { p.contract = rng.int(1, 3); p.wage = W.wageOf(p); }
          else movePlayer(G, p, team(G, p.teamId), null, 0);
        }
      }
      W.refreshPlayer(p);
    }
    // 유스 영입 + 선수단 보충
    report.youth = [];
    for (const t of G.teams) {
      const n = t.id === ut.id ? 3 : rng.int(1, 3);
      for (let i = 0; i < n; i++) {
        const pos = rng.pick(['GK', 'DF', 'DF', 'MF', 'MF', 'FW', 'FW']);
        const p = W.createPlayer(G, rng, pos, rng.int(42, 54), rng.int(16, 18));
        p.pot = clamp(p.ovr + rng.int(14, 26) + t.facilities.youth * 3, p.ovr, 95);
        p.contract = 3; p.wage = 30; W.refreshPlayer(p);
        p.teamId = t.id; t.squad.push(p.id);
        if (t.id === ut.id) { report.youth.push(p); p.youth = true; }
      }
      while (t.squad.length < 22 && t.id !== ut.id) {
        const fa = G.freeAgents.map((id) => G.players[id]).sort((a, b) => b.ovr - a.ovr)[0];
        if (fa) movePlayer(G, fa, null, t, 0);
        else { const p = W.createPlayer(G, rng, rng.pick(['DF', 'MF', 'FW']), t.strength - 6, rng.int(20, 28)); p.teamId = t.id; t.squad.push(p.id); }
      }
      while (t.squad.length > 30 && t.id !== ut.id) {
        const worst = t.squad.map((id) => G.players[id]).sort((a, b) => a.ovr - b.ovr)[0];
        movePlayer(G, worst, t, null, 0);
      }
      W.assignNumbers(G, t);
    }
    // 자유계약 풀 갱신
    for (let i = 0; i < 12; i++) {
      const p = W.createPlayer(G, rng, rng.pick(['GK', 'DF', 'MF', 'FW']), rng.int(50, 68), rng.int(20, 33));
      G.freeAgents.push(p.id);
    }
    G.freeAgents = G.freeAgents.filter((id) => G.players[id]).slice(-60);
    const keep = new Set(G.freeAgents);
    for (const id in G.players) { const p = G.players[id]; if (p.teamId == null && !keep.has(p.id)) delete G.players[id]; }
    G.offers = []; G.nego = {};
    G.year++; G.season++;
    saveRng(G, rng);
    report.newGoal = null;
    if (!G.user.sacked) {
      setupSeason(G);
      report.newGoal = G.board.goal;
      news(G, 'board', `${G.year} 시즌 개막`, `구단주의 목표: ${G.board.goal.text}. 여름 이적시장이 열렸습니다.`);
    }
    G.lastReport = report;
    return report;
  }

  function removePlayer(G, p) {
    if (p.teamId != null) {
      const t = team(G, p.teamId);
      t.squad = t.squad.filter((id) => id !== p.id);
      t.lineup = t.lineup.map((id) => (id === p.id ? null : id));
      t.bench = t.bench.filter((id) => id !== p.id);
    }
    G.freeAgents = G.freeAgents.filter((id) => id !== p.id);
    delete G.players[p.id];
  }

  // 경질 후 새 구단 제의
  function jobOffers(G) {
    const cur = G.user.teamId;
    const rep = G.user.rep;
    return G.teams.filter((t) => t.id !== cur && t.rep <= 52 + rep * 0.35).sort((a, b) => b.rep - a.rep).slice(0, 3).map((t) => t.id);
  }
  function takeJob(G, teamId) {
    G.user.teamId = teamId;
    G.user.sacked = false;
    G.board.conf = 60;
    if (G.week >= G.calendar.length || !G.fixtures) setupSeason(G);
    G.board.goal = boardGoal(G);
    news(G, 'board', `${team(G, teamId).name} 부임`, `${G.user.name} 감독이 ${team(G, teamId).name}의 지휘봉을 잡았습니다.`);
  }

  // ── 기자회견 ───────────────────────────────────────────────
  function pressQuestions(G) {
    const lm = G.lastMatch;
    if (!lm) return null;
    const opp = team(G, lm.opp);
    if (lm.r === 'W') return { q: `${opp.name}전 승리 소감은?`, a: [
      { t: '선수들이 모든 걸 쏟아냈습니다. 그들의 승리예요.', m: 4, c: 0 },
      { t: '전술 준비가 완벽하게 맞아떨어졌습니다.', m: 1, c: 2 },
      { t: '아직 부족합니다. 더 잘할 수 있어요.', m: -1, c: 1 }] };
    if (lm.r === 'L') return { q: `${opp.name}전 패배, 원인은 무엇이라 보나요?`, a: [
      { t: '제 책임입니다. 선수들을 탓할 생각 없습니다.', m: 3, c: -1 },
      { t: '몇몇 선수의 집중력이 아쉬웠습니다.', m: -4, c: 1 },
      { t: '심판 판정에 의문이 남습니다.', m: 1, c: -2 }] };
    return { q: `${opp.name}전 무승부, 만족하나요?`, a: [
      { t: '승점 1점도 소중합니다.', m: 2, c: 0 },
      { t: '이겨야 했던 경기입니다.', m: -2, c: 1 },
      { t: '경기력은 좋았으니 결과는 따라올 겁니다.', m: 1, c: 0 }] };
  }
  function answerPress(G, i) {
    const pq = pressQuestions(G);
    if (!pq || G.lastMatch.answered) return;
    const a = pq.a[i];
    for (const id of userTeam(G).squad) { const p = G.players[id]; p.morale = clamp(p.morale + a.m, 5, 100); }
    G.board.conf = clamp(G.board.conf + a.c, 0, 100);
    G.lastMatch.answered = true;
    G.lastMatch.answer = a.t;
  }

  // ── 소식, 업적 ─────────────────────────────────────────────
  function news(G, tag, title, body) {
    G.news.unshift({ s: G.season, w: G.week, tag, title, body });
    if (G.news.length > 80) G.news.pop();
  }

  const ACH = {
    firstWin: ['첫 승', '감독 커리어 첫 승리'],
    firstSigning: ['첫 영입', '첫 선수를 영입'],
    unbeaten10: ['무패 행진', '10경기 연속 무패'],
    thrash: ['대승', '4골 차 이상 승리'],
    giant: ['자이언트 킬링', '전력이 훨씬 강한 팀을 꺾음'],
    cup: ['컵 위너', '코리아 컵 우승'],
    title: ['챔피언', '1부 리그 우승'],
    title2: ['2부 챔피언', '2부 리그 우승'],
    promotion: ['승격', '1부 리그 승격'],
    bigSpender: ['큰손', '30억 이상 이적료로 영입'],
    youth: ['유스 키우기', '유스 출신 선수가 OVR 70 달성'],
    legend: ['장기 집권', '5시즌 연속 지휘'],
  };
  function unlock(G, k) {
    if (G.ach[k]) return;
    G.ach[k] = { s: G.season, w: G.week };
    news(G, 'ach', `업적 달성: ${ACH[k][0]}`, ACH[k][1]);
    G.newAch = (G.newAch || []).concat(k);
  }

  KM.Season = {
    newGame, setupSeason, userTeam, team, table, position, currentEvent, userFixture, windowOpen,
    createMatch, playWeek, endSeason, quickSim, buildSide,
    makeBid, completeSigning, askingPrice, wageDemand, willingToJoin, acceptOffer, rejectOffer, releasePlayer,
    renew, renewDemand, upgradeFacility, facCost, FAC, jobOffers, takeJob,
    pressQuestions, answerPress, unlock, ACH, CUP_NAMES, news, strengthRank,
  };
})(globalThis.KM || (globalThis.KM = {}));
