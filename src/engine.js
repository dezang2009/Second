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

  function roleGroup(role) {
    if (role === 'GK') return 'GK';
    if (role === 'CB' || role === 'LB' || role === 'RB') return 'DF';
    if (role === 'ST' || role === 'LW' || role === 'RW') return 'FW';
    return 'MF';
  }

  // 공격 방향 기준 좌표 (side 0은 +x 방향으로 공격)
  const fx = (side, x) => (side === 0 ? x : LEN - x);
  const fy = (side, y) => (side === 0 ? y : WID - y);

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

  function MP(p, side, role, slot, cond, morale, phase, base) {
    // 역할 적합도에 따른 능력치 보정
    const fit = D.fit(role, p);
    const f = Math.pow(fit, 0.7) * (0.94 + 0.12 * (morale / 100));
    const a = {};
    // 능력치 차이를 완만하게 압축해 약팀도 이변을 낼 수 있게 함
    for (const k in p.attr) a[k] = 62 + (p.attr[k] * f - (base || 62)) * 0.45;
    if (role === 'GK' && p.pos !== 'GK') a.gk = p.attr.gk * 0.5;
    this.p = p; this.id = p.id; this.side = side; this.role = role; this.grp = roleGroup(role);
    this.bx = slot[1]; this.by = slot[2];
    this.x = 0; this.y = 0; this.vx = 0; this.vy = 0; this.tx = 0; this.ty = 0;
    this.st = clamp(cond / 100, 0.3, 1);
    this.a = a;
    this.maxSpd = 6.2 + (a.pac / 100) * 3.2;
    this.on = true; this.yellow = 0; this.stun = 0; this.injured = false;
    this.phase = phase;
    this.s = { pass: 0, passOk: 0, key: 0, shots: 0, sot: 0, goals: 0, ast: 0, tkl: 0, int: 0, saves: 0, fouls: 0, drb: 0, lost: 0, mins: 0 };
    this.startT = 0; this.endT = null;
    this.hold = 0; this.protect = 0; this.chase = false; this.blocked = false;
    this.dx = null; this.dy = null; this.recvCross = false; this.injWeeks = 0;
    this.red = false; this.subbed = false; this.rating = 6; this.mins = 0;
  }

  function Match(home, away, opts) {
    opts = opts || {};
    this.rng = new RNG(opts.seed || (Math.random() * 1e9) | 0);
    this.sides = [home, away];  // { team, starters:[{p, role, slot}], bench:[p], tactics, morale }
    this.user = opts.user == null ? -1 : opts.user;
    this.mp = [[], []];
    this.subsLeft = [5, 5];
    this.used = new Set();
    // 경기 수준 기준점: 두 팀 선발의 평균 OVR. 리그 수준과 상관없이 두 팀의 '차이'가 경기를 좌우한다
    let sum = 0, cnt = 0;
    for (const sd of this.sides) for (const st of sd.starters) { sum += st.p.ovr; cnt++; }
    this.base = cnt ? sum / cnt : 62;
    for (let s = 0; s < 2; s++) {
      const sd = this.sides[s];
      sd.starters.forEach((st) => this.mp[s].push(new MP(st.p, s, st.role, st.slot, st.p.cond, st.p.morale, this.rng.next() * 6.28, this.base)));
    }
    this.ball = { x: 52.5, y: 34, vx: 0, vy: 0, owner: null, mode: 'held', z: 0 };
    this.t = 0;
    this.half = 1;
    this.added = [this.rng.int(0, 3) * 60 / CLOCK, this.rng.int(1, 6) * 60 / CLOCK];
    this.score = [0, 0];
    this.state = 'kickoff';
    this.timer = 1.2;
    this.kickSide = 0;
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
    this.placeKickoff();
  }

  function blankStats() {
    return { poss: 0, shots: 0, sot: 0, xg: 0, pass: 0, passOk: 0, fouls: 0, corners: 0, yel: 0, red: 0, tkl: 0 };
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
    const ev = Object.assign({ min: this.minute(), clock: this.clockText(), type, side, text }, extra || {});
    this.events.push(ev);
    return ev;
  };

  M.placeKickoff = function () {
    for (let s = 0; s < 2; s++) {
      for (const m of this.mp[s]) {
        if (!m.on) continue;
        const ofx = m.grp === 'GK' ? 3 : 8 + m.bx * 40;
        const ofy = m.by * WID * 0.8 + WID * 0.1;
        m.x = s === 0 ? ofx : LEN - ofx;
        m.y = s === 0 ? ofy : WID - ofy;
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
    k.x = 52.5 - (ks === 0 ? 0.6 : -0.6); k.y = 34;
    this.giveBall(k, 0.6);
  };

  M.giveBall = function (m, hold) {
    const b = this.ball;
    b.owner = m; b.mode = 'held'; b.vx = b.vy = 0; b.z = 0;
    this.poss = m.side; this.lastTouch = m.side;
    m.hold = hold != null ? hold : this.holdTime(m);
    m.protect = 0.35;
    this.pass = null;
  };

  M.holdTime = function (m) {
    const st = this.tac(m.side).style;
    const base = st === 0 ? 0.9 : st === 1 ? 0.65 : 0.4;
    return base + this.rng.next() * 0.6;
  };

  // ── 메인 스텝 ───────────────────────────────────────────────
  M.step = function () {
    if (this.finished) return;
    this.flash = null;
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
    this.checkClock();
  };

  M.checkClock = function () {
    const endHalf1 = HALF + this.added[0];
    const endFull = HALF * 2 + this.added[0] + this.added[1];
    if (this.half === 1 && this.t >= endHalf1 && this.ballSafe()) {
      this.half = 2;
      this.t = endHalf1;
      this.log('half', -1, `전반 종료. ${this.sides[0].team.short} ${this.score[0]} - ${this.score[1]} ${this.sides[1].team.short}`);
      this.kickSide = 1;
      this.state = 'kickoff'; this.timer = 1.5;
      for (const m of this.all()) m.st = Math.min(1, m.st + 0.06);
      this.placeKickoff();
    } else if (this.half === 2 && this.t >= endFull && this.ballSafe()) {
      this.finish();
    }
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
      const tac = this.tac(s);
      const men = tac.mentality - 2, line = tac.line - 1, width = tac.width - 1, press = tac.press;
      const players = this.onPitch(s);
      const bF = fx(s, b.x), bY = fy(s, b.y);
      const inPoss = possSide === s;
      // 상대 최종 수비 라인 (오프사이드 근사)
      let lastDef = 0;
      for (const o of this.onPitch(1 - s)) { if (o.grp === 'GK') continue; const f = fx(s, o.x); if (f > lastDef) lastDef = f; }
      const offLine = Math.max(bF, lastDef) - 0.5;
      let backLine, span;
      if (inPoss) {
        backLine = clamp(bF - 38 + men * 4 + line * 4, 14, 60);
        span = 50 + men * 3;
      } else {
        backLine = clamp(bF - 30 + line * 7 + men * 2, 9, 52);
        span = 33 - press * 1.5;
      }
      const wf = inPoss ? 0.92 + 0.07 * width : 0.62 + 0.04 * width;
      const shift = inPoss ? 0.22 : 0.38;
      for (const m of players) {
        if (m === owner) continue;
        let tf, ty;
        if (m.grp === 'GK') {
          tf = clamp(3 + bF * 0.07, 2, 12);
          ty = 34 + (bY - 34) * 0.18;
          if (!inPoss && bF < 22) { tf = clamp(bF * 0.25, 1.5, 6); ty = 34 + (bY - 34) * 0.35; }
        } else {
          const depth = clamp((m.bx - 0.12) / 0.74, 0, 1);
          tf = backLine + depth * span;
          ty = 34 + (m.by - 0.5) * WID * wf + (bY - 34) * shift;
          if (inPoss) {
            // 침투 움직임
            if ((m.grp === 'FW' || m.role === 'AM' || m.role === 'LM' || m.role === 'RM') && bF > 45) {
              tf += 4 + 5 * Math.sin(this.t * 0.35 + m.phase);
              if (bF > 75 && m.grp === 'FW') ty = lerp(ty, 34, 0.35);
            }
            if (m.grp !== 'GK') tf = Math.min(tf, offLine);
            // 세트피스: 공격수와 장신 수비수가 박스로
            if (this.setPiece && this.setPiece.side === s && (m.grp === 'FW' || m.role === 'CB' || m.role === 'AM')) {
              tf = 93 + (m.phase % 1) * 6; ty = 28 + ((m.phase * 7) % 12);
            }
          } else {
            if (this.setPiece && this.setPiece.side !== s && (m.grp === 'DF' || m.grp === 'FW' && m.bx < 0.82)) {
              tf = 6 + (m.phase % 1) * 7; ty = 27 + ((m.phase * 5) % 14);
            }
            // 수비 시 공 쪽으로 압축
            if (bF < 35) tf = Math.min(tf, backLine + depth * span * 0.8);
          }
        }
        tf = clamp(tf, 1, LEN - 1); ty = clamp(ty, 1, WID - 1);
        m.tx = s === 0 ? tf : LEN - tf;
        m.ty = s === 0 ? ty : WID - ty;
        m.chase = false;
      }
      // 대인 마크: 자기 진영 깊숙이 공이 들어오면 수비수가 위험 지역의 공격수를 붙잡는다
      if (!inPoss && bF < 52) {
        const threats = this.onPitch(1 - s).filter((o) => o !== owner && o.grp !== 'GK' && fx(s, o.x) < 40);
        const markers = players.filter((m) => m.grp === 'DF' || m.role === 'DM');
        const usedT = new Set();
        for (const m of markers) {
          let best = null, bd = 16;
          for (const o of threats) {
            if (usedT.has(o)) continue;
            const d = dist(m.tx, m.ty, o.x, o.y);
            if (d < bd) { bd = d; best = o; }
          }
          if (best) {
            usedT.add(best);
            const gx = s === 0 ? 0 : LEN;
            const ang = Math.atan2(34 - best.y, gx - best.x);
            m.tx = best.x + Math.cos(ang) * 1.6; m.ty = best.y + Math.sin(ang) * 1.6;
          }
        }
      }
      // 압박 / 공 쫓기
      if (!inPoss || !owner) {
        const target = owner || b;
        const px = owner ? owner.x : b.x + b.vx * 0.4, py = owner ? owner.y : b.y + b.vy * 0.4;
        const outfield = players.filter((m) => m.grp !== 'GK' && m.stun <= 0);
        outfield.sort((a, c) => dist(a.x, a.y, px, py) - dist(c.x, c.y, px, py));
        let k = owner ? 1 + (press >= 1 ? 1 : 0) + (press >= 2 ? 1 : 0) : 2;
        const radius = owner ? 12 + press * 7 : 30;
        for (let i = 0; i < outfield.length && i < k; i++) {
          const m = outfield[i];
          const d = dist(m.x, m.y, px, py);
          if (i > 0 && d > radius) break;
          // 첫 번째 압박수는 골문 쪽에서 접근
          const gx = s === 0 ? 0 : LEN;
          const off = owner ? 1.0 : 0;
          const ang = Math.atan2(34 - py, gx - px);
          m.tx = px + Math.cos(ang) * off; m.ty = py + Math.sin(ang) * off;
          m.chase = true;
        }
        if (!owner && !this.pass && !this.shot) {
          // 골키퍼: 박스 안 루즈볼은 직접 처리
          const gk = players.find((m) => m.grp === 'GK');
          if (gk && fx(s, b.x) < 16 && Math.abs(b.y - 34) < 20) { gk.tx = b.x; gk.ty = b.y; gk.chase = true; }
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
      if (m.protect > 0) m.protect -= DT;
      let tx = m.tx, ty = m.ty;
      if (m === b.owner) { tx = m.dx != null ? m.dx : m.x; ty = m.dy != null ? m.dy : m.y; }
      const dx = tx - m.x, dy = ty - m.y;
      const d = Math.hypot(dx, dy);
      let spd = m.maxSpd * (0.68 + 0.32 * m.st);
      if (m === b.owner) {
        spd *= 0.74 + 0.12 * (m.a.dri / 100);
        if (m.blocked) spd *= 0.45;
      }
      if (m.injured) spd *= 0.5;
      let want = d > 4 || m.chase ? spd : d > 0.3 ? spd * (d / 4) * 0.8 : 0;
      if (this.state !== 'play' && !m.chase) want *= 0.7;
      let vx = d > 0.01 ? (dx / d) * want : 0, vy = d > 0.01 ? (dy / d) * want : 0;
      m.vx = lerp(m.vx, vx, 0.25); m.vy = lerp(m.vy, vy, 0.25);
      m.x = clamp(m.x + m.vx * DT, -1, LEN + 1);
      m.y = clamp(m.y + m.vy * DT, -1, WID + 1);
      const r = Math.hypot(m.vx, m.vy) / m.maxSpd;
      const press = this.tac(m.side).press;
      const drain = (0.00011 + 0.00042 * r * r * (m.chase ? 1 + press * 0.15 : 1)) * (1.25 - (m.a.phy / 100) * 0.5);
      m.st = Math.max(0.05, m.st - drain * DT);
    }
    if (b.owner) {
      const o = b.owner;
      const dir = o.side === 0 ? 1 : -1;
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
    const dir = s === 0 ? 1 : -1;
    for (const o of opps) {
      const ahead = (o.x - m.x) * dir;
      if (ahead > 0 && ahead < 3 && Math.abs(o.y - m.y) < 1.8) { m.blocked = true; break; }
    }
    m.hold -= DT;
    if (nearest < 3 && m.hold > 0.25 && m.grp !== 'GK') m.hold = Math.min(m.hold, 0.12 + this.rng.next() * 0.3);
    if (m.hold > 0) {
      if (m.dx == null) this.setDribble(m, opps);
      return;
    }
    this.decide(m, opps);
  };

  M.setDribble = function (m, opps) {
    const s = m.side;
    const f = fx(s, m.x), y = fy(s, m.y);
    let ty = lerp(y, 34, f > 70 ? 0.35 : 0.1);
    // 가까운 수비수 반대쪽으로
    let near = null, nd = 99;
    for (const o of opps) { const d = dist(o.x, o.y, m.x, m.y); if (d < nd) { nd = d; near = o; } }
    if (near && nd < 6) ty += (fy(s, m.y) - fy(s, near.y) >= 0 ? 1 : -1) * 4;
    const tf = clamp(f + (m.grp === 'GK' ? 0 : 7), 1, LEN - 1);
    ty = clamp(ty, 2, WID - 2);
    m.dx = s === 0 ? tf : LEN - tf; m.dy = s === 0 ? ty : WID - ty;
  };

  M.decide = function (m, opps) {
    const s = m.side, tac = this.tac(s);
    const men = tac.mentality - 2;
    const f = fx(s, m.x), y = fy(s, m.y);
    const options = [];
    const eps = 0.0015;
    const curV = threat(f, y);
    // 상대 가장 가까운 거리
    let nearest = 99;
    for (const o of opps) { const d = dist(o.x, o.y, m.x, m.y); if (d < nearest) nearest = d; }

    // 슈팅
    if (f > 70 && m.grp !== 'GK') {
      let xg = xgAt(f, y);
      if (nearest < 2) xg *= 0.6;
      // 슛 경로 차단 수비수
      let blockers = 0;
      for (const o of opps) {
        const of = fx(s, o.x), oy = fy(s, o.y);
        if (of > f && of < LEN - 1 && segDist(of, oy, f, y, LEN, 34) < 1.2) blockers++;
      }
      xg *= Math.pow(0.7, blockers);
      const d = Math.hypot(LEN - f, 34 - y);
      const longBonus = d > 16 && d < 28 ? 0.45 + (m.a.sho - 60) / 60 : 0;
      const u = Math.log(xg * (1 + men * 0.12) * (0.75 + m.a.sho / 200) + eps) - 0.25 + longBonus;
      options.push({ k: 'shoot', u, xg });
    }
    // 패스
    const style = tac.style;
    for (const t of this.onPitch(s)) {
      if (t === m || t.injured) continue;
      const lead = 0.35;
      const tX = clamp(t.x + t.vx * lead * 2, 1, LEN - 1), tY = clamp(t.y + t.vy * lead * 2, 1, WID - 1);
      const L = dist(m.x, m.y, tX, tY);
      if (L < 4 || L > 55) continue;
      const tf = fx(s, tX), ty = fy(s, tY);
      if (t.grp === 'GK' && f > 40) continue;
      const lofted = L > 26;
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
      risk = clamp(risk * (style === 0 ? 1.3 : style === 2 ? 0.85 : 1) * (1 - men * 0.06), 0, 0.95);
      const danger = 0.6 * Math.max(0, 1 - f / 60);
      let u = Math.log(threat(tf, ty) * (1 - risk) + eps) + Math.log(1 - risk * danger + 1e-6);
      if (style === 0) u -= L * 0.006;
      if (style === 2) u += Math.max(0, tf - f) * 0.006;
      if (tf < f - 5) u -= 0.05;
      // 측면 크로스 보너스
      if (f > 85 && Math.abs(y - 34) > 14 && tf > 88 && Math.abs(ty - 34) < 10) u += 0.25;
      options.push({ k: 'pass', u, t, tX, tY, L, lofted });
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
      const u = Math.log(threat(df, dy) * (1 - pr) + eps) + Math.log(1 - pr * 0.6 * Math.max(0, 1 - f / 60) + 1e-6) - 0.08;
      options.push({ k: 'dribble', u });
    }
    // 소프트맥스 선택
    const T = 0.22 + (1 - m.a.pas / 100) * 0.25;
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

  M.doPass = function (m, o) {
    const rng = this.rng;
    const err = (0.035 + (1 - m.a.pas / 100) * 0.11) * (1 + o.L / 40) * (m.st < 0.5 ? 1.2 : 1);
    const ang = Math.atan2(o.tY - m.y, o.tX - m.x) + rng.gauss(0, err);
    const L = o.L * (1 + rng.gauss(0, err * 0.6));
    const tx = clamp(m.x + Math.cos(ang) * L, -2, LEN + 2), ty = clamp(m.y + Math.sin(ang) * L, -2, WID + 2);
    const speed = o.lofted ? 19 : clamp(11 + o.L * 0.35, 12, 21);
    this.pass = { from: m, to: o.t, sx: m.x, sy: m.y, tx, ty, L: Math.max(1, dist(m.x, m.y, tx, ty)), prog: 0, speed, lofted: o.lofted, tried: new Set(), cross: this.setPiece || (fx(m.side, m.x) > 82 && Math.abs(m.y - 34) > 14) };
    const b = this.ball;
    b.owner = null; b.mode = 'pass';
    this.secondPasser = this.lastPasser;
    this.lastPasser = m;
    m.s.pass++; this.stats[m.side].pass++;
    this.setPiece = null;
  };

  M.doShot = function (m, xg) {
    const rng = this.rng, s = m.side;
    const opps = this.onPitch(1 - s);
    const gk = opps.find((o) => o.grp === 'GK');
    const header = this.pass == null && m.recvCross;
    const skill = header ? (m.a.phy * 0.6 + m.a.sho * 0.4) : m.a.sho;
    const gkSkill = gk ? gk.a.gk : 30;
    let pGoal = xg * (0.55 + skill / 110) * (1.45 - gkSkill / 110);
    pGoal = clamp(pGoal * 0.72, 0.005, 0.9);
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
    const gx = s === 0 ? LEN + 0.5 : -0.5;
    const ty = s === 0 ? gy : WID - gy;
    this.shot = { by: m, sx: m.x, sy: m.y, tx: blocked ? blocked.x : gx, ty: blocked ? blocked.y : ty, outcome, xg, gk, blocked, prog: 0, L: 1 };
    this.shot.L = Math.max(1, dist(m.x, m.y, this.shot.tx, this.shot.ty));
    const b = this.ball; b.owner = null; b.mode = 'shot';
    m.s.shots++; this.stats[s].shots++; this.stats[s].xg += xg;
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
            let pi = 0.22 + o.a.def / 260 + (p.speed < 15 ? 0.1 : 0);
            if (o.grp === 'GK') pi = 0.35 + o.a.gk / 200;
            if (p.cross && o.grp === 'DF') pi += 0.12;
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
        if (rng.chance(fail)) { this.pass = null; this.looseBall(r.x, r.y, 4); this.lastTouch = r.side; return; }
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
      const atkSide = b.x > LEN ? 0 : 1; // 이 골라인을 공격하는 쪽
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
      x = side === 0 ? 5.5 : LEN - 5.5; y = 34;
    } else if (kind === 'pen') {
      const cands = this.onPitch(side).filter((m) => m.grp !== 'GK').sort((a, c) => c.a.sho - a.a.sho);
      taker = cands[0];
      x = side === 0 ? LEN - 11 : 11; y = 34;
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
    if (kind === 'corner') { this.stats[side].corners++; }
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
      this.log('chance', s, `${r.taker.p.name}, 페널티킥 키커로 나섭니다.`);
      this.doShot(r.taker, 0.78);
      return;
    }
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
      const ev = this.log('goal', s, `골! ${team.name}의 ${name}${ast ? ` (도움: ${ast.p.name})` : ''}`, { pid: m.id, ast: ast ? ast.id : null, xg: sh.xg });
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
      const big = sh.xg > 0.25;
      if (big) this.log('save', 1 - s, `${name}의 결정적인 슈팅! ${gk ? gk.p.name : '골키퍼'}의 선방!`, { pid: m.id });
      const r = rng.next();
      if (gk && r < 0.55) { b.x = gk.x; b.y = gk.y; this.setRestart('gkhold', 1 - s); this.timer = 1.6; }
      else if (r < 0.8) this.setRestart('corner', s, s === 0 ? LEN - 0.3 : 0.3, rng.chance(0.5) ? 0.3 : WID - 0.3);
      else { this.looseBall(sh.tx + (s === 0 ? -3 : 3), sh.ty, 7); this.lastTouch = 1 - s; }
      return;
    }
    if (sh.outcome === 'block') {
      if (sh.blocked) sh.blocked.s.tkl++;
      if (rng.chance(0.4)) this.setRestart('corner', s, s === 0 ? LEN - 0.3 : 0.3, rng.chance(0.5) ? 0.3 : WID - 0.3);
      else { this.looseBall(b.x, b.y, 7); this.lastTouch = 1 - s; }
      return;
    }
    // 빗나감
    if (sh.xg > 0.3) this.log('miss', s, `${name}, 절호의 기회를 놓칩니다!`, { pid: m.id });
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
      const press = this.tac(o.side).press;
      const rate = 0.7 + press * 0.2;
      if (!rng.chance(rate * DT)) continue;
      const pw = sigmoid((o.a.def - m.a.dri) / 22 + (o.a.phy - m.a.phy) / 60 - 0.1 + (m.st - o.st) * -0.8);
      if (rng.chance(pw)) {
        o.s.tkl++; this.stats[o.side].tkl++;
        m.s.lost++;
        this.lastTouch = o.side;
        if (rng.chance(0.55)) this.giveBall(o);
        else this.looseBall(m.x, m.y, 5);
        m.stun = 0.6;
        return;
      }
      // 실패 → 파울 가능
      const mf = fx(m.side, m.x), inBox = mf > LEN - 16.5 && Math.abs(fy(m.side, m.y) - 34) < 20;
      const foulP = (0.16 + (press === 2 ? 0.04 : 0) + (o.a.def < 50 ? 0.05 : 0)) * (inBox ? 0.05 : 1);
      if (rng.chance(foulP)) { this.foul(o, m); return; }
      o.stun = 0.9;
      m.s.drb++;
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
    else if (pr < 0.15 + (f > 70 ? 0.06 : 0)) card = 'yellow';
    if (card === 'yellow') {
      o.yellow++;
      this.stats[o.side].yel++;
      if (o.yellow >= 2) card = 'red2';
      else this.log('yellow', o.side, `${o.p.name} 경고`, { pid: o.id });
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
      m.injWeeks = rng.int(1, 6);
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
    const nm = new MP(p, s, out.role, [out.role, out.bx, out.by], p.cond, p.morale, this.rng.next() * 6.28, this.base);
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
    m.role = role; m.grp = roleGroup(role); m.bx = bx; m.by = by;
  };

  // 포메이션 변경: 현재 선수들을 새 슬롯에 재배치
  M.setFormation = function (s, formation) {
    const slots = D.FORMATIONS[formation];
    const players = this.onPitch(s);
    const gk = players.find((m) => m.grp === 'GK');
    const rest = players.filter((m) => m !== gk).sort((a, b) => a.bx - b.bx || a.by - b.by);
    const outSlots = slots.slice(1).map((sl, i) => ({ sl, i })).sort((a, b) => a.sl[1] - b.sl[1] || a.sl[2] - b.sl[2]);
    rest.forEach((m, i) => { const o = outSlots[i]; if (o) this.changeRole(s, m, o.sl[0], o.sl[1], o.sl[2]); });
    this.tac(s).formation = formation;
  };

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
        let r = 6.0 + st.passOk * 0.012 - (st.pass - st.passOk) * 0.045 + st.goals * 0.9 + st.ast * 0.55 + st.key * 0.12
          + st.tkl * 0.07 + st.int * 0.06 + st.drb * 0.012 - st.lost * 0.03 + st.sot * 0.08 + st.saves * 0;
        if (m.grp === 'GK') r += st.saves * 0.3 - conceded * 0.3 + (conceded === 0 ? 0.5 : 0);
        if (m.grp === 'DF') r += (conceded === 0 ? 0.5 : -conceded * 0.15);
        r += won ? 0.3 : lost ? -0.3 : 0;
        if (m.red) r -= 1.5;
        if (mins < 20) r = 6 + (r - 6) * 0.5;
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

  KM.Engine = { Match, LEN, WID, DT, HALF, CLOCK, threat, xgAt, fx, fy };
})(globalThis.KM || (globalThis.KM = {}));
