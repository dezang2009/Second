// CAfe 화면과 진행: HUD, 목록, 팝업, 저장, 게임 루프.
(function (root) {
  'use strict';
  var C = root.CAFE, D = C.D, G = C.G, R = C.R;
  var SAVE_KEY = 'cafe.save.v1';
  var $ = function (id) { return document.getElementById(id); };

  var state, rt, tab = 'menu', lastListHtml = '', popupClose = null, hintLeft = 0;

  // ---- 저장 ----
  function load() {
    var raw = null;
    try { raw = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { raw = null; }
    return raw;
  }
  function save() {
    if (!state) return;
    state.lastSeen = Date.now();
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) { /* 저장 공간이 없으면 다음 기회에 */ }
  }

  // ---- 팝업 ----
  function showPopup(html, onClose) {
    $('popup').innerHTML = html;
    $('overlay').hidden = false;
    popupClose = onClose || null;
  }
  function closePopup() {
    if ($('overlay').hidden) return false;
    $('overlay').hidden = true;
    var f = popupClose; popupClose = null;
    if (f) f();
    return true;
  }
  function duration(secs) {
    var h = Math.floor(secs / 3600), m = Math.floor(secs % 3600 / 60);
    if (h >= 24) return Math.floor(h / 24) + '일 ' + (h % 24) + '시간';
    if (h > 0) return h + '시간 ' + m + '분';
    return Math.max(1, m) + '분';
  }
  // 자리를 비운 동안의 수입은 바로 지급하고(앱이 꺼져도 잃지 않게), 팝업은 알림만 한다.
  function offlinePopup() {
    var off = G.offlineEarnings(state, Date.now());
    if (off.amount > 0) G.earn(state, off.amount);
    save();
    if (off.amount <= 0 || !$('overlay').hidden) return;
    var capped = off.secs > D.OFFLINE_MAX;
    showPopup(
      '<img alt="" src="' + R.icon('cup') + '">' +
      '<h2>다녀오셨어요!</h2>' +
      '<p>자리를 비운 ' + duration(off.secs) + ' 동안<br>직원들이 가게를 지켰어요' + (capped ? '<br>(최대 8시간까지만 쌓여요)' : '') + '</p>' +
      '<div class="amount"><img alt="" src="' + R.icon('coin') + '">+' + G.fmt(off.amount) + '</div>' +
      '<button class="big" data-act="close">받기</button>',
      function () { floatText(65, 40, '+' + G.fmt(off.amount), true); }
    );
  }
  function gradePopup() {
    var g = D.GRADES[state.grade - 1], opened = [];
    D.MENUS.forEach(function (m) { if (m.grade === state.grade) opened.push(m.name); });
    showPopup(
      '<img alt="" src="' + R.icon('grade') + '">' +
      '<h2>Lv.' + state.grade + ' ' + g.name + '</h2>' +
      '<p>가게가 한 단계 성장했어요!<br>모든 메뉴 가격 ' + D.GRADE_PRICE_MULT + '배, 손님도 더 자주 와요' +
      (opened.length ? '<br>새 메뉴: ' + opened.join(', ') : '') + '</p>' +
      '<button class="big" data-act="close">좋아요</button>'
    );
  }
  function settingsPopup() {
    showPopup(
      '<h2>가게 기록</h2>' +
      '<table>' +
      '<tr><td>지금까지 번 코인</td><td>' + G.fmt(state.totalEarned) + '</td></tr>' +
      '<tr><td>다녀간 손님</td><td>' + G.fmt(state.served) + '명</td></tr>' +
      '<tr><td>받은 팁</td><td>' + G.fmt(state.tips) + '번</td></tr>' +
      '<tr><td>영업한 시간</td><td>' + duration(state.playSec) + '</td></tr>' +
      '</table>' +
      '<button class="big" data-act="close">닫기</button>' +
      '<button class="plain" data-act="reset">처음부터 다시 하기</button>'
    );
  }
  function resetPopup() {
    showPopup(
      '<h2>정말 처음부터 할까요?</h2>' +
      '<p>지금까지 키운 가게가 모두 사라지고<br>되돌릴 수 없어요</p>' +
      '<button class="big" data-act="close">계속 하기</button>' +
      '<button class="danger" data-act="reset-yes">가게 지우고 새로 시작</button>'
    );
  }

  // ---- 목록 ----
  function pct(x) { return Math.round(x * 100) + '%'; }
  function rows() {
    var out = [], s = state, i;
    if (tab === 'menu') {
      for (i = 0; i < D.MENUS.length; i++) {
        var m = D.MENUS[i];
        if (!G.menuUnlocked(s, i)) { out.push({ icon: m.id, title: m.name, sub: '가게 등급 ' + m.grade + '에서 팔 수 있어요', locked: '등급 ' + m.grade + '에<br>열려요' }); continue; }
        var ms = G.nextMilestone(s.menu[i]);
        out.push({ icon: m.id, title: m.name, sub: 'Lv.' + s.menu[i] + ' · 한 ' + m.unit + '에 ' + G.fmt(G.price(s, i)) + (ms ? '<br><em>Lv.' + ms + '에 가격 2배</em>' : ''), kind: 'menu', idx: i, label: '강화' });
      }
    } else if (tab === 'staff') {
      out.push({ icon: 'barista', title: '바리스타 교육', sub: 'Lv.' + s.baristaLv + ' · 만드는 속도 ' + G.baristaSpeed(s).toFixed(2) + '배', kind: 'baristaLv', label: '교육' });
      out.push({ icon: 'server', title: '서버 교육', sub: 'Lv.' + s.serverLv + ' · 나르는 속도 ' + G.serverSpeed(s).toFixed(2) + '배', kind: 'serverLv', label: '교육' });
      out.push({ icon: 'plus', title: '바리스타 더 뽑기', sub: '지금 ' + s.baristas + '명 · 최대 3명', kind: 'hireBarista', label: '고용' });
      out.push({ icon: 'plus', title: '서버 더 뽑기', sub: '지금 ' + s.servers + '명 · 최대 3명', kind: 'hireServer', label: '고용' });
    } else {
      out.push({ icon: 'table', title: '테이블', sub: s.tables + '개 놓음 · 최대 ' + (D.TABLE_START + D.TABLE_COST.length) + '개', kind: 'table', label: '추가' });
      out.push({ icon: 'machine', title: '에스프레소 머신', sub: 'Lv.' + s.machineLv + ' · 한 번에 ' + G.machineCups(s) + '잔' + (G.machineCups(s) < 3 ? '<br><em>Lv.' + (G.machineCups(s) * 5) + '에 한 잔 더</em>' : ''), kind: 'machine', label: '강화' });
      out.push({ icon: 'interior', title: '인테리어', sub: 'Lv.' + s.interiorLv + ' · 손님 +' + pct(D.INTERIOR_ARRIVAL_STEP * (s.interiorLv - 1)) + ', 팁 +' + pct(D.INTERIOR_TIP_STEP * (s.interiorLv - 1)), kind: 'interior', label: '꾸미기' });
      if (s.grade < D.GRADES.length) {
        var p = G.gradeProgress(s), next = D.GRADES[s.grade];
        out.push({ icon: 'grade', title: '가게 등급 올리기', sub: 'Lv.' + (s.grade + 1) + ' ' + next.name + (p < 1 ? '<br><em>누적 수입 ' + G.fmt(next.need) + ' 필요</em>' : '<br><em>승급 준비 완료!</em>'), kind: 'grade', label: '승급', goal: true });
      } else {
        out.push({ icon: 'grade', title: '전설의 카페', sub: '최고 등급에 도달했어요', locked: '최고<br>등급', goal: true });
      }
    }
    return out;
  }
  function renderList() {
    var html = rows().map(function (r) {
      var right;
      if (r.locked) right = '<div class="note">' + r.locked + '</div>';
      else {
        var cost = G.costOf(state, r.kind, r.idx || 0);
        if (cost === null) right = '<div class="note">최고<br>단계</div>';
        else right = '<button class="buy' + (G.canBuy(state, r.kind, r.idx || 0) ? '' : ' off') + '" data-kind="' + r.kind + '" data-idx="' + (r.idx || 0) + '"><span>' + r.label + '</span><b>' + G.fmt(cost) + '</b></button>';
      }
      return '<div class="row' + (r.locked ? ' locked' : '') + (r.goal ? ' goal' : '') + '"><img alt="" src="' + R.icon(r.icon) + '">' +
        '<div class="info"><div class="title">' + r.title + '</div><div class="sub">' + r.sub + '</div></div>' + right + '</div>';
    }).join('');
    if (html !== lastListHtml) { $('list').innerHTML = html; lastListHtml = html; }
  }

  function renderHud() {
    var s = state;
    $('gradeName').textContent = 'Lv.' + s.grade + ' ' + D.GRADES[s.grade - 1].name;
    var p = G.gradeProgress(s);
    $('gradeBar').style.width = pct(p);
    $('gradeText').textContent = s.grade >= D.GRADES.length ? '최고 등급' : p >= 1 ? '승급 가능!' : '다음 등급 ' + pct(p);
    $('coins').textContent = G.fmt(s.coins);
    $('rate').textContent = '초당 +' + G.fmt(G.estimateRate(s) * (rt.rushLeft > 0 ? D.RUSH_MULT : 1)) + ' 코인';
    $('rushBtn').hidden = !(rt.rushOffer > 0 && rt.rushLeft <= 0);
    $('rushBadge').hidden = rt.rushLeft <= 0;
    if (rt.rushLeft > 0) $('rushBadge').textContent = '러시 타임 ' + Math.ceil(rt.rushLeft) + '초';
    // 살 수 있는 것이 있는 탭에 표시
    var can = { menu: false, staff: false, shop: false }, i;
    for (i = 0; i < D.MENUS.length; i++) if (G.canBuy(s, 'menu', i)) can.menu = true;
    ['baristaLv', 'serverLv', 'hireBarista', 'hireServer'].forEach(function (k) { if (G.canBuy(s, k, 0)) can.staff = true; });
    ['table', 'machine', 'interior', 'grade'].forEach(function (k) { if (G.canBuy(s, k, 0)) can.shop = true; });
    var btns = $('tabs').children;
    for (i = 0; i < btns.length; i++) btns[i].classList.toggle('dot', can[btns[i].dataset.tab] && btns[i].dataset.tab !== tab);
  }

  // ---- 효과 ----
  function floatText(x, y, text, tip) {
    var fx = $('fx');
    if (fx.children.length > 24) fx.removeChild(fx.firstChild);
    var el = document.createElement('div');
    el.className = 'float' + (tip ? ' tip' : '');
    el.textContent = text;
    el.style.left = Math.max(14, Math.min(86, x / G.SCENE_W * 100)) + '%';
    el.style.top = (y / G.SCENE_H * 100) + '%';
    fx.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 1000);
  }

  // ---- 구매 ----
  function doBuy(kind, idx) {
    var g0 = state.grade;
    if (!G.buy(state, kind, idx)) return false;
    G.syncRuntime(state, rt);
    renderList(); renderHud();
    if (state.grade !== g0) { save(); gradePopup(); }
    return true;
  }

  // 탭 한 번 = 1회 구매, 길게 누르면 연속 구매
  var press = null;
  function endPress() { if (press) { clearTimeout(press.timer); clearInterval(press.rep); press = null; } }
  document.addEventListener('pointerdown', function (e) {
    var b = e.target.closest ? e.target.closest('.buy') : null;
    endPress();
    if (!b) return;
    press = { kind: b.dataset.kind, idx: +b.dataset.idx, x: e.clientX, y: e.clientY, repeated: false, timer: 0, rep: 0 };
    var p = press;
    p.timer = setTimeout(function () {
      p.repeated = true;
      p.rep = setInterval(function () { if (!doBuy(p.kind, p.idx)) endPress(); }, 90);
    }, 450);
  });
  document.addEventListener('pointermove', function (e) {
    if (press && (Math.abs(e.clientX - press.x) > 10 || Math.abs(e.clientY - press.y) > 10)) endPress();
  });
  document.addEventListener('pointerup', function () {
    if (press && !press.repeated) doBuy(press.kind, press.idx);
    endPress();
  });
  document.addEventListener('pointercancel', endPress);

  // ---- 입력 ----
  $('tabs').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    tab = b.dataset.tab;
    for (var i = 0; i < this.children.length; i++) this.children[i].classList.toggle('on', this.children[i] === b);
    renderList(); renderHud(); $('list').scrollTop = 0;
  });
  $('scene').addEventListener('pointerdown', function (e) {
    var box = this.getBoundingClientRect();
    var x = (e.clientX - box.left) / box.width * G.SCENE_W, y = (e.clientY - box.top) / box.height * G.SCENE_H;
    var b = G.collectTip(state, rt, x, y, 14);
    if (b) { floatText(b.x, b.y - 6, '팁 +' + G.fmt(b.amount), true); renderHud(); }
  });
  $('rushBtn').addEventListener('click', function () { if (G.startRush(rt)) renderHud(); });
  $('settingsBtn').addEventListener('click', settingsPopup);
  $('overlay').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    var act = b.dataset.act;
    if (act === 'close') closePopup();
    else if (act === 'reset') resetPopup();
    else if (act === 'reset-yes') {
      try { localStorage.removeItem(SAVE_KEY); } catch (err) { /* 무시 */ }
      popupClose = null; $('overlay').hidden = true;
      start(null);
    }
  });

  // ---- 루프 ----
  var lastT = 0, uiT = 0, time = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    var dt = lastT ? (now - lastT) / 1000 : 0;
    lastT = now;
    if (dt > 0.5) dt = 0.5; // 화면이 멈췄다 돌아온 경우 건너뛴다(긴 공백은 오프라인 정산이 처리)
    time += dt;
    var left = dt;
    while (left > 0) { var step = Math.min(0.05, left); G.tick(state, rt, step); left -= step; }
    while (rt.events.length) {
      var ev = rt.events.shift();
      if (ev.type === 'pay') floatText(ev.x, ev.y, '+' + G.fmt(ev.amount), false);
    }
    R.draw($('scene'), state, rt, time);
    uiT += dt;
    if (uiT >= 0.25) {
      uiT = 0; renderHud(); renderList();
      if (hintLeft > 0) { hintLeft -= 0.25; if (hintLeft <= 0) $('hint').hidden = true; }
    }
  }

  function start(raw) {
    state = G.loadState(raw, Date.now());
    rt = G.newRuntime(state);
    lastListHtml = '';
    renderList(); renderHud();
    if (!raw) {
      $('hint').innerHTML = '손님이 오면 직원들이 알아서 일해요.<br>번 코인으로 아래에서 가게를 키워 보세요!';
      $('hint').hidden = false; hintLeft = 12;
      save();
    } else {
      $('hint').hidden = true;
      offlinePopup();
    }
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) save();
    else { lastT = 0; offlinePopup(); }
  });
  window.addEventListener('pagehide', save);
  setInterval(function () { if (!document.hidden) save(); }, 10000);

  // 안드로이드 래퍼에서 부르는 함수
  C.save = save;
  C.debug = function () { return { state: state, rt: rt }; };
  C.back = function () { return closePopup(); };

  $('coinIcon').src = R.icon('coin');
  start(load());
  requestAnimationFrame(frame);
})(window);
