// 커리어 진행: 6개 리그 일정, 결과 반영, 이적, 재정, 훈련, 시즌 종료
// 금액 단위: 천 유로(k€)
(function (KM) {
  'use strict';
  const { clamp, RNG, money, josa } = KM;
  const D = KM.DATA, W = KM.World;

  const CUP_NAMES = ['1라운드', '32강', '16강', '8강', '준결승', '결승'];

  // ── 유럽 대항전 (챔피언스리그 · 유로파리그) ─────────────────
  // 리그별 출전권: 챔스 16팀, 유로파 16팀. 조별리그(4개 조, 6경기) → 8강·4강(홈 앤드 어웨이) → 결승(단판)
  const EURO = [
    { key: 'UCL', name: 'UEFA 챔피언스리그', short: '챔스', quota: { GB1: 4, ES1: 4, IT1: 3, L1: 3, FR1: 2 },
      prize: { join: 18000, win: 2100, draw: 700, qf: 10000, sf: 12000, f: 15000, champ: 20000 } },
    { key: 'UEL', name: 'UEFA 유로파리그', short: '유로파', quota: { GB1: 3, ES1: 3, IT1: 3, L1: 3, FR1: 4 },
      prize: { join: 4000, win: 600, draw: 200, qf: 2000, sf: 3000, f: 4500, champ: 8000 } },
  ];
  const EURO_ROUNDS = ['조별리그 1차전', '조별리그 2차전', '조별리그 3차전', '조별리그 4차전', '조별리그 5차전', '조별리그 6차전', '8강 1차전', '8강 2차전', '4강 1차전', '4강 2차전', '결승'];
  const EURO_AT = [0.1, 0.16, 0.22, 0.3, 0.36, 0.42, 0.58, 0.63, 0.74, 0.79, 0.94]; // 리그 일정 진행률 기준 위치
  const GROUP_MD = [[[0, 1], [2, 3]], [[0, 2], [3, 1]], [[3, 0], [1, 2]], [[1, 0], [3, 2]], [[2, 0], [1, 3]], [[0, 3], [2, 1]]];
  // 출전 구단: 지난 시즌 순위(첫 시즌은 전력 순)
  function euroEntrants(G, ranked) {
    const out = {};
    for (const c of EURO) out[c.key] = [];
    G.leagues.forEach((lg, li) => {
      const order = ranked ? ranked[li] : lg.teams.slice().sort((a, b) => W.squadOvr(G, team(G, b)) - W.squadOvr(G, team(G, a)) || team(G, b).rep - team(G, a).rep);
      if (!order) return;
      let at = 0;
      for (const c of EURO) { const q = c.quota[lg.code] || 0; out[c.key].push(...order.slice(at, at + q)); at += q; }
    });
    return out;
  }
  function setupEuro(G, rng) {
    const ent = G.euroNext || euroEntrants(G, null);
    G.euroNext = null;
    G.euro = { comps: EURO.map((c) => {
      const ids = (ent[c.key] || []).filter((id) => G.teams[id]).slice(0, 16);
      if (ids.length < 16) return null;
      // 포트 추첨: 전력순으로 4개 포트, 같은 리그는 가능하면 다른 조
      const sorted = ids.slice().sort((a, b) => W.squadOvr(G, team(G, b)) - W.squadOvr(G, team(G, a)));
      const groups = [[], [], [], []];
      for (let pot = 0; pot < 4; pot++) {
        const potIds = rng.shuffle(sorted.slice(pot * 4, pot * 4 + 4));
        const free = [0, 1, 2, 3];
        for (const id of potIds) {
          const lgId = team(G, id).league;
          let gi = free.find((g) => !groups[g].some((x) => team(G, x).league === lgId));
          if (gi == null) gi = free[0];
          groups[gi].push(id); free.splice(free.indexOf(gi), 1);
        }
      }
      const rounds = GROUP_MD.map((md) => groups.flatMap((g, gi) => md.map(([a, b]) => ({ h: g[a], a: g[b], hs: null, as: null, g: gi }))));
      if (ids.includes(G.user.teamId)) news(G, 'cup', `${c.name} 출전`, `${c.name} 조별리그 ${'ABCD'[groups.findIndex((g) => g.includes(G.user.teamId))]}조에 배정됐습니다. 첫 경기 때 출전 상금 ${money(c.prize.join)}을 받아요.`);
      return { key: c.key, name: c.name, short: c.short, groups, rounds, winner: null };
    }).filter(Boolean) };
  }
  function euroGroupTable(comp, gi) {
    const rows = {};
    for (const id of comp.groups[gi]) rows[id] = { id, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 };
    for (let r = 0; r < 6; r++) for (const m of comp.rounds[r] || []) {
      if (m.g !== gi || m.hs == null) continue;
      const h = rows[m.h], a = rows[m.a];
      h.p++; a.p++; h.gf += m.hs; h.ga += m.as; a.gf += m.as; a.ga += m.hs;
      if (m.hs > m.as) { h.w++; a.l++; h.pts += 3; } else if (m.hs < m.as) { a.w++; h.l++; a.pts += 3; } else { h.d++; a.d++; h.pts++; a.pts++; }
    }
    return Object.values(rows).sort((x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf);
  }
  function euroCfg(key) { return EURO.find((c) => c.key === key); }
  // 라운드가 끝나면 다음 라운드 대진을 만든다
  function advanceEuro(G, r) {
    for (const comp of G.euro.comps) {
      const P = euroCfg(comp.key).prize;
      const pay = (id, amt, label) => { const t = team(G, id); t.balance += amt; if (id === G.user.teamId) addFin(G, '상금', amt); };
      if (r === 0) for (const g of comp.groups) for (const id of g) pay(id, P.join);
      if (r < 6) for (const m of comp.rounds[r]) {
        if (m.hs > m.as) pay(m.h, P.win); else if (m.hs < m.as) pay(m.a, P.win); else { pay(m.h, P.draw); pay(m.a, P.draw); }
      }
      if (r === 5) {
        const tb = [0, 1, 2, 3].map((gi) => euroGroupTable(comp, gi));
        const W1 = tb.map((t) => t[0].id), R2 = tb.map((t) => t[1].id);
        // 8강: 조 1위 vs 다른 조 2위, 1차전은 2위 팀 홈
        const pairs = [[W1[0], R2[1]], [W1[1], R2[0]], [W1[2], R2[3]], [W1[3], R2[2]]];
        comp.rounds[6] = pairs.map(([w, ru], i) => ({ h: ru, a: w, hs: null, as: null, tie: i }));
        for (const id of W1.concat(R2)) pay(id, P.qf);
        const uid = G.user.teamId;
        if (comp.groups.some((g) => g.includes(uid))) {
          const ok = W1.includes(uid) || R2.includes(uid);
          news(G, 'cup', ok ? `${comp.name} 8강 진출!` : `${comp.name} 조별리그 탈락`, ok ? `조 ${W1.includes(uid) ? '1위' : '2위'}로 토너먼트에 올랐습니다. 상금 ${money(P.qf)}.` : '아쉽게 조 3위 이하로 대회를 마쳤습니다.');
        }
      }
      if (r === 6) comp.rounds[7] = comp.rounds[6].map((m) => ({ h: m.a, a: m.h, hs: null, as: null, tie: m.tie, l1: [m.hs, m.as] }));
      if (r === 7) {
        const w = comp.rounds[7].map((m) => m.w);
        for (const id of w) pay(id, P.sf);
        comp.rounds[8] = [{ h: w[1], a: w[0], hs: null, as: null, tie: 0 }, { h: w[3], a: w[2], hs: null, as: null, tie: 1 }];
      }
      if (r === 8) comp.rounds[9] = comp.rounds[8].map((m) => ({ h: m.a, a: m.h, hs: null, as: null, tie: m.tie, l1: [m.hs, m.as] }));
      if (r === 9) {
        const w = comp.rounds[9].map((m) => m.w);
        for (const id of w) pay(id, P.f);
        comp.rounds[10] = [{ h: w[0], a: w[1], hs: null, as: null, fin: true }];
      }
      if (r === 10) {
        const m = comp.rounds[10][0];
        comp.winner = m.w;
        pay(m.w, P.champ);
        const t = team(G, m.w);
        t.rep = clamp(t.rep + (comp.key === 'UCL' ? 3 : 1), 35, 96);
        news(G, 'cup', `${t.name}, ${comp.name} 우승!`, `${josa(t.name, '이/가')} 결승에서 ${team(G, m.w === m.h ? m.a : m.h).name}을(를) 꺾고 유럽 정상에 올랐습니다.`);
        if (m.w === G.user.teamId) { G.user.trophies.push({ year: G.year, name: comp.name }); unlock(G, comp.key === 'UCL' ? 'ucl' : 'uel'); G.board.conf = clamp(G.board.conf + (comp.key === 'UCL' ? 25 : 12), 0, 100); }
      }
    }
  }
  function euroUserComp(G) {
    if (!G.euro) return null;
    return G.euro.comps.find((c) => c.groups.some((g) => g.includes(G.user.teamId))) || null;
  }
  function euroStatus(G, comp) {
    // 사용자 구단의 이번 시즌 유럽 대항전 성적 문자열
    const uid = G.user.teamId;
    if (!comp) return '-';
    if (comp.winner === uid) return '우승';
    for (let r = 10; r >= 6; r--) {
      const rd = comp.rounds[r]; if (!rd) continue;
      const m = rd.find((x) => x.h === uid || x.a === uid);
      if (m) return m.w == null ? EURO_ROUNDS[r].replace(/ \d차전/, '') + ' 진행 중' : m.w === uid ? (r === 10 ? '우승' : EURO_ROUNDS[r].replace(/ \d차전/, '') + ' 통과') : EURO_ROUNDS[r].replace(/ \d차전/, '') + ' 탈락';
    }
    return comp.rounds[5] && comp.rounds[5][0].hs != null ? '조별리그 탈락' : '조별리그';
  }

  function rngOf(G) { const r = new RNG(1); r.s = G.rngS; return r; }
  function saveRng(G, r) { G.rngS = r.s; }

  // ── 새 게임 ─────────────────────────────────────────────────
  // 실제 데이터(KM.REAL)로 리그와 구단을 만든다
  function createWorld(seed) {
    const R = KM.REAL;
    const G = {
      v: 2, seed, rngS: seed >>> 0 || 1, year: R.season, season: 1, week: 0,
      players: {}, nextPid: 900000000, teams: [], leagues: [],
      user: { teamId: 0, name: '감독', rep: 45, sacked: false, history: [], trophies: [], seasons: 0, wins: 0, draws: 0, losses: 0 },
      news: [], offers: [], nego: {}, freeAgents: [], records: { recordFee: 0 }, short: [],
      ach: {}, training: { focus: 'bal', intensity: 1 }, settings: { speed: 1 },
      board: { conf: 65, goal: null },
      fin: { log: [], cat: {} },
      unbeaten: 0, lastMatch: null, transfers: [], dataDate: R.fetched,
    };
    R.leagues.forEach((lg, li) => {
      const league = { code: lg.code, name: lg.name, teams: [] };
      for (const c of lg.clubs) {
        const t = W.createRealTeam(G, c, li, lg.code, R.colors || {}, R.season);
        G.teams.push(t);
        league.teams.push(t.id);
      }
      G.leagues.push(league);
    });
    const rng = rngOf(G);
    for (let i = 0; i < 40; i++) {
      const lg = rng.int(0, G.leagues.length - 1);
      const p = W.createPlayer(G, rng, rng.pick(['GK', 'CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'LW', 'RW', 'ST']), rng.int(55, 70), rng.int(20, 32), namePool(G, lg));
      p.contract = 0;
      G.freeAgents.push(p.id);
    }
    saveRng(G, rng);
    return G;
  }

  function startCareer(G, teamId, name) {
    G.user.teamId = teamId;
    G.user.name = name || '감독';
    G.news = [];
    setupSeason(G);
    const t = userTeam(G);
    news(G, 'board', `${G.user.name} 감독 부임`, `${josa(t.name, '이/가')} ${G.user.name} 감독을 새 사령탑으로 선임했습니다. 구단주의 목표는 '${G.board.goal.text}'입니다.`);
  }

  // 같은 리그 선수들의 이름 조각으로 가상 선수 이름 풀을 만든다
  function namePool(G, li) {
    G._pools = G._pools || {};
    if (G._pools[li]) return G._pools[li];
    const lg = G.leagues[li];
    if (lg.code === 'RSK1') return (G._pools[li] = { korean: true, nat: '대한민국' });
    const first = [], last = [];
    for (const tid of lg.teams) for (const id of G.teams[tid].squad) {
      const p = G.players[id];
      if (!p || p.gen) continue;
      const parts = p.name.split(' ');
      if (parts.length >= 2) { first.push(parts[0]); last.push(parts[parts.length - 1]); }
    }
    return (G._pools[li] = { first, last });
  }

  function userTeam(G) { return G.teams[G.user.teamId]; }
  function team(G, id) { return G.teams[id]; }
  function leagueOf(G, t) { return G.leagues[t.league]; }

  // ── 시즌 설정 ───────────────────────────────────────────────
  function roundRobin(ids, rng) {
    const list = rng.shuffle(ids.slice());
    if (list.length % 2) list.push(null);
    const n = list.length;
    const rounds = [];
    for (let r = 0; r < n - 1; r++) {
      const games = [];
      for (let i = 0; i < n / 2; i++) {
        const a = list[i], b = list[n - 1 - i];
        if (a == null || b == null) continue;
        games.push(r % 2 === 0 ? { h: a, a: b } : { h: b, a: a });
      }
      rounds.push(games);
      list.splice(1, 0, list.pop());
    }
    const second = rounds.map((g) => g.map((m) => ({ h: m.a, a: m.h })));
    return rounds.concat(second).map((g) => g.map((m) => Object.assign(m, { hs: null, as: null })));
  }

  function setupSeason(G) {
    const rng = rngOf(G);
    for (const lg of G.leagues) { lg.fixtures = roundRobin(lg.teams, rng); lg.played = 0; }
    const ut = userTeam(G);
    const ul = leagueOf(G, ut);
    // 컵: 사용자 리그 구단으로 토너먼트 (빈 자리는 부전승)
    const ids = rng.shuffle(ul.teams.slice());
    let size = 2; while (size < ids.length) size *= 2;
    const slots = ids.concat(new Array(size - ids.length).fill(null));
    const seeded = [];
    for (let i = 0; i < size / 2; i++) seeded.push(slots[i], slots[size - 1 - i]);
    G.cup = { name: D.LEAGUE_ECON[ul.code].cupName, rounds: [pairUp(seeded)], winner: null, first: CUP_NAMES.length - Math.log2(size) };
    // 일정: 사용자 리그 라운드 사이에 컵 라운드를 고르게 배치
    const R = ul.fixtures.length;
    const cupRounds = Math.log2(size);
    const cupAfter = [];
    for (let c = 0; c < cupRounds; c++) cupAfter.push(Math.round(((c + 1) * R) / (cupRounds + 1)) - 1);
    setupEuro(G, rng);
    const euroAfter = [];
    if (G.euro.comps.length) { let prev = -1; for (const f of EURO_AT) { prev = Math.min(R - 1, Math.max(prev + 1, Math.round(f * R) - 1)); euroAfter.push(prev); } }
    G.calendar = [];
    let c = 0, e = 0;
    for (let r = 0; r < R; r++) {
      G.calendar.push({ k: 'L', r });
      while (e < euroAfter.length && euroAfter[e] === r) { G.calendar.push({ k: 'E', r: e }); e++; }
      while (c < cupAfter.length && cupAfter[c] === r) { G.calendar.push({ k: 'C', r: c }); c++; }
    }
    assignDays(G);
    G.week = 0;
    G.day = 0;
    for (const t of G.teams) {
      t.form = []; W.validateLineup(G, t);
      t.wage0 = W.wageBill(G, t);
    }
    for (const id in G.players) { const p = G.players[id]; p.season = W.blankStats(); p.ratings = []; p.yAcc = 0; }
    G.board.goal = boardGoal(G);
    G.board.conf = clamp(G.board.conf, 45, 80);
    G.fin.cat = {};
    const len = G.calendar.length;
    G.window = { mid0: Math.round(len * 0.5), mid1: Math.round(len * 0.5) + 3 };
    saveRng(G, rng);
  }

  // 경기 날짜: 시즌은 8월 첫째 주 월요일(0일)에 시작. 리그는 토요일, 컵은 그다음 수요일
  function assignDays(G) {
    let lastL = 0;
    for (const ev of G.calendar) {
      if (ev.k === 'L') { ev.day = ev.r * 7 + 5; lastL = ev.day; }
      else if (ev.k === 'E') ev.day = lastL + 3; // 유럽 대항전: 화요일
      else ev.day = lastL + 4;
    }
  }
  function seasonStart(G) {
    const d = new Date(G.year, 7, 1);
    while (d.getDay() !== 1) d.setDate(d.getDate() + 1); // 8월 첫 월요일
    return d;
  }
  function dateOf(G, day) {
    const d = seasonStart(G);
    d.setDate(d.getDate() + day);
    return d;
  }
  function dateText(G, day, withWeekday) {
    const d = dateOf(G, day);
    return `${d.getMonth() + 1}월 ${d.getDate()}일${withWeekday === false ? '' : ` (${'일월화수목금토'[d.getDay()]})`}`;
  }
  // 예전 세이브: 날짜가 없으면 만든다
  function ensureDays(G) {
    if (!G.calendar || !G.calendar.length) return;
    if (G.calendar[0].day == null) assignDays(G);
    if (G.day == null) {
      const ev = G.calendar[Math.min(G.week, G.calendar.length - 1)];
      G.day = G.week >= G.calendar.length ? ev.day + 1 : ev.day;
    }
  }

  function pairUp(ids) {
    const out = [];
    for (let i = 0; i < ids.length; i += 2) out.push({ h: ids[i], a: ids[i + 1], hs: null, as: null, w: null, pens: null });
    return out;
  }
  function cupRoundName(G, r) { return CUP_NAMES[G.cup.first + r] || `${r + 1}라운드`; }

  function strengthRank(G, teamId) {
    const t = team(G, teamId);
    const ids = leagueOf(G, t).teams.slice().sort((a, b) => W.squadOvr(G, team(G, b)) - W.squadOvr(G, team(G, a)) || team(G, b).rep - team(G, a).rep);
    return ids.indexOf(teamId) + 1;
  }

  function boardGoal(G) {
    const t = userTeam(G);
    const n = leagueOf(G, t).teams.length;
    const rank = strengthRank(G, t.id);
    if (rank <= 2) return { code: 'title', pos: 1, text: '리그 우승' };
    if (rank <= 5) return { code: 'top4', pos: 4, text: '4위 이내' };
    const half = Math.ceil(n / 2);
    if (rank <= half + 1) return { code: 'half', pos: half, text: `상위권(${half}위 이내)` };
    return { code: 'survive', pos: n - 3, text: `강등권 탈출(${n - 3}위 이내)` };
  }

  // ── 순위표 ─────────────────────────────────────────────────
  function table(G, li) {
    const lg = G.leagues[li];
    const rows = {};
    for (const id of lg.teams) rows[id] = { id, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 };
    for (const round of lg.fixtures) {
      for (const m of round) {
        if (m.hs == null) continue;
        const h = rows[m.h], a = rows[m.a];
        h.p++; a.p++; h.gf += m.hs; h.ga += m.as; a.gf += m.as; a.ga += m.hs;
        if (m.hs > m.as) { h.w++; a.l++; h.pts += 3; }
        else if (m.hs < m.as) { a.w++; h.l++; a.pts += 3; }
        else { h.d++; a.d++; h.pts++; a.pts++; }
      }
    }
    return Object.values(rows).sort((x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf || x.id - y.id);
  }
  function position(G, teamId) {
    return table(G, team(G, teamId).league).findIndex((r) => r.id === teamId) + 1;
  }

  // ── 이번 주 일정 ───────────────────────────────────────────
  function currentEvent(G) { return G.calendar[G.week] || null; }

  function userFixture(G) {
    const ev = currentEvent(G);
    if (!ev) return null;
    const uid = G.user.teamId;
    const ul = leagueOf(G, userTeam(G));
    if (ev.k === 'L') {
      const m = ul.fixtures[ev.r].find((x) => x.h === uid || x.a === uid);
      return m ? { ev, m, comp: '리그', label: `${ul.name} ${ev.r + 1}라운드` } : null;
    }
    if (ev.k === 'E') {
      if (!G.euro) return null;
      for (const comp of G.euro.comps) {
        const m = (comp.rounds[ev.r] || []).find((x) => x.h === uid || x.a === uid);
        if (m) return { ev, m, comp: comp.short, euro: comp, label: `${comp.name} ${EURO_ROUNDS[ev.r]}` };
      }
      return null;
    }
    const round = G.cup.rounds[ev.r];
    if (!round) return null;
    const m = round.find((x) => (x.h === uid || x.a === uid) && x.h != null && x.a != null);
    return m ? { ev, m, comp: '컵', label: `${G.cup.name} ${cupRoundName(G, ev.r)}` } : null;
  }

  function windowOpen(G) {
    const w = G.week;
    return w < G.calendar.length && (w < 4 || (w >= G.window.mid0 && w <= G.window.mid1));
  }

  // ── 엔진용 팀 구성 ─────────────────────────────────────────
  function buildSide(G, t) {
    D.normTactics(t.tactics);
    W.validateLineup(G, t);
    const slots = D.FORMATIONS[t.tactics.formation];
    const roles = W.validateRoles(t);
    const opF = t.tactics.formationOP && D.FORMATIONS[t.tactics.formationOP] ? t.tactics.formationOP : '';
    const op = opF ? D.shapeMap(slots, D.FORMATIONS[opF]) : null;
    return {
      team: t,
      tactics: Object.assign({}, t.tactics),
      baseMent: t.tactics.mentality,
      fam: t.id !== G.user.teamId ? 90 : opF ? (W.famOf(t, t.tactics.formation) + W.famOf(t, opF)) / 2 : W.famOf(t, t.tactics.formation),
      starters: t.lineup.map((id, i) => ({ p: G.players[id], role: slots[i][0], slot: slots[i], r: roles[i], op: op ? op[i] : null })),
      bench: t.bench.map((id) => G.players[id]),
    };
  }

  function createMatch(G, fx) {
    const h = team(G, fx.m.h), a = team(G, fx.m.a);
    const rng = rngOf(G);
    const seed = rng.int(1, 2e9);
    saveRng(G, rng);
    aiPrepare(G, h, a); aiPrepare(G, a, h);
    const user = fx.m.h === G.user.teamId ? 0 : 1;
    return new KM.Engine.Match(buildSide(G, h), buildSide(G, a), { seed, user });
  }

  // AI 구단: 상대와의 전력 차에 따라 전술 프리셋을 고른다
  function aiPrepare(G, t, opp) {
    D.normTactics(t.tactics);
    if (t.id === G.user.teamId) return;
    W.autoLineup(G, t);
    const key = aiPlan(G, t, opp);
    const preset = D.TACTIC_PRESETS.find((x) => x[0] === key);
    Object.assign(t.tactics, preset[3]);
    D.normTactics(t.tactics);
    // 수비 시 포메이션: 내려앉는 팀은 측면 미드필더까지 내려 두 줄 수비
    const f = t.tactics.formation;
    t.tactics.formationOP = key === 'bus' || key === 'counter' ? ({ '4-3-3': '4-1-4-1', '4-2-3-1': '4-4-1-1', '3-5-2': '5-3-2', '3-4-3': '5-4-1' }[f] || '') : key === 'gegen' && f === '4-2-3-1' ? '4-4-2' : '';
    W.autoRoles(G, t);
  }

  // ── 빠른 시뮬레이션 (AI 대 AI) ─────────────────────────────
  function quickSim(G, h, a, rng, knockout) {
    aiPrepare(G, h, a); aiPrepare(G, a, h);
    const rH = effRating(G, h), rA = effRating(G, a);
    const diff = rH - rA + 2.2;
    const lh = clamp(1.2 * Math.exp(0.056 * diff) * mentF(h) * (1.08 - (a.tactics.mentality - 2) * 0.04), 0.15, 5);
    const la = clamp(1.2 * Math.exp(-0.056 * diff) * mentF(a) * (1.08 - (h.tactics.mentality - 2) * 0.04), 0.15, 5);
    const hs = poisson(rng, lh), as = poisson(rng, la);
    const res = { hs, as, pens: null, players: [] };
    for (const [t, goals, conceded] of [[h, hs, as], [a, as, hs]]) {
      const slots = D.FORMATIONS[t.tactics.formation];
      const xi = t.lineup.map((id, i) => ({ p: G.players[id], role: slots[i][0] }));
      const subs = t.bench.slice(0, 3).map((id) => G.players[id]).filter(Boolean);
      const rec = new Map();
      xi.forEach((x) => rec.set(x.p.id, { p: x.p, role: x.role, mins: 90, goals: 0, ast: 0, yel: 0, red: false, inj: 0 }));
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
        if (r.role === 'GK' || ['CB', 'LB', 'RB'].includes(r.role)) rt += conceded === 0 ? 0.5 : -conceded * 0.2;
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

  function engineResult(G, match) {
    const res = { hs: match.score[0], as: match.score[1], pens: null, players: [], engine: true };
    const rated = match.ratings();
    res.an = match.analysis();
    for (const m of rated) {
      res.players.push({
        p: m.p, role: m.role, mins: m.mins, goals: m.s.goals, ast: m.s.ast,
        yel: m.yellow ? 1 : 0, red: !!m.red, inj: m.injured ? m.injWeeks : 0, rating: m.rating, endSt: m.st,
        cs: match.score[1 - m.side] === 0 && (m.grp === 'GK' || m.grp === 'DF') && m.mins >= 60,
      });
    }
    return res;
  }

  // ── 결과 반영 ───────────────────────────────────────────────
  function applyResult(G, fxm, res) {
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
      const r = gf > ga ? 'W' : gf < ga ? 'L' : 'D';
      t.form.push(r); if (t.form.length > 6) t.form.shift();
      if (tid === G.user.teamId) {
        const sq = W.squadOvr(G, t);
        for (const id of t.squad) {
          const p = G.players[id];
          if (!played.has(id) && p.ovr >= sq && p.inj <= 0) p.morale = clamp(p.morale - 1.5, 5, 100);
          p.morale = clamp(p.morale + (r === 'W' ? 2.5 : r === 'L' ? -2.5 : 0), 5, 100);
        }
      }
      t.fans = clamp(t.fans + (r === 'W' ? 1.2 : r === 'L' ? -1.2 : 0), 10, 100);
    }
  }

  // ── 한 주 진행 ─────────────────────────────────────────────
  function playWeek(G, userMatch) {
    const ev = currentEvent(G);
    if (!ev) return null;
    const rng = rngOf(G);
    const uid = G.user.teamId;
    const ut = userTeam(G);
    const summary = { ev, results: [], user: null };
    const games = [];
    if (ev.k === 'L') {
      const R = leagueOf(G, ut).fixtures.length;
      G.leagues.forEach((lg, li) => {
        // 리그마다 라운드 수가 달라도 같은 주에 시즌이 끝나도록 진행 속도를 맞춘다
        const target = li === ut.league ? ev.r + 1 : Math.round(((ev.r + 1) * lg.fixtures.length) / R);
        while (lg.played < target) { for (const m of lg.fixtures[lg.played]) games.push({ m, li }); lg.played++; }
      });
    } else if (ev.k === 'E') {
      for (const comp of (G.euro ? G.euro.comps : [])) for (const m of comp.rounds[ev.r] || []) games.push({ m, li: team(G, m.h).league, euro: comp, ko: ev.r >= 6 });
    } else {
      for (const m of G.cup.rounds[ev.r]) games.push({ m, li: ut.league, cup: true });
    }
    for (const g of games) {
      const m = g.m;
      if (g.cup && (m.h == null || m.a == null)) { m.w = m.h == null ? m.a : m.h; continue; }
      const isUser = m.h === uid || m.a === uid;
      let res;
      if (isUser && userMatch) {
        res = engineResult(G, userMatch);
        if (g.cup && res.hs === res.as) res.pens = shootout(rng);
      } else {
        res = quickSim(G, team(G, m.h), team(G, m.a), rng, !!g.cup || !!m.fin);
      }
      // 유럽 대항전 2차전: 합산 동점이면 승부차기
      if (g.euro && m.l1) {
        const aggH = res.hs + m.l1[1], aggA = res.as + m.l1[0];
        res.pens = aggH === aggA ? shootout(rng) : null;
        res.agg = [aggH, aggA];
      } else if (g.euro && m.fin && res.hs === res.as && !res.pens) res.pens = shootout(rng);
      else if (g.euro && !m.fin) res.pens = null;
      for (const tid of [m.h, m.a]) for (const id of team(G, tid).squad) { const p = G.players[id]; if (p.sus > 0 && !res.players.some((r) => r.p === p)) p.sus--; }
      applyResult(G, m, res);
      if (g.cup) m.w = res.hs > res.as ? m.h : res.hs < res.as ? m.a : (res.pens[0] > res.pens[1] ? m.h : m.a);
      if (g.euro && m.l1) { const [x, y] = res.agg; m.agg = res.agg; m.w = x > y ? m.h : x < y ? m.a : (res.pens[0] > res.pens[1] ? m.h : m.a); }
      if (g.euro && m.fin) m.w = res.hs > res.as ? m.h : res.hs < res.as ? m.a : (res.pens[0] > res.pens[1] ? m.h : m.a);
      const item = { m, li: g.li, res, cup: !!g.cup, euro: g.euro ? g.euro.key : null };
      summary.results.push(item);
      if (isUser) summary.user = item;
      gateIncome(G, team(G, m.h), !!g.cup || !!g.euro, rng);
    }
    if (ev.k === 'C') advanceCup(G, ev.r);
    if (ev.k === 'E') advanceEuro(G, ev.r);
    if (summary.user) afterUserMatch(G, summary.user, ev);
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
      news(G, 'cup', `${t.name}, ${G.cup.name} 우승!`, `${josa(t.name, '이/가')} 결승에서 승리하며 트로피를 들어 올렸습니다.`);
      if (t.id === G.user.teamId) { G.user.trophies.push({ year: G.year, name: G.cup.name }); unlock(G, 'cup'); G.board.conf = clamp(G.board.conf + 15, 0, 100); }
      return;
    }
    G.cup.rounds.push(pairUp(winners));
  }

  function afterUserMatch(G, item, ev) {
    const uid = G.user.teamId;
    const { m, res } = item;
    const home = m.h === uid;
    const gf = home ? res.hs : res.as, ga = home ? res.as : res.hs;
    const opp = team(G, home ? m.a : m.h);
    const r = gf > ga ? 'W' : gf < ga ? 'L' : 'D';
    if (r === 'W') G.user.wins++; else if (r === 'L') G.user.losses++; else G.user.draws++;
    const exp = W.teamRating(G, userTeam(G)) - W.teamRating(G, opp);
    const delta = r === 'W' ? 2.5 - exp * 0.05 : r === 'L' ? -2.2 - exp * 0.07 : -0.2 - exp * 0.04;
    G.board.conf = clamp(G.board.conf + delta, 0, 100);
    G.unbeaten = r === 'L' ? 0 : G.unbeaten + 1;
    if (r === 'W') unlock(G, 'firstWin');
    if (G.unbeaten >= 10) unlock(G, 'unbeaten10');
    if (gf - ga >= 4) unlock(G, 'thrash');
    if (r === 'W' && W.squadOvr(G, opp) - W.squadOvr(G, userTeam(G)) >= 5) unlock(G, 'giant');
    const scorers = res.players.filter((x) => x.goals > 0 && x.p.teamId === uid).map((x) => x.p.name + (x.goals > 1 ? ` ${x.goals}골` : '')).join(', ');
    const label = ev.k === 'L' ? `리그 ${ev.r + 1}R` : ev.k === 'E' ? `${(euroUserComp(G) || {}).short || '유럽'} ${EURO_ROUNDS[ev.r]}` : `${G.cup.name} ${cupRoundName(G, ev.r)}`;
    const word = r === 'W' ? '승리' : r === 'L' ? '패배' : '무승부';
    news(G, 'match', `[${label}] ${opp.name}전 ${gf}-${ga} ${word}`, scorers ? `득점: ${scorers}` : '득점 없이 경기를 마쳤습니다.');
    const best = res.players.slice().sort((a, b) => b.rating - a.rating)[0];
    G.lastMatch = { opp: opp.id, home, gf, ga, r, label, motm: best ? best.p.id : null, pens: res.pens, agg: res.agg ? (home ? res.agg : [res.agg[1], res.agg[0]]) : null };
    // 시즌 데이터: 경기별 득실과 xG (엔진 경기만)
    if (res.an) {
      const us = home ? 0 : 1;
      G.lastMatch.an = res.an; G.lastMatch.us = us;
      G.xgLog = G.xgLog || [];
      G.xgLog.push({ s: G.season, label, opp: opp.id, gf, ga, xf: Math.round(res.an.sides[us].st.xg * 100) / 100, xa: Math.round(res.an.sides[1 - us].st.xg * 100) / 100, poss: res.an.sides[us].poss, sh: res.an.sides[us].st.shots, sha: res.an.sides[1 - us].st.shots });
      if (G.xgLog.length > 120) G.xgLog.shift();
    }
    for (const x of res.players) {
      if (x.inj && x.p.teamId === uid) news(G, 'injury', `${x.p.name} 부상`, `${josa(x.p.name, '이/가')} 부상으로 약 ${x.inj}주간 결장합니다.`);
    }
  }

  function econ(t) { return D.LEAGUE_ECON[t.code] || D.LEAGUE_ECON.GB1; }

  function gateIncome(G, t, cup, rng) {
    const fill = clamp(0.5 + t.fans / 200 + (t.form.filter((f) => f === 'W').length - 2) * 0.03 + rng.gauss(0, 0.04), 0.3, 1);
    const cap = Math.round(t.cap * (1 + (t.facilities.stadium - 1) * 0.15));
    const att = Math.round(cap * fill);
    const inc = Math.round(att * econ(t).ticket * (cup ? 1.2 : 1));
    t.balance += inc;
    if (t.id === G.user.teamId) { addFin(G, '입장 수입', inc); G.lastAttendance = att; }
  }

  const CAT = { '입장 수입': '입장 수입', '중계권': '중계권', '스폰서·상품': '스폰서·상품', '선수 주급': '선수 주급', '상금': '상금' };
  function addFin(G, label, amount) {
    G.fin.log.unshift({ w: G.week, s: G.season, label, amount });
    if (G.fin.log.length > 60) G.fin.log.pop();
    const cat = CAT[label] || (amount >= 0 ? '이적 수입' : / 공사$/.test(label) ? '시설 투자' : / 영입$/.test(label) ? '이적 지출' : '기타 지출');
    G.fin.cat[cat] = (G.fin.cat[cat] || 0) + amount;
  }

  // ── 하루 진행 ───────────────────────────────────────────────
  // 오늘 일정이 남아 있으면(사용자 경기) 진행하지 않는다. 사용자 경기가 없는 일정은 자동으로 치른다.
  function nextEventDay(G) { const ev = currentEvent(G); return ev ? ev.day : null; }
  function canAdvance(G) {
    const ev = currentEvent(G);
    if (!ev) return false;
    return !(ev.day <= G.day && userFixture(G));
  }
  function advanceDay(G) {
    ensureDays(G);
    const out = { auto: [], log: [] };
    // 오늘 사용자 경기가 없는 일정(다른 구단 경기)이 남아 있으면 먼저 치른다
    let ev = currentEvent(G);
    while (ev && ev.day <= G.day && !userFixture(G)) { out.auto.push(playWeek(G, null)); ev = currentEvent(G); }
    if (!canAdvance(G)) return out;
    const rng = rngOf(G);
    G.day++;
    dailyTick(G, rng, out.log);
    if (G.day % 7 === 6) weeklyTick(G, rng);
    saveRng(G, rng);
    ev = currentEvent(G);
    while (ev && ev.day <= G.day && !userFixture(G)) { out.auto.push(playWeek(G, null)); ev = currentEvent(G); }
    return out;
  }

  function dailyTick(G, rng, log) {
    const uid = G.user.teamId;
    const dow = dateOf(G, G.day).getDay();
    const matchTomorrow = currentEvent(G) && currentEvent(G).day === G.day + 1;
    for (const t of G.teams) {
      const isUser = t.id === uid;
      // 경기 전날은 가벼운 회복 훈련
      const intensity = matchTomorrow ? 0 : isUser ? G.training.intensity : 1;
      const focus = isUser ? G.training.focus : 'bal';
      for (const id of t.squad) {
        const p = G.players[id];
        const before = isUser ? Object.assign({}, p.attr) : null;
        p.cond = Math.round(clamp(p.cond + [7, 5.5, 4][intensity] + p.attr.phy / 70, 0, 100));
        if (intensity === 2 && rng.chance(0.0007)) {
          p.inj = Math.max(p.inj, rng.int(1, 3));
          if (isUser) { news(G, 'injury', `${p.name} 훈련 중 부상`, `강도 높은 훈련 도중 부상을 입어 ${p.inj}주 결장합니다.`); log.push(`${p.name} 훈련 중 부상`); }
        }
        develop(G, p, t, rng, intensity, focus, 1 / 7);
        p.morale = clamp(p.morale + (70 - p.morale) * 0.006, 5, 100);
        if (before) for (const k in p.attr) if (p.attr[k] > before[k]) log.push(`${p.name} ${KM.World.ATTR_KO[k]} +${p.attr[k] - before[k]}`);
      }
    }
    // 전술 숙련도: 쓰는 포메이션은 매일 익숙해지고, 안 쓰는 포메이션은 서서히 잊는다
    const ut = userTeam(G);
    const cur = ut.tactics.formation, op = ut.tactics.formationOP;
    W.famOf(ut, cur);
    for (const f in D.FORMATIONS) {
      const v = W.famOf(ut, f);
      if (f === cur || f === op) ut.fam[f] = Math.min(100, v + (G.training.focus === 'tac' ? 2.4 : 0.9) * (f === cur ? 1 : 0.6));
      else ut.fam[f] = Math.max(35, v - 0.12);
    }
    // 어시스턴트 매니저의 상대 분석 보고서 (경기 이틀 전)
    const nev = currentEvent(G);
    if (nev && userFixture(G) && nev.day - G.day <= 2) sendReport(G);
    // 이적시장: 화·목에 AI 이적과 영입 제안
    if (windowOpen(G) && (dow === 2 || dow === 4)) { aiTransfers(G, rng); incomingOffers(G, rng); }
  }

  function weeklyTick(G, rng) {
    const uid = G.user.teamId;
    for (const t of G.teams) {
      const isUser = t.id === uid;
      for (const id of t.squad) { const p = G.players[id]; if (p.inj > 0) { p.inj--; if (p.inj === 0 && isUser) news(G, 'injury', `${p.name} 부상 복귀`, '훈련에 정상 합류했습니다.'); } }
      // 재정: 중계권은 리그 규모, 스폰서는 구단 규모(시즌 시작 시 주급 총액)에 비례
      const wages = Math.round(W.wageBill(G, t));
      const tv = Math.round(econ(t).tv * (400 + 10 * t.rep));
      const spons = Math.round((t.wage0 || wages) * 0.3 + t.fans * econ(t).tv * 6);
      t.balance += tv + spons - wages;
      if (isUser) { addFin(G, '중계권', tv); addFin(G, '스폰서·상품', spons); addFin(G, '선수 주급', -wages); }
      if (!isUser) W.validateLineup(G, t);
    }
    const ut = userTeam(G);
    if (ut.build) {
      ut.build.weeks--;
      if (ut.build.weeks <= 0) {
        ut.facilities[ut.build.k]++;
        news(G, 'club', `${FAC[ut.build.k].name} 공사 완료`, `${josa(FAC[ut.build.k].name, '이/가')} ${ut.facilities[ut.build.k]}단계로 업그레이드되었습니다.`);
        ut.build = null;
      }
    }
    G.offers = G.offers.filter((o) => o.exp > G.week);
    if (windowOpen(G) && G.week % 2 === 0) scoutTip(G);
    if (G.board.conf < 10 && G.week > 10 && position(G, uid) > G.board.goal.pos + 2) G.user.sacked = true;
  }

  function develop(G, p, t, rng, intensity, focus, scale) {
    scale = scale || 1;
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
    p._dev = (p._dev || 0) + pts * 3.2 * scale;
    while (p._dev >= 1 || p._dev <= -1) {
      const sign = p._dev > 0 ? 1 : -1;
      p._dev -= sign;
      const k = pickAttr(p, focus, rng, sign < 0);
      p.attr[k] = clamp(p.attr[k] + sign, 10, 99);
    }
    W.refreshPlayer(p);
  }
  const FOCUS = { tac: null, bal: null, atk: ['sho', 'dri', 'pac'], def: ['def', 'phy'], tec: ['pas', 'dri'], phy: ['pac', 'phy'] };
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
    const n = rng.int(2, 5);
    const all = Object.values(G.players).filter((p) => p.teamId != null && p.teamId !== G.user.teamId);
    for (let i = 0; i < n; i++) {
      const buyer = rng.pick(G.teams.filter((t) => t.id !== G.user.teamId && t.squad.length < 30));
      if (!buyer) return;
      const pos = rng.pick(['GK', 'DF', 'MF', 'FW']);
      const mine = buyer.squad.map((id) => G.players[id]).filter((p) => p.pos === pos).sort((a, b) => b.ovr - a.ovr);
      const ref = mine[pos === 'GK' ? 0 : 2];
      const need = ref ? ref.ovr : 55;
      const cands = all.filter((p) => p.teamId != null && p.teamId !== buyer.id && p.pos === pos && p.ovr > need + 1 && p.ovr < need + 9 && p.value < buyer.balance * 0.6 && team(G, p.teamId).rep <= buyer.rep + 6);
      if (!cands.length) continue;
      const p = rng.pick(cands);
      const seller = team(G, p.teamId);
      if (seller.squad.length <= 20) continue;
      const fee = Math.round(p.value * rng.range(0.95, 1.3) / 25) * 25;
      movePlayer(G, p, seller, buyer, fee);
      news(G, 'transfer', `${p.name}, ${buyer.name} 이적`, `${seller.name}에서 ${josa(buyer.name, '으로/로')} 이적 (이적료 ${money(fee)})`, { gen: true, read: true, from: '이적 소식' });
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

  function incomingOffers(G, rng) {
    const ut = userTeam(G);
    for (const id of ut.squad) {
      const p = G.players[id];
      const pr = p.listed ? 0.35 : 0.02 * (p.ovr > W.squadOvr(G, ut) + 3 ? 2 : 1);
      if (!rng.chance(pr)) continue;
      if (G.offers.some((o) => o.pid === id)) continue;
      const buyers = G.teams.filter((t) => t.id !== ut.id && t.balance > p.value * 0.8 && t.rep >= ut.rep - 12);
      if (!buyers.length) continue;
      const b = rng.pick(buyers);
      const amount = Math.round(p.value * (p.listed ? rng.range(0.75, 1.05) : rng.range(0.95, 1.35)) / 25) * 25;
      // max: 상대가 속으로 정해 둔 최고액 (역제안 협상에 쓰임)
      const max = Math.min(Math.round(b.balance * 0.9 / 25) * 25, Math.round(amount * rng.range(1.05, 1.4) / 25) * 25);
      G.offers.push({ id: G.season * 100000 + G.week * 100 + G.day * 7 + G.offers.length, pid: id, from: b.id, amount, max: Math.max(amount, max), exp: G.week + 2, rounds: 0 });
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

  // 우리가 더 높은 금액을 요구: 상대 최고액 안이면 수용, 조금 넘으면 최종 제안, 너무 높거나 세 번째면 결렬
  function counterOffer(G, offerId, ask) {
    const o = G.offers.find((x) => x.id === offerId);
    if (!o) return { status: 'gone', msg: '제안이 만료되었습니다.' };
    const p = G.players[o.pid], b = team(G, o.from);
    if (o.max == null) o.max = Math.round(Math.max(o.amount, p.value * 1.15) / 25) * 25;
    o.rounds = (o.rounds || 0) + 1;
    if (ask <= o.amount) return { status: 'same', msg: '현재 제시액보다 높은 금액을 요구하세요.' };
    if (ask <= o.max) {
      o.amount = ask; o.agreed = true;
      return { status: 'agreed', msg: `${josa(b.name, '이/가')} ${money(ask)}에 동의했어요. 수락하면 이적이 확정돼요.` };
    }
    if (o.final || o.rounds >= 3 || ask > o.max * 1.25) {
      G.offers = G.offers.filter((x) => x.id !== offerId);
      news(G, 'offer', `${p.name} 협상 결렬`, `${josa(b.name, '이/가')} 요구액이 너무 높다며 협상에서 물러났습니다.`);
      return { status: 'walk', msg: `${josa(b.name, '이/가')} 협상을 포기했어요.` };
    }
    o.amount = o.max; o.final = true;
    return { status: 'final', msg: `${josa(b.name, '이/가')} 최종 제안으로 ${money(o.max)}를 내놨어요. 더 올리면 협상이 깨질 수 있어요.` };
  }

  function askingPrice(G, p) {
    if (p.teamId == null) return 0;
    const t = team(G, p.teamId);
    const starter = t.lineup.includes(p.id);
    const f = (p.listed ? 0.9 : 1.15) + (starter ? 0.25 : 0) + (t.squad.length <= 20 ? 0.3 : 0) + (p.contract >= 4 ? 0.1 : p.contract <= 1 ? -0.2 : 0);
    return Math.round(p.value * f / 25) * 25;
  }
  function wageDemand(G, p, toTeam) {
    const repGap = (p.teamId != null ? team(G, p.teamId).rep : 55) - toTeam.rep;
    const f = 1.1 + Math.max(0, repGap) * 0.03 + (p.teamId == null ? -0.05 : 0);
    return Math.max(1, Math.round(W.wageOf(p) * f * 10) / 10);
  }
  function willingToJoin(G, p, toTeam) {
    const from = p.teamId != null ? team(G, p.teamId) : null;
    if (!from) return true;
    return toTeam.rep >= from.rep - 12;
  }

  function makeBid(G, pid, amount) {
    const p = G.players[pid];
    const ut = userTeam(G);
    if (!windowOpen(G) && p.teamId != null) return { status: 'closed', msg: '이적시장이 닫혀 있어요. 자유계약 선수만 영입할 수 있어요.' };
    if (amount > ut.balance) return { status: 'money', msg: '구단 잔고가 부족해요.' };
    if (ut.squad.length >= 32) return { status: 'full', msg: '선수단이 32명으로 가득 찼어요. 먼저 정리하세요.' };
    if (!willingToJoin(G, p, ut)) return { status: 'refuse', msg: `${josa(p.name, '은/는')} 우리 구단 이적에 관심이 없어요. (구단 평판 차이)` };
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
    G.short = (G.short || []).filter((x) => x !== pid);
    if (fee > G.records.recordFee) { G.records.recordFee = fee; if (fee >= 50000) unlock(G, 'bigSpender'); }
    unlock(G, 'firstSigning');
    news(G, 'transfer', `오피셜: ${p.name} 영입`, `${from ? from.name + '에서 ' : '자유계약으로 '}${josa(p.name, '을/를')} 영입했습니다. 계약 ${years}년, 주급 ${money(wage)}.`);
    return { ok: true, msg: `${p.name} 영입 완료!` };
  }

  function releaseCost(p) { return Math.round(p.wage * 16 * Math.max(1, p.contract) * 10) / 10; }
  function releasePlayer(G, pid) {
    const p = G.players[pid];
    const ut = userTeam(G);
    if (ut.squad.length <= 18) return { ok: false, msg: '선수단이 18명 이하라 방출할 수 없어요.' };
    const comp = releaseCost(p);
    if (comp > ut.balance) return { ok: false, msg: `위약금 ${money(comp)}가 부족해요.` };
    movePlayer(G, p, ut, null, 0);
    ut.balance -= comp;
    addFin(G, `${p.name} 계약 해지`, -comp);
    return { ok: true, msg: `${p.name} 방출 (위약금 ${money(comp)})` };
  }

  function renewDemand(G, p) {
    const base = W.wageOf(p);
    const moraleF = p.morale < 40 ? 1.35 : p.morale < 60 ? 1.15 : 1;
    return Math.round(Math.max(p.wage, base) * moraleF * 1.05 * 10) / 10;
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
  function facCost(t, k) {
    const scale = Math.max(1500, (t.wage0 || 500) * 6);
    return Math.round(scale * t.facilities[k] * (k === 'stadium' ? 2 : 1) / 100) * 100;
  }
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
    const ut = userTeam(G);
    const report = { year: G.year, champions: [], awards: {}, user: {} };
    G.leagues.forEach((lg, li) => {
      const tb = table(G, li);
      report.champions.push({ league: lg.name, team: tb[0].id });
      const n = tb.length;
      tb.forEach((r, i) => {
        const t = team(G, r.id);
        const prize = Math.round(econ(t).tv * (n - i) * 900 + (i === 0 ? econ(t).tv * 15000 : 0));
        t.balance += prize;
        if (r.id === G.user.teamId) addFin(G, '상금', prize);
        t.rep = clamp(Math.round(t.rep * 0.9 + (t.rep + (n / 2 - i) * 0.8) * 0.1), 35, 96);
      });
    });
    const uli = ut.league;
    const all = Object.values(G.players).filter((p) => p.teamId != null && team(G, p.teamId).league === uli);
    report.awards = {
      scorer: all.slice().sort((a, b) => b.season.goals - a.season.goals || b.ovr - a.ovr)[0],
      assist: all.slice().sort((a, b) => b.season.assists - a.season.assists)[0],
      mvp: all.filter((p) => p.season.apps >= 12).sort((a, b) => b.season.rsum / b.season.apps - a.season.rsum / a.season.apps)[0],
    };
    if (report.awards.scorer) report.awards.scorerGoals = report.awards.scorer.season.goals;
    const pos = position(G, ut.id);
    const n = G.leagues[uli].teams.length;
    const goal = G.board.goal;
    report.user = { pos, league: G.leagues[uli].name, goal, met: pos <= goal.pos, n };
    const lastRound = G.cup.rounds.findIndex((rd) => rd.some((m) => (m.h === ut.id || m.a === ut.id) && m.w != null && m.w !== ut.id));
    report.user.cup = G.cup.winner === ut.id ? '우승' : lastRound >= 0 ? cupRoundName(G, lastRound) + ' 탈락' : '-';
    const ec = euroUserComp(G);
    report.user.euro = ec ? `${ec.short} ${euroStatus(G, ec)}` : null;
    report.euroWinners = G.euro ? G.euro.comps.map((c) => ({ name: c.name, team: c.winner })) : [];
    // 다음 시즌 유럽 대항전 출전권: 리그 최종 순위
    G.euroNext = euroEntrants(G, G.leagues.map((lg, li) => table(G, li).map((r) => r.id)));
    const uq = EURO.find((c) => G.euroNext[c.key].includes(ut.id));
    report.user.euroNext = uq ? uq.name : null;
    G.user.history.push({ year: G.year, team: ut.name, league: G.leagues[uli].name, pos, cup: report.user.cup, euro: report.user.euro });
    if (pos === 1) { G.user.trophies.push({ year: G.year, name: G.leagues[uli].name + ' 우승' }); unlock(G, 'title'); }
    const diff = goal.pos - pos;
    G.board.conf = clamp(G.board.conf + diff * 5 + (report.user.met ? 10 : -10), 0, 100);
    if (pos > n - 3) G.board.conf = clamp(G.board.conf - 25, 0, 100);
    report.user.conf = G.board.conf;
    if (G.board.conf < 20) { G.user.sacked = true; report.user.sacked = true; }
    G.user.rep = clamp(G.user.rep + (report.user.met ? 6 : -4) + (pos === 1 ? 8 : 0), 0, 100);
    G.user.seasons++;
    if (G.user.seasons >= 5) unlock(G, 'legend');
    if (ut.squad.some((id) => G.players[id].youth && G.players[id].ovr >= 70)) unlock(G, 'youth');
    // 노화, 은퇴, 계약
    report.retired = []; report.left = [];
    for (const p of Object.values(G.players)) {
      p.age++;
      W.agePlayerValue(p);
      const retire = p.age >= 38 || (p.age >= 35 && rng.chance(0.3 + (p.age - 35) * 0.2)) || (p.teamId == null && p.age >= 33 && rng.chance(0.5));
      if (retire) {
        if (p.teamId === ut.id) report.retired.push(p.name);
        removePlayer(G, p);
        continue;
      }
      if (p.teamId != null) {
        p.contract--;
        if (p.contract <= 0) {
          if (p.teamId === ut.id) { report.left.push(p.name); movePlayer(G, p, ut, null, 0); }
          else if (rng.chance(0.75)) { p.contract = rng.int(1, 4); p.wage = W.wageOf(p); }
          else movePlayer(G, p, team(G, p.teamId), null, 0);
        }
      }
      W.refreshPlayer(p);
    }
    // 유스 + 선수단 보충
    report.youth = [];
    for (const t of G.teams) {
      const pool = namePool(G, t.league);
      const base = W.squadOvr(G, t);
      const cnt = t.id === ut.id ? 3 : rng.int(1, 2);
      for (let i = 0; i < cnt; i++) {
        const role = rng.pick(['GK', 'CB', 'CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'LW', 'RW', 'ST', 'ST']);
        const p = W.createPlayer(G, rng, role, clamp(base - rng.int(14, 22), 42, 70), rng.int(16, 18), pool);
        p.pot = clamp(p.ovr + rng.int(12, 24) + t.facilities.youth * 3, p.ovr, 95);
        p.contract = 3; p.wage = Math.max(1, Math.round(W.wageOf(p) * 0.6 * 10) / 10);
        p.teamId = t.id; t.squad.push(p.id);
        if (t.id === ut.id) { report.youth.push(p); p.youth = true; }
      }
      while (t.squad.length < 22 && t.id !== ut.id) {
        const fa = G.freeAgents.map((id) => G.players[id]).filter((p) => p && p.value <= t.balance).sort((a, b) => b.ovr - a.ovr)[0];
        if (fa) movePlayer(G, fa, null, t, 0);
        else { const p = W.createPlayer(G, rng, rng.pick(['CB', 'CM', 'ST']), base - 6, rng.int(20, 28), pool); p.teamId = t.id; t.squad.push(p.id); }
      }
      while (t.squad.length > 32 && t.id !== ut.id) {
        const worst = t.squad.map((id) => G.players[id]).sort((a, b) => a.ovr - b.ovr)[0];
        movePlayer(G, worst, t, null, 0);
      }
      W.assignNumbers(G, t);
    }
    for (let i = 0; i < 15; i++) {
      const li = rng.int(0, G.leagues.length - 1);
      const p = W.createPlayer(G, rng, rng.pick(['GK', 'CB', 'LB', 'CM', 'AM', 'LW', 'ST']), rng.int(55, 70), rng.int(20, 32), namePool(G, li));
      G.freeAgents.push(p.id);
    }
    G.freeAgents = G.freeAgents.filter((id) => G.players[id]).slice(-80);
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

  function jobOffers(G) {
    const cur = G.user.teamId;
    const cap = 50 + G.user.rep * 0.4;
    return G.teams.filter((t) => t.id !== cur && t.rep <= cap).sort((a, b) => b.rep - a.rep).slice(0, 4).map((t) => t.id);
  }
  function takeJob(G, teamId) {
    const prevLeague = userTeam(G).league;
    G.user.teamId = teamId;
    G.user.sacked = false;
    G.board.conf = 60;
    const t = userTeam(G);
    // 다른 리그로 옮기면 그 리그 일정으로 새 시즌을 시작
    if (t.league !== prevLeague || G.week >= G.calendar.length) setupSeason(G);
    G.board.goal = boardGoal(G);
    news(G, 'board', `${t.name} 부임`, `${G.user.name} 감독이 ${t.name}의 지휘봉을 잡았습니다.`);
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
  // 받은 편지함: 소식마다 보낸 사람(스태프)이 있다
  const SENDER = { match: '수석 코치', transfer: '단장', injury: '의료팀장', board: '구단주', cup: '대회 운영국', offer: '단장', ach: '구단 기록관', club: '구단 사무국', scout: '수석 스카우트', report: '어시스턴트 매니저', train: '피트니스 코치' };
  function news(G, tag, title, body, extra) {
    G.newsId = (G.newsId || 0) + 1;
    G.news.unshift(Object.assign({ id: G.newsId, s: G.season, w: G.week, d: G.day, tag, from: SENDER[tag] || '구단 사무국', title, body, read: false }, extra || {}));
    if (G.news.length > 80) G.news.pop();
  }

  // ── 상대 분석 (AI 전술 선택과 어시스턴트 보고서가 같은 판단을 쓴다) ──
  function aiPlan(G, t, opp) {
    const diff = W.teamRating(G, t) - W.teamRating(G, opp);
    if (diff > 6) return t.rep >= 85 ? (t.id % 2 ? 'gegen' : 'tiki') : 'vtiki';
    if (diff > 2) return t.id % 3 === 0 ? 'wing' : t.id % 3 === 1 ? 'gegen' : 'balance';
    if (diff > -3) return t.id % 2 ? 'balance' : 'direct';
    if (diff > -8) return 'counter';
    return 'bus';
  }
  function unitStrength(G, t) {
    const slots = D.FORMATIONS[t.tactics.formation];
    const u = { DF: [], MF: [], FW: [] };
    t.lineup.forEach((id, i) => { const p = G.players[id]; const g = D.ROLE_GROUP[slots[i][0]]; if (p && u[g]) u[g].push(W.roleOvr(p, slots[i][0])); });
    const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
    return { DF: avg(u.DF), MF: avg(u.MF), FW: avg(u.FW) };
  }
  function oppReport(G) {
    const fx = userFixture(G);
    if (!fx) return null;
    const ut = userTeam(G), oppId = fx.m.h === ut.id ? fx.m.a : fx.m.h, opp = team(G, oppId);
    W.autoLineup(G, opp);
    const key = aiPlan(G, opp, ut);
    const preset = D.TACTIC_PRESETS.find((x) => x[0] === key);
    const us = unitStrength(G, ut), them = unitStrength(G, opp);
    const NAME = { DF: '수비', MF: '중원', FW: '공격' };
    const weak = Object.keys(them).sort((a, b) => them[a] - them[b])[0];
    const strong = Object.keys(them).sort((a, b) => them[b] - them[a])[0];
    const stars = opp.lineup.map((id) => G.players[id]).filter(Boolean).sort((a, b) => b.ovr - a.ovr).slice(0, 3);
    const fast = opp.lineup.map((id) => G.players[id]).filter((p) => p && p.pos === 'FW').sort((a, b) => b.attr.pac - a.attr.pac)[0];
    const diff = W.teamRating(G, ut) - W.teamRating(G, opp);
    const tips = [];
    if (key === 'bus' || key === 'counter') tips.push('상대는 내려앉을 가능성이 높아요. 짧은 패스로 점유하면서 박스까지 파고들거나 측면 크로스로 블록을 넓히세요.');
    if (key === 'gegen' || key === 'vtiki') tips.push('상대가 강하게 압박해 올 거예요. 직선적인 패스나 뒷공간 침투로 압박을 벗겨내면 기회가 생겨요.');
    if (key === 'wing') tips.push('상대는 측면 크로스가 주무기예요. 공격 폭을 좁히고 수비 라인을 깊게 두는 것도 방법이에요.');
    if (fast && fast.attr.pac >= 78) tips.push(`${fast.name}의 스피드가 위협적이에요. 높은 수비 라인은 뒷공간을 내줄 수 있어요.`);
    if (them[weak] + 2 < us[weak === 'DF' ? 'FW' : weak === 'FW' ? 'DF' : 'MF']) tips.push(`상대 ${NAME[weak]}이 약점이에요.`);
    return { opp, key, presetName: preset[1], formation: opp.tactics.formation, stars, weak: NAME[weak], strong: NAME[strong], tips, diff, label: fx.label, day: fx.ev.day };
  }
  function sendReport(G) {
    const r = oppReport(G);
    if (!r) return;
    const k = G.season + ':' + G.week;
    if (G.repSent === k) return;
    G.repSent = k;
    const lines = [`예상 포메이션 ${r.formation}, 예상 전술 '${r.presetName}'.`, `강점은 ${r.strong}, 약점은 ${r.weak}이에요.`, `경계 대상: ${r.stars.map((p) => p.name).join(', ')}.`].concat(r.tips);
    news(G, 'report', `${r.label} 상대 분석: ${r.opp.name}`, lines.join(' '), { opp: r.opp.id });
  }

  // 수석 스카우트: 라인업에서 가장 약한 자리를 보강할 후보 추천
  function scoutTip(G) {
    const ut = userTeam(G);
    const slots = D.FORMATIONS[ut.tactics.formation];
    let wi = -1, wv = 999;
    ut.lineup.forEach((id, i) => { const p = G.players[id]; const v = p ? W.roleOvr(p, slots[i][0]) : 0; if (v < wv) { wv = v; wi = i; } });
    if (wi < 0) return;
    const role = slots[wi][0];
    const cands = Object.values(G.players).filter((p) => p.teamId !== ut.id && p.age <= 31 && D.fit(role, p) >= 0.9 && W.roleOvr(p, role) >= wv + 3 && p.value <= Math.max(ut.balance, 0) * 0.8)
      .sort((a, b) => W.roleOvr(b, role) - W.roleOvr(a, role) || a.value - b.value).slice(0, 3);
    if (!cands.length) return;
    news(G, 'scout', `${D.ROLE_NAME[role]} 보강 후보 보고서`, `현재 ${D.ROLE_NAME[role]} 자리(${wv})가 가장 약해요. 예산 안에서 영입할 만한 선수를 찾았습니다: ${cands.map((p) => `${p.name}(${p.age}세, ${W.roleOvr(p, role)})`).join(', ')}.`, { pids: cands.map((p) => p.id) });
  }

  // ── 팀 토크 ────────────────────────────────────────────────
  // ctx: { phase: 'pre'|'ht', fav: 전력 차(우리-상대), gd: 현재 득실차, xgd: xG 차 }
  const TALKS = {
    pre: [
      ['expect', '승리를 기대한다', '“우리가 이길 경기다. 보여줘.”'],
      ['nopress', '부담 갖지 마라', '“잃을 게 없다. 즐기고 와라.”'],
      ['focus', '집중해라', '“하던 대로, 실수만 줄이자.”'],
      ['faith', '너희를 믿는다', '“나는 너희를 믿는다.”'],
    ],
    ht: [
      ['praise', '잘하고 있다', '“좋다, 계속 이렇게 가자.”'],
      ['complacent', '방심하지 마라', '“아직 끝나지 않았다. 집중해.”'],
      ['encourage', '할 수 있다', '“충분히 뒤집을 수 있다. 자신 있게.”'],
      ['disappointed', '실망스럽다', '“이게 너희 실력이냐? 실망이다.”'],
      ['angry', '분노', '(라커룸 문을 걷어차며) “당장 정신 차려!”'],
    ],
  };
  function talkBase(tone, c) {
    const fav = c.fav, gd = c.gd || 0, xgd = c.xgd || 0;
    switch (tone) {
      case 'expect': return fav > 2 ? 6 : fav > -2 ? 2 : -5;
      case 'nopress': return fav < -2 ? 7 : fav < 2 ? 2 : -3;
      case 'focus': return 2.5;
      case 'faith': return c.morale < 55 ? 6 : 1.5;
      case 'praise': return gd > 0 || (gd === 0 && xgd > 0.3) ? 6 : gd === 0 ? 1 : -4;
      case 'complacent': return gd > 0 ? 4.5 : gd === 0 ? 1.5 : -2;
      case 'encourage': return gd < 0 ? 5.5 : gd === 0 ? 3 : 0.5;
      case 'disappointed': return gd < 0 && xgd < 0 ? 4 : gd < 0 ? 1 : -6;
      case 'angry': return gd < 0 && fav > 0 ? 7 : gd < 0 ? 2 : -8;
      default: return 0;
    }
  }
  function reaction(d) {
    if (d >= 6) return ['fire', '의욕이 넘친다'];
    if (d >= 3) return ['up', '자신감이 생겼다'];
    if (d >= 0.5) return ['ok', '집중하고 있다'];
    if (d > -2) return ['flat', '별 반응이 없다'];
    if (d > -5) return ['down', '긴장한 것 같다'];
    return ['bad', '실망한 표정이다'];
  }
  // 선수마다 성격(고정 난수)에 따라 반응이 다르다. 사기를 바꾸고 반응 목록을 돌려준다
  function teamTalk(G, players, tone, c) {
    const avgM = players.reduce((s, p) => s + p.morale, 0) / Math.max(1, players.length);
    const base = talkBase(tone, Object.assign({ morale: avgM }, c));
    const out = [];
    for (const p of players) {
      const pers = (((p.id * 2654435761) >>> 0) % 1000) / 1000 - 0.5; // -0.5 ~ 0.5
      const vol = tone === 'angry' || tone === 'disappointed' ? 2.2 : 1;
      let d = base + pers * 6 * vol + (p.age >= 30 ? 1 : 0) * (base < 0 ? 1 : 0);
      if (p.morale > 85 && d > 0) d *= 0.5;
      d = Math.round(clamp(d, -12, 12));
      p.morale = clamp(p.morale + d, 5, 100);
      out.push({ p, d, r: reaction(d) });
    }
    return out;
  }


  const ACH = {
    ucl: ['유럽 정복', 'UEFA 챔피언스리그 우승'],
    uel: ['유로파의 왕', 'UEFA 유로파리그 우승'],
    firstWin: ['첫 승', '감독 커리어 첫 승리'],
    firstSigning: ['첫 영입', '첫 선수를 영입'],
    unbeaten10: ['무패 행진', '10경기 연속 무패'],
    thrash: ['대승', '4골 차 이상 승리'],
    giant: ['자이언트 킬링', '전력이 훨씬 강한 팀을 꺾음'],
    cup: ['컵 위너', '국내 컵 대회 우승'],
    title: ['챔피언', '리그 우승'],
    bigSpender: ['큰손', '€5,000만 이상 이적료로 영입'],
    youth: ['유스 키우기', '유스 출신 선수가 OVR 70 달성'],
    legend: ['장기 집권', '5시즌 지휘'],
  };
  function unlock(G, k) {
    if (G.ach[k]) return;
    G.ach[k] = { s: G.season, w: G.week };
    news(G, 'ach', `업적 달성: ${ACH[k][0]}`, ACH[k][1]);
    G.newAch = (G.newAch || []).concat(k);
  }

  KM.Season = {
    createWorld, startCareer, setupSeason, userTeam, team, leagueOf, table, position, currentEvent, userFixture, windowOpen,
    createMatch, playWeek, endSeason, advanceDay, canAdvance, nextEventDay, dateText, dateOf, ensureDays, quickSim, buildSide, cupRoundName,
    makeBid, completeSigning, askingPrice, wageDemand, willingToJoin, acceptOffer, rejectOffer, counterOffer, releasePlayer, releaseCost,
    renew, renewDemand, upgradeFacility, facCost, FAC, jobOffers, takeJob, strengthRank,
    EURO_ROUNDS, euroGroupTable, euroUserComp, euroStatus, setupEuro,
    pressQuestions, answerPress, unlock, ACH, news, oppReport, sendReport, aiPlan, teamTalk, TALKS, unitStrength,
  };
})(globalThis.KM || (globalThis.KM = {}));
