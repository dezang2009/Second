// 2D 실시간 경기 엔진
// 22명의 선수가 포메이션·전술·능력치에 따라 움직이고, 공을 가진 선수는 패스/드리블/슈팅을 판단한다.
// 화면 재생과 백그라운드 시뮬레이션이 같은 엔진을 쓴다.
(function (KM) {
  'use strict';
  const { clamp, lerp, dist, sigmoid, RNG } = KM;
  const D = KM.DATA;

  const LEN = 105, WID = 68;
  const DT = 0.1;
  const HALF = 600;              // 전반 플레이 시간(엔진 초)
  const CLOCK = 2700 / HALF;     // 엔진 초 → 실제 경기 초 환산 (45분 = 600 엔진 초)
  const GOAL_Y0 = 34 - 3.66, GOAL_Y1 = 34 + 3.66;
  const HX = 12, HY = 8; // 히트맵 격자 (공격 방향 기준)

  function roleGroup(role) {
    if (role === 'GK') return 'GK';
    if (role === 'CB' || role === 'LB' || role === 'RB') return 'DF';
    if (role === 'ST' || role === 'LW' || role === 'RW') return 'FW';
    return 'MF';
  }

  // 공격 방향 기준 좌표 (side 0은 +x 방향으로 공격)
  // 후반에는 진영을 바꾼다: SWAP=1이면 홈팀(0)이 -x 방향으로 공격.
  // step()마다 현재 경기의 값으로 맞춘다 (엔진은 동기적으로 한 경기씩 진행)
  let SWAP = 0;
  const UP = (side) => (side ^ SWAP) === 0; // 이 팀이 +x 방향으로 공격하는가
  const fx = (side, x) => (UP(side) ? x : LEN - x);
  const fy = (side, y) => (UP(side) ? y : WID - y);

  // 위치 위협도: 이 지점에서 공을 가지면 결국 득점으로 이어질 확률의 근사치
  function threat(px, py) {
    const d = Math.hypot(LEN - px, (34 - py) * 1.25);
    return 0.32 * Math.exp(-d / 14);
  }

  function xgAt(px, py) {
    const d = Math.hypot(LEN - px, 34 - py);
    const lateral = Math.max(0, Math.abs(py - 34) - 4);
    let xg = 0.95 * Math.exp(-d / 6.8) * Math.exp(-lateral / 9);
    if (px > LEN - 1.5 && Math.abs(py - 34) > 6) xg *= 0.2; // 각도 없는 위치
    return clamp(xg, 0.003, 0.85);
  }

  function MP(p, side, role, slot, cond, morale, phase, base, o) {
    o = o || {};
    // 역할 적합도에 따른 능력치 보정 + 포메이션 숙련도
    const fam = o.fam == null ? 90 : o.fam;
    this.base = base || 62; this.fam = fam; this.hb = o.hb || 0;
    this.p = p; this.role = role;
    const a = this.calcA(morale);
    this.p = p; this.id = p.id; this.side = side; this.role = role; this.grp = roleGroup(role);
    this.bx = slot[1]; this.by = slot[2];
    // 수비 시 포메이션 자리 (별도 지정이 없으면 공격 시와 같다)
    this.obx = o.op ? o.op[1] : slot[1]; this.oby = o.op ? o.op[2] : slot[2];
    this.R = D.roleMods(D.validRole(role, o.r));
    this.x = 0; this.y = 0; this.vx = 0; this.vy = 0; this.tx = 0; this.ty = 0;
    this.st = clamp(cond / 100, 0.3, 1);
    this.a = a;
    this.maxSpd = 6.2 + (a.pac / 100) * 3.2;
    this.on = true; this.yellow = 0; this.stun = 0; this.injured = false;
    this.phase = phase;
    this.s = { pass: 0, passOk: 0, key: 0, shots: 0, sot: 0, goals: 0, ast: 0, tkl: 0, int: 0, saves: 0, fouls: 0, drb: 0, lost: 0, mins: 0 };
    this.startT = 0; this.endT = null;
    this.hold = 0; this.protect = 0; this.chase = false; this.blocked = false; this.lag = 0;
    this.heat = new Uint16Array(HX * HY); this.ax = 0; this.ay = 0; this.an = 0; this.touch = 0;
    this.dx = null; this.dy = null; this.recvCross = false; this.injWeeks = 0;
    this.red = false; this.subbed = false; this.rating = 6; this.mins = 0;
  }

  // 능력치: 역할 적합도·사기·포메이션 숙련도 반영 후, 차이를 완만하게 압축해 약팀도 이변을 낼 수 있게 함
  MP.prototype.calcA = function (morale) {
    const p = this.p, role = this.role;
    const f = Math.pow(D.fit(role, p), 0.7) * (0.94 + 0.12 * (morale / 100)) * (0.95 + 0.05 * this.fam / 100) * (1 + this.hb);
    const a = {};
    for (const k in p.attr) a[k] = 62 + (p.attr[k] * f - this.base) * 0.55;
    if (role === 'GK' && p.pos !== 'GK') a.gk = p.attr.gk * 0.5;
    return a;
  };
  // 팀 토크 등으로 사기가 바뀌면 능력치를 다시 계산
  MP.prototype.setMorale = function (morale) {
    const pac = this.a.pac;
    this.a = this.calcA(morale);
    this.maxSpd = 6.2 + (this.a.pac / 100) * 3.2;
    return pac;
  };

  function Match(home, away, opts) {
    opts = opts || {};
    this.rng = new RNG(opts.seed || (Math.random() * 1e9) | 0);
    this.sides = [home, away];  // { team, starters:[{p, role, slot}], bench:[p], tactics, morale }
    this.user = opts.user == null ? -1 : opts.user;
    this.mp = [[], []];
    this.subsLeft = [5, 5];
    this.used = new Set();
    for (const sd of this.sides) D.normTactics(sd.tactics);
    // 홈 어드밴티지: 관중이 꽉 찰수록 홈팀 경기력이 조금 오른다 (중립 경기는 없음)
    this.homeAdv = opts.neutral ? 0 : 0.021 + 0.024 * clamp(opts.fill == null ? 0.8 : opts.fill, 0, 1);
    this.wonT = [-99, -99]; this.lostT = [-99, -99];
    this.P = [null, null];
    // 경기 수준 기준점: 두 팀 선발의 평균 OVR. 리그 수준과 상관없이 두 팀의 '차이'가 경기를 좌우한다
    let sum = 0, cnt = 0;
    for (const sd of this.sides) for (const st of sd.starters) { sum += st.p.ovr; cnt++; }
    this.base = cnt ? sum / cnt : 62;
    for (let s = 0; s < 2; s++) {
      const sd = this.sides[s];
      sd.starters.forEach((st) => this.mp[s].push(new MP(st.p, s, st.role, st.slot, st.p.cond, st.p.morale, this.rng.next() * 6.28, this.base, { r: st.r, op: st.op, fam: sd.fam, hb: s === 0 ? this.homeAdv : 0 })));
    }
    this.ball = { x: 52.5, y: 34, vx: 0, vy: 0, owner: null, mode: 'held', z: 0 };
    this.t = 0;
    this.half = 1;
    this.added = [0, 0]; this.addSet = [false, false]; // 추가시간은 각 하프 45분이 되면 그동안의 골·교체·부상·카드로 정한다
    this.score = [0, 0];
    this.state = 'kickoff';
    this.timer = 1.2;
    this.kickSide = 0;
    this.swap = 0;
    this.poss = 0;
    this.lastTouch = 0;
    this.events = [];
    this.stats = [blankStats(), blankStats()];
    this.momentum = [];
    this.thAcc = [0, 0];
    this.lastMinute = 0;
    this.pass = null;
    this.shot = null;
    this.restart = null;
    this.setPiece = null;
    this.finished = false;
    this.lastPasser = null;
    this.secondPasser = null;
    this.flash = null;       // 화면 연출용 (골, 카드 등)
    this.nextAiCheck = 0;
    this.tick = 0;
    this.goalsList = [];
    // 경기 분석용 기록: 슈팅 위치, 패스 연결, 선수 위치 표본
    this.shotLog = [];
    this.passNet = [{}, {}];
    this.sampleT = 0;
    // 라이벌전: 열기(1~3)만큼 태클·카드가 늘어난다
    this.derby = opts.derby || null;
    this.dLv = this.derby ? this.derby.lvl : 0;
    // 중계 멘트 전용 난수 (경기 결과에는 영향을 주지 않음)
    this.crng = new RNG(((opts.seed || 7) ^ 0x5bd1e995) >>> 0);
    this.comNext = 18; this.comFlags = {};
    SWAP = 0;
    this.placeKickoff();
    this.intro(opts);
  }

  function blankStats() {
    return { poss: 0, shots: 0, sot: 0, xg: 0, pass: 0, passOk: 0, fouls: 0, corners: 0, yel: 0, red: 0, tkl: 0, off: 0 };
  }

  const M = Match.prototype;

  M.minute = function () {
    const base = this.half === 1 ? this.t : this.t - HALF - this.added[0];
    const m = Math.floor((base * CLOCK) / 60) + (this.half === 2 ? 45 : 0);
    return Math.max(0, m);
  };
  M.clockText = function () {
    const half = this.half;
    const base = half === 1 ? this.t : this.t - HALF - this.added[0];
    const sec = Math.floor(base * CLOCK);
    let m = Math.floor(sec / 60), s = sec % 60;
    const cap = 45;
    if (m >= cap) {
      const extra = m - cap + 1;
      return (half === 1 ? '45' : '90') + '+' + extra + "'";
    }
    m += half === 2 ? 45 : 0;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  };

  M.tac = function (side) { return this.sides[side].tactics; };
  M.onPitch = function (side) {
    if (!this._on) this.refreshOn();
    return this._on[side];
  };
  M.all = function () {
    if (!this._on) this.refreshOn();
    return this._all;
  };
  M.refreshOn = function () {
    this._on = [this.mp[0].filter((m) => m.on), this.mp[1].filter((m) => m.on)];
    this._all = this._on[0].concat(this._on[1]);
  };

  M.log = function (type, side, text, extra) {
    const ev = Object.assign({ min: this.minute(), clock: this.clockText(), type, side, text, h: this.half }, extra || {});
    this.events.push(ev);
    return ev;
  };

  M.placeKickoff = function () {
    for (let s = 0; s < 2; s++) {
      for (const m of this.mp[s]) {
        if (!m.on) continue;
        const ofx = m.grp === 'GK' ? 3 : 8 + m.bx * 40;
        const ofy = m.by * WID * 0.8 + WID * 0.1;
        m.x = UP(s) ? ofx : LEN - ofx;
        m.y = UP(s) ? ofy : WID - ofy;
        m.vx = m.vy = 0;
      }
    }
    this.ball.x = 52.5; this.ball.y = 34; this.ball.vx = this.ball.vy = 0; this.ball.z = 0;
    this.ball.owner = null; this.ball.mode = 'held';
    this.pass = null; this.shot = null; this.setPiece = null;
    // 킥오프 키커
    const ks = this.kickSide;
    const cands = this.onPitch(ks).filter((m) => m.grp === 'FW' || m.role === 'AM' || m.grp === 'MF');
    const k = cands.sort((a, b) => b.bx - a.bx)[0] || this.onPitch(ks)[0];
    k.x = 52.5 - (UP(ks) ? 0.6 : -0.6); k.y = 34;
    this.giveBall(k, 0.6);
  };

  M.giveBall = function (m, hold) {
    const b = this.ball;
    b.owner = m; b.mode = 'held'; b.vx = b.vy = 0; b.z = 0;
    if (this.poss !== m.side && this.state === 'play') {
      this.wonT[m.side] = this.t; this.lostT[1 - m.side] = this.t;
      this.fromRestart = null;
      // 공수 전환: 공보다 앞에 올라가 있던 선수는 돌아서는 데 시간이 걸린다 (공격적일수록 더 많이 올라가 있다)
      const ls = 1 - m.side, LP = this.params(ls), bf = fx(ls, m.x);
      for (const o of this.onPitch(ls)) {
        if (o.grp === 'GK') continue;
        const ahead = fx(ls, o.x) - bf;
        if (ahead <= 2) continue;
        if (this.tac(ls).onLoss === 2 && dist(o.x, o.y, m.x, m.y) < 16) continue; // 카운터 프레스: 가까운 선수는 바로 덤빈다
        o.lag = Math.max(o.lag, Math.min(1.4, 0.25 + ahead * 0.012 + Math.max(0, LP.men) * 0.18 + (o.R.adv > 6 ? 0.15 : 0)));
      }
    }
    this.poss = m.side; this.lastTouch = m.side;
    m.hold = hold != null ? hold : this.holdTime(m);
    m.protect = 0.35;
    this.pass = null;
  };

  // 전술 지시 → 엔진이 쓰는 수치. 매 판단마다 계산(경기 중 전술 변경이 즉시 반영됨)
  M.params = function (s) { return this.P[s] || this.calcParams(s); };
  M.calcParams = function (s) {
    const t = this.tac(s);
    const since = (x) => this.t - x;
    return {
      men: t.mentality - 2,
      passLen: t.passing - 2,
      tempo: t.tempo - 1,
      width: t.width - 1,
      line: t.line - 1,
      press: t.press,
      approach: t.approach, finalThird: t.finalThird, block: t.block,
      dribble: [-0.3, 0, 0.25][t.dribble],
      temp: [0.8, 1, 1.25][t.creative], riskF: [1.1, 1, 0.92][t.creative],
      engage: [48, 70, 106][t.block], blockShift: [-8, 0, 4][t.block],
      tackleRate: [0.75, 1, 1.3][t.tackle], foulF: [0.7, 1, 1.45][t.tackle], tackleSkill: [-0.12, 0, 0.08][t.tackle],
      tight: t.marking === 1,
      trap: t.trap,
      counterPress: t.onLoss === 2 && since(this.lostT[s]) < 4,
      regroup: t.onLoss === 0 && since(this.lostT[s]) < 4,
      counter: t.onWin === 2 && since(this.wonT[s]) < 5,
      holdShape: t.onWin === 0 && since(this.wonT[s]) < 5,
      gk: t.gk,
    };
  };

  M.holdTime = function (m) {
    const P = this.params(m.side);
    let h = 0.68 - P.tempo * 0.22 - P.passLen * 0.05 + this.rng.next() * 0.6;
    if (P.counter) h *= 0.4;
    if (P.holdShape) h *= 1.4;
    if (m.grp === 'GK') h += P.gk === 0 ? 0.6 : 0.2;
    h += m.R.holdX;
    return Math.max(0.15, h);
  };

  // ── 메인 스텝 ───────────────────────────────────────────────
  M.step = function () {
    if (this.finished) return;
    SWAP = this.swap;
    this.flash = null;
    this.P[0] = this.calcParams(0); this.P[1] = this.calcParams(1);
    if (this.state === 'kickoff') {
      this.timer -= DT;
      this.movePlayers(true);
      if (this.timer <= 0) this.state = 'play';
      return;
    }
    if (this.state === 'goal') {
      this.timer -= DT;
      this.movePlayers(true);
      if (this.timer <= 0) { this.state = 'kickoff'; this.timer = 1.0; this.placeKickoff(); }
      return;
    }
    if (this.state === 'dead') {
      this.timer -= DT;
      this.t += DT;
      this.updateTargets();
      this.movePlayers(false);
      if (this.timer <= 0) this.doRestart();
      this.checkClock();
      return;
    }
    // play
    this.t += DT;
    if ((this.tick = (this.tick + 1) | 0) % 2 === 0 || this.pass) this.updateTargets();
    this.carrierLogic();
    this.ballLogic();
    this.movePlayers(false);
    this.tackles();
    this.randomIncidents();
    this.accumulate();
    this.sample();
    if (this.t >= this.comNext) this.flavor();
    this.checkClock();
  };
  // 1초마다 선수 위치를 기록 (평균 위치·히트맵)
  M.sample = function () {
    if (this.t < this.sampleT) return;
    this.sampleT = this.t + 1;
    for (const m of this.all()) {
      const f = fx(m.side, m.x), y = fy(m.side, m.y);
      m.ax += f; m.ay += y; m.an++;
      const i = clamp(Math.floor(f / LEN * HX), 0, HX - 1), j = clamp(Math.floor(y / WID * HY), 0, HY - 1);
      m.heat[j * HX + i]++;
    }
    const o = this.ball.owner; if (o) o.touch++;
  };
  // 경기 분석 요약 (저장용으로 작게)
  M.analysis = function () {
    const out = { shots: this.shotLog.map((x) => [x.s, Math.round(x.x * 10) / 10, Math.round(x.y * 10) / 10, Math.round(x.xg * 100) / 100, x.o, x.min, x.pid, x.h]), sides: [] };
    for (let s = 0; s < 2; s++) {
      const pl = this.mp[s].filter((m) => m.an > 20).map((m) => ({ id: m.id, role: m.role, mins: m.mins || 0, ax: Math.round(m.ax / m.an * 10) / 10, ay: Math.round(m.ay / m.an * 10) / 10, heat: Array.from(m.heat), n: m.an, rating: m.rating, t: m.touch, s: { pass: m.s.pass, ok: m.s.passOk, key: m.s.key, sh: m.s.shots, sot: m.s.sot, g: m.s.goals, a: m.s.ast, tkl: m.s.tkl, int: m.s.int, drb: m.s.drb, sv: m.s.saves } }));
      const links = Object.entries(this.passNet[s]).map(([k, v]) => { const [a, b] = k.split('>').map(Number); return [a, b, v]; }).filter((x) => x[2] >= 2);
      out.sides.push({ pl, links, poss: s === 0 ? this.possPct() : 100 - this.possPct(), st: Object.assign({}, this.stats[s]) });
    }
    out.mom = this.momentum.map((x) => [x.min, Math.round(x.v * 1000) / 1000]);
    return out;
  };

  M.checkClock = function () {
    if (this.half === 1 && !this.addSet[0] && this.t >= HALF) this.setAdded(0);
    if (this.half === 2 && !this.addSet[1] && this.t >= HALF * 2 + this.added[0]) this.setAdded(1);
    const endHalf1 = HALF + this.added[0];
    const endFull = HALF * 2 + this.added[0] + this.added[1];
    if (this.half === 1 && this.t >= endHalf1 && this.ballSafe()) {
      this.half = 2;
      this.t = endHalf1;
      this.log('half', -1, `전반 종료. ${this.sides[0].team.short} ${this.score[0]} - ${this.score[1]} ${this.sides[1].team.short}`);
      this.say(-1, this.halfLine());
      this.kickSide = 1;
      this.swap = 1; SWAP = 1; // 후반: 진영 교체
      this.state = 'kickoff'; this.timer = 1.5;
      for (const m of this.all()) m.st = Math.min(1, m.st + 0.06);
      this.placeKickoff();
    } else if (this.half === 2 && this.t >= endFull && this.ballSafe()) {
      this.finish();
    }
  };
  M.setAdded = function (h) {
    this.addSet[h] = true;
    const ev = this.events.filter((e) => e.h === h + 1);
    const c = (t) => ev.filter((e) => e.type === t).length;
    let n = (h ? 1.6 : 0.8) + c('goal') * 0.4 + c('sub') * 0.22 + c('inj') * 1.2 + (c('yellow') + c('red')) * 0.2 + this.rng.next();
    n = clamp(Math.round(n), h ? 2 : 1, h ? 9 : 6);
    this.added[h] = n * 60 / CLOCK;
    this.say(-1, `추가시간 ${n}분이 주어집니다.`);
  };
  M.ballSafe = function () {
    // 슈팅 중이면 끝날 때까지 기다림
    return !this.shot;
  };

  M.finish = function () {
    this.finished = true;
    this.state = 'end';
    for (const m of this.all()) m.endT = this.t;
    this.log('ft', -1, `경기 종료! ${this.sides[0].team.name} ${this.score[0]} - ${this.score[1]} ${this.sides[1].team.name}`);
    this.say(-1, this.endLine());
  };

  M.runToEnd = function () {
    let guard = 0;
    while (!this.finished && guard++ < 40000) this.step();
    if (!this.finished) this.finish();
  };

  // ── 위치 선정 ───────────────────────────────────────────────
  M.updateTargets = function () {
    const b = this.ball;
    const owner = b.owner;
    const possSide = owner ? owner.side : (this.pass ? this.pass.from.side : this.poss);
    for (let s = 0; s < 2; s++) {
      const P = this.params(s);
      const men = P.men, line = P.line, width = P.width, press = P.press;
      const players = this.onPitch(s);
      const bF = fx(s, b.x), bY = fy(s, b.y);
      const inPoss = possSide === s;
      // 상대 최종 수비 라인 (오프사이드 근사)
      let lastDef = 0;
      for (const o of this.onPitch(1 - s)) { if (o.grp === 'GK') continue; const f = fx(s, o.x); if (f > lastDef) lastDef = f; }
      const offLine = Math.max(bF, lastDef) - 0.5;
      let backLine, span;
      if (inPoss) {
        backLine = clamp(bF - 38 + men * (men > 0 ? 4 : 2.5) + line * 2, 14, 60);
        span = 50 + men * 3;
      } else {
        backLine = clamp(bF - 30 + line * 5 + men * 1.5 + P.blockShift + (P.regroup ? -6 : 0), 9, 52);
        span = 33 - press * 1.5 - (P.block === 0 ? 9 : 0) + Math.min(0, men) * 3;
      }
      const wf = inPoss ? 0.92 + 0.07 * width : (P.block === 0 ? 0.5 : 0.62) + 0.04 * width;
      const shift = inPoss ? 0.22 : 0.38;
      for (const m of players) {
        if (m === owner) continue;
        let tf, ty;
        const R = m.R;
        if (m.grp === 'GK') {
          tf = clamp(3 + bF * 0.07, 2, 12);
          // 스위퍼 키퍼: 라인이 올라가면 같이 올라와 뒷공간을 지킨다
          if (R.sweep && bF > 35) tf = clamp(3 + bF * 0.1 + R.adv * 0.7, 2, 22);
          ty = 34 + (bY - 34) * 0.18;
          if (!inPoss && bF < 22) { tf = clamp(bF * 0.25, 1.5, 6); ty = 34 + (bY - 34) * 0.35; }
        } else {
          const bx = inPoss ? m.bx : m.obx, by = inPoss ? m.by : m.oby;
          const depth = clamp((bx - 0.12) / 0.74, 0, 1);
          tf = backLine + depth * span;
          ty = 34 + (by - 0.5) * WID * wf + (bY - 34) * shift;
          if (inPoss) {
            // 선수 역할: 전진·좁히기·벌리기·내려오기
            tf += R.adv * (bF > 30 ? 1 : 0.5) + R.run * (bF > 40 ? 5 : 0);
            if (R.invert && bF > 18 && bF < 80) { tf = Math.min(tf, backLine + span * 0.36 + R.adv * 0.5); ty = lerp(ty, 34 + (by < 0.5 ? -9 : 9), R.inside); }
            else if (R.inside) ty = lerp(ty, 34 + (ty - 34) * 0.35, R.inside);
            if (R.wide) ty = lerp(ty, by < 0.5 ? 3 : WID - 3, R.wide * 0.8);
            if (R.drop && bF < 78) tf -= R.drop;
            if (R.hb && bF < 48) { tf = backLine - 2; ty = 34; }
            if (R.roam) { ty += R.roam * Math.sin(this.t * 0.45 + m.phase * 3); tf += R.roam * 0.5 * Math.cos(this.t * 0.3 + m.phase); }
            if (R.box && bF > 62) { tf = Math.max(tf, 89); ty = lerp(ty, 34, 0.5); }
            // 침투 움직임
            if ((m.grp === 'FW' || m.role === 'AM' || m.role === 'LM' || m.role === 'RM') && bF > 45) {
              const amp = P.approach === 2 || P.counter ? 9 : 5;
              tf += 4 + amp * Math.sin(this.t * 0.35 + m.phase);
              if (bF > 75 && m.grp === 'FW' && P.finalThird !== 3) ty = lerp(ty, 34, 0.35);
            }
            // 측면 오버랩: 풀백이 높이 올라가 넓게 선다
            if (P.approach === 3 && (m.role === 'LB' || m.role === 'RB') && bF > 35) { tf += 14; ty = lerp(ty, m.by < 0.5 ? 4 : WID - 4, 0.6); }
            // 후방 빌드업: 센터백이 넓게 벌려 골키퍼·풀백과 삼각형
            if (P.approach === 1 && m.role === 'CB' && bF < 40) ty = 34 + (m.by - 0.5) * WID * 1.15;
            // 크로스 위주: 측면 선수는 터치라인 쪽에 머문다
            if (P.finalThird === 3 && (m.role === 'LW' || m.role === 'RW' || m.role === 'LM' || m.role === 'RM')) ty = lerp(ty, m.by < 0.5 ? 5 : WID - 5, 0.5);
            // 크로스 위주: 공이 측면 깊숙이 오면 스트라이커와 공격형 미드필더가 박스로 쇄도
            if (P.finalThird === 3 && bF > 68 && (m.role === 'ST' || m.role === 'AM')) { tf = 95 + (m.phase % 1) * 5; ty = 28 + ((m.phase * 7) % 12); }
            // 침투 타이밍: 오프 더 볼이 약할수록 가끔 라인을 넘어선다 (→ 오프사이드)
            if (m.grp !== 'GK') tf = Math.min(tf, offLine + (m.grp === 'FW' || R.run > 0 ? Math.max(0, Math.sin(this.t * 0.55 + m.phase * 2.3)) ** 2 * Math.max(0.25, 1.7 - (m.a.sho + m.a.pac) / 110) : 0));
            // 세트피스: 공격수와 장신 수비수가 박스로
            if (this.setPiece && this.setPiece.side === s && (m.grp === 'FW' || m.role === 'CB' || m.role === 'AM')) {
              tf = 93 + (m.phase % 1) * 6; ty = 28 + ((m.phase * 7) % 12);
            }
          } else {
            // 수비 시 역할: 공격형 선수는 높이 남고, 앵커는 중앙을 지키고, 카릴레로는 측면을 덮는다
            if (R.stay) tf += R.stay;
            if (R.screen) ty = lerp(ty, 34, 0.45);
            if (R.cover) ty = lerp(ty, bY, 0.25);
            if (this.setPiece && this.setPiece.side !== s && (m.grp === 'DF' || m.grp === 'FW' && m.bx < 0.82)) {
              tf = 6 + (m.phase % 1) * 7; ty = 27 + ((m.phase * 5) % 14);
            }
            // 수비 시 공 쪽으로 압축
            if (bF < 35) tf = Math.min(tf, backLine + depth * span * 0.8);
          }
        }
        tf = clamp(tf, 1, LEN - 1); ty = clamp(ty, 1, WID - 1);
        m.tx = UP(s) ? tf : LEN - tf;
        m.ty = UP(s) ? ty : WID - ty;
        m.chase = false;
      }
      // 대인 마크: 자기 진영 깊숙이 공이 들어오면 수비수가 위험 지역의 공격수를 붙잡는다
      if (!inPoss && bF < (P.tight ? 62 : 52)) {
        const threats = this.onPitch(1 - s).filter((o) => o !== owner && o.grp !== 'GK' && fx(s, o.x) < (P.tight ? 48 : 40));
        const markers = players.filter((m) => m.grp === 'DF' || m.role === 'DM');
        const usedT = new Set();
        for (const m of markers) {
          let best = null, bd = P.tight ? 21 : 16;
          for (const o of threats) {
            if (usedT.has(o)) continue;
            const d = dist(m.tx, m.ty, o.x, o.y);
            if (d < bd) { bd = d; best = o; }
          }
          if (best) {
            usedT.add(best);
            const gx = UP(s) ? 0 : LEN;
            const ang = Math.atan2(34 - best.y, gx - best.x);
            const off = P.tight ? 0.9 : 1.6;
            m.tx = best.x + Math.cos(ang) * off; m.ty = best.y + Math.sin(ang) * off;
          }
        }
      }
      // 압박 / 공 쫓기
      if (!inPoss || !owner) {
        const target = owner || b;
        const px = owner ? owner.x : b.x + b.vx * 0.4, py = owner ? owner.y : b.y + b.vy * 0.4;
        const outfield = players.filter((m) => m.grp !== 'GK' && m.stun <= 0);
        outfield.sort((a, c) => dist(a.x, a.y, px, py) - a.R.press * 7 - dist(c.x, c.y, px, py) + c.R.press * 7);
        let k = owner ? 1 + (press >= 1 ? 1 : 0) + (press >= 2 ? 1 : 0) : 2;
        let radius = owner ? 12 + press * 7 : 30;
        // 수비 블록: 공이 압박 시작선보다 멀리 있으면 1명만 길을 막고 나머지는 대형 유지
        if (owner && bF > P.engage) { k = 1; radius = 0; }
        else if (owner && (P.block === 0 || bF < 35)) { k = Math.max(k, 2); radius = Math.max(radius, 15); } // 블록 안(또는 우리 진영 깊숙이)에 들어오면 둘이 협력 수비
        if (P.counterPress && owner) { k += 2; radius += 12; }
        if (P.regroup && owner) { k = 1; }
        for (let i = 0; i < outfield.length && i < k; i++) {
          const m = outfield[i];
          const d = dist(m.x, m.y, px, py);
          if (i > 0 && d > radius) break;
          // 첫 번째 압박수는 골문 쪽에서 접근
          const gx = UP(s) ? 0 : LEN;
          const off = owner ? (bF > P.engage ? 6 : 1.0) : 0;
          let ang = Math.atan2(34 - py, gx - px);
          // 압박 함정: 중앙으로 몰기 = 바깥쪽에서, 측면으로 몰기 = 안쪽에서 접근
          if (owner && i === 0 && P.trap) {
            const toCenter = Math.sign(34 - py) || 1;
            ang += (P.trap === 1 ? -toCenter : toCenter) * 0.6 * (UP(s) ? -1 : 1);
          }
          m.tx = px + Math.cos(ang) * off; m.ty = py + Math.sin(ang) * off;
          m.chase = true;
        }
        const gk = players.find((m) => m.grp === 'GK');
        if (gk && !owner && !this.pass && !this.shot) {
          // 골키퍼: 박스 안 루즈볼은 직접 처리
          if (fx(s, b.x) < (gk.R.sweep ? 30 : 16) && Math.abs(b.y - 34) < 20) { gk.tx = b.x; gk.ty = b.y; gk.chase = true; }
        }
        // 뒷공간으로 오는 패스: 골키퍼가 뛰어나와 처리 (스위퍼 키퍼는 더 멀리까지)
        if (gk && this.pass && this.pass.from.side !== s && this.pass.through) {
          const pf = fx(s, this.pass.tx);
          if (pf < (gk.R.sweep ? 34 : 18) && Math.abs(this.pass.ty - 34) < 24) { gk.tx = this.pass.tx; gk.ty = this.pass.ty; gk.chase = true; }
        }
      }
      // 패스 받는 선수는 공 도착 지점으로
      if (this.pass && this.pass.to.side === s && this.pass.to.on) {
        this.pass.to.tx = this.pass.tx; this.pass.to.ty = this.pass.ty;
      }
    }
  };

  M.movePlayers = function (frozenBall) {
    const b = this.ball;
    for (const m of this.all()) {
      if (m.stun > 0) m.stun -= DT;
      if (m.lag > 0) m.lag -= DT;
      if (m.protect > 0) m.protect -= DT;
      let tx = m.tx, ty = m.ty;
      if (m === b.owner) { tx = m.dx != null ? m.dx : m.x; ty = m.dy != null ? m.dy : m.y; }
      const dx = tx - m.x, dy = ty - m.y;
      const d = Math.hypot(dx, dy);
      let spd = m.maxSpd * (0.55 + 0.45 * m.st);
      if (m === b.owner) {
        spd *= 0.74 + 0.12 * (m.a.dri / 100);
        if (m.blocked) spd *= 0.45;
      }
      if (m.injured) spd *= 0.5;
      if (m.lag > 0) spd *= 0.6;
      let want = d > 4 || m.chase ? spd : d > 0.3 ? spd * (d / 4) * 0.8 : 0;
      if (this.state !== 'play' && !m.chase) want *= 0.7;
      let vx = d > 0.01 ? (dx / d) * want : 0, vy = d > 0.01 ? (dy / d) * want : 0;
      m.vx = lerp(m.vx, vx, 0.25); m.vy = lerp(m.vy, vy, 0.25);
      m.x = clamp(m.x + m.vx * DT, -1, LEN + 1);
      m.y = clamp(m.y + m.vy * DT, -1, WID + 1);
      const r = Math.hypot(m.vx, m.vy) / m.maxSpd;
      const press = this.tac(m.side).press + (this.params(m.side).counterPress ? 1 : 0);
      const drain = (0.00011 + 0.00042 * r * r * (m.chase ? 1 + press * 1.2 : 1)) * (1.25 - (m.a.phy / 100) * 0.5) * (1 + this.tac(m.side).press * 0.24) * (1 + m.R.press * 0.12 + (m.R.key === 'b2b' || m.R.key === 'cwb' ? 0.12 : 0));
      m.st = Math.max(0.05, m.st - drain * DT);
    }
    if (b.owner) {
      const o = b.owner;
      const dir = UP(o.side) ? 1 : -1;
      b.x = o.x + dir * 0.6; b.y = o.y + Math.sin(this.t * 6) * 0.15;
    }
  };

  // ── 공을 가진 선수 판단 ────────────────────────────────────
  M.carrierLogic = function () {
    const m = this.ball.owner;
    if (!m) return;
    const s = m.side;
    const opps = this.onPitch(1 - s);
    let nearest = 99;
    for (const o of opps) { const d = dist(o.x, o.y, m.x, m.y); if (d < nearest) nearest = d; }
    // 진행 방향 앞을 막는 수비수
    m.blocked = false;
    const dir = UP(s) ? 1 : -1;
    for (const o of opps) {
      const ahead = (o.x - m.x) * dir;
      if (ahead > 0 && ahead < 3 && Math.abs(o.y - m.y) < 1.8) { m.blocked = true; break; }
    }
    m.hold -= DT;
    if (nearest < 3 && m.hold > 0.25 && m.grp !== 'GK') m.hold = Math.min(m.hold, 0.12 + this.rng.next() * 0.3);
    // 박스 안에서 앞이 비었으면 드리블을 오래 끌지 않고 바로 판단(슈팅)
    if (m.hold > 0.1 && m.grp !== 'GK' && !m.blocked && nearest > 3.5) { const f = fx(s, m.x), y = fy(s, m.y); if (f > 94 && Math.abs(y - 34) < 12) m.hold = 0.05; }
    if (m.hold > 0) {
      if (m.dx == null) this.setDribble(m, opps);
      return;
    }
    this.decide(m, opps);
  };

  M.setDribble = function (m, opps) {
    const s = m.side;
    const f = fx(s, m.x), y = fy(s, m.y);
    let ty = lerp(y, 34, (f > 70 ? 0.35 : 0.1) + (m.R.cut && f > 55 ? 0.3 : 0) - (m.R.wide && f < 85 ? 0.08 : 0));
    // 가까운 수비수 반대쪽으로
    let near = null, nd = 99;
    for (const o of opps) { const d = dist(o.x, o.y, m.x, m.y); if (d < nd) { nd = d; near = o; } }
    if (near && nd < 6) ty += (fy(s, m.y) - fy(s, near.y) >= 0 ? 1 : -1) * 4;
    const tf = clamp(f + (m.grp === 'GK' ? 0 : 7), 1, LEN - 1);
    ty = clamp(ty, 2, WID - 2);
    m.dx = UP(s) ? tf : LEN - tf; m.dy = UP(s) ? ty : WID - ty;
  };

  M.decide = function (m, opps) {
    const s = m.side, tac = this.tac(s);
    const P = this.params(s), OP = this.params(1 - s);
    const men = P.men;
    let oppLine = 0;
    for (const o of opps) { if (o.grp !== 'GK') { const v = fx(s, o.x); if (v > oppLine) oppLine = v; } }
    const f = fx(s, m.x), y = fy(s, m.y);
    const options = [];
    const eps = 0.0015;
    const curV = threat(f, y);
    let clear = false;
    // 상대 가장 가까운 거리
    let nearest = 99;
    for (const o of opps) { const d = dist(o.x, o.y, m.x, m.y); if (d < nearest) nearest = d; }

    // 슈팅
    if (f > 70 && m.grp !== 'GK') {
      let xg = xgAt(f, y);
      if (nearest < 2) xg *= 0.6;
      // 슛 경로 차단 수비수
      let blockers = 0, fieldBlockers = 0;
      for (const o of opps) {
        const of = fx(s, o.x), oy = fy(s, o.y);
        if (of > f && of < LEN - 1 && segDist(of, oy, f, y, LEN, 34) < 1.2) { blockers++; if (o.grp !== 'GK') fieldBlockers++; }
      }
      xg *= Math.pow(0.7, blockers);
      // 박스 안이 붐비면(수비수가 슈팅 각도 안에 많으면) 좋은 슈팅이 어렵다
      let crowd = 0;
      for (const o of opps) {
        if (o.grp === 'GK') continue;
        const of = fx(s, o.x), oy = fy(s, o.y);
        if (of > f && of < LEN && Math.abs(oy - lerp(y, 34, (of - f) / Math.max(1, LEN - f))) < 2 + (of - f) * 0.18) crowd++;
      }
      xg *= Math.pow(0.83, Math.max(0, crowd - 1));
      // 수비가 정돈되지 않았으면(공보다 뒤에 있는 수비수가 적으면) 더 좋은 기회
      let behind = 0;
      for (const o of opps) if (o.grp !== 'GK' && fx(s, o.x) > f - 1) behind++;
      xg *= 1 + 0.09 * Math.max(0, 4 - behind);
      const d = Math.hypot(LEN - f, 34 - y);
      let longBonus = d > 16 && d < 28 ? 0.45 + (m.a.sho - 60) / 60 : 0;
      if (P.finalThird === 2) longBonus += d > 16 ? 0.35 : 0.15; // 보이면 슈팅
      if (P.finalThird === 1) longBonus += d > 16 ? -0.35 : 0.1; // 박스까지 파고들기
      // 골문 앞에 막는 수비수가 없는 확실한 기회: 실제 선수처럼 거의 무조건 슈팅
      let near = 99;
      for (const o of opps) if (o.grp !== 'GK') { const dd = dist(o.x, o.y, m.x, m.y); if (dd < near) near = dd; }
      clear = near > 3.5 && fieldBlockers === 0 && ((f > 88.5 && Math.abs(y - 34) < 16) || (f > 82 && xgAt(f, y) > 0.08));
      const u = Math.log(xg * (1 + men * 0.12) * (0.75 + m.a.sho / 200) + eps) - 1.3 + longBonus + m.R.shoot + (clear ? (f > 94 ? 2.7 : 1.6) : 0);
      options.push({ k: 'shoot', u, xg });
    }
    // 패스
    for (const t of this.onPitch(s)) {
      if (t === m || t.injured) continue;
      const lead = 0.35;
      const tX = clamp(t.x + t.vx * lead * 2, 1, LEN - 1), tY = clamp(t.y + t.vy * lead * 2, 1, WID - 1);
      const L = dist(m.x, m.y, tX, tY);
      if (L < 4 || L > 55) continue;
      const tf = fx(s, tX), ty = fy(s, tY);
      if (t.grp === 'GK' && f > 40) continue;
      if (m.grp === 'GK' && ((P.gk === 0 && L > 32) || (P.gk === 2 && L < 28))) continue;
      const lofted = L > 26;
      if (P.approach === 1 && lofted && f < 35 && m.grp !== 'GK') continue; // 후방 빌드업: 뒤에서는 롱볼 금지
      let risk = 0;
      for (const o of opps) {
        const of = fx(s, o.x), oy = fy(s, o.y);
        const sd = segDistT(of, oy, f, y, tf, ty);
        if (lofted && sd.t < 0.8) continue;
        const reach = 1.4 + L * 0.035 + (o.a.pac / 100) * 0.8;
        if (sd.d < reach) risk += (1 - sd.d / reach) * (0.35 + o.a.def / 220);
      }
      let rp = 99;
      for (const o of opps) { const d = dist(o.x, o.y, tX, tY); if (d < rp) rp = d; }
      if (rp < 1.5) risk += 0.35; else if (rp < 3.5) risk += 0.12;
      risk += (L / 55) * 0.18 * (1.2 - m.a.pas / 100);
      if (lofted) risk += 0.08;
      // 상대의 압박 함정이 노리는 쪽으로 가는 패스는 더 위험
      if (OP.trap === 1 && Math.abs(ty - 34) < 12) risk += 0.07;
      if (OP.trap === 2 && Math.abs(ty - 34) > 20) risk += 0.07;
      risk = clamp(risk * (1 - P.passLen * 0.1) * (1 - men * 0.06) * P.riskF * (P.holdShape ? 1.2 : 1), 0, 0.95);
      const danger = 0.6 * Math.max(0, 1 - f / 60);
      let u = Math.log(threat(tf, ty) * (1 - risk) + eps) + Math.log(1 - risk * danger + 1e-6);
      // 받는 선수 앞에 수비수가 적을수록(수적 우위) 가치가 크다
      if (tf > 50) { let bh = 0; for (const o of opps) if (o.grp !== 'GK' && fx(s, o.x) > tf) bh++; u += 0.07 * Math.max(0, 4 - bh); }
      if (P.passLen < 0) u += L * 0.004 * P.passLen;
      if (P.passLen > 0) u += Math.max(0, tf - f) * 0.004 * P.passLen;
      if (P.counter) u += Math.max(0, tf - f) * 0.02;
      if (P.approach === 2 && t.grp === 'FW' && tf - f > 15) u += 0.15; // 공간 침투 패스
      if (OP.line === 1 && tf > oppLine - 2 && tf - f > 10 && (t.grp === 'FW' || t.role === 'AM')) u += 0.2; // 높은 라인 뒷공간
      if (m.grp === 'GK' && P.gk === 2 && t.grp === 'FW') u += 0.3;
      if (tf < f - 5) u -= 0.05;
      if (clear && !(tf > f + 3 && Math.abs(ty - 34) < Math.abs(y - 34))) u -= 1.5; // 확실한 기회에서 옆·뒤로 돌리지 않는다
      // 선수 역할: 플레이메이커에게 공이 모이고, 전진 패스 성향, 공중볼 타깃
      u += t.R.pm * (tf > f - 12 ? 1 : 0.4) + m.R.prog * Math.max(-0.4, Math.min(1, (tf - f) / 20));
      if (lofted) u += t.R.aerial * 0.35;
      // 측면 크로스
      if (f > 85 && Math.abs(y - 34) > 14 && tf > 88 && Math.abs(ty - 34) < 10) u += (P.finalThird === 3 ? 0.6 : 0.25) + m.R.cross + t.R.aerial * 0.4;
      options.push({ k: 'pass', u, t, tX, tY, L, lofted });
    }
    // 뒷공간 침투 패스: 최종 수비 라인 어깨에 선 선수에게 라인 뒤 빈 공간으로 찔러준다.
    // 수비 라인이 높을수록 공간이 넓고, 공격수가 빠를수록 경합에서 이긴다.
    const space = LEN - 7 - oppLine;
    if (space > 7 && m.grp !== 'GK' && f > 22) {
      for (const t of this.onPitch(s)) {
        if (t === m || t.injured || t.grp === 'GK' || t.grp === 'DF' && !t.R.run) continue;
        const tfT = fx(s, t.x);
        if (oppLine - tfT > 5 || tfT < f - 4 || (t.grp !== 'FW' && t.R.run <= 0 && t.role !== 'AM')) continue;
        const tfS = Math.min(oppLine + 5 + space * 0.35, LEN - 8), tyS = clamp(lerp(fy(s, t.y), 34, 0.3), 6, WID - 6);
        const tX = UP(s) ? tfS : LEN - tfS, tY = UP(s) ? tyS : WID - tyS;
        const L = dist(m.x, m.y, tX, tY);
        if (L < 10 || L > 50) continue;
        const lofted = L > 30;
        const spdT = (o) => o.maxSpd * (0.55 + 0.45 * o.st);
        const tRun = dist(t.x, t.y, tX, tY) / spdT(t) + 0.2;
        const tBall = L / (lofted ? 19 : clamp(13 + L * 0.3, 14, 22));
        let tDef = 99;
        for (const o of opps) {
          const reach = o.grp === 'GK' ? (o.R.sweep ? 3 : 1.8) : 1.4;
          const td = Math.max(0, dist(o.x, o.y, tX, tY) - reach) / spdT(o) + (o.grp === 'GK' ? 0.1 : 0.45);
          if (td < tDef) tDef = td;
        }
        let risk = sigmoid(-(tDef - Math.max(tRun, tBall)) * 1.8);
        if (!lofted) for (const o of opps) {
          const sd = segDistT(fx(s, o.x), fy(s, o.y), f, y, tfS, tyS);
          if (sd.t < 0.85 && sd.d < 1.6) risk += (1 - sd.d / 1.6) * 0.45;
        }
        risk = clamp(risk + (1 - m.a.pas / 100) * 0.22, 0, 0.95);
        const danger = 0.6 * Math.max(0, 1 - f / 60);
        const u = (clear ? -1.5 : 0) + Math.log(threat(tfS, tyS) * (1 - risk) + eps) + Math.log(1 - risk * danger + 1e-6) - 0.05 + t.R.run * 0.3 + (P.approach === 2 ? 0.15 : 0) + (P.counter ? 0.2 : 0) + m.R.prog * 0.3;
        options.push({ k: 'pass', u, t, tX, tY, L, lofted, through: true });
      }
    }
    // 드리블
    if (m.grp !== 'GK') {
      const df = clamp(f + 6, 0, LEN), dy = lerp(y, 34, 0.15);
      let pr = 0;
      for (const o of opps) {
        const of = fx(s, o.x), oy = fy(s, o.y);
        if (of > f - 1 && dist(of, oy, df, dy) < 6) pr += 0.22 * (0.6 + o.a.def / 150);
      }
      pr = clamp(pr * (1.25 - m.a.dri / 100), 0, 0.9);
      const u = Math.log(threat(df, dy) * (1 - pr) + eps) + Math.log(1 - pr * 0.6 * Math.max(0, 1 - f / 60) + 1e-6) - 0.08 + P.dribble + (P.counter ? 0.2 : 0) + m.R.drb - (clear && f > 94 ? 1.2 : 0);
      options.push({ k: 'dribble', u });
    }
    // 고를 수 있는 선택지가 없으면(드문 경우: 골키퍼 배급 제한) 가장 가까운 동료에게 걷어낸다
    if (!options.length) {
      const mates = this.onPitch(s).filter((t) => t !== m && !t.injured);
      const t = mates.sort((a, b) => dist(m.x, m.y, a.x, a.y) - dist(m.x, m.y, b.x, b.y))[0];
      if (!t) { m.hold = 0.5; return; }
      const L = dist(m.x, m.y, t.x, t.y);
      options.push({ k: 'pass', u: 0, t, tX: t.x, tY: t.y, L: Math.max(4, L), lofted: L > 26 });
    }
    // 소프트맥스 선택
    const T = (0.22 + (1 - m.a.pas / 100) * 0.25) * P.temp * (1 + (1 - m.st) * 0.6);
    let mx = -1e9;
    for (const o of options) if (o.u > mx) mx = o.u;
    let sum = 0;
    for (const o of options) { o.w = Math.exp((o.u - mx) / T); sum += o.w; }
    let r = this.rng.next() * sum, pick = options[options.length - 1];
    for (const o of options) { r -= o.w; if (r <= 0) { pick = o; break; } }

    m.dx = null;
    if (pick.k === 'shoot') this.doShot(m, pick.xg);
    else if (pick.k === 'pass') this.doPass(m, pick);
    else { m.hold = 0.5 + this.rng.next() * 0.5; this.setDribble(m, opps); m.s.drb++; }
  };

  function segDistT(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy || 1;
    let t = ((px - ax) * dx + (py - ay) * dy) / l2;
    t = clamp(t, 0, 1);
    return { d: Math.hypot(px - (ax + t * dx), py - (ay + t * dy)), t };
  }
  function segDist(px, py, ax, ay, bx, by) { return segDistT(px, py, ax, ay, bx, by).d; }

  // 오프사이드: 패스 순간 받는 선수가 상대 진영에서 공과 뒤에서 두 번째 수비수보다 앞에 있으면
  M.offsideCheck = function (m, t) {
    const s = m.side;
    if (this.fromRestart) return false; // 스로인·코너킥·골킥은 오프사이드 없음
    const tf = fx(s, t.x);
    if (tf <= LEN / 2) return false;
    const fs = this.onPitch(1 - s).map((o) => fx(s, o.x)).sort((a, b) => b - a);
    let line = fs[1] != null ? fs[1] : LEN;
    if (this.params(1 - s).line === 1) line -= 0.6; // 높은 라인은 한 발 먼저 올라가 함정을 판다
    return tf > Math.max(line, fx(s, m.x)) + 0.75;
  };
  M.callOffside = function (m, t) {
    const s = m.side;
    this.stats[s].off++;
    this.log('off', s, `오프사이드! ${sn(t.p)}의 침투가 한 발 빨랐습니다.`, { pid: t.id });
    this.setRestart('fk', 1 - s, t.x, t.y);
    this.restart.taker = this.onPitch(1 - s).sort((a, b) => dist(a.x, a.y, t.x, t.y) - dist(b.x, b.y, t.x, t.y))[0];
  };
  M.doPass = function (m, o) {
    const rng = this.rng;
    if (o.t && o.t.side === m.side && this.offsideCheck(m, o.t)) { m.s.pass++; this.stats[m.side].pass++; this.lastTouch = m.side; this.callOffside(m, o.t); return; }
    this.fromRestart = null;
    const err = (0.035 + (1 - m.a.pas / 100) * 0.11) * (1 + o.L / 40) * (1 + Math.max(0, 0.8 - m.st) * 1.2);
    const ang = Math.atan2(o.tY - m.y, o.tX - m.x) + rng.gauss(0, err);
    const L = o.L * (1 + rng.gauss(0, err * 0.6));
    const tx = clamp(m.x + Math.cos(ang) * L, -2, LEN + 2), ty = clamp(m.y + Math.sin(ang) * L, -2, WID + 2);
    const speed = o.lofted ? 19 : o.through ? clamp(13 + o.L * 0.3, 14, 22) : clamp(11 + o.L * 0.35, 12, 21);
    this.pass = { through: !!o.through, from: m, to: o.t, sx: m.x, sy: m.y, tx, ty, L: Math.max(1, dist(m.x, m.y, tx, ty)), prog: 0, speed, lofted: o.lofted, tried: new Set(), cross: this.setPiece || (fx(m.side, m.x) > 82 && Math.abs(m.y - 34) > 14) };
    const b = this.ball;
    b.owner = null; b.mode = 'pass';
    this.secondPasser = this.lastPasser;
    this.lastPasser = m;
    m.s.pass++; this.stats[m.side].pass++;
    if (this.state === 'play') {
      if (o.through && fx(m.side, m.x) > 45 && this.crng.chance(0.3)) this.say(m.side, this.pick(THROUGH)(sn(m.p), sn(o.t.p)), 'through');
      else if (this.pass.cross && !this.setPiece && this.crng.chance(0.18)) this.say(m.side, this.pick(CROSS)(sn(m.p), sn(o.t.p)), 'cross');
    }
    this.setPiece = null;
  };

  M.doShot = function (m, xg) {
    const rng = this.rng, s = m.side;
    const opps = this.onPitch(1 - s);
    const gk = opps.find((o) => o.grp === 'GK');
    const header = this.pass == null && m.recvCross;
    const skill = header ? (m.a.phy * 0.6 + m.a.sho * 0.4) * (1 + m.R.aerial * 0.25) : m.a.sho;
    const gkSkill = gk ? gk.a.gk : 30;
    let pGoal = xg * (0.55 + skill / 110) * (1.45 - gkSkill / 110);
    pGoal = clamp(pGoal * 0.56, 0.005, 0.9);
    xg = Math.min(0.95, xg * 0.5); // 표시용 xG: 실제 득점 확률 수준으로 보정
    const f = fx(s, m.x), y = fy(s, m.y);
    const d = Math.hypot(LEN - f, 34 - y);
    const pOn = clamp(0.32 + skill / 250 - d * 0.006, 0.18, 0.75);
    let blocked = false;
    for (const o of opps) {
      const of = fx(s, o.x), oy = fy(s, o.y);
      if (o.grp !== 'GK' && of > f && of < f + 8 && segDist(of, oy, f, y, LEN, 34) < 1.0 && rng.chance(0.35)) { blocked = o; break; }
    }
    let outcome;
    const r = rng.next();
    if (blocked) outcome = 'block';
    else if (r < pGoal) outcome = 'goal';
    else if (r < Math.max(pOn, pGoal + 0.05)) outcome = 'save';
    else outcome = 'wide';
    let gy;
    if (outcome === 'goal') gy = rng.range(GOAL_Y0 + 0.3, GOAL_Y1 - 0.3);
    else if (outcome === 'save') gy = rng.range(GOAL_Y0 + 1, GOAL_Y1 - 1);
    else gy = rng.chance(0.5) ? rng.range(GOAL_Y0 - 6, GOAL_Y0 - 0.5) : rng.range(GOAL_Y1 + 0.5, GOAL_Y1 + 6);
    const gx = UP(s) ? LEN + 0.5 : -0.5;
    const ty = UP(s) ? gy : WID - gy;
    this.shot = { by: m, sx: m.x, sy: m.y, tx: blocked ? blocked.x : gx, ty: blocked ? blocked.y : ty, outcome, xg, gk, blocked, prog: 0, L: 1, header, pen: !!this.penKick, d };
    this.penKick = false;
    this.shot.L = Math.max(1, dist(m.x, m.y, this.shot.tx, this.shot.ty));
    const b = this.ball; b.owner = null; b.mode = 'shot';
    m.s.shots++; this.stats[s].shots++; this.stats[s].xg += xg;
    this.shotLog.push({ s, x: fx(s, m.x), y: fy(s, m.y), xg, o: outcome, min: this.minute(), pid: m.id, h: header ? 1 : 0 });
    if (outcome === 'goal' || outcome === 'save') { m.s.sot++; this.stats[s].sot++; }
    this.shotAssist = this.lastPasser && this.lastPasser.side === s && this.lastPasser !== m ? this.lastPasser : null;
    if (this.shotAssist) this.shotAssist.s.key++;
    m.recvCross = false;
  };

  // ── 공 처리 ─────────────────────────────────────────────────
  M.ballLogic = function () {
    const b = this.ball, rng = this.rng;
    if (this.shot) {
      const sh = this.shot;
      sh.prog += (28 * DT) / sh.L;
      const t = Math.min(1, sh.prog);
      b.x = lerp(sh.sx, sh.tx, t); b.y = lerp(sh.sy, sh.ty, t); b.z = Math.sin(t * Math.PI) * 0.6;
      if (sh.gk && sh.outcome === 'save') { sh.gk.tx = b.x; sh.gk.ty = sh.ty; }
      if (sh.prog >= 1) this.resolveShot();
      return;
    }
    if (this.pass) {
      const p = this.pass;
      p.prog += (p.speed * DT) / p.L;
      const t = Math.min(1, p.prog);
      b.x = lerp(p.sx, p.tx, t); b.y = lerp(p.sy, p.ty, t);
      b.z = p.lofted ? Math.sin(t * Math.PI) * 3 : 0;
      // 가로채기
      const airborne = p.lofted && t < 0.78;
      if (!airborne) {
        for (const o of this.onPitch(1 - p.from.side)) {
          if (p.tried.has(o)) continue;
          const d = dist(o.x, o.y, b.x, b.y);
          const reach = o.grp === 'GK' ? 2.4 : 1.6;
          if (d < reach) {
            p.tried.add(o);
            let pi = 0.22 + o.a.def / 260 + (p.speed < 15 ? 0.1 : 0) + (this.params(o.side).tight ? 0.05 : 0) + (this.params(o.side).block === 0 && fx(o.side, o.x) < 35 ? 0.08 : 0) + (this.params(o.side).line === -1 && fx(o.side, o.x) < 30 ? 0.06 : 0) + (this.params(o.side).men < 0 && fx(o.side, o.x) < 35 ? 0.05 * -this.params(o.side).men : 0);
            if (o.grp === 'GK') pi = 0.35 + o.a.gk / 200;
            if (p.cross && o.grp === 'DF') pi += 0.04;
            // 문전 크로스를 걷어내려다 자책골
            if (p.cross && o.grp !== 'GK' && fx(o.side, o.x) < 7 && Math.abs(fy(o.side, o.y) - 34) < 10 && rng.chance(0.07)) { this.pass = null; this.ownGoal(o, p.from.side); return; }
            if (rng.chance(pi)) {
              o.s.int++;
              this.pass = null;
              p.from.s.lost++;
              if (rng.chance(o.grp === 'GK' ? 0.85 : 0.65)) this.giveBall(o);
              else this.looseBall(o.x, o.y, 6);
              this.lastTouch = o.side;
              return;
            }
          }
        }
      }
      // 수신
      const r = p.to;
      if (r.on && !airborne && dist(r.x, r.y, b.x, b.y) < 1.5) {
        const fail = 0.03 + (1 - r.a.dri / 100) * 0.05 + (p.lofted ? 0.06 : 0);
        p.from.s.passOk++; this.stats[p.from.side].passOk++;
        if (p.from !== r && r.side === p.from.side) { const k = p.from.id + '>' + r.id, pn = this.passNet[r.side]; pn[k] = (pn[k] || 0) + 1; }
        if (rng.chance(fail)) { this.pass = null; this.looseBall(r.x, r.y, 4); this.lastTouch = r.side; return; }
        // 압박이 벗겨짐: 공을 쫓던 상대 선수들은 방향을 바꾸느라 늦는다
        const opPress = this.tac(1 - r.side).press;
        for (const o of this.onPitch(1 - r.side)) if (o.chase && o.grp !== 'GK' && dist(o.x, o.y, r.x, r.y) > 7) o.lag = Math.max(o.lag, 0.3 + opPress * 0.25);
        this.giveBall(r);
        r.dx = null;
        if (p.cross && fx(r.side, r.x) > 86) { r.recvCross = true; r.hold = 0.08; }
        else r.recvCross = false;
        return;
      }
      if (p.prog >= 1) {
        const dx = p.tx - p.sx, dy = p.ty - p.sy, l = Math.hypot(dx, dy) || 1;
        this.pass = null;
        b.mode = 'free'; b.vx = (dx / l) * 5; b.vy = (dy / l) * 5;
        this.lastTouch = p.from.side;
      }
      this.checkOut();
      return;
    }
    if (b.mode === 'free') {
      b.x += b.vx * DT; b.y += b.vy * DT; b.vx *= 0.93; b.vy *= 0.93; b.z = 0;
      if (this.checkOut()) return;
      // 줍기
      let best = null, bd = 99, contest = null;
      for (const m of this.all()) {
        if (m.stun > 0 && m.grp !== 'GK') continue;
        const d = dist(m.x, m.y, b.x, b.y);
        if (d < 1.1 && d < bd) { contest = best && best.side !== m.side ? best : contest; bd = d; best = m; }
      }
      if (best) {
        if (contest && rng.chance(contest.a.phy / (contest.a.phy + best.a.phy))) best = contest;
        this.giveBall(best);
      }
    }
  };

  M.ownGoal = function (o, s) {
    this.score[s]++;
    const ev = this.log('goal', s, `자책골! ${J(sn(o.p), '이/가')} 걷어낸 공이 자기 골문으로 들어갑니다!`, { pid: o.id, og: true });
    this.goalsList.push(ev);
    this.flash = { type: 'goal', side: s, name: o.p.name + ' (자책골)' };
    this.state = 'goal'; this.timer = 3.2;
    this.kickSide = 1 - s;
    const b = this.ball; b.mode = 'dead'; b.owner = null;
  };
  M.looseBall = function (x, y, v) {
    const b = this.ball, a = this.rng.next() * Math.PI * 2;
    b.owner = null; b.mode = 'free'; b.x = x; b.y = y; b.vx = Math.cos(a) * v; b.vy = Math.sin(a) * v;
  };

  M.checkOut = function () {
    const b = this.ball;
    if (b.x >= 0 && b.x <= LEN && b.y >= 0 && b.y <= WID) return false;
    const last = this.lastTouch;
    this.pass = null;
    b.owner = null; b.mode = 'dead'; b.vx = b.vy = 0;
    if (b.y < 0 || b.y > WID) {
      // 스로인
      const side = 1 - last;
      this.setRestart('throw', side, clamp(b.x, 1, LEN - 1), b.y < 0 ? 0.2 : WID - 0.2);
    } else {
      // 골라인
      const atkSide = (b.x > LEN) === UP(0) ? 0 : 1; // 이 골라인을 공격하는 쪽
      if (last === atkSide) this.setRestart('goalkick', 1 - atkSide);
      else this.setRestart('corner', atkSide, b.x > LEN ? LEN - 0.3 : 0.3, b.y < 34 ? 0.3 : WID - 0.3);
    }
    return true;
  };

  M.setRestart = function (kind, side, x, y) {
    this.state = 'dead';
    this.timer = kind === 'corner' ? 2.4 : kind === 'goalkick' ? 2 : kind === 'pen' ? 2.5 : 1.3;
    const b = this.ball;
    let taker;
    if (kind === 'goalkick' || kind === 'gkhold') {
      taker = this.onPitch(side).find((m) => m.grp === 'GK') || this.onPitch(side)[0];
      x = UP(side) ? 5.5 : LEN - 5.5; y = 34;
    } else if (kind === 'pen') {
      const cands = this.onPitch(side).filter((m) => m.grp !== 'GK').sort((a, c) => c.a.sho - a.a.sho);
      taker = cands[0];
      x = UP(side) ? LEN - 11 : 11; y = 34;
    } else {
      const cands = this.onPitch(side).filter((m) => m.grp !== 'GK');
      cands.sort((a, c) => dist(a.x, a.y, x, y) - dist(c.x, c.y, x, y));
      taker = cands[0];
    }
    b.x = x; b.y = y;
    this.restart = { kind, side, taker, x, y };
    taker.tx = x; taker.ty = y; taker.chase = true;
    this.setPiece = kind === 'corner' ? { side } : null;
    this.poss = side;
    if (kind === 'corner') { this.stats[side].corners++; if (this.crng.chance(0.4)) this.say(side, this.pick(CORNER)(sn(taker.p), this.sides[side].team.name), 'corner'); }
  };

  M.doRestart = function () {
    const r = this.restart;
    this.restart = null;
    this.state = 'play';
    if (!r || !r.taker.on) { this.looseBall(this.ball.x, this.ball.y, 0); return; }
    r.taker.x = r.x; r.taker.y = r.y;
    if (r.kind === 'pen') {
      this.giveBall(r.taker, 0);
      const s = r.taker.side;
      this.log('chance', s, this.pick(PEN_UP)(sn(r.taker.p)));
      this.penKick = true;
      this.doShot(r.taker, 1.4);
      return;
    }
    // 프리킥: 골문 정면 17~32m면 전담 키커가 직접 노리고, 측면이면 박스로 크로스
    if (r.kind === 'fk') {
      const s = r.side, f = fx(s, r.x), y = fy(s, r.y), d = Math.hypot(LEN - f, 34 - y);
      if (f > 60) {
        const kick = this.onPitch(s).filter((m) => m.grp !== 'GK').sort((a, b) => (b.a.sho + b.a.pas) - (a.a.sho + a.a.pas))[0] || r.taker;
        kick.x = r.x; kick.y = r.y;
        if (d >= 17 && d <= 32 && Math.abs(y - 34) < 17 && this.rng.chance(0.3)) {
          this.giveBall(kick, 0);
          this.say(s, `프리킥, ${J(sn(kick.p), '이/가')} 직접 노립니다. 거리 ${Math.round(d)}m.`);
          this.doShot(kick, 0.13 * (0.6 + kick.a.sho / 160));
          return;
        }
        this.giveBall(kick, 0.4);
        this.setPiece = { side: s };
        return;
      }
    }
    this.fromRestart = r.kind === 'throw' || r.kind === 'corner' || r.kind === 'goalkick' || r.kind === 'gkhold' ? r.kind : null;
    this.giveBall(r.taker, r.kind === 'corner' ? 0.05 : r.kind === 'goalkick' ? 0.8 : 0.2);
    if (r.kind === 'corner') this.setPiece = { side: r.side };
  };

  M.resolveShot = function () {
    const sh = this.shot, m = sh.by, s = m.side, rng = this.rng;
    this.shot = null;
    const b = this.ball;
    const name = m.p.name, team = this.sides[s].team;
    if (sh.outcome === 'goal') {
      this.score[s]++;
      m.s.goals++;
      const ast = this.shotAssist;
      if (ast) ast.s.ast++;
      const ev = this.log('goal', s, this.goalText(m, ast, sh), { pid: m.id, ast: ast ? ast.id : null, xg: sh.xg });
      this.goalsList.push(ev);
      this.flash = { type: 'goal', side: s, name };
      this.state = 'goal'; this.timer = 3.2;
      this.kickSide = 1 - s;
      b.mode = 'dead'; b.owner = null;
      // 실점 팀 사기 소폭 하락, 득점 팀 체력 회복 효과
      return;
    }
    if (sh.outcome === 'save') {
      const gk = sh.gk;
      if (gk) gk.s.saves++;
      if (sh.xg > 0.13) this.log('save', 1 - s, this.pick(SAVE_BIG)(sn(m.p), gk ? sn(gk.p) : '골키퍼'), { pid: m.id });
      else if (this.crng.chance(0.45)) this.say(s, this.pick(SAVE_SMALL)(sn(m.p), gk ? sn(gk.p) : '골키퍼'), 'savesmall');
      const r = rng.next();
      if (gk && r < 0.55) { b.x = gk.x; b.y = gk.y; this.setRestart('gkhold', 1 - s); this.timer = 1.6; }
      else if (r < 0.8) this.setRestart('corner', s, UP(s) ? LEN - 0.3 : 0.3, rng.chance(0.5) ? 0.3 : WID - 0.3);
      else { this.looseBall(sh.tx + (UP(s) ? -3 : 3), sh.ty, 7); this.lastTouch = 1 - s; }
      return;
    }
    if (sh.outcome === 'block') {
      if (sh.blocked) { sh.blocked.s.tkl++; if (this.crng.chance(0.45)) this.say(1 - s, this.pick(BLOCK)(sn(m.p), sn(sh.blocked.p)), 'block'); }
      if (rng.chance(0.4)) this.setRestart('corner', s, UP(s) ? LEN - 0.3 : 0.3, rng.chance(0.5) ? 0.3 : WID - 0.3);
      else { this.looseBall(b.x, b.y, 7); this.lastTouch = 1 - s; }
      return;
    }
    // 빗나감
    if (sh.xg > 0.16) this.log('miss', s, this.pick(MISS_BIG)(sn(m.p)), { pid: m.id });
    else if (this.crng.chance(0.4)) this.say(s, this.pick(MISS_SMALL)(sn(m.p), Math.round(Math.hypot(LEN - fx(s, sh.sx), 34 - fy(s, sh.sy)))), 'misssmall');
    this.setRestart('goalkick', 1 - s);
  };

  // ── 태클과 파울 ─────────────────────────────────────────────
  M.tackles = function () {
    const m = this.ball.owner;
    if (!m || m.protect > 0 || this.state !== 'play') return;
    const rng = this.rng;
    for (const o of this.onPitch(1 - m.side)) {
      if (o.stun > 0 || o.grp === 'GK') continue;
      const d = dist(o.x, o.y, m.x, m.y);
      if (d > 1.8) continue;
      const OP = this.params(o.side);
      const press = OP.press;
      const rate = (0.75 + press * 0.1) * OP.tackleRate * (1 + this.dLv * 0.08);
      if (!rng.chance(rate * DT)) continue;
      const pw = sigmoid((o.a.def - m.a.dri) / 22 + (o.a.phy - m.a.phy) / 60 - 0.1 + OP.tackleSkill + o.R.tackle + (m.st - o.st) * -0.8);
      if (rng.chance(pw)) {
        o.s.tkl++; this.stats[o.side].tkl++;
        m.s.lost++;
        this.lastTouch = o.side;
        if (rng.chance(0.55)) this.giveBall(o);
        else this.looseBall(m.x, m.y, 5);
        m.stun = 0.6;
        if (fx(m.side, m.x) > 68 && this.crng.chance(0.3)) this.say(o.side, this.pick(TACKLE)(sn(o.p), sn(m.p)), 'tackle');
        return;
      }
      // 실패 → 파울 가능
      const mf = fx(m.side, m.x), inBox = mf > LEN - 16.5 && Math.abs(fy(m.side, m.y) - 34) < 20;
      const foulP = (0.16 + (press === 2 ? 0.04 : 0) + (o.a.def < 50 ? 0.05 : 0)) * OP.foulF * (inBox ? 0.05 : 1);
      if (rng.chance(foulP)) { this.foul(o, m); return; }
      o.stun = 0.9 + press * 0.3; // 무리한 압박이 실패하면 더 오래 제쳐진다
      m.s.drb++;
      if (fx(m.side, m.x) > 60 && this.crng.chance(0.28)) this.say(m.side, this.pick(DRIBBLE)(sn(m.p), sn(o.p)), 'dribble');
      return;
    }
  };

  M.foul = function (o, m) {
    const rng = this.rng;
    o.s.fouls++; this.stats[o.side].fouls++;
    const f = fx(m.side, m.x), y = fy(m.side, m.y);
    const inBox = f > LEN - 16.5 && Math.abs(y - 34) < 20.16;
    let card = null;
    const pr = rng.next();
    if (pr < 0.008 + (inBox ? 0.01 : 0)) card = 'red';
    else if (pr < 0.15 + (f > 70 ? 0.06 : 0) + this.dLv * 0.035) card = 'yellow';
    if (card === 'yellow') {
      o.yellow++;
      this.stats[o.side].yel++;
      if (o.yellow >= 2) card = 'red2';
      else this.log('yellow', o.side, this.pick(YELLOW)(sn(o.p), sn(m.p)), { pid: o.id });
    }
    if (card === 'red' || card === 'red2') {
      this.stats[o.side].red++;
      this.log('red', o.side, card === 'red2' ? `${o.p.name}, 두 번째 경고로 퇴장!` : `${o.p.name} 다이렉트 퇴장!`, { pid: o.id });
      this.sendOff(o);
      this.flash = { type: 'red', side: o.side, name: o.p.name };
    }
    if (inBox) {
      this.log('pen', m.side, `페널티킥! ${o.p.name}의 파울`, { pid: m.id });
      this.flash = this.flash || { type: 'pen', side: m.side };
      this.setRestart('pen', m.side);
    } else {
      this.setRestart('fk', m.side, m.x, m.y);
      this.restart.taker = m;
    }
  };

  M.sendOff = function (o) {
    o.on = false; o.endT = this.t; o.red = true; this._on = null;
    o.x = -5; o.y = -5;
    if (this.ball.owner === o) this.ball.owner = null;
  };

  // ── 부상, 교체, AI 판단 ────────────────────────────────────
  M.randomIncidents = function () {
    const rng = this.rng;
    if (rng.chance(DT * 22 * 0.0000085)) {
      const all = this.all().filter((m) => !m.injured);
      const m = rng.pick(all);
      m.injured = true;
      const sv = rng.next();
      m.injWeeks = sv < 0.6 ? rng.int(1, 2) : sv < 0.9 ? rng.int(3, 6) : rng.int(8, 16); // 경미 60% · 중간 30% · 장기 10%
      this.log('inj', m.side, `${m.p.name} 부상으로 쓰러집니다.`, { pid: m.id });
    }
    if (this.t >= this.nextAiCheck) {
      this.nextAiCheck = this.t + 30;
      for (let s = 0; s < 2; s++) this.aiManage(s);
    }
  };

  M.aiManage = function (s) {
    const isUser = s === this.user;
    const min = this.minute();
    // 부상자는 사용자 팀도 자동 교체
    for (const m of this.onPitch(s)) {
      if (m.injured && this.subsLeft[s] > 0) this.autoSub(s, m);
    }
    if (isUser) return;
    if (min >= 58 && this.subsLeft[s] > 0) {
      const tired = this.onPitch(s).filter((m) => m.grp !== 'GK' && (m.st < 0.62 || m.yellow && min > 70)).sort((a, b) => a.st - b.st);
      if (tired.length && this.rng.chance(0.6)) this.autoSub(s, tired[0]);
    }
    const tac = this.tac(s);
    const diff = this.score[s] - this.score[1 - s];
    if (min >= 65 && diff < 0 && tac.mentality < 4) tac.mentality = Math.min(4, (this.sides[s].baseMent ?? 2) + 1 + (min > 80 ? 1 : 0));
    if (min >= 75 && diff > 0 && tac.mentality > 1) tac.mentality = Math.max(1, (this.sides[s].baseMent ?? 2) - 1);
  };

  M.autoSub = function (s, out) {
    const bench = this.sides[s].bench.filter((p) => !this.used.has(p.id) && p.inj <= 0);
    if (!bench.length) return false;
    const fitBy = (p) => D.fit(out.role, p) * p.ovr * (0.7 + 0.3 * p.cond / 100);
    bench.sort((a, b) => fitBy(b) - fitBy(a));
    return this.substitute(s, out, bench[0]);
  };

  M.substitute = function (s, out, p) {
    if (this.subsLeft[s] <= 0 || !out.on || this.used.has(p.id)) return false;
    const nm = new MP(p, s, out.role, [out.role, out.bx, out.by], p.cond, p.morale, this.rng.next() * 6.28, this.base, { r: [out.R.key, out.R.duty], op: [out.role, out.obx, out.oby], fam: out.fam, hb: out.hb });
    nm.x = out.x; nm.y = out.y; nm.startT = this.t;
    out.on = false; out.endT = this.t; out.subbed = true;
    if (this.ball.owner === out) this.giveBall(nm);
    if (this.pass && this.pass.to === out) this.pass.to = nm;
    this.mp[s].push(nm);
    this._on = null;
    this.used.add(p.id);
    this.subsLeft[s]--;
    this.log('sub', s, `교체: ${out.p.name} → ${p.name}`, { pid: p.id, out: out.id });
    return true;
  };

  M.changeRole = function (s, m, role, bx, by) {
    const same = m.role === role;
    m.role = role; m.grp = roleGroup(role); m.bx = bx; m.by = by; m.obx = bx; m.oby = by;
    if (!same) m.R = D.roleMods(D.validRole(role, null));
  };

  // 포메이션 변경: 현재 선수들을 새 슬롯에 재배치 (수비 시 포메이션도 다시 맞춘다)
  M.setFormation = function (s, formation) {
    const slots = D.FORMATIONS[formation];
    const players = this.onPitch(s);
    const gk = players.find((m) => m.grp === 'GK');
    const rest = players.filter((m) => m !== gk).sort((a, b) => a.bx - b.bx || a.by - b.by);
    const outSlots = slots.slice(1).map((sl, i) => ({ sl, i })).sort((a, b) => a.sl[1] - b.sl[1] || a.sl[2] - b.sl[2]);
    rest.forEach((m, i) => { const o = outSlots[i]; if (o) this.changeRole(s, m, o.sl[0], o.sl[1], o.sl[2]); });
    this.tac(s).formation = formation;
    this.setOPFormation(s, this.tac(s).formationOP);
  };
  M.setOPFormation = function (s, f) {
    this.tac(s).formationOP = f || '';
    const players = this.onPitch(s).filter((m) => m.grp !== 'GK');
    if (!f || !D.FORMATIONS[f]) { for (const m of players) { m.obx = m.bx; m.oby = m.by; } return; }
    const from = [['GK', 0, 0.5]].concat(players.map((m) => [m.role, m.bx, m.by]));
    const map = D.shapeMap(from, D.FORMATIONS[f]);
    players.forEach((m, i) => { const o = map[i + 1]; if (o) { m.obx = o[1]; m.oby = o[2]; } });
  };
  M.setRole = function (s, m, r) { m.R = D.roleMods(D.validRole(m.role, r)); };

  M.accumulate = function () {
    const b = this.ball;
    const s = b.owner ? b.owner.side : this.poss;
    this.stats[s].poss += DT;
    if (b.owner) this.thAcc[s] += threat(fx(s, b.x), fy(s, b.y)) * DT;
    const min = this.minute();
    if (min !== this.lastMinute) {
      this.momentum.push({ min, v: this.thAcc[0] - this.thAcc[1] });
      this.thAcc = [0, 0];
      this.lastMinute = min;
    }
  };

  // ── 결과 정리 ───────────────────────────────────────────────
  M.ratings = function () {
    const out = [];
    for (let s = 0; s < 2; s++) {
      const conceded = this.score[1 - s];
      const won = this.score[s] > this.score[1 - s], lost = this.score[s] < this.score[1 - s];
      for (const m of this.mp[s]) {
        const mins = Math.round(((m.endT ?? this.t) - m.startT) * CLOCK / 60);
        const st = m.s;
        let r = 6.0 + st.passOk * 0.012 - (st.pass - st.passOk) * 0.045 + st.goals * 0.75 + st.ast * 0.45 + st.key * 0.12
          + st.tkl * 0.07 + st.int * 0.06 + st.drb * 0.012 - st.lost * 0.03 + st.sot * 0.08 + st.saves * 0;
        if (m.grp === 'GK') r += st.saves * 0.18 - conceded * 0.3 + (conceded === 0 ? 0.5 : 0);
        if (m.grp === 'DF') r += (conceded === 0 ? 0.5 : -conceded * 0.15);
        r += won ? 0.3 : lost ? -0.3 : 0;
        if (m.red) r -= 1.5;
        if (mins < 20) r = 6 + (r - 6) * 0.5;
        if (r > 8) r = 8 + (r - 8) * 0.55; // 10점은 정말 특별한 경기에서만
        m.rating = clamp(Math.round(r * 10) / 10, 3, 10);
        m.mins = Math.max(1, Math.min(90, mins));
        out.push(m);
      }
    }
    return out;
  };

  M.possPct = function () {
    const a = this.stats[0].poss, b = this.stats[1].poss;
    return a + b > 0 ? Math.round((a / (a + b)) * 100) : 50;
  };

  // ── 중계 멘트 ───────────────────────────────────────────────
  const J = (w, p) => KM.josa(w, p);
  // 해설은 성(마지막 단어)으로 부른다: '엘링 홀란' → '홀란', '손흥민'은 그대로
  function sn(p) { const n = String(p.name || ''); const parts = n.split(' '); return parts.length > 1 ? parts[parts.length - 1] : n; }
  const GOAL_HEAD = [(p, a) => `${a ? `${a}의 크로스, ` : ''}${p}의 헤더! 골망을 흔듭니다!`, (p, a) => `${p}, 높이 뛰어올라 머리로 꽂아 넣습니다!${a ? ` ${J(a, '이/가')} 정확히 배달했어요.` : ''}`];
  const GOAL_LONG = [(p, a, d) => `${p}의 ${d}m 중거리 슈팅! 골키퍼가 손쓸 수 없는 원더골!`, (p, a, d) => `${J(p, '이/가')} 먼 거리에서 그대로 때립니다… 들어갑니다! ${d}m 대포알!`];
  const GOAL_PEN = [(p) => `${p}, 침착하게 페널티킥 성공!`, (p) => `${J(p, '이/가')} 골키퍼를 속이고 반대쪽으로 차 넣습니다!`];
  const GOAL_SOLO = [(p) => `${p}의 개인기! 수비를 홀로 무너뜨리고 마무리합니다!`, (p) => `${p}, 혼자 해냅니다! 드리블 돌파 후 깔끔한 마무리!`];
  const GOAL_NORM = [(p, a) => `${a ? `${a}의 패스를 받은 ` : ''}${p}, 골! 깔끔하게 마무리합니다!`, (p, a) => `${p}의 슈팅이 골문 구석을 찌릅니다!${a ? ` 도움은 ${a}.` : ''}`, (p, a) => `들어갔습니다! ${p}!${a ? ` ${J(a, '과/와')}의 호흡이 완벽했어요.` : ''}`, (p, a) => `${p}, 골키퍼와 1대1에서 놓치지 않습니다!${a ? ` (도움 ${a})` : ''}`];
  const SAVE_BIG = [(p, g) => `${p}의 결정적인 슈팅! ${g}의 슈퍼 세이브!`, (p, g) => `${g}, 믿을 수 없는 선방! ${p}의 슈팅을 막아냅니다!`, (p, g) => `${p}, 골이나 다름없는 기회… ${J(g, '이/가')} 손끝으로 쳐냅니다!`];
  const SAVE_SMALL = [(p, g) => `${p}의 슈팅, ${J(g, '이/가')} 안정적으로 잡아냅니다.`, (p, g) => `${p}, 골문으로 향하는 슈팅! ${g} 정면입니다.`];
  const MISS_BIG = [(p) => `${p}, 절호의 기회를 놓칩니다!`, (p) => `아! ${p}의 슈팅이 골대를 살짝 벗어납니다!`, (p) => `${p}, 이걸 놓치나요! 관중석에서 탄식이 터집니다.`, (p) => `골대를 맞고 나옵니다! ${p} 아쉬워합니다!`];
  const MISS_SMALL = [(p, d) => `${p}의 ${d}m 슈팅, 크게 벗어납니다.`, (p) => `${p}, 과감하게 때려보지만 골문 위로 넘어갑니다.`, (p) => `${p}의 슈팅이 옆그물을 때립니다.`];
  const BLOCK = [(p, d) => `${p}의 슈팅, ${J(d, '이/가')} 몸을 던져 막아냅니다!`, (p, d) => `${d}의 육탄 방어! ${p}의 슈팅이 막힙니다.`];
  const THROUGH = [(p, t) => `${p}의 날카로운 침투 패스! ${J(t, '이/가')} 뒷공간으로 달려갑니다!`, (p, t) => `${p}, 수비 라인을 가르는 스루 패스! ${t} 쇄도!`];
  const CROSS = [(p, t) => `${p}, 측면에서 크로스를 올립니다!`, (p, t) => `${p}의 얼리 크로스, ${J(t, '을/를')} 노립니다!`];
  const TACKLE = [(d, p) => `${d}의 깔끔한 태클! ${p}의 돌파를 끊어냅니다.`, (d, p) => `${d}, 위험 지역에서 공을 따냅니다!`];
  const DRIBBLE = [(p, d) => `${p}, ${J(d, '을/를')} 제치고 돌파합니다!`, (p, d) => `${p}의 화려한 발재간! ${J(d, '이/가')} 따라가지 못합니다.`];
  const CORNER = [(p, t) => `코너킥입니다. ${J(p, '이/가')} 키커로 나섭니다.`, (p, t) => `${t}의 코너킥 기회. 박스 안이 붐빕니다.`];
  const YELLOW = [(o, p) => `${o} 경고. ${p}에게 거친 태클을 했습니다.`, (o) => `주심이 옐로카드를 꺼냅니다. ${o} 경고.`, (o, p) => `${o}, ${J(p, '을/를')} 잡아끌다 경고를 받습니다.`];
  const PEN_UP = [(p) => `${p}, 페널티킥 키커로 나섭니다.`, (p) => `${J(p, '이/가')} 공을 내려놓습니다. 경기장이 숨을 죽입니다.`];
  M.pick = function (arr) { return arr[Math.floor(this.crng.next() * arr.length)]; };
  // cat이 있으면 같은 종류 멘트는 약 4~5분, 모든 상황 멘트는 최소 40초 간격 (중계가 너무 수다스럽지 않게)
  M.say = function (side, text, cat) {
    if (!text) return;
    if (cat) {
      const cc = this.comCat || (this.comCat = {});
      if (this.t - (cc[cat] ?? -999) < 60 || this.t - (this.lastCom ?? -999) < 9) return;
      cc[cat] = this.t;
    }
    this.lastCom = this.t;
    this.log('com', side, text);
  };
  M.intro = function (opts) {
    const h = this.sides[0].team, a = this.sides[1].team;
    const att = opts.attendance ? ` 관중 ${opts.attendance.toLocaleString()}명.` : '';
    if (this.derby) this.say(-1, `${h.stadium || h.name + ' 홈구장'}, 오늘은 ${this.derby.name}입니다!${att} ${this.dLv >= 3 ? '관중석이 터질 듯한 함성으로 가득합니다.' : '양 팀 모두 물러설 수 없는 경기예요.'}`);
    else this.say(-1, `${h.name}의 홈 ${h.stadium || '경기장'}에서 ${J(a.name, '을/를')} 맞이합니다.${att} 곧 킥오프!`);
  };
  M.goalText = function (m, ast, sh) {
    const s = m.side, p = sn(m.p), a = ast ? sn(ast.p) : '';
    const d = Math.round(sh.d || 10);
    let line;
    if (sh.pen) line = this.pick(GOAL_PEN)(p);
    else if (sh.header) line = this.pick(GOAL_HEAD)(p, a);
    else if (d >= 20) line = this.pick(GOAL_LONG)(p, a, d);
    else if (!ast && m.s.drb >= 2 && this.crng.chance(0.6)) line = this.pick(GOAL_SOLO)(p);
    else line = this.pick(GOAL_NORM)(p, a);
    // 경기 상황: 동점·역전·쐐기·해트트릭·극장골 (점수는 이미 이번 골이 반영된 상태)
    const my = this.score[s], op = this.score[1 - s], min = this.minute();
    const tr = this.trailed || (this.trailed = [false, false]);
    let ctx = '';
    if (m.s.goals === 3) ctx = `해트트릭!! ${p}의 날입니다!`;
    else if (my === op) ctx = '동점골!';
    else if (my === op + 1 && tr[s]) ctx = '역전골!';
    else if (my - op >= 2 && min >= 70) ctx = '쐐기골!';
    else if (my < op) ctx = '추격골!';
    else if (my === 1 && op === 0) ctx = '선제골!';
    if (min >= 88 && my >= op && my - op <= 1) ctx = (ctx ? ctx + ' ' : '') + '극장골입니다!!';
    if (this.score[0] < this.score[1]) tr[0] = true;
    if (this.score[1] < this.score[0]) tr[1] = true;
    return `${ctx ? ctx + ' ' : '골! '}${line}`;
  };
  // 공 위치·흐름에 맞춘 중간 멘트 (1.5~3분 간격)
  M.flavor = function () {
    this.comNext = this.t + 20 + this.crng.next() * 26;
    if (this.state !== 'play') return;
    const min = this.minute(), F = this.comFlags, c = this.crng;
    const s0 = this.sides[0].team, s1 = this.sides[1].team;
    const lead = this.score[0] - this.score[1];
    // 시간대별 한 번씩 나오는 멘트
    const once = (k, cond, text) => { if (!F[k] && cond) { F[k] = 1; this.say(-1, text); return true; } return false; };
    const pp = this.possPct();
    if (once('m25', min >= 25 && min < 40, `${min}분, 점유율 ${pp}% 대 ${100 - pp}%. ${pp >= 55 ? J(s0.name, '이/가') + ' 경기를 주도하고 있습니다.' : pp <= 45 ? J(s1.name, '이/가') + ' 공을 더 오래 가지고 있어요.' : '팽팽한 흐름입니다.'}`)) return;
    if (once('m60', min >= 60 && min < 70, `후반 ${min}분. 슈팅 ${this.stats[0].shots}대 ${this.stats[1].shots}, xG ${this.stats[0].xg.toFixed(1)} 대 ${this.stats[1].xg.toFixed(1)}.`)) return;
    if (min >= 80 && Math.abs(lead) <= 1 && once('m80', true, lead === 0 ? '남은 시간 10분. 양 팀 모두 결승골을 노립니다!' : `${J((lead < 0 ? s0 : s1).name, '이/가')} 마지막 총공세에 나섭니다! 관중들이 모두 일어섭니다.`)) return;
    if (this.derby && c.chance(0.12)) { this.say(-1, this.pick([`관중석의 열기가 뜨겁습니다. 역시 ${this.derby.name}!`, `거친 몸싸움이 이어집니다. ${this.derby.name}다운 분위기예요.`, `양 팀 서포터들의 응원 대결도 치열합니다.`]), 'derby'); return; }
    const o = this.ball.owner;
    if (!o || c.chance(0.35)) return;
    const s = o.side, team = this.sides[s].team, f = fx(s, o.x), p = sn(o.p);
    const opT = this.sides[1 - s].team, OP = this.params(1 - s);
    let lines;
    if (OP.press === 2 && f < 50 && c.chance(0.5)) lines = [`${opT.name}의 거센 압박! ${J(p, '이/가')} 공을 지키느라 애를 먹습니다.`, `${opT.name}, 높은 곳에서부터 강하게 몰아붙입니다.`];
    else if (f < 35) lines = [`${J(team.name, '이/가')} 후방에서 차분하게 빌드업합니다.`, `${p}, 수비 라인에서 공을 돌리며 틈을 찾습니다.`, `${team.name}, 서두르지 않고 공을 소유합니다.`];
    else if (f < 70) lines = [`${p}, 중원에서 방향을 바꿉니다.`, `${J(team.name, '이/가')} 측면으로 공을 전개합니다.`, `${p}의 패스로 ${team.name}의 공격이 시작됩니다.`, `중원 싸움이 치열합니다. ${J(p, '이/가')} 공을 잡았어요.`];
    else lines = [`${p}, 페널티 박스 근처까지 전진합니다!`, `${team.name}의 공격이 계속됩니다. ${J(p, '이/가')} 기회를 엿봅니다.`, `${opT.name} 수비가 바쁘게 움직입니다. ${p}의 공격!`];
    this.say(s, this.pick(lines), 'flow');
  };
  M.halfLine = function () {
    const a = this.stats[0], b = this.stats[1], pp = this.possPct();
    const d = this.score[0] - this.score[1];
    return `전반 기록: 점유율 ${pp}%-${100 - pp}%, 슈팅 ${a.shots}-${b.shots}, xG ${a.xg.toFixed(1)}-${b.xg.toFixed(1)}. ${d === 0 ? '승부는 후반으로 이어집니다.' : J(this.sides[d > 0 ? 0 : 1].team.name, '이/가') + ' 앞선 채 전반을 마칩니다.'}`;
  };
  M.endLine = function () {
    const d = this.score[0] - this.score[1];
    if (d === 0) return this.derby ? `${this.derby.name}는 무승부로 끝납니다. 승자는 없었지만 뜨거운 90분이었어요.` : '승점 1점씩을 나눠 갖습니다.';
    const w = this.sides[d > 0 ? 0 : 1].team, l = this.sides[d > 0 ? 1 : 0].team;
    if (this.derby) return `${J(w.name, '이/가')} ${this.derby.name}에서 웃습니다! ${l.name} 팬들은 고개를 떨굽니다.`;
    return Math.abs(d) >= 3 ? `${w.name}의 완승입니다.` : `${J(w.name, '이/가')} 승리를 가져갑니다.`;
  };

  KM.Engine = { Match, LEN, WID, DT, HALF, CLOCK, HX, HY, threat, xgAt, fx, fy };
})(globalThis.KM || (globalThis.KM = {}));
