// 선수/구단 생성과 평가 함수
// 실제 데이터(트랜스퍼마크트)의 시장 가치·나이·세부 포지션으로 능력치를 추정한다.
// 금액 단위: 천 유로 (k€)
(function (KM) {
  'use strict';
  const { clamp, RNG } = KM;
  const D = KM.DATA;

  const ATTRS = ['pac', 'sho', 'pas', 'dri', 'def', 'phy', 'gk'];
  const ATTR_KO = { pac: '스피드', sho: '슈팅', pas: '패스', dri: '드리블', def: '수비', phy: '피지컬', gk: '골키핑' };

  // 포지션 그룹별 OVR 가중치
  const W = {
    GK: { gk: 0.82, pas: 0.06, phy: 0.08, pac: 0.04 },
    DF: { def: 0.45, phy: 0.2, pac: 0.14, pas: 0.15, dri: 0.06 },
    MF: { pas: 0.34, dri: 0.2, def: 0.14, sho: 0.12, phy: 0.1, pac: 0.1 },
    FW: { sho: 0.4, dri: 0.2, pac: 0.2, phy: 0.1, pas: 0.1 },
  };
  // 세부 포지션별 능력치 성향 (평균 대비)
  const T_FB = { pac: 5, sho: -15, pas: -2, dri: -3, def: 3, phy: -2, gk: -55 };
  const T_WM = { pac: 5, sho: -4, pas: 2, dri: 4, def: -10, phy: -3, gk: -55 };
  const T_W = { pac: 7, sho: 1, pas: -1, dri: 7, def: -24, phy: -6, gk: -55 };
  const TEMPLATE = {
    GK: { pac: -25, sho: -40, pas: -15, dri: -30, def: -20, phy: 0, gk: 6 },
    CB: { pac: -3, sho: -22, pas: -6, dri: -12, def: 7, phy: 5, gk: -55 },
    LB: T_FB, RB: T_FB,
    DM: { pac: -4, sho: -10, pas: 3, dri: -4, def: 4, phy: 3, gk: -55 },
    CM: { pac: -3, sho: -4, pas: 5, dri: 1, def: -3, phy: 0, gk: -55 },
    AM: { pac: 0, sho: 1, pas: 5, dri: 6, def: -18, phy: -6, gk: -55 },
    LM: T_WM, RM: T_WM, LW: T_W, RW: T_W,
    ST: { pac: 2, sho: 7, pas: -6, dri: 1, def: -28, phy: 3, gk: -55 },
  };

  function ovrOf(attr, pos) {
    const w = W[pos];
    let s = 0;
    for (const k in w) s += attr[k] * w[k];
    return Math.round(s);
  }

  function roleOvr(p, role) {
    const fit = D.fit(role, p);
    if (role === 'GK') return Math.round(ovrOf(p.attr, 'GK') * (p.pos === 'GK' ? 1 : 0.4));
    return Math.round(ovrOf(p.attr, D.ROLE_GROUP[role]) * fit);
  }

  // ── 시장 가치 ↔ 능력치 ─────────────────────────────────────
  const L30 = Math.log10(30);
  function ageShift(age) {
    // 어린 선수는 가치에 잠재력이 섞여 있고, 노장은 능력에 비해 가치가 낮다
    if (age <= 19) return -6;
    if (age <= 20) return -5;
    if (age <= 21) return -3.5;
    if (age <= 22) return -2.5;
    if (age <= 23) return -1.5;
    if (age <= 24) return -0.5;
    if (age <= 29) return 0;
    return Math.min(5, (age - 29) * 1.2);
  }
  function ovrFromValue(valueK, age) {
    const L = Math.log10(Math.max(valueK, 25) / 1000);
    const base = 64 + 8.6 * L + 6 * Math.max(0, L - L30);
    return Math.round(clamp(base + ageShift(age), 45, 93));
  }
  function valueFromOvr(ovr, age) {
    const o = ovr - ageShift(age);
    const lim = 64 + 8.6 * L30;
    const L = o <= lim ? (o - 64) / 8.6 : (o - 64 + 6 * L30) / 14.6;
    return Math.max(25, Math.round(Math.pow(10, L) * 1000 / 25) * 25);
  }
  function wageOf(p) {
    return Math.max(1, Math.round(8 * Math.pow(p.value / 1000, 0.72) * 10) / 10);
  }

  function blankStats() {
    return { apps: 0, goals: 0, assists: 0, yel: 0, red: 0, rsum: 0, cs: 0 };
  }

  // 능력치 생성: 세부 포지션 성향 + 선수별 고정 난수 → OVR이 목표에 맞도록 보정
  function makeAttrs(rng, role, target, height) {
    const pos = D.ROLE_GROUP[role];
    const t = TEMPLATE[role];
    const attr = {};
    for (const k of ATTRS) attr[k] = rng.gauss(target + t[k], 5.5);
    if (height >= 188) { attr.phy += 4; attr.pac -= 2; attr.dri -= 2; }
    else if (height && height <= 172) { attr.dri += 3; attr.pac += 2; attr.phy -= 5; }
    for (let i = 0; i < 3; i++) {
      const diff = target - ovrOf(attr, pos);
      for (const k of ATTRS) attr[k] += diff;
    }
    for (const k of ATTRS) attr[k] = Math.round(clamp(attr[k], 12, 97));
    return attr;
  }

  function basePlayer(id, name, role, age) {
    return {
      id, name, role, pos: D.ROLE_GROUP[role], age, attr: null,
      ovr: 0, pot: 0, cond: 100, morale: 70, form: 6.5,
      inj: 0, sus: 0, contract: 2, num: 0, nat: '', photo: '', foot: '', h: 0,
      teamId: null, listed: false, value: 0, wage: 0, vOvr: 0,
      season: blankStats(), career: blankStats(), ratings: [],
    };
  }

  // 트랜스퍼마크트 선수 → 게임 선수
  function createRealPlayer(G, raw, seasonYear) {
    const role = D.ROLE_KO[raw.pos] || 'CM';
    const rng = new RNG((raw.id * 2654435761) >>> 0);
    const p = basePlayer(raw.id, raw.name, role, raw.age);
    const h = parseInt(String(raw.h || '').replace(/\D/g, ''), 10) || 0;
    p.h = h; p.nat = raw.nat || ''; p.photo = raw.photo || ''; p.foot = raw.foot || '';
    p.num = raw.num || 0;
    p.value = Math.max(25, Math.round((raw.value || 50000) / 1000));
    const target = ovrFromValue(p.value, p.age);
    p.attr = makeAttrs(rng, role, target, h);
    p.ovr = ovrOf(p.attr, p.pos);
    p.vOvr = p.ovr;
    const growth = p.age <= 19 ? rng.int(10, 22) : p.age <= 21 ? rng.int(6, 16) : p.age <= 23 ? rng.int(3, 10) : p.age <= 26 ? rng.int(0, 4) : 0;
    p.pot = clamp(p.ovr + growth, p.ovr, 95);
    p.contract = clamp((raw.until || seasonYear + 1) - seasonYear, 1, 6);
    p.wage = wageOf(p);
    G.players[p.id] = p;
    return p;
  }

  // 유스·자유계약용 가상 선수 (이름은 같은 리그 선수들의 이름 조각을 섞어서 만든다)
  function createPlayer(G, rng, role, target, age, namePool) {
    if (D.ROLE_GROUP[role] == null) role = { GK: 'GK', DF: 'CB', MF: 'CM', FW: 'ST' }[role] || 'CM';
    const id = G.nextPid++;
    const p = basePlayer(id, makeName(rng, namePool), role, age);
    p.attr = makeAttrs(rng, role, target, 0);
    p.ovr = ovrOf(p.attr, p.pos);
    p.vOvr = p.ovr;
    const growth = age <= 19 ? rng.int(8, 24) : age <= 22 ? rng.int(3, 14) : age <= 25 ? rng.int(0, 6) : 0;
    p.pot = clamp(p.ovr + growth, p.ovr, 94);
    p.value = valueFromOvr(p.ovr, age);
    p.wage = wageOf(p);
    p.contract = rng.int(1, 3);
    p.nat = namePool && namePool.nat ? namePool.nat : '';
    p.gen = true;
    G.players[id] = p;
    return p;
  }

  function makeName(rng, pool) {
    if (pool && pool.korean) return rng.pick(D.SURNAMES) + rng.pick(D.GIVEN_A) + rng.pick(D.GIVEN_B);
    if (pool && pool.first && pool.first.length && pool.last.length) return rng.pick(pool.first) + ' ' + rng.pick(pool.last);
    return rng.pick(['Alex', 'Leo', 'Noah', 'Lucas', 'Mateo', 'Adam']) + ' ' + rng.pick(['Silva', 'Martin', 'Weber', 'Rossi', 'Moreau', 'Kim']);
  }

  // 시장 가치는 실제 값에서 출발하고, 능력치 변화만큼 따라 움직인다
  function refreshPlayer(p) {
    p.ovr = ovrOf(p.attr, p.pos);
    if (p.pot < p.ovr) p.pot = p.ovr;
    if (p.vOvr !== p.ovr) {
      p.value = Math.max(25, Math.round(p.value * Math.pow(10, (p.ovr - p.vOvr) / 8.6) / 25) * 25);
      p.vOvr = p.ovr;
    }
  }
  function agePlayerValue(p) {
    const f = p.age <= 21 ? 1.08 : p.age <= 25 ? 1.02 : p.age <= 28 ? 0.96 : p.age <= 30 ? 0.85 : p.age <= 32 ? 0.72 : 0.55;
    p.value = Math.max(25, Math.round(p.value * f / 25) * 25);
  }

  const SKIP = /^(fc|afc|cf|sc|ac|as|ssc|rc|ud|sd|rcd|ca|cd|vfb|vfl|tsg|sv|bv|ogc|losc|fk|sk|hsc|stade|club|1|real)$/;
  const SHORT = {
    'manchester-city': 'MCI', 'manchester-united': 'MUN', 'real-madrid': 'RMA', 'borussia-dortmund': 'BVB', 'borussia-monchengladbach': 'BMG',
    'paris-saint-germain': 'PSG', 'fc-paris-saint-germain': 'PSG', 'atletico-madrid': 'ATM', 'real-sociedad': 'RSO', 'real-betis-sevilla': 'BET',
    'inter-mailand': 'INT', 'ac-mailand': 'MIL', 'as-rom': 'ROM', 'ssc-neapel': 'NAP', 'rb-leipzig': 'RBL', 'fc-bayern-munchen': 'FCB',
    'west-ham-united': 'WHU', 'aston-villa': 'AVL', 'crystal-palace': 'CRY', 'nottingham-forest': 'NFO', 'newcastle-united': 'NEW',
    'tottenham-hotspur': 'TOT', 'leeds-united': 'LEE', 'fc-barcelona': 'BAR', 'athletic-bilbao': 'ATH', 'celta-vigo': 'CEL',
    'paris-fc': 'PFC', 'olympique-marseille': 'OM', 'olympique-lyon': 'OL', '1-fc-union-berlin': 'FCU', 'sv-werder-bremen': 'SVW',
    'brighton-amp-hove-albion': 'BHA', 'bayer-04-leverkusen': 'B04', 'rasenballsport-leipzig': 'RBL', '1-fsv-mainz-05': 'M05',
    'deportivo-la-coruna': 'RCD', 'deportivo-alaves': 'ALA', 'ud-levante': 'LEV', 'juventus-turin': 'JUV', 'ac-florenz': 'FIO',
    'lazio-rom': 'LAZ', 'us-sassuolo': 'SAS', 'fc-turin': 'TOR', 'genua-cfc': 'GEN', 'ac-monza': 'MZA', 'us-lecce': 'LEC',
    'as-monaco': 'ASM', 'rc-strassburg-alsace': 'RCS', 'fc-stade-rennes': 'REN', 'ogc-nizza': 'NIC', 'aj-auxerre': 'AJA',
    'stade-brest-29': 'SB29', 'sco-angers': 'SCO', 'ac-le-havre': 'HAC', 'es-troyes-ac': 'ESTAC', 'le-mans-fc': 'LMF',
    'fc-brentford': 'BRE', 'atalanta-bergamo': 'ATA', 'fc-bologna': 'BOL', 'inter-mailand': 'INT', 'jeonbuk-hyundai-motors': 'JBK',
    'ulsan-hyundai': 'ULS', 'daejeon-hana-citizen': 'DJN', 'gimcheon-sangmu': 'GIM', 'gangwon-fc': 'GWN', 'fc-seoul': 'SEO',
    'fc-anyang': 'FCA', 'jeju-united': 'JEJ', 'incheon-united': 'ICN', 'bucheon-fc-1995': 'BFC', 'gwangju-fc': 'GJU', 'pohang-steelers': 'POH',
  };
  function shortName(club) {
    if (SHORT[club.slug]) return SHORT[club.slug];
    const words = club.slug.split('-').filter((w) => !SKIP.test(w) && !/^\d+$/.test(w));
    return (words[0] || club.slug).slice(0, 3).toUpperCase();
  }

  function createRealTeam(G, club, leagueIdx, code, colors, seasonYear) {
    const rng = new RNG((club.id * 7919) >>> 0);
    const name = D.CLUB_KO[club.name] || club.name.replace(/\s+FC$/, '').replace(/^FC\s+/, '');
    const col = colors[club.id] || ['#2d3a4a', '#ffffff'];
    const team = {
      id: G.teams.length, tm: club.id, name, short: shortName(club), c1: col[0], c2: col[1],
      stadium: club.stadium || name + ' 홈구장', cap: club.cap || (code === 'RSK1' ? 15000 : 30000),
      league: leagueIdx, code,
      squad: [],
      tactics: { formation: rng.pick(['4-3-3', '4-2-3-1', '4-4-2', '4-2-3-1', '4-3-3', '3-5-2', '4-1-4-1']), mentality: 2, style: 1, press: 1, line: 1, width: 1 },
      lineup: [], bench: [], balance: 0, fans: 60, rep: 50,
      facilities: { train: 2, youth: 2, stadium: 1 },
      form: [],
    };
    for (const raw of club.players) {
      if (G.players[raw.id]) continue; // 같은 선수가 두 구단에 나오는 경우 (임대 등)
      const p = createRealPlayer(G, raw, seasonYear);
      p.teamId = team.id;
      team.squad.push(p.id);
    }
    const total = team.squad.reduce((s, id) => s + G.players[id].value, 0); // k€
    team.rep = Math.round(clamp(30 + 20 * Math.log10(Math.max(total, 1000) / 1000), 35, 96));
    team.balance = Math.round(total * 0.14 / 100) * 100;
    const lvl = team.rep >= 85 ? 4 : team.rep >= 75 ? 3 : 2;
    team.facilities = { train: lvl, youth: lvl, stadium: 1 };
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

  // 역할 적합도 기준으로 선발 11명 + 벤치 9명 구성
  function autoLineup(G, team) {
    const slots = D.FORMATIONS[team.tactics.formation];
    const pool = team.squad.map((id) => G.players[id]).filter(available);
    const taken = new Set();
    const lineup = new Array(slots.length).fill(null);
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
    return Math.round(team.squad.reduce((s, id) => s + G.players[id].wage, 0) * 10) / 10;
  }

  KM.World = {
    ATTRS, ATTR_KO, ovrOf, roleOvr, wageOf, createPlayer, createRealTeam, refreshPlayer, agePlayerValue,
    ovrFromValue, valueFromOvr, autoLineup, validateLineup, teamRating, squadOvr, wageBill, assignNumbers, available, blankStats,
  };
})(globalThis.KM || (globalThis.KM = {}));
