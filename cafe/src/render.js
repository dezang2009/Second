// CAfe 픽셀아트 그리기.
// 게임 좌표는 130x120 단위이고, 캔버스는 그 2배(260x240)다.
// r()는 게임 단위(=2x2 픽셀), f()는 캔버스 픽셀 단위로 그려 세부 묘사에 쓴다.
(function (root) {
  'use strict';
  var C = root.CAFE, D = C.D, G = C.G;
  var R = {};
  var ctx = null;

  function r(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x * 2), Math.round(y * 2), w * 2, h * 2); }
  function f(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }

  // 색을 밝게(k>0) 또는 어둡게(k<0)
  var shadeCache = {};
  function shade(hex, k) {
    var key = hex + k;
    if (shadeCache[key]) return shadeCache[key];
    var n = parseInt(hex.slice(1), 16), c = [n >> 16 & 255, n >> 8 & 255, n & 255], out = '#';
    for (var i = 0; i < 3; i++) {
      var v = Math.round(k < 0 ? c[i] * (1 + k) : c[i] + (255 - c[i]) * k);
      out += (v < 16 ? '0' : '') + v.toString(16);
    }
    shadeCache[key] = out;
    return out;
  }

  var WALLS = [
    ['#f0d9b5', '#ead0a6'], ['#dfe8cf', '#d2dfc0'], ['#f3d6d0', '#ecc7c0'],
    ['#d6e3ee', '#c6d7e6'], ['#efe2c0', '#e6d5a8']
  ];
  function sky(hour) {
    if (hour >= 7 && hour < 17) return ['#9fdcec', '#ffffff', 0];
    if (hour >= 17 && hour < 19) return ['#f4a56a', '#ffd9b0', 0.06];
    if (hour >= 5 && hour < 7) return ['#f2c4a8', '#fff0e0', 0.05];
    return ['#27305a', '#3b4a7a', 0.2];
  }

  // 간판 글자(7x9 픽셀)
  var GLYPH = {
    C: ['0111110', '1100011', '1100000', '1100000', '1100000', '1100000', '1100000', '1100011', '0111110'],
    A: ['0011100', '0110110', '1100011', '1100011', '1111111', '1100011', '1100011', '1100011', '1100011'],
    f: ['0001110', '0011000', '0011000', '1111110', '0011000', '0011000', '0011000', '0011000', '0011000'],
    e: ['0000000', '0000000', '0111100', '1100110', '1111110', '1100000', '1100000', '1100110', '0111100']
  };
  function word(txt, x, y, c) {
    for (var i = 0; i < txt.length; i++) {
      var g = GLYPH[txt[i]];
      for (var yy = 0; yy < g.length; yy++) for (var xx = 0; xx < 7; xx++) if (g[yy][xx] === '1') f(x + i * 9 + xx, y + yy, 1, 1, c);
    }
  }

  // ---- 사람 (16x34 픽셀, x/y=발 가운데의 게임 좌표) ----
  // p: hair, skin, shirt, pants, face, style(short/long/bun/cap), hat(chef/cap), capColor, apron(색), tie, glasses
  // o: seated, moving, carry, dy
  function person(x, y, p, o) {
    o = o || {};
    var X = Math.round(x * 2) - 8, Y = Math.round(y * 2) - 34 + (o.dy || 0), fc = p.face >= 0 ? 1 : -1;
    var skin = p.skin || '#f2c9a0', skinD = shade(skin, -0.16), shirtD = shade(p.shirt, -0.18);
    var pants = p.pants || '#3b4a6b', shoe = '#2b2135';
    if (o.seated) Y += 6;
    else {
      var st = o.moving ? Math.floor((x + y) / 2.5) % 2 : -1;
      f(X + 3, Y + 27, 4, st === 0 ? 4 : 5, pants); f(X + 9, Y + 27, 4, st === 1 ? 4 : 5, pants);
      f(X + 2, Y + (st === 0 ? 31 : 32), 5, 2, shoe); f(X + 9, Y + (st === 1 ? 31 : 32), 5, 2, shoe);
    }
    // 팔과 몸
    f(X, Y + 17, 2, 8, shirtD); f(X + 14, Y + 17, 2, 8, shirtD);
    f(X, Y + 25, 2, 2, skin); f(X + 14, Y + 25, 2, 2, skin);
    f(X + 2, Y + 16, 12, 11, p.shirt); f(X + 2, Y + 26, 12, 1, shirtD);
    f(X + 6, Y + 15, 4, 2, skinD);
    if (p.tie) { f(X + 6, Y + 16, 4, 2, '#f6ead7'); f(X + 7, Y + 17, 2, 6, '#e86a5c'); }
    if (p.apron) {
      var ad = shade(p.apron, -0.2);
      f(X + 4, Y + 19, 8, 8, p.apron); f(X + 4, Y + 16, 1, 3, p.apron); f(X + 11, Y + 16, 1, 3, p.apron);
      f(X + 6, Y + 22, 4, 2, ad); f(X + 4, Y + 26, 8, 1, ad);
    }
    // 머리
    f(X + 2, Y + 5, 12, 10, skin); f(X + 1, Y + 8, 1, 3, skinD); f(X + 14, Y + 8, 1, 3, skinD);
    f(X + 3, Y + 14, 10, 1, skinD);
    var ex = fc > 0 ? [6, 11] : [3, 8];
    f(X + ex[0], Y + 9, 2, 2, '#2b2135'); f(X + ex[1], Y + 9, 2, 2, '#2b2135');
    f(X + ex[0], Y + 9, 1, 1, '#ffffff'); f(X + ex[1], Y + 9, 1, 1, '#ffffff');
    f(X + ex[0] - 1, Y + 12, 2, 1, '#f0a59a'); f(X + ex[1] + 1, Y + 12, 2, 1, '#f0a59a');
    f(X + (fc > 0 ? 8 : 6), Y + 13, 2, 1, shade(skin, -0.35));
    if (p.glasses) {
      f(X + ex[0] - 1, Y + 8, 4, 1, '#2b2135'); f(X + ex[1] - 1, Y + 8, 4, 1, '#2b2135');
      f(X + ex[0] - 1, Y + 11, 4, 1, '#2b2135'); f(X + ex[1] - 1, Y + 11, 4, 1, '#2b2135');
    }
    // 머리카락
    var hair = p.hair, hl = shade(hair, 0.22);
    f(X + 3, Y, 10, 1, hair); f(X + 2, Y + 1, 12, 2, hair); f(X + 1, Y + 3, 14, 3, hair);
    f(X + (fc > 0 ? 1 : 9), Y + 6, 6, 1, hair); f(X + (fc > 0 ? 1 : 13), Y + 6, 2, 4, hair);
    f(X + 5, Y + 1, 5, 1, hl);
    if (p.style === 'long') { f(X + 1, Y + 6, 2, 11, hair); f(X + 13, Y + 6, 2, 11, hair); }
    if (p.style === 'bun') { f(X + 5, Y - 3, 6, 3, hair); f(X + 6, Y - 4, 4, 1, hair); f(X + 7, Y - 3, 2, 1, hl); }
    if (p.style === 'cap' || p.hat === 'cap') {
      var cc = p.capColor || '#e86a5c';
      f(X + 2, Y - 1, 12, 2, cc); f(X + 1, Y + 1, 14, 3, cc); f(X + (fc > 0 ? 9 : -1), Y + 4, 8, 2, shade(cc, -0.25));
      f(X + 6, Y, 4, 1, shade(cc, 0.3));
    }
    if (p.hat === 'chef' && o.icon) { f(X + 1, Y - 3, 14, 3, '#ffffff'); f(X + 2, Y, 12, 2, '#e0d8cc'); }
    else if (p.hat === 'chef') {
      f(X + 1, Y - 8, 14, 4, '#ffffff'); f(X + 2, Y - 4, 12, 5, '#ffffff'); f(X + 2, Y, 12, 2, '#e0d8cc');
      f(X + 5, Y - 7, 1, 6, '#e6dfd2'); f(X + 10, Y - 7, 1, 6, '#e6dfd2');
    }
    // 쟁반
    if (o.carry) {
      var tx = fc > 0 ? X + 13 : X - 9;
      f(tx, Y + 19, 12, 2, '#9aa1ad'); f(tx, Y + 20, 12, 1, '#6b7080');
      f(tx + 3, Y + 13, 6, 6, '#f6ead7'); f(tx + 4, Y + 13, 4, 2, o.carry); f(tx + 9, Y + 15, 2, 3, '#f6ead7');
    }
  }

  // 직원 외형
  var STAFF_LOOK = {
    alba: [
      { hair: '#3b2a20', shirt: '#8fb8e0', pants: '#3b4a6b', apron: '#5c8043', style: 'cap', capColor: '#5c8043' },
      { hair: '#c0603f', shirt: '#f2c38a', pants: '#4b5160', apron: '#5c8043', style: 'long' }
    ],
    mom: [{ hair: '#6b4532', shirt: '#f29bb5', pants: '#6b4532', apron: '#f6ead7', style: 'bun', skin: '#f7d9b8' }],
    barista: [
      { hair: '#2b2135', shirt: '#3a3a44', pants: '#2b2135', apron: '#8a5638', style: 'short' },
      { hair: '#e8b04a', shirt: '#3a3a44', pants: '#2b2135', apron: '#8a5638', style: 'bun' }
    ],
    patissier: [{ hair: '#7a4a36', shirt: '#ffffff', pants: '#4b5160', hat: 'chef', style: 'short', skin: '#f7d9b8' }],
    manager: [{ hair: '#3b2a20', shirt: '#3b4a6b', pants: '#2b2135', tie: true, glasses: true, style: 'short' }]
  };
  function staffLook(type, k, face) {
    var list = STAFF_LOOK[D.STAFF[type].id], p = list[k % list.length];
    p.face = face;
    return p;
  }

  // 테이블 위 음식(잔 또는 접시)
  function dish(x, y, menu) {
    var m = D.MENUS[menu];
    if (D.isFood(m.cat)) {
      f(x - 1, y + 5, 10, 2, '#f6ead7'); f(x, y + 7, 8, 1, '#cdbfe0');
      f(x + 1, y + 1, 6, 4, m.c[0]); f(x + 1, y + 1, 6, 1, m.c[1] || shade(m.c[0], -0.2));
    } else {
      f(x, y, 7, 8, '#f6ead7'); f(x + 1, y, 5, 2, m.c[0]); f(x + 7, y + 2, 2, 4, '#f6ead7'); f(x, y + 7, 7, 1, '#cdbfe0');
    }
  }

  function table(tp, food) {
    var X = (tp.x - 12) * 2, Y = tp.y * 2, wood = '#8a5638', woodD = '#6b4532', woodL = '#a06a48';
    // 의자(등받이, 앉는 판, 다리)
    [[X - 18, 1], [X + 62, -1]].forEach(function (c) {
      var bx = c[0], dir = c[1];
      f(bx, Y - 16, 4, 40, wood); f(bx + (dir > 0 ? 0 : 3), Y - 16, 1, 40, woodL);
      f(bx - (dir > 0 ? 0 : 14), Y + 4, 18, 4, wood); f(bx - (dir > 0 ? 0 : 14), Y + 4, 18, 1, woodL);
      f(bx + (dir > 0 ? 14 : -14), Y + 8, 4, 16, woodD);
      f(bx, Y - 10, 4, 1, woodD); f(bx, Y - 4, 4, 1, woodD);
    });
    // 테이블
    f(X - 1, Y, 50, 6, '#e2b07a'); f(X - 1, Y, 50, 1, '#f0c898'); f(X - 1, Y + 5, 50, 1, '#c99a66');
    f(X, Y + 6, 48, 2, '#b9825a');
    f(X + 22, Y + 8, 4, 16, '#7a4a36'); f(X + 22, Y + 8, 1, 16, '#8f5a42');
    f(X + 15, Y + 24, 18, 3, '#7a4a36'); f(X + 15, Y + 24, 18, 1, '#8f5a42');
    if (food[0] !== null) dish(X + 7, Y - 8, food[0]);
    if (food[1] !== null) dish(X + 32, Y - 8, food[1]);
  }

  R.draw = function (canvas, s, rt, time) {
    ctx = canvas.getContext('2d');
    var i, wall = WALLS[(s.grade - 1) % WALLS.length], hour = new Date().getHours(), sk = sky(hour);
    var night = sk[2] >= 0.2, lv = s.interiorLv;

    // 벽
    r(0, 0, 130, 40, wall[0]);
    for (i = 0; i < 130; i += 20) { r(i, 0, 10, 40, wall[1]); f(i * 2, 0, 1, 80, shade(wall[1], -0.05)); }
    f(0, 78, 260, 2, shade(wall[1], -0.1));
    // 허리 몰딩
    r(0, 40, 130, 12, '#a86f4c'); r(0, 40, 130, 2, '#8a5638'); r(0, 50, 130, 2, '#8a5638');
    f(0, 80, 260, 1, '#c08a62');
    for (i = 0; i < 260; i += 26) { f(i + 3, 86, 20, 12, '#9c6444'); f(i + 3, 86, 20, 1, '#b57a54'); f(i + 3, 97, 20, 1, '#8a5638'); }
    // 바닥
    r(0, 52, 130, 68, '#c98f62');
    f(0, 104, 260, 2, '#a8734c');
    for (i = 62; i < 120; i += 10) { f(0, i * 2, 260, 1, '#a8734c'); f(0, i * 2 + 1, 260, 1, '#d49a6c'); }
    var seams = [30, 90, 10, 66, 118, 40, 98, 20, 72, 112, 52, 104, 8, 84];
    for (i = 0; i < seams.length; i++) {
      var sy = (53 + 10 * Math.floor(i / 2)) * 2;
      f(seams[i] * 2, sy, 1, 18, '#a8734c');
      f(seams[i] * 2 + 9, sy + 6, 14, 1, '#bf8658'); f(seams[i] * 2 - 30, sy + 12, 10, 1, '#bf8658');
    }
    // 러그
    if (lv >= 5) {
      r(84, 96, 44, 20, '#b5564a'); f(172, 196, 80, 32, '#d98a6a'); f(176, 200, 72, 24, '#b5564a');
      for (i = 0; i < 9; i++) f(182 + i * 8, 210, 4, 4, '#f0c898');
      for (i = 0; i < 22; i++) { f(168 + i * 4, 190, 2, 2, '#f0c898'); f(168 + i * 4, 232, 2, 2, '#f0c898'); }
    }

    // 창문
    r(8, 6, 30, 26, '#6b4532'); f(16, 12, 60, 1, '#8a5f48'); r(10, 8, 26, 22, sk[0]);
    f(20, 16, 52, 1, shade(sk[0], -0.12));
    var cx = Math.floor(time / 4) % 30;
    r(10 + (cx % 20), 12, 6, 3, sk[1]); r(12 + (cx % 20), 10, 3, 2, sk[1]); r(10 + ((cx + 13) % 21), 21, 5, 2, sk[1]);
    if (night) {
      f(58, 22, 6, 6, '#fff2b0'); f(60, 22, 4, 2, sk[0]);
      f(28, 48, 1, 1, '#ffffff'); f(48, 26, 1, 1, '#ffffff'); f(66, 44, 1, 1, '#ffffff'); f(34, 30, 1, 1, '#ffffff'); f(54, 52, 1, 1, '#ffffff');
    } else { f(22, 18, 2, 10, 'rgba(255,255,255,0.35)'); f(26, 18, 1, 6, 'rgba(255,255,255,0.35)'); }
    r(22, 8, 2, 22, '#6b4532'); r(10, 18, 26, 2, '#6b4532'); f(44, 16, 1, 44, '#8a5f48'); f(20, 36, 52, 1, '#8a5f48');
    r(6, 32, 34, 2, '#8a5638'); f(12, 64, 68, 1, '#a06a48'); f(12, 67, 68, 1, '#6b4532');
    if (lv >= 7) {
      r(8, 6, 6, 14, '#e86a5c'); r(32, 6, 6, 14, '#e86a5c'); r(8, 6, 30, 2, '#c0503f');
      for (i = 0; i < 3; i++) { f(18 + i * 4, 16, 1, 22, '#c0503f'); f(66 + i * 4, 16, 1, 22, '#c0503f'); }
      f(16, 38, 12, 2, '#ffcf5c'); f(64, 38, 12, 2, '#ffcf5c');
    }

    // 간판
    f(104, 0, 2, 12, '#6b4532'); f(154, 0, 2, 12, '#6b4532');
    r(48, 6, 34, 14, '#4a2f25'); f(98, 14, 64, 24, '#5d3b2e'); f(98, 14, 64, 1, '#7a5040'); f(98, 37, 64, 1, '#3b241c');
    word('CAfe', 113, 22, '#2b1a14'); word('CAfe', 112, 21, '#ffcf5c');
    f(101, 17, 2, 2, '#ffcf5c'); f(157, 17, 2, 2, '#ffcf5c'); f(101, 33, 2, 2, '#ffcf5c'); f(157, 33, 2, 2, '#ffcf5c');
    // 액자
    if (lv >= 2) {
      r(54, 25, 12, 10, '#6b4532'); f(110, 52, 20, 16, '#9fdcec'); f(110, 60, 20, 8, '#7a9e5a'); f(110, 60, 20, 1, '#8fb86a');
      f(122, 54, 4, 4, '#ffcf5c'); f(112, 56, 6, 4, '#5c8043'); f(108, 50, 24, 1, '#8a5f48');
    }
    if (lv >= 9) {
      r(69, 24, 9, 12, '#6b4532'); f(140, 50, 14, 20, '#f6ead7'); f(144, 53, 6, 6, '#e86a5c'); f(145, 54, 2, 2, '#f29bb5');
      f(146, 59, 2, 9, '#5c8043'); f(143, 62, 3, 2, '#7a9e5a'); f(148, 64, 3, 2, '#7a9e5a');
    }

    // 선반
    for (i = 0; i < 2; i++) {
      var shy = (12 + i * 12) * 2;
      f(184, shy, 64, 4, '#8a5638'); f(184, shy, 64, 1, '#a06a48'); f(184, shy + 3, 64, 1, '#6b4532');
      f(188, shy + 4, 2, 4, '#6b4532'); f(242, shy + 4, 2, 4, '#6b4532');
    }
    r(96, 6, 5, 6, '#c0603f'); f(192, 12, 10, 2, '#a34e32'); r(97, 3, 3, 3, '#5c8043'); f(196, 4, 2, 4, '#7a9e5a');
    r(106, 7, 6, 5, '#d9a066'); f(212, 14, 12, 2, '#f6ead7'); f(214, 18, 8, 3, '#f6ead7');
    r(116, 8, 4, 4, '#e86a5c'); f(232, 16, 8, 1, '#f08a7a'); f(240, 18, 2, 4, '#e86a5c');
    var cupc = ['#e86a5c', '#7ed6b4', '#f6ead7', '#ffcf5c', '#6fa8dc'], cupx = [95, 101, 107, 113, 119];
    for (i = 0; i < 5; i++) {
      var ch = i === 2 ? 6 : i === 4 ? 7 : i === 0 ? 5 : 4, cw = i === 4 ? 3 : 4;
      r(cupx[i], 24 - ch, cw, ch, cupc[i]); f(cupx[i] * 2, (24 - ch) * 2, cw * 2, 1, shade(cupc[i], 0.35));
      f(cupx[i] * 2 + cw * 2 - 1, (24 - ch) * 2 + 1, 1, ch * 2 - 1, shade(cupc[i], -0.2));
    }

    // 줄 조명
    if (lv >= 12) {
      var cols = ['#ffcf5c', '#e86a5c', '#7ed6b4', '#6fa8dc'];
      for (i = 0; i < 22; i++) {
        var on = (Math.floor(time * 1.5) + i) % 3 !== 0, ly = 3 + Math.round(Math.sin(i / 21 * Math.PI) * 5);
        f(84 + i * 4, ly, 4, 1, '#6b4532');
        if (i % 2 === 0) { f(85 + i * 4, ly + 1, 3, 4, on ? cols[(i / 2) % 4] : '#8a5638'); if (on) f(85 + i * 4, ly + 1, 1, 1, '#ffffff'); }
      }
    }

    // 화분
    r(44, 33, 6, 11, '#5c8043'); r(42, 37, 3, 5, '#7a9e5a'); r(49, 36, 3, 6, '#7a9e5a');
    f(90, 66, 2, 18, '#7a9e5a'); f(96, 68, 2, 14, '#4a6b36'); f(86, 76, 2, 6, '#8fb86a'); f(100, 74, 2, 8, '#8fb86a');
    r(43, 44, 8, 8, '#c0603f'); r(43, 44, 8, 2, '#a34e32'); f(86, 88, 16, 1, '#d47a58'); f(100, 92, 2, 12, '#a34e32');
    if (lv >= 4) {
      r(2, 38, 5, 10, '#5c8043'); r(0, 41, 3, 5, '#7a9e5a'); r(6, 40, 3, 5, '#7a9e5a'); f(6, 78, 2, 16, '#7a9e5a'); f(10, 80, 2, 12, '#4a6b36');
      r(1, 48, 7, 6, '#6fa8dc'); f(2, 96, 14, 2, '#8fc0ea'); f(14, 100, 2, 8, '#4f88bc');
    }

    // 제조 직원(카운터 뒤)
    var bx = [100, 92, 108], seen = {};
    for (i = 0; i < rt.makers.length && i < 3; i++) {
      var mk = rt.makers[i], k = seen[mk.type] || 0;
      seen[mk.type] = k + 1;
      var busy = mk.jobs.length > 0;
      person(bx[i], 44, staffLook(mk.type, k, 1), { seated: true, dy: busy && Math.floor(time * 6) % 2 === 0 ? 3 : 2 });
    }
    // 에스프레소 머신
    var making = false;
    for (i = 0; i < rt.makers.length; i++) if (rt.makers[i].jobs.length) making = true;
    r(113, 28, 14, 2, '#9aa1ad'); r(113, 30, 14, 14, '#c9ced6'); f(226, 60, 28, 1, '#e2e6ec'); f(252, 60, 2, 28, '#a9afba');
    r(115, 36, 10, 6, '#4b5160'); f(230, 72, 20, 1, '#2f3440');
    f(232, 62, 3, 3, '#6fa8dc'); f(237, 62, 3, 3, '#7ed6b4'); f(242, 62, 3, 3, '#ffcf5c'); f(248, 62, 4, 4, making ? '#e86a5c' : '#7a2f28');
    f(234, 72, 4, 4, '#8a909c'); f(244, 72, 4, 4, '#8a909c'); f(230, 84, 20, 2, '#6b7080');
    r(118, 39, 4, 4, '#f6ead7'); f(236, 78, 8, 2, '#5a3526'); f(244, 80, 2, 4, '#f6ead7');
    if (making) { var stm = Math.floor(time * 4) % 3; f(238, 48 - stm * 2, 2, 6, 'rgba(255,255,255,0.8)'); f(243, 44 + stm * 2, 2, 6, 'rgba(255,255,255,0.8)'); }
    // 계산대
    r(85, 35, 5, 2, '#6b7080'); r(85, 37, 7, 7, '#4b5160'); f(172, 76, 8, 6, '#7ed6b4'); f(172, 76, 8, 1, '#b0ecd6');
    f(171, 84, 2, 2, '#9aa1ad'); f(175, 84, 2, 2, '#9aa1ad'); f(179, 84, 2, 2, '#9aa1ad');
    // 카운터
    r(84, 44, 46, 3, '#e2b07a'); f(168, 88, 92, 1, '#f0c898'); f(168, 93, 92, 1, '#c99a66');
    r(84, 47, 46, 17, '#7a4a36');
    for (i = 0; i < 3; i++) {
      var px = (86 + i * 14) * 2;
      f(px, 100, 24, 22, '#6b3f2e'); f(px, 100, 24, 1, '#5a3526'); f(px, 121, 24, 1, '#8f5a42');
      f(px + 3, 103, 18, 16, '#74452f'); f(px + 10, 110, 4, 2, '#d9a066');
    }
    r(84, 62, 46, 2, '#5a3526'); f(168, 94, 1, 30, '#8f5a42');
    // 완성되어 서빙을 기다리는 음식
    for (i = 0; i < Math.min(6, rt.ready.length); i++) dish(186 + i * 11, 80, rt.ready[i].menu);

    // 고양이
    if (lv >= 8) {
      var blink = Math.floor(time) % 5 === 0, tail = Math.floor(time * 2) % 2;
      f(236, 216, 18, 10, '#f0a04a'); f(232, 210, 12, 12, '#f0a04a'); f(232, 207, 3, 3, '#f0a04a'); f(241, 207, 3, 3, '#f0a04a');
      f(233, 208, 1, 2, '#f29bb5'); f(242, 208, 1, 2, '#f29bb5');
      f(240, 218, 2, 6, '#d98a36'); f(246, 218, 2, 6, '#d98a36'); f(236, 222, 6, 4, '#fff2e0');
      if (!blink) { f(234, 214, 2, 2, '#2b2135'); f(240, 214, 2, 2, '#2b2135'); } else { f(234, 215, 2, 1, '#2b2135'); f(240, 215, 2, 1, '#2b2135'); }
      f(237, 217, 2, 1, '#f29bb5');
      f(254, 212 + tail * 2, 3, 10, '#f0a04a'); f(254, 210 + tail * 2, 3, 2, '#fff2e0');
    }

    // 움직이는 것들을 y 순서로 그린다
    var items = [];
    for (i = 0; i < s.tables; i++) {
      (function (t) {
        var tp = G.tablePos(t), food = [null, null];
        for (var q = 0; q < 2; q++) {
          var id = rt.seats[t * 2 + q];
          if (id === null || id === undefined) continue;
          for (var j = 0; j < rt.customers.length; j++) {
            var c = rt.customers[j];
            if (c.id === id && c.phase === 'eat') food[q] = c.menu;
          }
        }
        items.push({ y: tp.y + 12, draw: function () { table(tp, food); } });
      })(i);
    }
    rt.customers.forEach(function (c) {
      var seated = c.phase === 'wait' || c.phase === 'eat';
      items.push({ y: c.y, draw: function () {
        person(c.x, c.y, c, { seated: seated, moving: c.path.length > 0 });
        var X = Math.round(c.x * 2), Y = Math.round(c.y * 2);
        if (c.phase === 'queue' && rt.queue[0] === c && c.path.length === 0) {
          f(X - 10, Y - 60, 21, 19, '#ffffff'); f(X - 11, Y - 59, 23, 17, '#ffffff'); f(X - 2, Y - 41, 5, 2, '#ffffff'); f(X - 1, Y - 39, 3, 2, '#ffffff');
          dish(X - 5, Y - 56, c.menu);
        }
        if (c.phase === 'wait') {
          var d3 = Math.floor(time * 3) % 4;
          for (var q = 0; q < 3; q++) f(X - 5 + q * 4, Y - 34 - (d3 === q ? 2 : 0), 2, 2, '#ffffff');
        }
      } });
    });
    var seenS = {};
    rt.servers.forEach(function (v) {
      var k = seenS[v.type] || 0;
      seenS[v.type] = k + 1;
      items.push({ y: v.y, draw: function () {
        person(v.x, v.y, staffLook(v.type, k, v.face), { moving: v.path.length > 0, carry: v.phase === 'toTable' && v.order ? D.MENUS[v.order.menu].c[0] : null });
      } });
    });
    if (rt.manager) {
      items.push({ y: rt.manager.y, draw: function () {
        var m = rt.manager;
        person(m.x, m.y, staffLook(G.ST.manager, 0, m.face), { moving: m.moving });
        // 클립보드
        var X = Math.round(m.x * 2), Y = Math.round(m.y * 2);
        f(X + (m.face > 0 ? 6 : -11), Y - 14, 5, 7, '#f6ead7'); f(X + (m.face > 0 ? 7 : -10), Y - 12, 3, 1, '#6b7080'); f(X + (m.face > 0 ? 7 : -10), Y - 10, 3, 1, '#6b7080');
      } });
    }
    items.sort(function (a, b) { return a.y - b.y; });
    for (i = 0; i < items.length; i++) items[i].draw();

    // 팁 말풍선(코인)
    rt.bubbles.forEach(function (b) {
      if (b.ttl < 2 && Math.floor(time * 8) % 2 === 0) return;
      var X = Math.round(b.x * 2), Y = Math.round(b.y * 2) - (Math.floor(time * 3) % 2) * 2;
      f(X - 7, Y - 11, 14, 22, '#2b2135'); f(X - 9, Y - 9, 18, 18, '#2b2135'); f(X - 11, Y - 7, 22, 14, '#2b2135');
      f(X - 5, Y - 9, 10, 18, '#ffcf5c'); f(X - 7, Y - 7, 14, 14, '#ffcf5c'); f(X - 9, Y - 5, 18, 10, '#ffcf5c');
      f(X - 5, Y - 7, 3, 1, '#fff2b0'); f(X - 7, Y - 5, 1, 3, '#fff2b0');
      f(X - 2, Y - 5, 4, 10, '#c98a1e'); f(X - 1, Y - 5, 1, 10, '#e0a030');
    });

    // 밤에는 살짝 어둡게
    if (sk[2] > 0) { ctx.fillStyle = 'rgba(20,16,50,' + sk[2] + ')'; ctx.fillRect(0, 0, 260, 240); }
    // 펜던트 조명
    if (lv >= 3) {
      var lx = [88, 176];
      for (i = 0; i < lx.length; i++) {
        f(lx[i], 0, 1, 26, '#4a2f25'); f(lx[i] - 3, 26, 7, 2, '#c0503f'); f(lx[i] - 6, 28, 13, 4, '#e86a5c'); f(lx[i] - 6, 28, 13, 1, '#f08a7a');
        f(lx[i] - 2, 32, 5, 3, '#fff2b0');
        if (night) { ctx.fillStyle = 'rgba(255,230,150,0.2)'; ctx.fillRect(lx[i] - 8, 35, 17, 4); ctx.fillRect(lx[i] - 12, 39, 25, 3); }
      }
    }
  };

  // ---- 목록 아이콘(16x16) ----
  function iconCanvas(size) {
    var cv = document.createElement('canvas');
    cv.width = size; cv.height = size;
    return cv;
  }
  var SHAPES = {
    mug: function (c) {
      f(6, 1, 1, 3, '#cdbfe0'); f(9, 0, 1, 3, '#cdbfe0');
      f(3, 5, 9, 8, '#f6ead7'); f(4, 5, 7, 2, c[0]); if (c[1]) f(6, 5, 3, 1, c[1]);
      f(12, 7, 2, 4, '#f6ead7'); f(11, 6, 1, 6, '#e0d4c0'); f(2, 13, 11, 1, '#cdbfe0'); f(3, 12, 9, 1, '#e0d4c0');
    },
    glass: function (c) {
      f(10, 0, 1, 6, c[2] || '#e86a5c');
      f(4, 3, 8, 12, '#e6eef2'); f(5, 4, 6, 10, c[0]); f(5, 4, 6, 3, c[1] || shade(c[0], 0.4));
      f(6, 8, 2, 2, 'rgba(255,255,255,0.6)'); f(9, 10, 1, 2, 'rgba(255,255,255,0.6)'); f(5, 14, 6, 1, '#cdbfe0');
    },
    bread: function (c) {
      f(3, 6, 10, 2, c[0]); f(2, 8, 12, 4, c[0]); f(3, 12, 10, 1, c[1]);
      f(5, 6, 1, 6, c[1]); f(8, 6, 1, 6, c[1]); f(11, 7, 1, 5, c[1]); f(4, 7, 3, 1, shade(c[0], 0.3));
    },
    slice: function (c) {
      f(2, 6, 12, 2, c[1]); f(2, 8, 12, 5, c[0]); f(2, 10, 12, 1, shade(c[0], -0.12)); f(2, 13, 12, 1, c[1]);
      f(7, 3, 3, 3, c[2] || '#e86a5c'); f(8, 2, 1, 1, '#5c8043'); f(1, 14, 14, 1, '#cdbfe0');
    },
    round: function (c) {
      f(4, 4, 8, 1, c[0]); f(3, 5, 10, 6, c[0]); f(4, 11, 8, 1, c[0]); f(4, 5, 4, 1, shade(c[0], 0.3));
      f(3, 8, 10, 1, c[1]); f(5, 6, 1, 1, c[1]); f(9, 6, 2, 1, c[1]); f(6, 10, 1, 1, c[1]); f(10, 10, 1, 1, c[1]);
      f(2, 13, 12, 1, '#cdbfe0');
    },
    stack: function (c) {
      f(6, 2, 4, 2, c[2] || '#ffffff'); f(3, 4, 10, 3, c[0]); f(3, 7, 10, 1, c[1]); f(3, 8, 10, 3, c[0]); f(3, 11, 10, 1, c[1]);
      f(4, 5, 1, 1, c[1]); f(7, 5, 1, 1, c[1]); f(10, 5, 1, 1, c[1]); f(1, 12, 14, 2, '#f6ead7'); f(2, 14, 12, 1, '#cdbfe0');
    },
    bowl: function (c) {
      f(5, 2, 6, 2, c[0]); f(4, 4, 8, 4, c[0]); f(6, 3, 4, 2, c[1]); f(7, 1, 2, 1, '#e86a5c');
      f(2, 8, 12, 3, '#e6eef2'); f(3, 11, 10, 2, '#e6eef2'); f(6, 13, 4, 1, '#cdbfe0'); f(4, 14, 8, 1, '#cdbfe0');
    },
    tier: function (c) {
      f(7, 0, 2, 15, c[2]); f(4, 4, 8, 1, c[0]); f(5, 2, 2, 2, c[1]); f(9, 2, 2, 2, '#f29bb5');
      f(2, 9, 12, 1, c[0]); f(3, 7, 2, 2, '#e2b07a'); f(11, 7, 2, 2, '#7a9e5a'); f(5, 7, 2, 2, c[1]);
      f(1, 14, 14, 1, c[0]); f(2, 12, 3, 2, '#ffe9a8'); f(10, 12, 3, 2, '#8a5638');
    }
  };
  var MISC = {
    plus: [[7, 3, 2, 10, '#7ed6b4'], [3, 7, 10, 2, '#7ed6b4']],
    table: [[1, 5, 14, 2, '#e2b07a'], [1, 5, 14, 1, '#f0c898'], [7, 7, 2, 6, '#b9825a'], [4, 13, 8, 1, '#b9825a']],
    machine: [[2, 1, 12, 1, '#9aa1ad'], [2, 2, 12, 12, '#c9ced6'], [4, 7, 8, 5, '#4b5160'], [10, 3, 2, 2, '#e86a5c'], [4, 3, 2, 2, '#6fa8dc'], [7, 10, 2, 2, '#f6ead7'], [3, 14, 10, 1, '#6b7080']],
    interior: [[6, 2, 4, 7, '#5c8043'], [4, 4, 2, 4, '#7a9e5a'], [10, 3, 2, 5, '#7a9e5a'], [7, 3, 1, 5, '#7a9e5a'], [5, 9, 6, 5, '#c0603f'], [5, 9, 6, 1, '#a34e32']],
    grade: [[7, 1, 2, 2, '#ffcf5c'], [5, 3, 6, 2, '#ffcf5c'], [1, 5, 14, 3, '#ffcf5c'], [3, 8, 10, 2, '#ffcf5c'], [2, 10, 5, 4, '#ffcf5c'], [9, 10, 5, 4, '#ffcf5c'], [7, 3, 1, 3, '#fff2b0']],
    coin: [[5, 2, 6, 12, '#ffcf5c'], [3, 4, 10, 8, '#ffcf5c'], [4, 3, 8, 10, '#ffcf5c'], [7, 5, 2, 6, '#c98a1e'], [5, 4, 2, 1, '#fff2b0']],
    cup: [[6, 0, 1, 3, '#cdbfe0'], [9, 0, 1, 3, '#cdbfe0'], [3, 5, 9, 8, '#f6ead7'], [4, 5, 7, 2, '#5a3526'], [12, 7, 2, 4, '#f6ead7'], [2, 13, 11, 1, '#cdbfe0']]
  };
  var iconCache = {};
  function cached(key, paint, size) {
    if (iconCache[key]) return iconCache[key];
    var cv = iconCanvas(size || 16), keep = ctx;
    ctx = cv.getContext('2d');
    paint();
    ctx = keep;
    iconCache[key] = cv.toDataURL();
    return iconCache[key];
  }
  R.icon = function (name) {
    return cached('misc:' + name, function () {
      var list = MISC[name] || MISC.cup;
      for (var i = 0; i < list.length; i++) f(list[i][0], list[i][1], list[i][2], list[i][3], list[i][4]);
    });
  };
  R.menuIcon = function (i) {
    var m = D.MENUS[i];
    return cached('menu:' + m.id, function () { SHAPES[m.shape](m.c); });
  };
  // 직원 얼굴(20x20): 사람 그림의 머리 부분만 쓴다
  R.staffIcon = function (type) {
    return cached('staff:' + D.STAFF[type].id, function () {
      ctx.translate(2, 4);
      person(4, 17, staffLook(type, 0, 1), { seated: true, dy: -6, icon: true });
    }, 20);
  };

  C.R = R;
})(window);
