// 선수/구단 생성과 평가 함수
(function (KM) {
  'use strict';
  const { clamp } = KM;
  const D = KM.DATA;

  const ATTRS = ['pac', 'sho', 'pas', 'dri', 'def', 'phy', 'gk'];
  const ATTR_KO = { pac: '스피드', sho: '슈팅', pas: '패스', dri: '드리블', def: '수비', phy: '피지컬', gk: '골키핑' };

  // 포지션별 능력치 가중치 (OVR 계산)
  const W = {
    GK: { gk: 0.82, pas: 0.06, phy: 0.08, pac: 0.04 },
    DF: { def: 0.45, phy: 0.2, pac: 0.14, pas: 0.15, dri: 0.06 },
    MF: { pas: 0.34, dri: 0.2, def: 0.14, sho: 0.12, phy: 0.1, pac: 0.1 },
    FW: { sho: 0.4, dri: 0.2, pac: 0.2, phy: 0.1, pas: 0.1 },
  };
  // 포지션별 능력치 기본 성향 (평균 대비 오프셋)
  const TEMPLATE = {
    GK: { pac: -25, sho: -40, pas: -15, dri: -30, def: -20, phy: 0, gk: 6 },
    DF: { pac: 0, sho: -18, pas: -4, dri: -8, def: 6, phy: 4, gk: -55 },
    MF: { pac: 0, sho: -4, pas: 5, dri: 2, def: -6, phy: -2, gk: -55 },
    FW: { pac: 4, sho: 6, pas: -6, dri: 2, def: -28, phy: 0, gk: -55 },
  };

  function ovrOf(attr, pos) {
    const w = W[pos];
    let s = 0;
    for (const k in w) s += attr[k] * w[k];
    return Math.round(s);
  }

  // 역할(슬롯)에 맞는 OVR — 라인업 화면과 자동 선발에 사용
  function roleOvr(p, role) {
    const fit = D.ROLE_FIT[role][p.pos] || 0.5;
    if (role === 'GK') return Math.round(ovrOf(p.attr, 'GK') * (p.pos === 'GK' ? 1 : 0.4));
    const grp = role === 'CB' || role === 'LB' || role === 'RB' ? 'DF'
      : role === 'ST' || role === 'LW' || role === 'RW' ? 'FW' : 'MF';
    return Math.round(ovrOf(p.attr, grp) * fit);
  }

  function valueOf(p) {
    const o = p.ovr;
    let v = Math.pow(Math.max(o - 40, 1), 3) * 1.6; // 만 원 단위
    const ageF = p.age <= 21 ? 1.5 : p.age <= 24 ? 1.3 : p.age <= 28 ? 1.0 : p.age <= 31 ? 0.65 : 0.35;
    const potF = 1 + Math.max(0, p.pot - o) / 40;
    v *= ageF * potF;
    if (p.contract <= 1) v *= 0.75;
    return Math.max(200, Math.round(v / 100) * 100);
  }

  function wageOf(p) {
    // 주급 (만 원)
    return Math.max(30, Math.round(Math.pow(Math.max(p.ovr - 40, 1), 2.4) * 0.12 / 5) * 5);
  }

  function makeName(rng, foreign) {
    if (foreign) {
      const f = rng.pick(D.FOREIGN);
      return { name: rng.pick(f[1]), nat: f[0] };
    }
    return { name: rng.pick(D.SURNAMES) + rng.pick(D.GIVEN_A) + rng.pick(D.GIVEN_B), nat: '한국' };
  }

  function createPlayer(G, rng, pos, target, age) {
    const id = G.nextPid++;
    const nm = makeName(rng, rng.chance(0.14));
    const attr = {};
    const t = TEMPLATE[pos];
    for (const k of ATTRS) attr[k] = rng.gauss(target + t[k], 6);
    // OVR이 목표치에 맞도록 보정
    for (let i = 0; i < 3; i++) {
      const diff = target - ovrOf(attr, pos);
      for (const k of ATTRS) attr[k] += diff;
    }
    for (const k of ATTRS) attr[k] = Math.round(clamp(attr[k], 15, 96));
    const p = {
      id, name: nm.name, nat: nm.nat, pos, age, attr,
      ovr: 0, pot: 0, cond: 100, morale: 70, form: 6.5,
      inj: 0, sus: 0, contract: rng.int(2, 4), num: 0,
      teamId: null, listed: false, value: 0, wage: 0,
      season: blankStats(), career: blankStats(), ratings: [],
    };
    p.ovr = ovrOf(attr, pos);
    const growth = age <= 19 ? rng.int(8, 26) : age <= 22 ? rng.int(3, 18) : age <= 25 ? rng.int(0, 8) : 0;
    p.pot = clamp(p.ovr + growth, p.ovr, 94);
    p.value = valueOf(p);
    p.wage = wageOf(p);
    G.players[id] = p;
    return p;
  }

  function blankStats() {
    return { apps: 0, goals: 0, assists: 0, yel: 0, red: 0, rsum: 0, cs: 0 };
  }

  function refreshPlayer(p) {
    p.ovr = ovrOf(p.attr, p.pos);
    if (p.pot < p.ovr) p.pot = p.ovr;
    p.value = valueOf(p);
  }

  function createTeam(G, rng, def, idx, div) {
    const [name, short, c1, c2, stadium, cap, str] = def;
    const team = {
      id: idx, name, short, c1, c2, stadium, cap, div,
      strength: str,
      rep: str,
      squad: [],
      tactics: { formation: rng.pick(['4-4-2', '4-3-3', '4-2-3-1', '4-3-3', '4-2-3-1', '3-5-2', '4-1-4-1']), mentality: 2, style: 1, press: 1, line: 1, width: 1 },
      lineup: [], bench: [],
      balance: Math.round(Math.pow(str - 40, 2.3) * 36 / 100) * 100,
      fans: 60,
      facilities: { train: div === 1 ? 2 : 1, youth: div === 1 ? 2 : 1, stadium: 1 },
      form: [],
    };
    const plan = [['GK', 3], ['DF', 8], ['MF', 8], ['FW', 5]];
    for (const [pos, cnt] of plan) {
      for (let i = 0; i < cnt; i++) {
        // 주전 vs 후보 차이
        const tier = i < (pos === 'GK' ? 1 : pos === 'FW' ? 3 : 4) ? 0 : 1;
        const age = clamp(Math.round(rng.gauss(26, 4.2)), 17, 35);
        const target = Math.round(rng.gauss(str - (tier ? 7 : 0) - (age < 21 ? 6 : 0), 3));
        const p = createPlayer(G, rng, pos, target, age);
        p.teamId = team.id;
        p.num = pos === 'GK' && i === 0 ? 1 : 0;
        team.squad.push(p.id);
      }
    }
    assignNumbers(G, team);
    autoLineup(G, team);
    return team;
  }

  function assignNumbers(G, team) {
    const used = new Set();
    const need = [];
    for (const id of team.squad) {
      const p = G.players[id];
      if (p.num && !used.has(p.num)) used.add(p.num);
      else need.push(p);
    }
    let n = 2;
    for (const p of need) {
      while (used.has(n)) n++;
      p.num = n; used.add(n);
    }
  }

  function available(p) {
    return p.inj <= 0 && p.sus <= 0;
  }

  // 역할 적합도를 기준으로 탐욕적으로 선발 11명 + 벤치 9명을 구성
  function autoLineup(G, team) {
    const slots = D.FORMATIONS[team.tactics.formation];
    const pool = team.squad.map((id) => G.players[id]).filter(available);
    const taken = new Set();
    const lineup = new Array(slots.length).fill(null);
    // 지정하기 어려운 슬롯(GK → 수비 → 공격 → 미드)부터 채움
    const order = slots.map((s, i) => i).sort((a, b) => prio(slots[a][0]) - prio(slots[b][0]));
    for (const i of order) {
      const role = slots[i][0];
      let best = null, bv = -1;
      for (const p of pool) {
        if (taken.has(p.id)) continue;
        const v = roleOvr(p, role) * (0.8 + 0.2 * p.cond / 100);
        if (v > bv) { bv = v; best = p; }
      }
      if (best) { lineup[i] = best.id; taken.add(best.id); }
    }
    team.lineup = lineup;
    const rest = pool.filter((p) => !taken.has(p.id)).sort((a, b) => b.ovr - a.ovr);
    const bench = [];
    const gk = rest.find((p) => p.pos === 'GK');
    if (gk) bench.push(gk.id);
    for (const p of rest) { if (bench.length >= 9) break; if (!bench.includes(p.id)) bench.push(p.id); }
    team.bench = bench;
  }
  function prio(role) {
    return role === 'GK' ? 0 : role === 'CB' ? 1 : role === 'ST' ? 2 : role === 'LB' || role === 'RB' ? 3 : role === 'LW' || role === 'RW' ? 4 : 5;
  }

  // 선발 라인업이 유효한지 확인 (부상/징계/이적 반영) 후 필요시 보정
  function validateLineup(G, team) {
    const slots = D.FORMATIONS[team.tactics.formation];
    let ok = team.lineup.length === slots.length;
    const seen = new Set();
    if (ok) for (const id of team.lineup) {
      const p = G.players[id];
      if (id == null || !p || p.teamId !== team.id || !available(p) || seen.has(id)) { ok = false; break; }
      seen.add(id);
    }
    if (!ok) { autoLineup(G, team); return; }
    team.bench = team.bench.filter((id) => { const p = G.players[id]; return p && p.teamId === team.id && available(p) && !seen.has(id); });
    if (team.bench.length < 9) {
      const extra = team.squad.map((id) => G.players[id]).filter((p) => available(p) && !seen.has(p.id) && !team.bench.includes(p.id)).sort((a, b) => b.ovr - a.ovr);
      for (const p of extra) { if (team.bench.length >= 9) break; team.bench.push(p.id); }
    }
  }

  function teamRating(G, team) {
    const slots = D.FORMATIONS[team.tactics.formation];
    let s = 0, n = 0;
    team.lineup.forEach((id, i) => { const p = G.players[id]; if (p) { s += roleOvr(p, slots[i][0]); n++; } });
    return n ? Math.round(s / n) : 0;
  }

  function squadOvr(G, team) {
    const arr = team.squad.map((id) => G.players[id].ovr).sort((a, b) => b - a).slice(0, 16);
    return Math.round(arr.reduce((a, b) => a + b, 0) / Math.max(1, arr.length));
  }

  function wageBill(G, team) {
    return team.squad.reduce((s, id) => s + G.players[id].wage, 0);
  }

  KM.World = {
    ATTRS, ATTR_KO, ovrOf, roleOvr, valueOf, wageOf, createPlayer, createTeam, refreshPlayer,
    autoLineup, validateLineup, teamRating, squadOvr, wageBill, assignNumbers, available, blankStats,
  };
})(globalThis.KM || (globalThis.KM = {}));
