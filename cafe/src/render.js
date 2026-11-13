// CAfe 픽셀아트 그리기. 장면은 130x120 단위 캔버스에 그리고 CSS로 확대한다.
(function (root) {
  'use strict';
  var C = root.CAFE, D = C.D, G = C.G;
  var R = {};
  var ctx = null;

  function r(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); }

  // 등급에 따라 바뀌는 벽 색
  var WALLS = [
    ['#f0d9b5', '#ead0a6'], ['#dfe8cf', '#d2dfc0'], ['#f3d6d0', '#ecc7c0'],
    ['#d6e3ee', '#c6d7e6'], ['#efe2c0', '#e6d5a8']
  ];

  // 시간대별 하늘색 [하늘, 구름, 어두움 정도]
  function sky(hour) {
    if (hour >= 7 && hour < 17) return ['#9fdcec', '#ffffff', 0];
    if (hour >= 17 && hour < 19) return ['#f4a56a', '#ffd9b0', 0.06];
    if (hour >= 5 && hour < 7) return ['#f2c4a8', '#fff0e0', 0.05];
    return ['#27305a', '#3b4a7a', 0.2];
  }

  // 5x5 글자(간판용)
  var GLYPH = {
    C: ['01110', '10000', '10000', '10000', '01110'],
    A: ['01100', '10010', '11110', '10010', '10010'],
    f: ['00110', '01000', '11100', '01000', '01000'],
    e: ['00000', '01100', '11110', '10000', '01110']
  };
  function word(txt, x, y, c) {
    for (var i = 0; i < txt.length; i++) {
      var g = GLYPH[txt[i]];
      for (var yy = 0; yy < 5; yy++) for (var xx = 0; xx < 5; xx++) if (g[yy][xx] === '1') r(x + i * 6 + xx, y + yy, 1, 1, c);
    }
  }

  function person(x, y, p, seated, apron, carry) {
    // x=발 가운데, y=발 위치
    var l = Math.round(x) - 4, t = Math.round(y) - 17, f = p.face >= 0 ? 1 : -1;
    r(l, t, 8, 3, p.hair);
    r(l, t + 3, 8, 5, p.skin || '#f2c9a0');
    r(l + (f > 0 ? 4 : 1), t + 5, 1, 2, '#2b2135');
    r(l + (f > 0 ? 6 : 3), t + 5, 1, 2, '#2b2135');
    r(l, t + 8, 8, 6, p.shirt);
    if (apron) r(l + 2, t + 9, 4, 5, '#5c8043');
    if (!seated) {
      var step = Math.floor((x + y) / 3) % 2 === 0;
      r(l + 1, t + 14, 2, step ? 3 : 2, p.legs || '#3b4a6b');
      r(l + 5, t + 14, 2, step ? 2 : 3, p.legs || '#3b4a6b');
    }
    if (carry) {
      r(l + (f > 0 ? 7 : -5), t + 9, 6, 1, '#9aa1ad');
      r(l + (f > 0 ? 9 : -4), t + 6, 3, 3, '#f6ead7');
    }
  }

  function table(tp, cups) {
    var x = tp.x - 12, y = tp.y;
    // 의자
    r(x - 9, y - 8, 2, 20, '#8a5638'); r(x - 9, y + 2, 9, 2, '#8a5638'); r(x - 2, y + 4, 2, 8, '#8a5638');
    r(x + 31, y - 8, 2, 20, '#8a5638'); r(x + 24, y + 2, 9, 2, '#8a5638'); r(x + 24, y + 4, 2, 8, '#8a5638');
    // 테이블
    r(x, y, 24, 3, '#e2b07a'); r(x, y + 3, 24, 1, '#b9825a'); r(x + 11, y + 4, 2, 8, '#7a4a36'); r(x + 8, y + 12, 8, 2, '#7a4a36');
    if (cups[0]) { r(x + 4, y - 4, 4, 4, '#f6ead7'); r(x + 5, y - 4, 2, 1, cups[0]); }
    if (cups[1]) { r(x + 16, y - 4, 4, 4, '#f6ead7'); r(x + 17, y - 4, 2, 1, cups[1]); }
  }

  R.draw = function (canvas, s, rt, time) {
    ctx = canvas.getContext('2d');
    var i, wall = WALLS[(s.grade - 1) % WALLS.length], hour = new Date().getHours(), sk = sky(hour);
    var night = sk[2] >= 0.2, lv = s.interiorLv;

    // 벽과 바닥
    r(0, 0, 130, 40, wall[0]);
    for (i = 0; i < 130; i += 20) r(i, 0, 10, 40, wall[1]);
    r(0, 40, 130, 12, '#a86f4c'); r(0, 40, 130, 2, '#8a5638'); r(0, 50, 130, 2, '#8a5638');
    r(0, 52, 130, 68, '#c98f62');
    for (i = 62; i < 120; i += 10) r(0, i, 130, 1, '#b07a50');
    var seams = [30, 90, 10, 66, 118, 40, 98, 20, 72, 112, 52, 104, 8, 84];
    for (i = 0; i < seams.length; i++) r(seams[i], 53 + 10 * Math.floor(i / 2) - (i < 2 ? 1 : 0), 1, 9, '#b07a50');
    if (lv >= 5) { r(84, 96, 44, 20, '#b5564a'); r(86, 98, 40, 16, '#d98a6a'); r(88, 100, 36, 12, '#b5564a'); }

    // 창문
    r(8, 6, 30, 26, '#6b4532'); r(10, 8, 26, 22, sk[0]);
    var cx = Math.floor(time / 4) % 30;
    r(10 + (cx % 20), 12, 6, 3, sk[1]); r(12 + (cx % 20), 10, 3, 2, sk[1]); r(10 + ((cx + 13) % 21), 21, 5, 2, sk[1]);
    if (night) { r(29, 11, 3, 3, '#fff2b0'); r(14, 24, 1, 1, '#ffffff'); r(24, 13, 1, 1, '#ffffff'); r(33, 22, 1, 1, '#ffffff'); }
    r(22, 8, 2, 22, '#6b4532'); r(10, 18, 26, 2, '#6b4532'); r(6, 32, 34, 2, '#8a5638');
    if (lv >= 7) { r(8, 6, 6, 14, '#e86a5c'); r(32, 6, 6, 14, '#e86a5c'); r(8, 6, 30, 2, '#c0503f'); }

    // 간판
    r(52, 0, 1, 6, '#6b4532'); r(77, 0, 1, 6, '#6b4532');
    r(48, 6, 34, 14, '#4a2f25'); r(49, 7, 32, 12, '#5d3b2e');
    word('CAfe', 54, 10, '#ffcf5c');
    if (lv >= 2) { r(54, 25, 12, 10, '#6b4532'); r(55, 26, 10, 8, '#9fdcec'); r(55, 31, 10, 3, '#7a9e5a'); r(61, 28, 2, 2, '#ffcf5c'); }
    if (lv >= 9) { r(69, 24, 9, 12, '#6b4532'); r(70, 25, 7, 10, '#f6ead7'); r(72, 27, 3, 3, '#e86a5c'); r(73, 30, 1, 4, '#5c8043'); }

    // 선반
    r(92, 12, 32, 2, '#8a5638'); r(92, 24, 32, 2, '#8a5638');
    r(96, 6, 5, 6, '#c0603f'); r(97, 3, 3, 3, '#5c8043'); r(106, 7, 6, 5, '#d9a066'); r(116, 8, 4, 4, '#e86a5c');
    r(95, 19, 4, 5, '#e86a5c'); r(101, 20, 4, 4, '#7ed6b4'); r(107, 18, 4, 6, '#f6ead7'); r(113, 20, 4, 4, '#ffcf5c'); r(119, 17, 3, 7, '#6fa8dc');

    // 줄 조명
    if (lv >= 12) {
      var cols = ['#ffcf5c', '#e86a5c', '#7ed6b4', '#6fa8dc'];
      for (i = 0; i < 11; i++) {
        var on = (Math.floor(time * 1.5) + i) % 3 !== 0;
        r(42 + i * 4, 1 + (i % 2), 1, 1, '#6b4532'); r(42 + i * 4, 2 + (i % 2), 2, 2, on ? cols[i % 4] : '#8a5638');
      }
    }

    // 화분
    r(44, 33, 6, 11, '#5c8043'); r(42, 37, 3, 5, '#7a9e5a'); r(49, 36, 3, 6, '#7a9e5a'); r(43, 44, 8, 8, '#c0603f'); r(43, 44, 8, 2, '#a34e32');
    if (lv >= 4) { r(2, 38, 5, 10, '#5c8043'); r(0, 41, 3, 5, '#7a9e5a'); r(6, 40, 3, 5, '#7a9e5a'); r(1, 48, 7, 6, '#6fa8dc'); }

    // 바리스타(카운터 뒤)
    var bx = [102, 92, 111], bhair = ['#3b2a20', '#e8b04a', '#7a4a36'];
    for (i = 0; i < s.baristas; i++) {
      var busy = rt.baristas[i] && rt.baristas[i].jobs.length > 0;
      var bob = busy && Math.floor(time * 6) % 2 === 0 ? 1 : 0;
      person(bx[i], 44 + bob, { hair: bhair[i], shirt: '#f6ead7', face: 1 }, true, true, false);
    }
    // 머신과 계산대
    r(113, 28, 14, 2, '#9aa1ad'); r(113, 30, 14, 14, '#c9ced6'); r(115, 36, 10, 6, '#4b5160');
    var making = false;
    for (i = 0; i < rt.baristas.length; i++) if (rt.baristas[i].jobs.length) making = true;
    r(124, 31, 2, 2, making ? '#e86a5c' : '#7a2f28'); r(118, 39, 4, 4, '#f6ead7');
    if (making) { var st = Math.floor(time * 4) % 3; r(119, 24 - st, 1, 3, '#ffffff'); r(121, 22 + st, 1, 3, '#ffffff'); }
    r(85, 35, 5, 2, '#6b7080'); r(85, 37, 7, 7, '#4b5160'); r(86, 38, 4, 3, '#7ed6b4');
    // 카운터
    r(84, 44, 46, 3, '#e2b07a'); r(84, 47, 46, 17, '#7a4a36');
    r(86, 50, 12, 11, '#6b3f2e'); r(100, 50, 12, 11, '#6b3f2e'); r(114, 50, 12, 11, '#6b3f2e'); r(84, 62, 46, 2, '#5a3526');
    // 완성되어 서빙을 기다리는 잔
    for (i = 0; i < Math.min(6, rt.ready.length); i++) { r(94 + i * 5, 40, 4, 4, '#f6ead7'); r(95 + i * 5, 40, 2, 1, D.MENUS[rt.ready[i].menu].color); }

    // 고양이
    if (lv >= 8) {
      var blink = Math.floor(time) % 5 === 0;
      r(118, 108, 9, 5, '#f0a04a'); r(116, 105, 6, 6, '#f0a04a'); r(116, 104, 2, 1, '#f0a04a'); r(120, 104, 2, 1, '#f0a04a');
      if (!blink) { r(117, 107, 1, 1, '#2b2135'); r(120, 107, 1, 1, '#2b2135'); }
      r(126, 105 + (Math.floor(time * 2) % 2), 2, 4, '#f0a04a');
    }

    // 움직이는 것들을 y 순서로 그린다
    var items = [];
    for (i = 0; i < s.tables; i++) {
      (function (t) {
        var tp = G.tablePos(t), cups = [null, null];
        for (var k = 0; k < 2; k++) {
          var id = rt.seats[t * 2 + k];
          if (id === null || id === undefined) continue;
          for (var j = 0; j < rt.customers.length; j++) {
            var c = rt.customers[j];
            if (c.id === id && c.phase === 'eat') cups[k] = D.MENUS[c.menu].color;
          }
        }
        items.push({ y: tp.y + 12, draw: function () { table(tp, cups); } });
      })(i);
    }
    rt.customers.forEach(function (c) {
      var seated = c.phase === 'wait' || c.phase === 'eat';
      items.push({ y: seated ? c.y : c.y, draw: function () {
        person(c.x, seated ? c.y + 3 : c.y, c, seated, false, false);
        if (c.phase === 'queue' && rt.queue[0] === c && c.path.length === 0) {
          r(c.x - 5, c.y - 30, 11, 10, '#ffffff'); r(c.x - 1, c.y - 20, 3, 2, '#ffffff');
          r(c.x - 2, c.y - 27, 5, 5, D.MENUS[c.menu].color); r(c.x + 3, c.y - 26, 1, 3, D.MENUS[c.menu].color);
        }
        if (c.phase === 'wait' && Math.floor(time * 2) % 2 === 0) { r(c.x - 2, c.y - 19, 1, 1, '#ffffff'); r(c.x, c.y - 19, 1, 1, '#ffffff'); r(c.x + 2, c.y - 19, 1, 1, '#ffffff'); }
      } });
    });
    var shair = ['#c0603f', '#2b2135', '#8d7ba3'];
    rt.servers.forEach(function (v, k) {
      items.push({ y: v.y, draw: function () {
        person(v.x, v.y, { hair: shair[k], shirt: '#f6ead7', face: v.face, legs: '#3b2a20' }, false, true, v.phase === 'toTable');
      } });
    });
    items.sort(function (a, b) { return a.y - b.y; });
    for (i = 0; i < items.length; i++) items[i].draw();

    // 팁 말풍선
    rt.bubbles.forEach(function (b) {
      var up = Math.floor(time * 3) % 2;
      if (b.ttl < 2 && Math.floor(time * 8) % 2 === 0) return;
      r(b.x - 5, b.y - 5 - up, 10, 10, '#2b2135'); r(b.x - 4, b.y - 6 - up, 8, 12, '#2b2135');
      r(b.x - 3, b.y - 4 - up, 6, 8, '#ffcf5c'); r(b.x - 4, b.y - 3 - up, 8, 6, '#ffcf5c'); r(b.x - 1, b.y - 3 - up, 2, 6, '#c98a1e');
    });

    // 밤에는 살짝 어둡게, 조명이 있으면 따뜻하게
    if (sk[2] > 0) { ctx.fillStyle = 'rgba(20,16,50,' + sk[2] + ')'; ctx.fillRect(0, 0, 130, 120); }
    if (lv >= 3) {
      var lx = [44, 88];
      for (i = 0; i < lx.length; i++) {
        r(lx[i], 0, 1, 14, '#4a2f25'); r(lx[i] - 3, 14, 7, 3, '#e86a5c'); r(lx[i] - 1, 17, 3, 2, '#fff2b0');
        if (night) { ctx.fillStyle = 'rgba(255,230,150,0.22)'; ctx.fillRect(lx[i] - 4, 19, 9, 3); ctx.fillRect(lx[i] - 6, 22, 13, 2); }
      }
    }
  };

  // ---- 목록 아이콘(14x14) ----
  var ICONS = {
    americano: [[6, 1, 1, 3, '#cdbfe0'], [3, 5, 8, 7, '#f6ead7'], [4, 5, 6, 1, '#5a3526'], [11, 7, 2, 3, '#f6ead7'], [2, 12, 10, 1, '#cdbfe0']],
    latte: [[4, 2, 6, 11, '#f6ead7'], [5, 3, 4, 3, '#ffffff'], [5, 6, 4, 6, '#c98f62']],
    vanilla: [[8, 0, 1, 5, '#e86a5c'], [4, 2, 6, 2, '#ffffff'], [4, 4, 6, 9, '#f6ead7'], [5, 5, 4, 7, '#e6c98a']],
    croissant: [[4, 5, 6, 2, '#e2b07a'], [2, 7, 10, 4, '#e2b07a'], [4, 6, 1, 5, '#b9825a'], [7, 5, 1, 6, '#b9825a'], [10, 7, 1, 4, '#b9825a']],
    cheesecake: [[6, 2, 2, 2, '#e86a5c'], [2, 5, 10, 1, '#e2b07a'], [2, 6, 10, 5, '#ffe9a8'], [2, 11, 10, 1, '#b9825a']],
    parfait: [[6, 2, 2, 2, '#e86a5c'], [4, 4, 6, 8, '#f6ead7'], [5, 5, 4, 2, '#e86a5c'], [5, 7, 4, 2, '#ffffff'], [5, 9, 4, 2, '#e86a5c'], [6, 12, 2, 1, '#f6ead7'], [4, 13, 6, 1, '#f6ead7']],
    matcha: [[3, 4, 8, 8, '#f6ead7'], [4, 4, 6, 2, '#7a9e5a'], [6, 5, 2, 1, '#f6ead7'], [11, 6, 2, 3, '#f6ead7'], [2, 12, 10, 1, '#cdbfe0']],
    tiramisu: [[2, 4, 10, 2, '#5a3526'], [2, 6, 10, 2, '#f6ead7'], [2, 8, 10, 2, '#8a5638'], [2, 10, 10, 2, '#f6ead7'], [1, 12, 12, 1, '#cdbfe0']],
    souffle: [[5, 2, 4, 2, '#ffffff'], [3, 4, 8, 3, '#f0d9b5'], [3, 7, 8, 1, '#d9a066'], [3, 8, 8, 3, '#f0d9b5'], [1, 11, 12, 2, '#cdbfe0']],
    signature: [[6, 1, 2, 2, '#ffcf5c'], [3, 3, 8, 1, '#cdbfe0'], [2, 4, 10, 5, '#f6ead7'], [4, 5, 2, 2, '#e86a5c'], [8, 5, 2, 2, '#7a9e5a'], [1, 9, 12, 2, '#ffcf5c'], [5, 11, 4, 2, '#c98a1e']],
    barista: [[3, 1, 8, 3, '#3b2a20'], [3, 4, 8, 5, '#f2c9a0'], [5, 6, 1, 2, '#2b2135'], [8, 6, 1, 2, '#2b2135'], [2, 9, 10, 5, '#f6ead7'], [4, 10, 6, 4, '#5c8043']],
    server: [[3, 1, 8, 3, '#c0603f'], [3, 4, 8, 5, '#f2c9a0'], [5, 6, 1, 2, '#2b2135'], [8, 6, 1, 2, '#2b2135'], [2, 9, 10, 5, '#f6ead7'], [4, 10, 6, 4, '#5c8043']],
    plus: [[6, 2, 2, 10, '#7ed6b4'], [2, 6, 10, 2, '#7ed6b4']],
    table: [[1, 5, 12, 2, '#e2b07a'], [6, 7, 2, 5, '#b9825a'], [4, 12, 6, 1, '#b9825a']],
    machine: [[2, 1, 10, 1, '#9aa1ad'], [2, 2, 10, 11, '#c9ced6'], [4, 6, 6, 5, '#4b5160'], [9, 3, 2, 2, '#e86a5c'], [6, 9, 2, 2, '#f6ead7']],
    interior: [[5, 2, 4, 6, '#5c8043'], [3, 4, 2, 3, '#7a9e5a'], [9, 3, 2, 4, '#7a9e5a'], [4, 8, 6, 5, '#c0603f']],
    grade: [[6, 1, 2, 2, '#ffcf5c'], [4, 3, 6, 2, '#ffcf5c'], [1, 5, 12, 2, '#ffcf5c'], [3, 7, 8, 2, '#ffcf5c'], [2, 9, 4, 3, '#ffcf5c'], [8, 9, 4, 3, '#ffcf5c']],
    coin: [[4, 2, 6, 10, '#ffcf5c'], [2, 4, 10, 6, '#ffcf5c'], [3, 3, 8, 8, '#ffcf5c'], [6, 4, 2, 6, '#c98a1e']],
    cup: [[5, 0, 1, 3, '#cdbfe0'], [8, 0, 1, 3, '#cdbfe0'], [2, 4, 9, 8, '#f6ead7'], [3, 4, 7, 1, '#5a3526'], [11, 6, 2, 4, '#f6ead7'], [1, 12, 11, 1, '#cdbfe0']]
  };
  var iconCache = {};
  R.icon = function (name) {
    if (iconCache[name]) return iconCache[name];
    var cv = document.createElement('canvas');
    cv.width = 14; cv.height = 14;
    var c = cv.getContext('2d'), list = ICONS[name] || ICONS.cup;
    for (var i = 0; i < list.length; i++) { c.fillStyle = list[i][4]; c.fillRect(list[i][0], list[i][1], list[i][2], list[i][3]); }
    iconCache[name] = cv.toDataURL();
    return iconCache[name];
  };

  C.R = R;
})(window);
