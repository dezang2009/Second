// CAfe 게임 로직. 화면과 무관한 순수 계산만 담는다(노드에서도 실행 가능).
(function (root) {
  'use strict';
  var D = root.CAFE && root.CAFE.D ? root.CAFE.D : require('./data.js');
  var G = {};

  // ---- 장면 좌표(130x120 단위. 화면에는 2배 해상도로 그린다) ----
  var AISLE_Y = 63, MID_X = 40, DOOR_X = 112, DOOR_Y = 126;
  G.SCENE_W = 130; G.SCENE_H = 120;
  G.tablePos = function (t) { return { x: t % 2 === 0 ? 20 : 60, y: 74 + 13 * Math.floor(t / 2) }; };
  G.seatPos = function (s) {
    var tp = G.tablePos(Math.floor(s / 2));
    return { x: tp.x + (s % 2 === 0 ? -14 : 14), y: tp.y + 10 };
  };
  G.queuePos = function (i) { return { x: 78 - 11 * i, y: AISLE_Y }; };
  G.serverHome = function (i) { return { x: 94 + 9 * i, y: 72 }; };
  var PICKUP = { x: 88, y: 68 };
  var MANAGER_SPOTS = [{ x: 62, y: 63 }, { x: 104, y: 84 }, { x: 40, y: 63 }, { x: 118, y: 100 }, { x: 84, y: 70 }];

  var ST = {}; // 직원 id -> 인덱스
  D.STAFF.forEach(function (t, i) { ST[t.id] = i; });
  G.ST = ST;

  // ---- 상태 ----
  G.newState = function (now) {
    var menu = [], staff = [], i;
    for (i = 0; i < D.MENUS.length; i++) menu.push(1);
    for (i = 0; i < D.STAFF.length; i++) staff.push({ n: D.STAFF[i].start, lv: 1 });
    return {
      v: 2, coins: D.START_COINS, totalEarned: 0, grade: 1, menu: menu, staff: staff,
      tables: D.TABLE_START, machineLv: 1, interiorLv: 1,
      lastSeen: now || 0, served: 0, tips: 0, playSec: 0
    };
  };

  // 저장 데이터를 검증해 현재 형식으로 맞춘다(깨진 값은 기본값으로).
  G.loadState = function (raw, now) {
    var s = G.newState(now), i;
    if (!raw || typeof raw !== 'object' || raw.v !== 2) return s;
    function ok(v) { return typeof v === 'number' && isFinite(v); }
    function num(k, min, max, whole) {
      if (ok(raw[k])) { s[k] = Math.min(max, Math.max(min, raw[k])); if (whole) s[k] = Math.floor(s[k]); }
    }
    num('coins', 0, 1e300); num('totalEarned', 0, 1e300);
    num('grade', 1, D.GRADES.length, true);
    num('tables', D.TABLE_START, D.TABLE_START + D.TABLE_COST.length, true);
    num('machineLv', 1, D.MACHINE_MAX_LV, true); num('interiorLv', 1, D.INTERIOR_MAX_LV, true);
    num('lastSeen', 0, 1e300); num('served', 0, 1e300); num('tips', 0, 1e300); num('playSec', 0, 1e300);
    if (Array.isArray(raw.menu)) {
      for (i = 0; i < s.menu.length; i++) if (ok(raw.menu[i])) s.menu[i] = Math.min(D.MENU_MAX, Math.max(1, Math.floor(raw.menu[i])));
    }
    if (Array.isArray(raw.staff)) {
      for (i = 0; i < s.staff.length; i++) {
        var r = raw.staff[i];
        if (!r || typeof r !== 'object') continue;
        if (ok(r.n)) s.staff[i].n = Math.min(D.STAFF[i].max, Math.max(D.STAFF[i].start, Math.floor(r.n)));
        if (ok(r.lv)) s.staff[i].lv = Math.min(D.STAFF_MAX_LV, Math.max(1, Math.floor(r.lv)));
      }
    }
    return s;
  };

  // ---- 수치 계산 ----
  G.menuUnlocked = function (s, i) { return D.MENUS[i].grade <= s.grade; };
  G.menuPrice = function (i, lv) {
    var m = 1;
    for (var k = 0; k < D.MILESTONES.length; k++) if (lv >= D.MILESTONES[k]) m *= 2;
    return Math.round(D.MENUS[i].base * (1 + D.MENU_PRICE_STEP * (lv - 1)) * m);
  };
  G.patissierBonus = function (s) {
    var p = s.staff[ST.patissier];
    return p.n > 0 ? D.PATISSIER_PRICE[0] + D.PATISSIER_PRICE[1] * (p.lv - 1) : 0;
  };
  // 실제 판매가: 등급이 오를 때마다 모든 메뉴가 비싸지고, 파티시에가 있으면 베이커리·디저트가 더 비싸진다.
  G.price = function (s, i) {
    var p = G.menuPrice(i, s.menu[i]) * Math.pow(D.GRADE_PRICE_MULT, s.grade - 1);
    if (D.isFood(D.MENUS[i].cat)) p *= 1 + G.patissierBonus(s);
    return Math.round(p);
  };
  G.nextMilestone = function (lv) {
    for (var k = 0; k < D.MILESTONES.length; k++) if (lv < D.MILESTONES[k]) return D.MILESTONES[k];
    return null;
  };
  G.managerBoost = function (s) {
    var m = s.staff[ST.manager];
    return m.n > 0 ? 1 + D.MANAGER_SPEED[0] + D.MANAGER_SPEED[1] * (m.lv - 1) : 1;
  };
  // 직원 한 명의 속도 배수(교육 레벨, 기본 속도, 매니저 효과)
  G.staffSpeed = function (s, t) {
    return D.STAFF[t].speed * (1 + D.STAFF_SPEED_STEP * (s.staff[t].lv - 1)) * G.managerBoost(s);
  };
  G.machineSpeed = function (s) { return 1 + D.MACHINE_SPEED_STEP * (s.machineLv - 1); };
  G.machineCups = function (s) { return Math.min(3, 1 + Math.floor(s.machineLv / 5)); };
  G.arrivalInterval = function (s, rush) {
    var mult = (1 + D.INTERIOR_ARRIVAL_STEP * (s.interiorLv - 1)) * (1 + D.GRADE_ARRIVAL_STEP * (s.grade - 1));
    if (rush) mult *= D.RUSH_MULT;
    return D.ARRIVAL_BASE / mult;
  };
  G.tipChance = function (s) { return D.TIP_CHANCE + (s.staff[ST.mom].n > 0 ? D.MOM_TIP_CHANCE : 0); };
  G.tipRate = function (s) {
    var m = s.staff[ST.mom];
    return D.TIP_RATE * (1 + D.INTERIOR_TIP_STEP * (s.interiorLv - 1)) * (m.n > 0 ? 1 + D.MOM_TIP_STEP * m.lv : 1);
  };
  G.offlineRate = function (s) {
    var m = s.staff[ST.manager];
    var r = D.OFFLINE_RATE + (m.n > 0 ? D.MANAGER_OFFLINE[0] + D.MANAGER_OFFLINE[1] * (m.lv - 1) : 0);
    return Math.min(D.OFFLINE_RATE_MAX, r);
  };
  G.seats = function (s) { return s.tables * 2; };
  G.staffLocked = function (s, t) { return D.STAFF[t].grade > s.grade; };

  function geo(base, growth, lv) { return Math.ceil(base * Math.pow(growth, lv - 1)); }

  // 구매 비용. 더 살 수 없으면 null. kind: menu/train/hire(i=대상 번호), table, machine, interior, grade
  G.costOf = function (s, kind, i) {
    switch (kind) {
      case 'menu':
        if (!G.menuUnlocked(s, i) || s.menu[i] >= D.MENU_MAX) return null;
        return geo(D.MENUS[i].base * D.MENU_COST_MULT, D.MENU_COST_GROWTH, s.menu[i]);
      case 'train':
        if (s.staff[i].n < 1 || s.staff[i].lv >= D.STAFF_MAX_LV) return null;
        return geo(D.STAFF[i].train[0], D.STAFF[i].train[1], s.staff[i].lv);
      case 'hire':
        if (s.staff[i].n >= D.STAFF[i].max || G.staffLocked(s, i)) return null;
        return D.STAFF[i].hire[s.staff[i].n];
      case 'table': { var c = D.TABLE_COST[s.tables - D.TABLE_START]; return c === undefined ? null : c; }
      case 'machine': return s.machineLv >= D.MACHINE_MAX_LV ? null : geo(D.MACHINE_COST[0], D.MACHINE_COST[1], s.machineLv);
      case 'interior': return s.interiorLv >= D.INTERIOR_MAX_LV ? null : geo(D.INTERIOR_COST[0], D.INTERIOR_COST[1], s.interiorLv);
      case 'grade': return s.grade >= D.GRADES.length ? null : D.GRADES[s.grade].cost;
    }
    return null;
  };

  G.gradeProgress = function (s) {
    if (s.grade >= D.GRADES.length) return 1;
    var need = D.GRADES[s.grade].need, prev = D.GRADES[s.grade - 1].need;
    return Math.max(0, Math.min(1, (s.totalEarned - prev) / (need - prev)));
  };

  G.canBuy = function (s, kind, i) {
    var c = G.costOf(s, kind, i);
    if (c === null || s.coins < c) return false;
    if (kind === 'grade' && s.totalEarned < D.GRADES[s.grade].need) return false;
    return true;
  };

  G.buy = function (s, kind, i) {
    if (!G.canBuy(s, kind, i)) return false;
    s.coins -= G.costOf(s, kind, i);
    switch (kind) {
      case 'menu': s.menu[i]++; break;
      case 'train': s.staff[i].lv++; break;
      case 'hire': s.staff[i].n++; break;
      case 'table': s.tables++; break;
      case 'machine': s.machineLv++; break;
      case 'interior': s.interiorLv++; break;
      case 'grade': s.grade++; break;
    }
    return true;
  };

  // 손님이 고를 메뉴: 나중에 열린 메뉴일수록 조금 더 자주 고른다.
  function menuWeights(s) {
    var w = [], k = 0;
    for (var i = 0; i < D.MENUS.length; i++) {
      if (G.menuUnlocked(s, i)) { k++; w.push(k); } else w.push(0);
    }
    return w;
  }
  G.pickMenu = function (s, rnd) {
    var w = menuWeights(s), sum = 0, i;
    for (i = 0; i < w.length; i++) sum += w[i];
    var r = rnd() * sum;
    for (i = 0; i < w.length; i++) { r -= w[i]; if (w[i] > 0 && r <= 0) return i; }
    return 0;
  };

  // 초당 예상 수입(오프라인 정산과 표시용 근사치). tools/sim.js 로 실제 시뮬레이션과 비교한다.
  G.estimateRate = function (s) {
    var w = menuWeights(s), sum = 0, price = 0, i;
    var shareD = 0, shareF = 0, makeD = 0, makeF = 0; // 음료 / 베이커리·디저트
    for (i = 0; i < w.length; i++) {
      if (!w[i]) continue;
      sum += w[i]; price += w[i] * G.price(s, i);
      if (D.isFood(D.MENUS[i].cat)) { shareF += w[i]; makeF += w[i] * D.MENUS[i].make; }
      else { shareD += w[i]; makeD += w[i] * D.MENUS[i].make; }
    }
    price /= sum;
    makeD = shareD ? makeD / shareD : 1; makeF = shareF ? makeF / shareF : 1;
    shareD /= sum; shareF /= sum;

    // 제조: 전문가가 자기 분야를 먼저 맡고, 남는 손이 다른 분야를 절반 속도로 돕는다.
    var cups = G.machineCups(s), ms = G.machineSpeed(s);
    var capB = s.staff[ST.barista].n * cups * ms * G.staffSpeed(s, ST.barista);
    var capP = s.staff[ST.patissier].n * cups * ms * G.staffSpeed(s, ST.patissier);
    var uD = shareD * makeD, uF = shareF * makeF, makeRate, off = D.OFF_SPECIALTY;
    if (capP <= 0) makeRate = capB / (uD + uF / off);
    else if (capB <= 0) makeRate = capP / (uF + uD / off);
    else {
      var fB = uD > 0 ? capB / uD : Infinity, fP = uF > 0 ? capP / uF : Infinity;
      if (fB < fP) makeRate = (capB + off * capP) / (uD + off * uF);
      else makeRate = (capP + off * capB) / (uF + off * uD);
      makeRate = Math.min(makeRate, Math.max(fB, fP));
    }

    var arrive = 1 / G.arrivalInterval(s, false);
    var rows = Math.ceil(s.tables / 2), avgDown = 11 + 13 * (rows - 1) / 2;
    var dist = 2 * (48 + avgDown) + 16, serveRate = 0;
    D.STAFF.forEach(function (t, k) {
      if (t.role === 'serve') serveRate += s.staff[k].n * D.SERVER_SPEED * G.staffSpeed(s, k) / dist;
    });
    var flow = Math.min(arrive, makeRate, serveRate);
    var stay = D.EAT_TIME + 4 + 1 / Math.max(0.01, Math.min(makeRate, serveRate));
    var seatRate = G.seats(s) / stay;
    return Math.min(flow, seatRate) * price * 0.93;
  };

  G.offlineEarnings = function (s, now) {
    var secs = Math.floor((now - s.lastSeen) / 1000);
    if (!s.lastSeen || secs < D.OFFLINE_MIN) return { secs: 0, amount: 0 };
    var counted = Math.min(secs, D.OFFLINE_MAX);
    return { secs: secs, counted: counted, amount: Math.floor(G.estimateRate(s) * counted * G.offlineRate(s)) };
  };

  G.earn = function (s, amount) { s.coins += amount; s.totalEarned += amount; };

  // ---- 실시간 시뮬레이션 ----
  var HAIR = ['#3b2a20', '#7a4a36', '#e8b04a', '#c0603f', '#2b2135', '#8d7ba3', '#5a3526'];
  var SHIRT = ['#6fa8dc', '#e86a5c', '#7ed6b4', '#ffcf5c', '#b58fd9', '#f6ead7', '#f29bb5', '#7a9e5a'];
  var PANTS = ['#3b4a6b', '#4b5160', '#6b4532', '#2b2135', '#5a6b8a'];
  var SKIN = ['#f2c9a0', '#e8b890', '#d9a577', '#f7d9b8'];

  G.newRuntime = function (s, rnd) {
    var rt = {
      rnd: rnd || Math.random, nextId: 1, customers: [], queue: [], seats: [],
      orders: [], ready: [], makers: [], servers: [], manager: null, bubbles: [], events: [],
      spawnT: 1.5, rushLeft: 0, rushOffer: 0, rushWait: 60
    };
    G.syncRuntime(s, rt);
    return rt;
  };

  function countType(list, t) { var n = 0; for (var i = 0; i < list.length; i++) if (list[i].type === t) n++; return n; }

  // 직원과 좌석 수를 상태에 맞춘다(고용·테이블 추가 직후 호출).
  G.syncRuntime = function (s, rt) {
    D.STAFF.forEach(function (t, k) {
      if (t.role === 'make') {
        while (countType(rt.makers, k) < s.staff[k].n) rt.makers.push({ type: k, jobs: [] });
      } else if (t.role === 'serve') {
        while (countType(rt.servers, k) < s.staff[k].n) {
          var h = G.serverHome(rt.servers.length);
          rt.servers.push({ type: k, x: h.x, y: h.y, path: [], phase: 'idle', order: null, face: -1 });
        }
      } else if (t.role === 'manage' && s.staff[k].n > 0 && !rt.manager) {
        rt.manager = { x: 62, y: 63, path: [], wait: 2, face: 1, moving: false };
      }
    });
    while (rt.seats.length < G.seats(s)) rt.seats.push(null);
  };

  function moveAlong(e, speed, dt) {
    var left = speed * dt;
    while (e.path.length && left > 0) {
      var p = e.path[0], dx = p.x - e.x, dy = p.y - e.y, d = Math.sqrt(dx * dx + dy * dy);
      if (dx > 0.01) e.face = 1; else if (dx < -0.01) e.face = -1;
      if (d <= left) { e.x = p.x; e.y = p.y; e.path.shift(); left -= d; }
      else { e.x += dx / d * left; e.y += dy / d * left; left = 0; }
    }
    return e.path.length === 0;
  }

  function freeSeat(rt) {
    var free = [];
    for (var i = 0; i < rt.seats.length; i++) if (rt.seats[i] === null) free.push(i);
    return free.length ? free[Math.floor(rt.rnd() * free.length)] : -1;
  }
  function pick(rt, list) { return list[Math.floor(rt.rnd() * list.length)]; }

  function spawnCustomer(s, rt) {
    var slot = rt.queue.length, q = G.queuePos(slot);
    var c = {
      id: rt.nextId++, x: DOOR_X, y: DOOR_Y, face: -1, phase: 'in', t: 0, seat: -1, order: null,
      menu: G.pickMenu(s, rt.rnd),
      hair: pick(rt, HAIR), shirt: pick(rt, SHIRT), pants: pick(rt, PANTS), skin: pick(rt, SKIN),
      style: rt.rnd() < 0.45 ? 'long' : rt.rnd() < 0.2 ? 'cap' : 'short',
      path: [{ x: DOOR_X, y: AISLE_Y }, { x: q.x, y: q.y }]
    };
    rt.customers.push(c); rt.queue.push(c);
  }

  function startEating(c) { c.phase = 'eat'; c.t = D.EAT_TIME; }

  // 이 직원이 지금 맡을 주문 번호를 고른다(없으면 -1). 자기 분야를 먼저, 남의 분야는 전문가가 없거나 오래 밀렸을 때만.
  function chooseOrder(s, rt, type) {
    var foodie = D.STAFF[type].id === 'patissier', other = foodie ? ST.barista : ST.patissier, i;
    for (i = 0; i < rt.orders.length; i++) if (D.isFood(D.MENUS[rt.orders[i].menu].cat) === foodie) return i;
    for (i = 0; i < rt.orders.length; i++) {
      if (s.staff[other].n < 1 || rt.orders[i].age >= D.OFF_SPECIALTY_WAIT) return i;
    }
    return -1;
  }

  G.tick = function (s, rt, dt) {
    var i, c;
    s.playSec += dt;

    // 러시 타임
    if (rt.rushLeft > 0) rt.rushLeft = Math.max(0, rt.rushLeft - dt);
    else if (rt.rushOffer > 0) {
      rt.rushOffer -= dt;
      if (rt.rushOffer <= 0) { rt.rushOffer = 0; rt.rushWait = D.RUSH_GAP[0] + rt.rnd() * (D.RUSH_GAP[1] - D.RUSH_GAP[0]); }
    } else {
      rt.rushWait -= dt;
      if (rt.rushWait <= 0) rt.rushOffer = D.RUSH_OFFER;
    }

    // 손님 입장
    rt.spawnT -= dt;
    if (rt.spawnT <= 0) {
      rt.spawnT += G.arrivalInterval(s, rt.rushLeft > 0) * (0.7 + 0.6 * rt.rnd());
      if (rt.spawnT < 0) rt.spawnT = 0;
      if (rt.queue.length < D.QUEUE_MAX) spawnCustomer(s, rt);
    }

    // 손님
    for (i = rt.customers.length - 1; i >= 0; i--) {
      c = rt.customers[i];
      if (c.phase === 'in') {
        if (moveAlong(c, D.CUSTOMER_SPEED, dt)) { c.phase = 'queue'; c.t = 0.6; c.face = 1; }
      } else if (c.phase === 'queue') {
        moveAlong(c, D.CUSTOMER_SPEED, dt);
        if (rt.queue[0] === c && c.path.length === 0) {
          c.t -= dt;
          if (c.t <= 0) {
            var seat = freeSeat(rt);
            if (seat >= 0) {
              var sp = G.seatPos(seat);
              rt.seats[seat] = c.id; c.seat = seat;
              c.order = { cust: c, menu: c.menu, seat: seat, delivered: false, age: 0 };
              rt.orders.push(c.order);
              c.phase = 'toSeat';
              c.path = [{ x: MID_X, y: AISLE_Y }, { x: MID_X, y: sp.y }, { x: sp.x, y: sp.y }];
              rt.queue.shift();
              for (var q = 0; q < rt.queue.length; q++) {
                var qp = G.queuePos(q), qc = rt.queue[q];
                if (qc.phase === 'queue') qc.path = [qp];
                else qc.path[qc.path.length - 1] = qp;
              }
            }
          }
        }
      } else if (c.phase === 'toSeat') {
        if (moveAlong(c, D.CUSTOMER_SPEED, dt)) {
          c.face = c.seat % 2 === 0 ? 1 : -1;
          if (c.order.delivered) startEating(c); else c.phase = 'wait';
        }
      } else if (c.phase === 'eat') {
        c.t -= dt;
        if (c.t <= 0) {
          var price = G.price(s, c.menu);
          G.earn(s, price); s.served++;
          rt.events.push({ type: 'pay', x: c.x, y: c.y - 18, amount: price });
          if (rt.rnd() < G.tipChance(s)) {
            var tp = G.tablePos(Math.floor(c.seat / 2));
            rt.bubbles.push({ id: rt.nextId++, x: tp.x + (c.seat % 2 === 0 ? -6 : 6), y: tp.y - 12, amount: Math.max(1, Math.round(price * G.tipRate(s))), ttl: D.TIP_TTL });
          }
          rt.seats[c.seat] = null;
          c.phase = 'out';
          c.path = [{ x: MID_X, y: c.y }, { x: MID_X, y: AISLE_Y }, { x: DOOR_X, y: AISLE_Y }, { x: DOOR_X, y: DOOR_Y }];
        }
      } else if (c.phase === 'out') {
        if (moveAlong(c, D.CUSTOMER_SPEED, dt)) rt.customers.splice(i, 1);
      }
    }

    // 제조(바리스타, 파티시에)
    for (i = 0; i < rt.orders.length; i++) rt.orders[i].age += dt;
    var cups = G.machineCups(s), ms = G.machineSpeed(s);
    for (i = 0; i < rt.makers.length; i++) {
      var b = rt.makers[i], foodie = D.STAFF[b.type].id === 'patissier', sp2 = G.staffSpeed(s, b.type) * ms;
      while (b.jobs.length < cups) {
        var oi = chooseOrder(s, rt, b.type);
        if (oi < 0) break;
        var o = rt.orders.splice(oi, 1)[0], mine = D.isFood(D.MENUS[o.menu].cat) === foodie;
        b.jobs.push({ order: o, left: D.MENUS[o.menu].make, rate: mine ? 1 : D.OFF_SPECIALTY });
      }
      for (var j = b.jobs.length - 1; j >= 0; j--) {
        b.jobs[j].left -= dt * sp2 * b.jobs[j].rate;
        if (b.jobs[j].left <= 0) { rt.ready.push(b.jobs[j].order); b.jobs.splice(j, 1); }
      }
    }

    // 서빙(대학생 알바, 주부 파트타이머)
    for (i = 0; i < rt.servers.length; i++) {
      var v = rt.servers[i], ss = D.SERVER_SPEED * G.staffSpeed(s, v.type);
      if (v.phase === 'idle' || v.phase === 'back') {
        if (rt.ready.length) {
          v.order = rt.ready.shift(); v.phase = 'toCounter'; v.path = [{ x: PICKUP.x + 4 * i, y: PICKUP.y }];
        } else if (v.phase === 'back' && moveAlong(v, ss, dt)) { v.phase = 'idle'; v.face = -1; }
      }
      if (v.phase === 'toCounter') {
        if (moveAlong(v, ss, dt)) {
          var tp2 = G.tablePos(Math.floor(v.order.seat / 2));
          v.phase = 'toTable';
          v.path = [{ x: v.x, y: AISLE_Y }, { x: MID_X, y: AISLE_Y }, { x: MID_X, y: tp2.y + 6 }];
        }
      } else if (v.phase === 'toTable') {
        if (moveAlong(v, ss, dt)) {
          v.order.delivered = true;
          if (v.order.cust.phase === 'wait') startEating(v.order.cust);
          v.order = null; v.phase = 'back';
          var h = G.serverHome(i);
          v.path = [{ x: MID_X, y: AISLE_Y }, { x: h.x, y: AISLE_Y }, { x: h.x, y: h.y }];
        }
      }
    }

    // 매니저: 가게를 돌아다닌다(효과는 수치로만 적용)
    if (rt.manager) {
      var m = rt.manager;
      if (m.path.length) { m.moving = true; if (moveAlong(m, 20, dt)) { m.moving = false; m.wait = 3 + rt.rnd() * 4; } }
      else {
        m.wait -= dt;
        if (m.wait <= 0) { var spot = pick(rt, MANAGER_SPOTS); m.path = [{ x: m.x, y: AISLE_Y }, { x: spot.x, y: AISLE_Y }, { x: spot.x, y: spot.y }]; }
      }
    }

    // 팁 말풍선
    for (i = rt.bubbles.length - 1; i >= 0; i--) {
      rt.bubbles[i].ttl -= dt;
      if (rt.bubbles[i].ttl <= 0) rt.bubbles.splice(i, 1);
    }
  };

  // 팁 말풍선을 탭했을 때. 받은 말풍선을 돌려준다(없으면 null).
  G.collectTip = function (s, rt, x, y, radius) {
    var best = -1, bestD = radius * radius;
    for (var i = 0; i < rt.bubbles.length; i++) {
      var dx = rt.bubbles[i].x - x, dy = rt.bubbles[i].y - y, d = dx * dx + dy * dy;
      if (d <= bestD) { best = i; bestD = d; }
    }
    if (best < 0) return null;
    var b = rt.bubbles.splice(best, 1)[0];
    G.earn(s, b.amount); s.tips++;
    return b;
  };

  G.startRush = function (rt) {
    if (rt.rushOffer <= 0 || rt.rushLeft > 0) return false;
    rt.rushOffer = 0; rt.rushLeft = D.RUSH_TIME;
    rt.rushWait = D.RUSH_GAP[0] + rt.rnd() * (D.RUSH_GAP[1] - D.RUSH_GAP[0]);
    return true;
  };

  // 큰 수를 한국식 단위로 표시
  G.fmt = function (n) {
    n = Math.floor(n);
    var comma = function (v) { return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ','); };
    if (n < 10000) return comma(n);
    var units = ['만', '억', '조', '경', '해'], u = -1;
    while (n >= 10000 && u < units.length - 1) { n /= 10000; u++; }
    var txt = n >= 100 ? comma(Math.floor(n)) : n >= 10 ? (Math.floor(n * 10) / 10).toFixed(1) : (Math.floor(n * 100) / 100).toFixed(2);
    return txt + units[u];
  };

  root.CAFE = root.CAFE || {};
  root.CAFE.G = G;
  if (typeof module !== 'undefined') module.exports = G;
})(typeof window !== 'undefined' ? window : globalThis);
