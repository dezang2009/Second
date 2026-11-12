'use strict';
/* 심연의 계단 — 텍스트 던전 탐험 RPG */
const G = (() => {
  const SAVE_KEY = 'abyss.save.v1';
  const REC_KEY = 'abyss.records.v1';
  const MAX_FLOOR = 10;

  // ---------- 도우미 ----------
  const R = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const chance = (p) => Math.random() < p;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = R(0, i); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function jong(w) {
    const c = w.charCodeAt(w.length - 1);
    if (c < 0xac00 || c > 0xd7a3) return 0;
    return (c - 0xac00) % 28;
  }
  // 조사: J(단어, '이', '가'), J(단어, '을', '를'), J(단어, '은', '는'), J(단어, '으로', '로')
  function J(w, a, b) {
    const j = jong(w);
    if (a === '으로') return w + (j && j !== 8 ? '으로' : '로');
    return w + (j ? a : b);
  }
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 저장 불가 */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* 무시 */ } },
  };

  // ---------- 데이터 ----------
  const CLASSES = {
    warrior: {
      name: '전사', icon: '🛡', desc: '튼튼한 체력과 방어력. 처음이라면 추천.',
      hp: 46, mp: 10, atk: 6, def: 3, crit: 0.06, dodge: 0.04, flee: 0.5,
      grow: { hp: 9, mp: 2, atk: 2, def: 1.2 },
      weapons: ['낡은 검', '강철 검', '기사의 장검', '룬 대검', '용살자의 검'],
      guard: '방패를 들어 올려 공격에 대비한다.',
      skills: [
        { id: 'smash', name: '강타', mp: 4, lv: 1, desc: '공격력 1.8배의 일격' },
        { id: 'rally', name: '재정비', mp: 7, lv: 4, desc: '최대 체력의 35% 회복' },
      ],
    },
    mage: {
      name: '마법사', icon: '✦', desc: '약한 몸, 강력한 주문. 마나 관리가 핵심.',
      hp: 34, mp: 26, atk: 5, def: 1, crit: 0.05, dodge: 0.05, flee: 0.5,
      grow: { hp: 5, mp: 6, atk: 2, def: 0.6 },
      weapons: ['참나무 지팡이', '수정 지팡이', '현자의 지팡이', '별빛 지팡이', '태초의 지팡이'],
      guard: '마력의 장막을 펼쳐 몸을 감싼다.',
      skills: [
        { id: 'fire', name: '화염구', mp: 5, lv: 1, desc: '방어를 무시하는 2배 화염 (빗나가지 않음)' },
        { id: 'ice', name: '얼음 창', mp: 9, lv: 4, desc: '1.6배 피해, 적을 1턴 얼림' },
      ],
    },
    rogue: {
      name: '도적', icon: '🗡', desc: '높은 치명타와 회피. 함정과 미믹을 잘 알아챈다.',
      hp: 36, mp: 14, atk: 6, def: 2, crit: 0.2, dodge: 0.15, flee: 0.75,
      grow: { hp: 7, mp: 3, atk: 2, def: 0.8 },
      weapons: ['녹슨 단검', '강철 단검', '그림자 단검', '독사의 송곳니', '밤의 칼날'],
      guard: '몸을 낮추고 상대의 움직임을 읽는다.',
      skills: [
        { id: 'stab', name: '급소 찌르기', mp: 4, lv: 1, desc: '반드시 치명타 (2.2배)' },
        { id: 'venom', name: '독 바르기', mp: 6, lv: 4, desc: '적을 4턴 동안 맹독에 빠뜨림' },
      ],
    },
  };
  const WEAPON_ATK = [2, 5, 9, 14, 20];
  const ARMORS = [['천 옷', 1], ['가죽 갑옷', 3], ['사슬 갑옷', 6], ['판금 갑옷', 10], ['미스릴 갑옷', 15]];
  const GEAR_PRICE = [0, 50, 120, 230, 380];

  const MONSTERS = [
    [ // 1~2층
      { n: '거대 쥐', hp: 10, atk: 5, def: 0, xp: 5, g: 3 },
      { n: '초록 슬라임', hp: 14, atk: 5, def: 2, xp: 6, g: 4 },
      { n: '고블린', hp: 16, atk: 7, def: 1, xp: 8, g: 7 },
      { n: '박쥐 떼', hp: 9, atk: 6, def: 0, xp: 6, g: 2, dodge: 0.25 },
      { n: '동굴 거미', hp: 12, atk: 5, def: 0, xp: 7, g: 3, poison: 0.3 },
    ],
    [ // 3~5층
      { n: '해골 병사', hp: 26, atk: 10, def: 3, xp: 15, g: 12 },
      { n: '오크 전사', hp: 34, atk: 12, def: 2, xp: 18, g: 15 },
      { n: '독거미', hp: 22, atk: 9, def: 1, xp: 14, g: 8, poison: 0.35 },
      { n: '굶주린 늑대', hp: 24, atk: 11, def: 2, xp: 15, g: 6, dodge: 0.15 },
      { n: '고블린 주술사', hp: 20, atk: 13, def: 1, xp: 16, g: 14 },
    ],
    [ // 6~7층
      { n: '망령', hp: 40, atk: 16, def: 3, xp: 30, g: 20, dodge: 0.2, drain: true },
      { n: '동굴 트롤', hp: 70, atk: 18, def: 4, xp: 38, g: 25, regen: 5 },
      { n: '리자드맨', hp: 50, atk: 17, def: 6, xp: 32, g: 22 },
      { n: '어둠 마법사', hp: 38, atk: 22, def: 2, xp: 34, g: 30 },
      { n: '시체 구울', hp: 48, atk: 15, def: 4, xp: 30, g: 18, poison: 0.3 },
    ],
    [ // 8~10층
      { n: '가고일', hp: 70, atk: 22, def: 10, xp: 50, g: 35 },
      { n: '흑기사', hp: 85, atk: 25, def: 9, xp: 58, g: 45 },
      { n: '키메라', hp: 90, atk: 26, def: 6, xp: 60, g: 40, poison: 0.3 },
      { n: '그림자 암살자', hp: 60, atk: 28, def: 4, xp: 55, g: 50, dodge: 0.25 },
      { n: '심연의 눈', hp: 65, atk: 24, def: 5, xp: 52, g: 38, drain: true },
    ],
  ];
  const TIER_START = [1, 3, 6, 8];
  const TIER_POW = [1, 1.1, 1.2, 1.3];
  const BOSSES = {
    5: {
      n: '고블린 왕 그락', hp: 160, atk: 20, def: 5, xp: 90, g: 120, boss: true, every: 3,
      intro: '썩은 왕좌 위에서 거대한 고블린이 몸을 일으킨다. "감히 내 왕국에 발을 들여?"',
      tele: '그락이 거대한 몽둥이를 머리 위로 치켜든다! (방어하는 게 좋겠다)',
      big: '몽둥이를 내리친다', mult: 1.9,
    },
    10: {
      n: '심연의 군주', hp: 400, atk: 34, def: 10, xp: 0, g: 0, boss: true, final: true, every: 4,
      intro: '끝없는 어둠이 형체를 이룬다. 수천 개의 목소리가 한꺼번에 속삭인다. "마침내… 왔구나, 작은 불꽃이여."',
      tele: '군주의 주위로 어둠이 소용돌이친다… 무언가 거대한 것이 온다! (방어하는 게 좋겠다)',
      big: '심연의 파동을 터뜨린다', mult: 2.2,
    },
  };
  const FLOOR_NAMES = { 1: '버려진 지하실', 2: '버려진 지하실', 3: '고블린 굴', 4: '고블린 굴', 5: '고블린 왕의 알현실', 6: '망자의 묘지', 7: '망자의 묘지', 8: '그림자 회랑', 9: '그림자 회랑', 10: '심연의 옥좌' };
  const FLAVOR = [
    '축축한 돌벽에서 물방울이 떨어진다.', '바닥에 오래된 뼈가 흩어져 있다.', '희미한 횃불이 벽에서 깜빡인다.',
    '거미줄이 천장을 뒤덮고 있다.', '부서진 나무 상자들이 쌓여 있다.', '어디선가 낮은 신음 소리가 들린다.',
    '이끼가 희미한 푸른빛을 낸다.', '무너진 기둥이 길을 반쯤 막고 있다.', '벽에 알 수 없는 문자가 새겨져 있다.',
    '썩은 냄새가 코를 찌른다.', '차가운 바람이 어디선가 불어온다.', '녹슨 쇠사슬이 벽에 매달려 있다.',
    '발밑에서 무언가 바스락거리며 도망친다.', '천장에서 흙가루가 조금씩 떨어진다.', '오래전 누군가 피웠던 모닥불 자국이 있다.',
  ];
  const NAMES = ['아린', '도윤', '세라', '카엘', '루나', '한결', '이안', '서하', '레오', '미르'];
  const DIRS = { n: [0, -1, '북'], s: [0, 1, '남'], w: [-1, 0, '서'], e: [1, 0, '동'] };

  // ---------- 상태 ----------
  let S = null;          // 진행 중인 게임
  let pre = null;        // 새 게임 만들기 단계 { step: 'name' | 'class', name }
  let buttons = [];
  let el = {};

  const C = () => CLASSES[S.cls];
  const cell = (x, y) => (x < 0 || y < 0 || x > 4 || y > 4 ? null : S.map[y * 5 + x]);
  const cur = () => cell(S.px, S.py);
  const pAtk = () => Math.floor(S.atk) + WEAPON_ATK[S.wt];
  const pDef = () => Math.floor(S.def) + ARMORS[S.at][1];
  const need = (l) => 10 * l * l + 15 * l;
  const wName = (t) => CLASSES[S.cls].weapons[t];
  const nm = () => esc(S.name);

  // ---------- 출력 ----------
  function say(t, c = '') {
    const e = { t, c };
    if (S) { S.log.push(e); if (S.log.length > 120) S.log.shift(); }
    appendLog(e);
  }
  function appendLog(e) {
    if (!el.log) return;
    const p = document.createElement('p');
    p.className = e.c;
    p.innerHTML = e.t;
    el.log.appendChild(p);
    while (el.log.children.length > 160) el.log.firstChild.remove();
    el.log.scrollTop = el.log.scrollHeight;
  }
  function clearLog() { if (el.log) el.log.innerHTML = ''; }
  function save() {
    if (S && S.mode !== 'dead' && S.mode !== 'win') ls.set(SAVE_KEY, JSON.stringify(S));
  }

  // ---------- 층 생성 ----------
  function genFloor(f) {
    const map = Array(25).fill(null);
    const mk = () => ({ t: 'empty', v: false, s: false, d: false, fl: R(0, FLAVOR.length - 1) });
    const sx = R(0, 4), sy = R(0, 4);
    map[sy * 5 + sx] = mk();
    const target = Math.min(20, 10 + f);
    let n = 1, cx = sx, cy = sy, guard = 0;
    const dl = Object.values(DIRS);
    while (n < target && guard++ < 5000) {
      const d = pick(dl);
      const nx = cx + d[0], ny = cy + d[1];
      if (nx < 0 || ny < 0 || nx > 4 || ny > 4) continue;
      cx = nx; cy = ny;
      if (!map[cy * 5 + cx]) { map[cy * 5 + cx] = mk(); n++; }
    }
    const dist = Array(25).fill(-1);
    dist[sy * 5 + sx] = 0;
    const q = [[sx, sy]];
    while (q.length) {
      const [a, b] = q.shift();
      for (const d of dl) {
        const na = a + d[0], nb = b + d[1];
        if (na < 0 || nb < 0 || na > 4 || nb > 4) continue;
        const i = nb * 5 + na;
        if (map[i] && dist[i] < 0) { dist[i] = dist[b * 5 + a] + 1; q.push([na, nb]); }
      }
    }
    let far = sy * 5 + sx;
    for (let i = 0; i < 25; i++) if (dist[i] > dist[far]) far = i;
    map[far].t = BOSSES[f] ? 'boss' : 'stairs';
    const rest = [];
    for (let i = 0; i < 25; i++) if (map[i] && i !== far && i !== sy * 5 + sx) rest.push(i);
    shuffle(rest);
    const assign = (t, k) => { for (let j = 0; j < k && rest.length; j++) map[rest.pop()].t = t; };
    if (f >= 2 && (f % 2 === 0 || chance(0.35))) assign('shop', 1);
    if (chance(0.6)) assign('shrine', 1);
    assign('chest', R(2, 3));
    assign('trap', R(1, 2));
    assign('monster', Math.round(rest.length * 0.6));
    for (const c of map) if (c && c.t === 'chest' && f >= 2 && chance(0.15)) c.mimic = true;
    map[sy * 5 + sx].v = true;
    return { map, x: sx, y: sy };
  }

  function makeMonster(f) {
    const tier = f <= 2 ? 0 : f <= 5 ? 1 : f <= 7 ? 2 : 3;
    const m = scaleMon(pick(MONSTERS[tier]), 1 + 0.1 * (f - TIER_START[tier]));
    m.hp = m.mhp = Math.round(m.hp * TIER_POW[tier]);
    m.atk = Math.round(m.atk * TIER_POW[tier]);
    return m;
  }
  function scaleMon(b, mult) {
    const m = Object.assign({}, b);
    for (const k of ['hp', 'atk', 'def', 'xp', 'g']) m[k] = Math.round(b[k] * mult);
    m.mhp = m.hp;
    m.turn = 0; m.frozen = 0; m.psn = 0;
    return m;
  }
  function makeMimic(f) {
    return { n: '미믹', hp: 20 + 9 * f, atk: Math.round(6 + 2.3 * f), def: Math.round(2 + f / 2), xp: 8 + 6 * f, g: 20 + 12 * f, mimic: true, turn: 0, frozen: 0, psn: 0, mhp: 20 + 9 * f };
  }

  // ---------- 진행 ----------
  function newGame(name, cls) {
    const c = CLASSES[cls];
    S = {
      v: 1, name, cls, lvl: 1, xp: 0,
      hp: c.hp, mhp: c.hp, mp: c.mp, mmp: c.mp, atk: c.atk, def: c.def,
      wt: 0, at: 0, gold: 15, potions: 2, ethers: 1, poison: 0,
      floor: 0, map: null, px: 0, py: 0, prev: null, rested: false,
      mode: 'explore', enemy: null, kills: 0, turns: 0, log: [],
    };
    pre = null;
    clearLog();
    say('심연의 계단', 'title');
    say('오래전, 왕국의 지하 깊은 곳에 <b>심연</b>이 열렸다. 그 바닥에 잠든 군주를 쓰러뜨리지 않으면 왕국은 어둠에 삼켜진다.', 'story');
    say(`${c.name} ${nm()}, 그대는 횃불 하나와 ${J(wName(0), '을', '를')} 들고 첫 계단을 내려간다…`, 'story');
    enterFloor(1);
  }

  function enterFloor(f) {
    S.floor = f;
    const g = genFloor(f);
    S.map = g.map; S.px = g.x; S.py = g.y; S.prev = null; S.rested = false;
    S.mode = 'explore';
    say(`— 지하 ${f}층 · ${FLOOR_NAMES[f]} —`, 'floor');
    if (f === 5) say('이 층 어딘가에서 거친 웃음소리가 울린다. 고블린들의 왕이 있는 곳이다.', 'warn');
    if (f === 10) say('공기가 무겁다. 이곳이 심연의 바닥이다.', 'warn');
    enterRoom();
  }

  function exits() {
    return Object.entries(DIRS).filter(([, d]) => cell(S.px + d[0], S.py + d[1])).map(([k]) => k);
  }

  function enterRoom() {
    const c = cur();
    c.v = true;
    for (const d of Object.values(DIRS)) { const n = cell(S.px + d[0], S.py + d[1]); if (n) n.s = true; }
    if (!c.seenDesc) { c.seenDesc = true; say(FLAVOR[c.fl], 'desc'); }
    else say('지나온 방이다.', 'sys');
    say('갈 수 있는 길: ' + exits().map((k) => DIRS[k][2]).join(' · '), 'sys');

    if (c.t === 'monster' && !c.d) {
      const m = c.m || makeMonster(S.floor);
      c.m = null;
      startCombat(m);
    } else if (c.t === 'boss' && !c.d) {
      const b = scaleMon(BOSSES[S.floor], 1);
      say(b.intro, 'warn');
      startCombat(b);
    } else if (c.t === 'chest' && !c.d) {
      S.mode = 'chest';
      say('방 한가운데 낡은 보물 상자가 놓여 있다.', 'loot');
      if (c.mimic && c.sensed === undefined) c.sensed = chance(S.cls === 'rogue' ? 0.7 : 0.2);
      if (c.mimic && c.sensed) say('…상자가 아주 미세하게 숨을 쉬는 것 같다. 미믹일지도 모른다.', 'warn');
    } else if (c.t === 'trap' && !c.d) {
      trap(c);
    } else if (c.t === 'shrine' && !c.d) {
      S.mode = 'shrine';
      say('부서진 제단 위에서 은은한 빛이 맴돈다. 고대 신의 축복이 남아 있는 것 같다.', 'heal');
    } else if (c.t === 'shop') {
      S.mode = 'shop';
      say('천막 아래 떠돌이 상인 <b>모르</b>가 손을 비빈다. "어서 오시게, 살아 있는 손님은 오랜만이야."', 'loot');
    } else if (c.t === 'stairs') {
      say('아래로 이어지는 어두운 계단이 있다. <b>[내려가기]</b>', 'loot');
    } else if (c.t === 'shrine') {
      say('빛이 사라진 제단이 있다.', 'sys');
    } else if (c.t === 'chest') {
      say('열린 빈 상자가 굴러다닌다.', 'sys');
    }
  }

  function move(k) {
    if (S.mode !== 'explore') return;
    const d = DIRS[k];
    const n = cell(S.px + d[0], S.py + d[1]);
    if (!n) { say('단단한 벽이 가로막고 있다.', 'sys'); return; }
    S.prev = [S.px, S.py];
    S.px += d[0]; S.py += d[1];
    S.turns++;
    say(`${d[2]}쪽으로 걸어간다.`, 'move');
    if (tickPoison()) return;
    enterRoom();
  }

  function tickPoison() {
    if (S.poison <= 0) return false;
    const d = Math.max(1, Math.floor(S.mhp * 0.05));
    S.hp -= d; S.poison--;
    say(`독이 몸에 퍼진다. <b>${d}</b>의 피해.${S.poison ? '' : ' (독이 빠졌다)'}`, 'dmg');
    if (S.hp <= 0) { die('독'); return true; }
    return false;
  }

  function trap(c) {
    c.d = true;
    if (chance(S.cls === 'rogue' ? 0.65 : 0.2)) {
      const xp = 3 * S.floor;
      say(`바닥의 수상한 돌판을 알아채고 조심스럽게 피했다. (경험치 +${xp})`, 'heal');
      gainXp(xp);
      return;
    }
    const kind = R(0, 2);
    if (kind === 0) {
      const d = Math.max(3, Math.round(S.mhp * 0.15));
      S.hp -= d; say(`딸깍! 벽에서 화살이 날아온다. <b>${d}</b>의 피해!`, 'dmg');
    } else if (kind === 1) {
      const d = Math.max(2, Math.round(S.mhp * 0.07));
      S.hp -= d; S.poison = 4; say(`발밑에서 독침이 튀어나왔다! <b>${d}</b>의 피해, 중독되었다!`, 'dmg');
    } else {
      const d = Math.max(3, Math.round(S.mmp * 0.4));
      S.mp = Math.max(0, S.mp - d); say(`보랏빛 가스가 뿜어져 나온다. 정신이 흐려진다… 마나 <b>${d}</b> 감소.`, 'dmg');
    }
    if (S.hp <= 0) die('함정');
  }

  // ---------- 전투 ----------
  function startCombat(m) {
    S.enemy = m;
    S.mode = 'combat';
    S.guard = false;
    if (m.mimic) say('상자가 날카로운 이빨을 드러냈다! <b>미믹</b>이다!', 'mon');
    else say(`<b>${esc(J(m.n, '이', '가'))}</b> 나타났다!`, 'mon');
  }

  function roll(atk, def) { return Math.max(1, Math.round(atk + Math.random() * atk * 0.35 - def)); }

  function hit(mult, magic, forceCrit, verb) {
    const m = S.enemy;
    if (!magic && m.dodge && !forceCrit && chance(m.dodge)) { say(`${verb}! 하지만 ${J(m.n, '이', '가')} 재빠르게 피했다.`, 'sys'); return 0; }
    const crit = forceCrit || chance(C().crit);
    let d = roll(pAtk() * mult, magic ? 0 : m.def);
    if (crit) d = Math.round(d * (forceCrit ? 2.2 : 1.8));
    m.hp -= d;
    say(`${verb}! ${m.n}에게 <b>${d}</b>의 피해${crit ? ' <span class="crit">치명타!</span>' : ''}`, 'hit');
    return d;
  }

  function heal(amount, what) {
    const before = S.hp;
    S.hp = Math.min(S.mhp, S.hp + amount);
    say(`${what} 체력 <b>${S.hp - before}</b> 회복.`, 'heal');
  }

  function usePotion() {
    if (S.potions <= 0) { say('물약이 없다.', 'sys'); return false; }
    S.potions--;
    heal(Math.max(25, Math.round(S.mhp * 0.45)), '붉은 물약을 마셨다.');
    if (S.poison) { S.poison = 0; say('몸속의 독도 씻겨 나갔다.', 'heal'); }
    return true;
  }
  function useEther() {
    if (S.ethers <= 0) { say('에테르가 없다.', 'sys'); return false; }
    S.ethers--;
    const before = S.mp;
    S.mp = Math.min(S.mmp, S.mp + Math.max(10, Math.round(S.mmp * 0.5)));
    say(`푸른 에테르를 마셨다. 마나 <b>${S.mp - before}</b> 회복.`, 'heal');
    return true;
  }

  function combat(action) {
    const m = S.enemy;
    S.guard = false;
    if (action === 'attack') {
      hit(1, false, false, '공격');
    } else if (action === 'skill0' || action === 'skill1') {
      const sk = C().skills[action === 'skill0' ? 0 : 1];
      if (S.lvl < sk.lv) { say(`${sk.name}: 레벨 ${sk.lv}에 배운다.`, 'sys'); return; }
      if (S.mp < sk.mp) { say(`마나가 부족하다. (${sk.name}: 마나 ${sk.mp})`, 'sys'); return; }
      S.mp -= sk.mp;
      if (sk.id === 'smash') hit(1.8, false, false, '강타');
      else if (sk.id === 'rally') heal(Math.round(S.mhp * 0.35), '숨을 고르고 자세를 바로잡았다.');
      else if (sk.id === 'fire') hit(2.0, true, false, '화염구');
      else if (sk.id === 'ice') { hit(1.6, true, false, '얼음 창'); if (m.hp > 0) { m.frozen = 1; say(`${J(m.n, '이', '가')} 얼어붙었다!`, 'hit'); } }
      else if (sk.id === 'stab') hit(1, false, true, '급소 찌르기');
      else if (sk.id === 'venom') { m.psn = 4; say(`칼날에 맹독을 바르고 ${J(m.n, '을', '를')} 베었다. ${J(m.n, '이', '가')} 중독되었다!`, 'hit'); }
    } else if (action === 'guard') {
      S.guard = true;
      S.mp = Math.min(S.mmp, S.mp + 2);
      say(C().guard + ' (마나 +2)', 'sys');
    } else if (action === 'potion') {
      if (!usePotion()) return;
    } else if (action === 'ether') {
      if (!useEther()) return;
    } else if (action === 'flee') {
      if (m.boss) { say('도망칠 곳이 없다!', 'warn'); return; }
      if (chance(C().flee)) {
        say('등을 돌려 필사적으로 도망쳤다!', 'move');
        const c = cur();
        if (!m.ambush) c.m = m;
        S.enemy = null; S.mode = 'explore';
        if (S.prev) { S.px = S.prev[0]; S.py = S.prev[1]; S.prev = null; }
        enterRoom();
        return;
      }
      say('도망치려 했지만 붙잡혔다!', 'warn');
    }
    if (m.hp <= 0) return victory();
    enemyTurn();
    if (m.hp <= 0) return victory();
    if (S.hp <= 0) return die(m.n);
    if (tickPoison()) return;
  }

  function enemyTurn() {
    const m = S.enemy;
    m.turn++;
    if (m.psn > 0) {
      const d = Math.max(2, Math.round(pAtk() * 0.6));
      m.hp -= d; m.psn--;
      say(`${J(m.n, '이', '가')} 독에 시달린다. <b>${d}</b>의 피해.`, 'hit');
      if (m.hp <= 0) return;
    }
    if (m.regen && m.hp < m.mhp) {
      const h = Math.min(m.regen, m.mhp - m.hp);
      m.hp += h; say(`${m.n}의 상처가 꿈틀거리며 아문다. (+${h})`, 'mon');
    }
    if (m.frozen > 0) { m.frozen--; say(`${J(m.n, '은', '는')} 얼어붙어 움직이지 못한다.`, 'sys'); return; }
    let mult = 1, verb = '공격한다';
    if (m.boss) {
      if (m.final && !m.enraged && m.hp < m.mhp / 2) {
        m.enraged = true; m.atk = Math.round(m.atk * 1.25);
        say('심연의 군주가 포효한다. 어둠이 더욱 짙어진다! (공격력 상승)', 'warn');
      }
      if (m.charging) { mult = m.mult; verb = m.big; m.charging = false; }
      else if (m.turn % m.every === 0) { m.charging = true; say(m.tele, 'warn'); return; }
    }
    if (chance(C().dodge)) { say(`${J(m.n, '이', '가')} ${verb}! 몸을 날려 피했다.`, 'sys'); return; }
    let d = roll(m.atk * mult, pDef());
    if (S.guard) d = Math.max(1, Math.round(d * 0.4));
    S.hp -= d;
    say(`${J(m.n, '이', '가')} ${verb}! <b>${d}</b>의 피해를 입었다.${S.guard ? ' (방어)' : ''}`, 'dmg');
    if (m.poison && !S.poison && S.hp > 0 && chance(m.poison)) { S.poison = 4; say('상처가 보랏빛으로 물든다. 중독되었다!', 'dmg'); }
    if (m.drain && m.hp < m.mhp) {
      const h = Math.min(Math.round(d / 2), m.mhp - m.hp);
      if (h > 0) { m.hp += h; say(`${J(m.n, '이', '가')} 생명력을 빨아들인다. (+${h})`, 'mon'); }
    }
  }

  function victory() {
    const m = S.enemy;
    const c = cur();
    S.kills++;
    S.enemy = null; S.mode = 'explore';
    say(`${J(m.n, '을', '를')} 쓰러뜨렸다!`, 'win');
    if (m.final) return winGame();
    if (!m.ambush) c.d = true;
    if (m.g) { S.gold += m.g; say(`금화 <b>${m.g}</b>개를 주웠다.`, 'loot'); }
    if (!m.boss && chance(0.1)) { S.potions++; say('붉은 물약을 하나 떨어뜨렸다.', 'loot'); }
    if (m.mimic) { chestLoot(true); }
    if (m.boss) {
      c.t = 'stairs';
      gearDrop('w', Math.max(2, S.wt + 1));
      S.potions += 2; say('왕의 보물 더미에서 붉은 물약 2개를 챙겼다.', 'loot');
      say('왕좌 뒤로 아래로 이어지는 계단이 드러났다. <b>[내려가기]</b>', 'loot');
    }
    gainXp(m.xp);
  }

  function gainXp(x) {
    if (!x) return;
    S.xp += x;
    say(`경험치 +${x}`, 'sys');
    while (S.xp >= need(S.lvl)) {
      S.xp -= need(S.lvl);
      S.lvl++;
      const g = C().grow;
      S.mhp += g.hp; S.mmp += g.mp; S.atk += g.atk; S.def += g.def;
      S.hp = S.mhp; S.mp = S.mmp;
      say(`★ 레벨 업! <b>Lv.${S.lvl}</b> — 체력·마나가 모두 회복되었다.`, 'lvl');
      for (const sk of C().skills) if (sk.lv === S.lvl) say(`새 기술을 깨달았다: <b>${sk.name}</b> — ${sk.desc}`, 'lvl');
    }
  }

  function gearDrop(kind, tier) {
    tier = clamp(tier, 1, 4);
    if (kind === 'w') {
      if (tier > S.wt) { S.wt = tier; say(`<b>${wName(tier)}</b>${jong(wName(tier)) ? '을' : '를'} 손에 넣었다! (무기 공격력 ${WEAPON_ATK[tier]})`, 'loot'); return; }
      const g = 12 * tier; S.gold += g; say(`${J(wName(tier), '을', '를')} 찾았지만 지금 무기가 더 낫다. 금화 ${g}개 값어치는 되겠다.`, 'loot');
    } else {
      const a = ARMORS[tier][0];
      if (tier > S.at) { S.at = tier; say(`<b>${a}</b>${jong(a) ? '을' : '를'} 입었다! (방어구 방어력 ${ARMORS[tier][1]})`, 'loot'); return; }
      const g = 12 * tier; S.gold += g; say(`${J(a, '을', '를')} 찾았지만 지금 방어구가 더 낫다. 금화 ${g}개 값어치는 되겠다.`, 'loot');
    }
  }

  function chestLoot(bonus) {
    const f = S.floor;
    const r = Math.random();
    if (bonus || r < 0.2) {
      gearDrop(chance(0.5) ? 'w' : 'a', Math.floor((f - 1) / 2) + R(0, 1) + (bonus ? 1 : 0));
    } else if (r < 0.55) {
      const g = R(10, 22) * f; S.gold += g; say(`금화 <b>${g}</b>개가 반짝인다!`, 'loot');
    } else if (r < 0.82) {
      const n = chance(0.3) ? 2 : 1; S.potions += n; say(`붉은 물약 <b>${n}</b>개를 찾았다.`, 'loot');
    } else {
      S.ethers++; say('푸른 에테르 <b>1</b>개를 찾았다.', 'loot');
    }
  }

  function openChest(open) {
    const c = cur();
    S.mode = 'explore';
    if (!open) { say('상자를 그대로 두었다.', 'sys'); return; }
    c.d = true;
    if (c.mimic) { startCombat(makeMimic(S.floor)); return; }
    say('끼이익… 상자를 열었다.', 'sys');
    chestLoot(false);
  }

  function shrine(kind) {
    const c = cur();
    S.mode = 'explore';
    if (!kind) { say('제단을 지나쳤다.', 'sys'); return; }
    c.d = true;
    if (kind === 'life') { S.mhp += 8; S.hp = S.mhp; S.poison = 0; say('따스한 빛이 온몸을 감싼다. <b>최대 체력 +8</b>, 체력이 모두 회복되었다.', 'heal'); }
    if (kind === 'power') { S.atk += 2; say('팔에 힘이 솟구친다. <b>공격력 +2</b>', 'heal'); }
    if (kind === 'mind') { S.mmp += 6; S.mp = S.mmp; say('머릿속이 맑아진다. <b>최대 마나 +6</b>, 마나가 모두 회복되었다.', 'heal'); }
    say('제단의 빛이 꺼졌다.', 'sys');
  }

  function shopItems() {
    const f = S.floor;
    const cap = Math.min(4, Math.ceil(f / 2) + 1);
    const items = [
      { id: 'potion', label: '붉은 물약', price: 15 + 3 * f, desc: '체력 45% 회복, 해독' },
      { id: 'ether', label: '푸른 에테르', price: 18 + 3 * f, desc: '마나 50% 회복' },
    ];
    if (S.wt < 4 && S.wt + 1 <= cap) items.push({ id: 'weapon', label: wName(S.wt + 1), price: GEAR_PRICE[S.wt + 1], desc: `무기 공격력 ${WEAPON_ATK[S.wt]}→${WEAPON_ATK[S.wt + 1]}` });
    if (S.at < 4 && S.at + 1 <= cap) items.push({ id: 'armor', label: ARMORS[S.at + 1][0], price: Math.round(GEAR_PRICE[S.at + 1] * 0.85), desc: `방어구 방어력 ${ARMORS[S.at][1]}→${ARMORS[S.at + 1][1]}` });
    return items;
  }
  function buy(id) {
    const it = shopItems().find((i) => i.id === id);
    if (!it) return;
    if (S.gold < it.price) { say('"돈이 모자라는구먼." 모르가 고개를 젓는다.', 'sys'); return; }
    S.gold -= it.price;
    if (id === 'potion') { S.potions++; say(`붉은 물약을 샀다. (−${it.price}G)`, 'loot'); }
    if (id === 'ether') { S.ethers++; say(`푸른 에테르를 샀다. (−${it.price}G)`, 'loot'); }
    if (id === 'weapon') { S.wt++; say(`<b>${it.label}</b>${jong(it.label) ? '을' : '를'} 샀다! (−${it.price}G)`, 'loot'); }
    if (id === 'armor') { S.at++; say(`<b>${it.label}</b>${jong(it.label) ? '을' : '를'} 샀다! (−${it.price}G)`, 'loot'); }
  }

  function rest() {
    if (S.rested) { say('이 층에서는 이미 쉬었다. 불안해서 눈이 감기지 않는다.', 'sys'); return; }
    S.rested = true;
    say('벽에 기대어 잠시 눈을 붙인다…', 'sys');
    if (chance(0.3)) {
      say('잠결에 무언가 다가오는 소리가 들린다!', 'warn');
      const m = makeMonster(S.floor); m.ambush = true;
      startCombat(m);
      return;
    }
    const h = Math.round(S.mhp * 0.4), mp = Math.round(S.mmp * 0.4);
    S.mp = Math.min(S.mmp, S.mp + mp);
    heal(h, '개운하게 일어났다.');
  }

  function descend() {
    const c = cur();
    if (c.t !== 'stairs') { say('여기에는 내려갈 계단이 없다.', 'sys'); return; }
    S.turns++;
    say('계단을 따라 더 깊은 어둠 속으로 내려간다…', 'move');
    enterFloor(S.floor + 1);
  }

  function look() {
    const c = cur();
    say(FLAVOR[c.fl], 'desc');
    say('갈 수 있는 길: ' + exits().map((k) => DIRS[k][2]).join(' · '), 'sys');
    const left = S.map.filter((x) => x && !x.v).length;
    say(left ? `이 층에는 아직 가 보지 않은 방이 ${left}개 있다.` : '이 층의 모든 방을 둘러보았다.', 'sys');
    const st = S.map.find((x) => x && (x.t === 'stairs' || x.t === 'boss') && x.v);
    if (!st) say('계단은 아직 찾지 못했다.', 'sys');
  }

  function status() {
    const c = C();
    say(`<b>${nm()}</b> · ${c.name} Lv.${S.lvl} — 공격력 ${pAtk()} · 방어력 ${pDef()} · 치명타 ${Math.round(c.crit * 100)}% · 회피 ${Math.round(c.dodge * 100)}%`, 'info');
    say(`무기: ${wName(S.wt)} (+${WEAPON_ATK[S.wt]}) · 방어구: ${ARMORS[S.at][0]} (+${ARMORS[S.at][1]})`, 'info');
    say(`기술: ${c.skills.map((s) => (S.lvl >= s.lv ? `${s.name}(마나 ${s.mp}) ${s.desc}` : `${s.name}(Lv.${s.lv}에 습득)`)).join(' / ')}`, 'info');
    say(`처치 ${S.kills} · 걸음 ${S.turns}${S.poison ? ' · <span class="bad">중독</span>' : ''}`, 'info');
  }

  function score(win) { return S.floor * 100 + S.kills * 10 + S.lvl * 50 + S.gold + (win ? 3000 : 0); }
  function record(win, cause) {
    let recs = [];
    try { recs = JSON.parse(ls.get(REC_KEY) || '[]'); } catch (e) { recs = []; }
    const sc = score(win);
    recs.push({ name: S.name, cls: S.cls, floor: S.floor, lvl: S.lvl, kills: S.kills, score: sc, win, cause: cause || '', date: new Date().toISOString().slice(0, 10) });
    recs.sort((a, b) => b.score - a.score);
    ls.set(REC_KEY, JSON.stringify(recs.slice(0, 10)));
    ls.del(SAVE_KEY);
    return sc;
  }
  function die(cause) {
    S.hp = 0;
    S.mode = 'dead';
    S.enemy = null;
    say(`${nm()}의 횃불이 꺼졌다…`, 'dead');
    say(`지하 ${S.floor}층에서 ${cause === '독' || cause === '함정' ? J(cause, '으로', '로') + ' 인해' : esc(cause) + '에게'} 쓰러졌다.`, 'dead');
    const sc = record(false, cause);
    say(`최종 점수 <b>${sc}</b> (Lv.${S.lvl} · 처치 ${S.kills} · 금화 ${S.gold})`, 'info');
  }
  function winGame() {
    S.mode = 'win';
    say('심연의 군주가 비명을 지르며 빛 속으로 흩어진다.', 'story');
    say('짙은 어둠이 걷히고, 아득히 먼 위쪽에서 한 줄기 햇빛이 내려온다.', 'story');
    say(`왕국은 구원받았다. 사람들은 오래도록 <b>${nm()}</b>의 이름을 노래할 것이다.`, 'story');
    const sc = record(true);
    say(`🏆 승리! 최종 점수 <b>${sc}</b> (Lv.${S.lvl} · 처치 ${S.kills} · 걸음 ${S.turns})`, 'lvl');
  }

  // ---------- 화면 ----------
  function title() {
    S = null; pre = null;
    clearLog();
    say('심연의 계단', 'title');
    say('텍스트로 즐기는 던전 탐험 RPG', 'story');
    say('지하 10층, 심연의 바닥에 잠든 군주를 쓰러뜨려라. 방을 탐험하고, 보물을 찾고, 괴물과 싸워 강해지자. 한 번 쓰러지면 처음부터 다시 시작해야 한다.', 'desc');
    say('버튼을 누르거나 아래 입력창에 명령(예: 북, 공격, 1)을 적어도 된다.', 'sys');
    render();
  }
  function showRecords() {
    let recs = [];
    try { recs = JSON.parse(ls.get(REC_KEY) || '[]'); } catch (e) { recs = []; }
    say('— 명예의 전당 —', 'floor');
    if (!recs.length) say('아직 기록이 없다.', 'sys');
    recs.forEach((r, i) => say(`${i + 1}. <b>${esc(r.name)}</b> (${CLASSES[r.cls] ? CLASSES[r.cls].name : ''} Lv.${r.lvl}) ${r.win ? '🏆 심연 정복' : `지하 ${r.floor}층`} — ${r.score}점`, 'info'));
  }
  function startNew() {
    S = null;
    pre = { step: 'name' };
    clearLog();
    say('모험가여, 그대의 이름은?', 'story');
    say('아래 입력창에 이름을 적고 [확인]을 누르자.', 'sys');
    render();
    if (el.input) el.input.focus();
  }
  function setName(n) {
    n = (n || '').trim().slice(0, 10) || pick(NAMES);
    pre = { step: 'class', name: n };
    say(`그대의 이름은 <b>${esc(n)}</b>.`, 'story');
    say('어떤 길을 걸어왔는가?', 'story');
    for (const c of Object.values(CLASSES)) say(`${c.icon} <b>${c.name}</b> — ${c.desc} (체력 ${c.hp} · 마나 ${c.mp} · 기술: ${c.skills[0].name})`, 'info');
    if (el.input) el.input.value = '';
    render();
  }
  function cont() {
    try {
      const s = JSON.parse(ls.get(SAVE_KEY));
      if (!s || !s.map) return;
      S = s; pre = null;
      clearLog();
      for (const e of S.log.slice(-60)) appendLog(e);
      say('— 이어서 모험을 계속한다 —', 'sys');
      render();
    } catch (e) { ls.del(SAVE_KEY); title(); }
  }

  const B = (l, f, o = {}) => Object.assign({ l, f }, o);
  function buttonsFor() {
    if (!S && !pre) {
      return { cols: 1, list: [
        B('새 모험', startNew, { k: ['새', '시작', 'new'], c: 'primary' }),
        B('이어하기', cont, { x: !ls.get(SAVE_KEY), k: ['이어', 'continue'] }),
        B('명예의 전당', showRecords, { k: ['기록', '랭킹'] }),
      ] };
    }
    if (pre && pre.step === 'name') {
      return { cols: 2, list: [
        B('확인', () => setName(el.input ? el.input.value : ''), { c: 'primary', k: ['ok'] }),
        B('무작위 이름', () => setName(pick(NAMES))),
        B('돌아가기', title),
      ] };
    }
    if (pre && pre.step === 'class') {
      return { cols: 3, list: Object.entries(CLASSES).map(([id, c]) => B(c.name, () => newGame(pre.name, id), { s: c.icon })).concat([B('돌아가기', title)]) };
    }
    const m = S.mode;
    if (m === 'explore') {
      const c = cur();
      const can = (k) => !!cell(S.px + DIRS[k][0], S.py + DIRS[k][1]);
      return { cols: 3, dpad: true, list: [
        B('가방', () => { S.mode = 'bag'; bag(); }, { k: ['인벤', 'i', '아이템'] }),
        B('북', () => move('n'), { x: !can('n'), k: ['n', '위', 'ㅂ', '북쪽'], c: 'dir', s: '▲' }),
        B('상태', status, { k: ['스탯', '정보', 'c'] }),
        B('서', () => move('w'), { x: !can('w'), k: ['w', '왼쪽', 'ㅅ', '서쪽'], c: 'dir', s: '◀' }),
        B('살피기', look, { k: ['보기', 'l', '둘러보기'] }),
        B('동', () => move('e'), { x: !can('e'), k: ['e', '오른쪽', 'ㄷ', '동쪽'], c: 'dir', s: '▶' }),
        B('휴식', rest, { x: S.rested, k: ['쉬기', 'r', '잠'] }),
        B('남', () => move('s'), { x: !can('s'), k: ['s', '아래', 'ㄴ', '남쪽'], c: 'dir', s: '▼' }),
        B('내려가기', descend, { x: c.t !== 'stairs', k: ['계단', 'd', '하강'], c: c.t === 'stairs' ? 'primary' : '' }),
      ] };
    }
    if (m === 'combat') {
      const sk = C().skills;
      const skb = (i) => B(sk[i].name, () => combat('skill' + i), { s: S.lvl >= sk[i].lv ? `마나 ${sk[i].mp}` : `Lv.${sk[i].lv}`, x: S.lvl < sk[i].lv || S.mp < sk[i].mp, k: ['스킬' + (i + 1), '기술' + (i + 1)] });
      return { cols: 3, list: [
        B('공격', () => combat('attack'), { c: 'primary', k: ['a', '때리기', '공'] }),
        skb(0), skb(1),
        B('방어', () => combat('guard'), { s: '피해 60%↓', k: ['막기', 'g', '방'] }),
        B('물약', () => combat('potion'), { s: `${S.potions}개`, x: !S.potions, k: ['p', '포션', '회복'] }),
        B('에테르', () => combat('ether'), { s: `${S.ethers}개`, x: !S.ethers, k: ['마나'] }),
        B('도망', () => combat('flee'), { s: S.enemy && S.enemy.boss ? '불가' : `${Math.round(C().flee * 100)}%`, x: !!(S.enemy && S.enemy.boss), k: ['f', '도주', '후퇴'] }),
      ] };
    }
    if (m === 'chest') {
      return { cols: 2, list: [
        B('연다', () => openChest(true), { c: 'primary', k: ['열기', 'o'] }),
        B('그냥 둔다', () => openChest(false), { k: ['무시', '두기'] }),
      ] };
    }
    if (m === 'shrine') {
      return { cols: 1, list: [
        B('생명의 축복', () => shrine('life'), { s: '최대 체력 +8 · 완전 회복', k: ['생명'] }),
        B('힘의 축복', () => shrine('power'), { s: '공격력 +2', k: ['힘'] }),
        B('지혜의 축복', () => shrine('mind'), { s: '최대 마나 +6 · 마나 회복', k: ['지혜'] }),
        B('지나간다', () => shrine(null), { k: ['무시'] }),
      ] };
    }
    if (m === 'shop') {
      return { cols: 1, list: shopItems().map((it) => B(it.label, () => buy(it.id), { s: `${it.price}G · ${it.desc}`, x: S.gold < it.price })).concat([
        B('떠나기', () => { S.mode = 'explore'; say('"또 들르게나." 모르가 손을 흔든다.', 'sys'); }, { k: ['나가기', '닫기', 'x'] }),
      ]) };
    }
    if (m === 'bag') {
      return { cols: 3, list: [
        B('물약 사용', () => { usePotion(); }, { s: `${S.potions}개`, x: !S.potions || (S.hp >= S.mhp && !S.poison), k: ['물약', 'p'] }),
        B('에테르 사용', () => { useEther(); }, { s: `${S.ethers}개`, x: !S.ethers || S.mp >= S.mmp, k: ['에테르'] }),
        B('닫기', () => { S.mode = 'explore'; }, { k: ['x', '나가기'] }),
      ] };
    }
    if (m === 'dead' || m === 'win') {
      return { cols: 2, list: [
        B('새 모험', startNew, { c: 'primary', k: ['다시', '새'] }),
        B('명예의 전당', showRecords, { k: ['기록'] }),
        B('처음 화면', title),
      ] };
    }
    return { cols: 1, list: [B('처음 화면', title)] };
  }

  function bag() {
    say('— 가방 —', 'floor');
    say(`붉은 물약 ${S.potions}개 · 푸른 에테르 ${S.ethers}개 · 금화 ${S.gold}개`, 'info');
    say(`무기: ${wName(S.wt)} (+${WEAPON_ATK[S.wt]}) · 방어구: ${ARMORS[S.at][0]} (+${ARMORS[S.at][1]})`, 'info');
  }

  function bar(cls, v, max, label) {
    const p = max > 0 ? clamp(v / max, 0, 1) * 100 : 0;
    return `<div class="bar ${cls}"><i style="width:${p}%"></i><span>${label}</span></div>`;
  }

  function renderStatus() {
    if (!S) {
      el.status.innerHTML = '<div class="brand">심연의 계단</div>';
      el.map.innerHTML = '';
      el.enemy.innerHTML = '';
      el.enemy.hidden = true;
      return;
    }
    const c = C();
    el.status.innerHTML =
      `<div class="who"><b>${nm()}</b> <span>${c.name} Lv.${S.lvl}</span></div>` +
      bar('hp', S.hp, S.mhp, `체력 ${Math.max(0, S.hp)}/${S.mhp}${S.poison ? ' ☠' : ''}`) +
      bar('mp', S.mp, S.mmp, `마나 ${S.mp}/${S.mmp}`) +
      bar('xp', S.xp, need(S.lvl), `경험 ${S.xp}/${need(S.lvl)}`) +
      `<div class="meta"><span>B${S.floor}F</span><span>💰${S.gold}</span><span>🧪${S.potions}</span><span>💧${S.ethers}</span></div>`;
    let h = '';
    for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
      const m = S.map[y * 5 + x];
      let cls = 'void', t = '';
      if (m && (m.v || m.s)) {
        cls = m.v ? 'room' : 'fog';
        if (m.v) {
          if (m.t === 'stairs') t = '▼';
          else if (m.t === 'boss') t = '☠';
          else if (m.t === 'shop') t = '$';
          else if (m.t === 'shrine' && !m.d) t = '✦';
          else if (m.t === 'chest' && !m.d) t = '◆';
          else if (m.t === 'monster' && !m.d) t = '!';
        }
      }
      if (x === S.px && y === S.py) { cls += ' me'; t = '●'; }
      h += `<div class="${cls}">${t}</div>`;
    }
    el.map.innerHTML = h;
    const e = S.enemy;
    el.enemy.hidden = !e;
    el.enemy.innerHTML = e ? `<div class="ename">${e.boss ? '☠ ' : ''}${esc(e.n)}${e.frozen ? ' ❄' : ''}${e.psn ? ' ☠' : ''}${e.charging ? ' ⚠' : ''}</div>` + bar('ehp', e.hp, e.mhp, `${Math.max(0, e.hp)}/${e.mhp}`) : '';
  }

  function renderButtons() {
    const { cols, list, dpad } = buttonsFor();
    buttons = list;
    el.actions.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    el.actions.className = dpad ? 'dpad' : '';
    el.actions.innerHTML = '';
    list.forEach((b, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = b.c || '';
      btn.disabled = !!b.x;
      btn.innerHTML = (b.s && b.c === 'dir' ? `<em>${b.s}</em>` : '') + `<b>${esc(b.l)}</b>` + (b.s && b.c !== 'dir' ? `<small>${esc(b.s)}</small>` : '');
      btn.addEventListener('click', () => press(i));
      el.actions.appendChild(btn);
    });
    if (el.input) el.input.placeholder = pre && pre.step === 'name' ? '이름을 입력하세요' : '명령 입력 (예: 북, 공격, 1)';
  }

  function render() {
    if (!el.status) return;
    renderStatus();
    renderButtons();
  }

  function press(i) {
    const b = buttons[i];
    if (!b || b.x) return;
    b.f();
    save();
    render();
  }

  function command(text) {
    const t = text.trim().toLowerCase();
    if (pre && pre.step === 'name') { setName(text); return; }
    if (!t) return;
    say('> ' + esc(text.trim()), 'cmd');
    const n = parseInt(t, 10);
    let idx = -1;
    if (String(n) === t && n >= 1 && n <= buttons.length) idx = n - 1;
    if (idx < 0) idx = buttons.findIndex((b) => b.l.replace(/\s/g, '').toLowerCase() === t.replace(/\s/g, ''));
    if (idx < 0) idx = buttons.findIndex((b) => (b.k || []).some((k) => k.toLowerCase() === t));
    if (idx < 0) idx = buttons.findIndex((b) => b.l.replace(/\s/g, '').toLowerCase().startsWith(t.replace(/\s/g, '')));
    if (idx < 0) { say('무슨 뜻인지 모르겠다. 버튼 이름이나 번호를 적어 보자.', 'sys'); render(); return; }
    if (buttons[idx].x) { say(`지금은 '${esc(buttons[idx].l)}'${jong(buttons[idx].l) ? '을' : '를'} 할 수 없다.`, 'sys'); render(); return; }
    press(idx);
  }

  function back() {
    if (S && S.mode === 'bag') { S.mode = 'explore'; render(); save(); return true; }
    if (S && S.mode === 'shop') { S.mode = 'explore'; render(); save(); return true; }
    if (pre) { title(); return true; }
    return false;
  }

  function init() {
    el = {
      status: document.getElementById('status'), map: document.getElementById('map'), enemy: document.getElementById('enemy'),
      log: document.getElementById('log'), actions: document.getElementById('actions'),
      form: document.getElementById('cmd'), input: document.getElementById('input'),
    };
    el.form.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = el.input.value;
      el.input.value = '';
      command(v);
    });
    document.addEventListener('keydown', (e) => {
      if (document.activeElement === el.input && el.input.value) return;
      const map = { ArrowUp: '북', ArrowDown: '남', ArrowLeft: '서', ArrowRight: '동' };
      if (map[e.key]) {
        const i = buttons.findIndex((b) => b.l === map[e.key]);
        if (i >= 0) { e.preventDefault(); press(i); }
      }
    });
    if (ls.get(SAVE_KEY)) { title(); cont(); } else title();
  }

  return { init, press, command, back, save, state: () => S, buttons: () => buttons, _pre: () => pre };
})();

window.G = G;
document.addEventListener('DOMContentLoaded', G.init);
