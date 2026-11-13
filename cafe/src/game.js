// CAfe 게임 로직. 화면과 무관한 순수 계산만 담는다(노드에서도 실행 가능).
(function (root) {
  'use strict';
  var D = root.CAFE && root.CAFE.D ? root.CAFE.D : require('./data.js');
  var G = {};

  // ---- 장면 좌표(픽셀아트 기준 단위) ----
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

  // ---- 상태 ----
  G.newState = function (now) {
    var menu = [];
    for (var i = 0; i < D.MENUS.length; i++) menu.push(1);
    return {
      v: 1, coins: D.START_COINS, totalEarned: 0, grade: 1, menu: menu,
      baristaLv: 1, serverLv: 1, baristas: 1, servers: 1,
      tables: D.TABLE_START, machineLv: 1, interiorLv: 1,
      lastSeen: now || 0, served: 0, tips: 0, playSec: 0
    };
  };

  // 저장 데이터를 검증해 현재 형식으로 맞춘다(깨진 값은 기본값으로).
  G.loadState = function (raw, now) {
    var s = G.newState(now);
    if (!raw || typeof raw !== 'object') return s;
    function num(k, min, max) {
      var v = raw[k];
      if (typeof v === 'number' && isFinite(v)) s[k] = Math.min(max, Math.max(min, v));
    }
    num('coins', 0, 1e300); num('totalEarned', 0, 1e300);
    num('grade', 1, D.GRADES.length);
    num('baristaLv', 1, D.STAFF_MAX_LV); num('serverLv', 1, D.STAFF_MAX_LV);
    num('baristas', 1, 3); num('servers', 1, 3);
    num('tables', D.TABLE_START, D.TABLE_START + D.TABLE_COST.length);
    num('machineLv', 1, D.MACHINE_MAX_LV); num('interiorLv', 1, D.INTERIOR_MAX_LV);
    num('lastSeen', 0, 1e300); num('served', 0, 1e300); num('tips', 0, 1e300); num('playSec', 0, 1e300);
    ['grade', 'baristaLv', 'serverLv', 'baristas', 'servers', 'tables', 'machineLv', 'interiorLv'].forEach(function (k) { s[k] = Math.floor(s[k]); });
    if (Array.isArray(raw.menu)) {
      for (var i = 0; i < s.menu.length; i++) {
        var v = raw.menu[i];
        if (typeof v === 'number' && isFinite(v)) s.menu[i] = Math.min(D.MENU_MAX, Math.max(1, Math.floor(v)));
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
  // 실제 판매가: 가게 등급이 오를 때마다 모든 메뉴가 일정 배수로 비싸진다.
  G.price = function (s, i) { return G.menuPrice(i, s.menu[i]) * Math.pow(D.GRADE_PRICE_MULT, s.grade - 1); };
  G.nextMilestone = function (lv) {
    for (var k = 0; k < D.MILESTONES.length; k++) if (lv < D.MILESTONES[k]) return D.MILESTONES[k];
    return null;
  };
  G.baristaSpeed = function (s) {
    return (1 + D.STAFF_SPEED_STEP * (s.baristaLv - 1)) * (1 + D.MACHINE_SPEED_STEP * (s.machineLv - 1));
  };
  G.machineCups = function (s) { return Math.min(3, 1 + Math.floor(s.machineLv / 5)); };
  G.serverSpeed = function (s) { return 1 + D.STAFF_SPEED_STEP * (s.serverLv - 1); };
  G.arrivalInterval = function (s, rush) {
    var mult = (1 + D.INTERIOR_ARRIVAL_STEP * (s.interiorLv - 1)) * (1 + D.GRADE_ARRIVAL_STEP * (s.grade - 1));
    if (rush) mult *= D.RUSH_MULT;
    return D.ARRIVAL_BASE / mult;
  };
  G.tipRate = function (s) { return D.TIP_RATE * (1 + D.INTERIOR_TIP_STEP * (s.interiorLv - 1)); };
  G.seats = function (s) { return s.tables * 2; };

  function geo(base, growth, lv) { return Math.ceil(base * Math.pow(growth, lv - 1)); }

  // 구매 비용. 더 살 수 없으면 null.
  G.costOf = function (s, kind, i) {
    switch (kind) {
      case 'menu':
        if (!G.menuUnlocked(s, i) || s.menu[i] >= D.MENU_MAX) return null;
        return geo(D.MENUS[i].base * D.MENU_COST_MULT, D.MENU_COST_GROWTH, s.menu[i]);
      case 'baristaLv': return s.baristaLv >= D.STAFF_MAX_LV ? null : geo(D.BARISTA_LV_COST[0], D.BARISTA_LV_COST[1], s.baristaLv);
      case 'serverLv': return s.serverLv >= D.STAFF_MAX_LV ? null : geo(D.SERVER_LV_COST[0], D.SERVER_LV_COST[1], s.serverLv);
      case 'hireBarista': return s.baristas >= 3 ? null : D.HIRE_BARISTA[s.baristas - 1];
      case 'hireServer': return s.servers >= 3 ? null : D.HIRE_SERVER[s.servers - 1];
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
      case 'baristaLv': s.baristaLv++; break;
      case 'serverLv': s.serverLv++; break;
      case 'hireBarista': s.baristas++; break;
      case 'hireServer': s.servers++; break;
      case 'table': s.tables++; break;
      case 'machine': s.machineLv++; break;
      case 'interior': s.interiorLv++; break;
      case 'grade': s.grade++; break;
    }
    return true;
  };

  // 손님이 고를 메뉴: 비싼(나중에 열린) 메뉴일수록 조금 더 자주 고른다.
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
    var w = menuWeights(s), sum = 0, price = 0, make = 0, i;
    for (i = 0; i < w.length; i++) {
      if (!w[i]) continue;
      sum += w[i]; price += w[i] * G.price(s, i); make += w[i] * D.MENUS[i].make;
    }
    price /= sum; make /= sum;
    var arrive = 1 / G.arrivalInterval(s, false);
    var makeRate = s.baristas * G.machineCups(s) * G.baristaSpeed(s) / make;
    var rows = Math.ceil(s.tables / 2), avgDown = 11 + 13 * (rows - 1) / 2;
    var trip = (2 * (48 + avgDown) + 16) / (D.SERVER_SPEED * G.serverSpeed(s));
    var serveRate = s.servers / trip;
    var flow = Math.min(arrive, makeRate, serveRate);
    var stay = D.EAT_TIME + 4 + 1 / Math.max(0.01, Math.min(makeRate, serveRate));
    var seatRate = G.seats(s) / stay;
    return Math.min(flow, seatRate) * price * 0.93;
  };

  G.offlineEarnings = function (s, now) {
    var secs = Math.floor((now - s.lastSeen) / 1000);
    if (!s.lastSeen || secs < D.OFFLINE_MIN) return { secs: 0, amount: 0 };
    var counted = Math.min(secs, D.OFFLINE_MAX);
    return { secs: secs, counted: counted, amount: Math.floor(G.estimateRate(s) * counted * D.OFFLINE_RATE) };
  };

  G.earn = function (s, amount) { s.coins += amount; s.totalEarned += amount; };

  // ---- 실시간 시뮬레이션 ----
  var HAIR = ['#3b2a20', '#7a4a36', '#e8b04a', '#c0603f', '#2b2135', '#8d7ba3'];
  var SHIRT = ['#6fa8dc', '#e86a5c', '#7ed6b4', '#ffcf5c', '#b58fd9', '#f6ead7', '#f29bb5'];
  var SKIN = ['#f2c9a0', '#e8b890', '#d9a577', '#f7d9b8'];

  G.newRuntime = function (s, rnd) {
    var rt = {
      rnd: rnd || Math.random, nextId: 1, customers: [], queue: [], seats: [],
      orders: [], ready: [], baristas: [], servers: [], bubbles: [], events: [],
      spawnT: 1.5, rushLeft: 0, rushOffer: 0, rushWait: 60
    };
    G.syncRuntime(s, rt);
    return rt;
  };

  // 직원과 좌석 수를 상태에 맞춘다(고용·테이블 추가 직후 호출).
  G.syncRuntime = function (s, rt) {
    while (rt.baristas.length < s.baristas) rt.baristas.push({ jobs: [] });
    while (rt.servers.length < s.servers) {
      var h = G.serverHome(rt.servers.length);
      rt.servers.push({ x: h.x, y: h.y, path: [], phase: 'idle', order: null, face: -1 });
    }
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

  function spawnCustomer(s, rt) {
    var slot = rt.queue.length, q = G.queuePos(slot);
    var c = {
      id: rt.nextId++, x: DOOR_X, y: DOOR_Y, face: -1, phase: 'in', t: 0, seat: -1, order: null,
      menu: G.pickMenu(s, rt.rnd),
      hair: HAIR[Math.floor(rt.rnd() * HAIR.length)], shirt: SHIRT[Math.floor(rt.rnd() * SHIRT.length)],
      skin: SKIN[Math.floor(rt.rnd() * SKIN.length)],
      path: [{ x: DOOR_X, y: AISLE_Y }, { x: q.x, y: q.y }]
    };
    rt.customers.push(c); rt.queue.push(c);
  }

  function startEating(c) { c.phase = 'eat'; c.t = D.EAT_TIME; }

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
              c.order = { cust: c, menu: c.menu, seat: seat, delivered: false };
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
          if (rt.rnd() < D.TIP_CHANCE) {
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

    // 바리스타
    var bs = G.baristaSpeed(s), cups = G.machineCups(s);
    for (i = 0; i < rt.baristas.length; i++) {
      var b = rt.baristas[i];
      while (b.jobs.length < cups && rt.orders.length) {
        var o = rt.orders.shift();
        b.jobs.push({ order: o, left: D.MENUS[o.menu].make, total: D.MENUS[o.menu].make });
      }
      for (var j = b.jobs.length - 1; j >= 0; j--) {
        b.jobs[j].left -= dt * bs;
        if (b.jobs[j].left <= 0) { rt.ready.push(b.jobs[j].order); b.jobs.splice(j, 1); }
      }
    }

    // 서버
    var ss = D.SERVER_SPEED * G.serverSpeed(s);
    for (i = 0; i < rt.servers.length; i++) {
      var v = rt.servers[i];
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

    // 팁 말풍선
    for (i = rt.bubbles.length - 1; i >= 0; i--) {
      rt.bubbles[i].ttl -= dt;
      if (rt.bubbles[i].ttl <= 0) rt.bubbles.splice(i, 1);
    }
  };

  // 팁 말풍선을 탭했을 때. 받은 금액을 돌려준다(없으면 0).
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
    if (n < 10000) return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    var units = ['만', '억', '조', '경', '해'], u = -1;
    while (n >= 10000 && u < units.length - 1) { n /= 10000; u++; }
    var txt = n >= 1000 ? Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') : n >= 100 ? Math.floor(n).toString() : n >= 10 ? (Math.floor(n * 10) / 10).toFixed(1) : (Math.floor(n * 100) / 100).toFixed(2);
    return txt + units[u];
  };

  root.CAFE = root.CAFE || {};
  root.CAFE.G = G;
  if (typeof module !== 'undefined') module.exports = G;
})(typeof window !== 'undefined' ? window : globalThis);
