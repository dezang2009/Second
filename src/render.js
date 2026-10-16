// 캔버스 경기장 렌더러 (세로 경기장, 사용자 팀이 항상 위쪽으로 공격)
(function (KM) {
  'use strict';
  const { LEN, WID } = KM.Engine;

  function PitchView(canvas, match, userSide) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.m = match;
    this.flip = userSide === 1;
    this.prev = new Map();
    this.prevBall = null;
    this.trail = [];
    this.kits = kits(match.sides[0].team, match.sides[1].team);
    this.resize();
  }

  // 유니폼 색이 비슷하면 원정팀은 보조색 유니폼을 입는다
  function rgb(hex) { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  function kits(h, a) {
    const x = rgb(h.c1), y = rgb(a.c1);
    const d = Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
    return [{ fill: h.c1, ring: h.c2 }, d < 140 ? { fill: a.c2, ring: a.c1 } : { fill: a.c1, ring: a.c2 }];
  }

  PitchView.prototype.resize = function () {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const w = this.c.clientWidth || 340;
    const h = Math.round(w * (LEN + 6) / (WID + 4));
    this.c.style.height = h + 'px';
    this.c.width = Math.round(w * dpr);
    this.c.height = Math.round(h * dpr);
    this.w = w; this.h = h; this.dpr = dpr;
    this.pad = 2;
    this.sx = (w) / (WID + this.pad * 2);
    this.sy = (h) / (LEN + 6);
  };

  // 엔진 좌표 → 화면 좌표
  PitchView.prototype.px = function (x, y) {
    let ex = y, ey = x;
    if (!this.flip) { ey = LEN - x; } else { ex = WID - y; }
    return [(ex + this.pad) * this.sx, (ey + 3) * this.sy];
  };

  PitchView.prototype.snapshot = function () {
    for (const m of this.m.all()) this.prev.set(m, [m.x, m.y]);
    const b = this.m.ball;
    this.prevBall = [b.x, b.y, b.z];
  };

  PitchView.prototype.drawPitch = function () {
    const g = this.ctx, w = this.w, h = this.h;
    // 잔디 줄무늬
    const stripes = 12;
    for (let i = 0; i < stripes; i++) {
      const [, y0] = this.px(LEN - (LEN / stripes) * i, 0);
      const [, y1] = this.px(LEN - (LEN / stripes) * (i + 1), 0);
      g.fillStyle = i % 2 ? '#2a6b43' : '#2f7549';
      const top = Math.min(y0, y1), hh = Math.abs(y1 - y0);
      g.fillRect(0, top, w, hh + 1);
    }
    g.fillStyle = '#25603c';
    g.fillRect(0, 0, w, this.px(LEN, 0)[1]);
    g.fillRect(0, this.px(0, 0)[1], w, h);
    g.strokeStyle = 'rgba(240,245,235,.82)';
    g.lineWidth = Math.max(1, this.sx * 0.28);
    const line = (pts) => { g.beginPath(); pts.forEach(([x, y], i) => { const [a, b] = this.px(x, y); i ? g.lineTo(a, b) : g.moveTo(a, b); }); g.stroke(); };
    line([[0, 0], [LEN, 0], [LEN, WID], [0, WID], [0, 0]]);
    line([[LEN / 2, 0], [LEN / 2, WID]]);
    const [cx, cy] = this.px(LEN / 2, WID / 2);
    g.beginPath(); g.arc(cx, cy, 9.15 * this.sx, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(240,245,235,.85)';
    g.beginPath(); g.arc(cx, cy, 1.6, 0, Math.PI * 2); g.fill();
    for (const end of [0, LEN]) {
      const d = end === 0 ? 1 : -1;
      line([[end, 34 - 20.16], [end + d * 16.5, 34 - 20.16], [end + d * 16.5, 34 + 20.16], [end, 34 + 20.16]]);
      line([[end, 34 - 9.16], [end + d * 5.5, 34 - 9.16], [end + d * 5.5, 34 + 9.16], [end, 34 + 9.16]]);
      const [sx, sy] = this.px(end + d * 11, 34);
      g.beginPath(); g.arc(sx, sy, 1.5, 0, Math.PI * 2); g.fill();
      // 페널티 아크
      const a0 = Math.acos(5.5 / 9.15);
      g.beginPath();
      const steps = 16;
      for (let i = 0; i <= steps; i++) {
        const t = -a0 + (2 * a0 * i) / steps;
        const ax = end + d * 11 + d * Math.cos(t) * 9.15, ay = 34 + Math.sin(t) * 9.15;
        const [rx, ry] = this.px(ax, ay);
        i ? g.lineTo(rx, ry) : g.moveTo(rx, ry);
      }
      g.stroke();
      // 골대
      g.save();
      g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = Math.max(1.5, this.sx * 0.5);
      line([[end, 34 - 3.66], [end - d * 1.6, 34 - 3.66], [end - d * 1.6, 34 + 3.66], [end, 34 + 3.66]]);
      g.restore();
    }
  };

  PitchView.prototype.draw = function (alpha) {
    const g = this.ctx, m = this.m;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawPitch();
    const r = Math.max(5, this.sx * 1.45);
    const owner = m.ball.owner;
    // 패스 경로
    if (m.pass) {
      const [ax, ay] = this.px(m.pass.sx, m.pass.sy), [bx, by] = this.px(m.pass.tx, m.pass.ty);
      g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 1.5; g.setLineDash([4, 4]);
      g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke(); g.setLineDash([]);
    }
    const order = m.all().slice().sort((a, b) => (a === owner) - (b === owner));
    for (const p of order) {
      const pr = this.prev.get(p) || [p.x, p.y];
      const x = pr[0] + (p.x - pr[0]) * alpha, y = pr[1] + (p.y - pr[1]) * alpha;
      const [sx, sy] = this.px(x, y);
      const kit = this.kits[p.side];
      const gk = p.grp === 'GK';
      g.fillStyle = 'rgba(0,0,0,.28)';
      g.beginPath(); g.ellipse(sx + 1.5, sy + 2, r, r * 0.8, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = gk ? (p.side === 0 ? '#e9d23b' : '#55d0e8') : kit.fill;
      g.beginPath(); g.arc(sx, sy, r, 0, Math.PI * 2); g.fill();
      g.lineWidth = Math.max(1.5, r * 0.28);
      g.strokeStyle = gk ? '#1b1b1b' : kit.ring;
      g.stroke();
      if (p === owner) {
        g.strokeStyle = '#ffd36b'; g.lineWidth = 2;
        g.beginPath(); g.arc(sx, sy, r + 3.5, 0, Math.PI * 2); g.stroke();
      }
      if (p.injured) { g.fillStyle = '#ff5d5d'; g.fillRect(sx - 2, sy - r - 6, 4, 4); }
      if (r >= 6.5) {
        g.fillStyle = gk ? '#111' : contrast(kit.fill);
        g.font = `700 ${Math.round(r * 1.05)}px "Saira Semi Condensed", system-ui, sans-serif`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(p.p.num, sx, sy + 0.5);
      }
    }
    // 공
    const b = m.ball;
    const pb = this.prevBall || [b.x, b.y, b.z];
    const bx = pb[0] + (b.x - pb[0]) * alpha, by = pb[1] + (b.y - pb[1]) * alpha, bz = pb[2] + (b.z - pb[2]) * alpha;
    const [qx, qy] = this.px(bx, by);
    const br = Math.max(3, this.sx * 0.75) * (1 + bz * 0.12);
    g.fillStyle = 'rgba(0,0,0,.35)';
    g.beginPath(); g.ellipse(qx + 1 + bz * 1.5, qy + 1.5 + bz * 2.5, br * 0.9, br * 0.6, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fbfbf7';
    g.beginPath(); g.arc(qx, qy - bz * 2.2, br, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#222'; g.lineWidth = 0.8; g.stroke();
    // 공 가진 선수 이름
    if (owner) {
      const pr = this.prev.get(owner) || [owner.x, owner.y];
      const [sx, sy] = this.px(pr[0] + (owner.x - pr[0]) * alpha, pr[1] + (owner.y - pr[1]) * alpha);
      const name = owner.p.name;
      g.font = '600 11px "Noto Sans KR", system-ui, sans-serif';
      const tw = g.measureText(name).width + 10;
      const lx = Math.min(Math.max(sx - tw / 2, 2), this.w - tw - 2), ly = sy - r - 20;
      g.fillStyle = 'rgba(10,16,28,.78)';
      roundRect(g, lx, ly, tw, 16, 5); g.fill();
      g.fillStyle = '#f4f1e6'; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText(name, lx + 5, ly + 8.5);
    }
  };

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function contrast(hex) {
    const n = parseInt(hex.slice(1), 16);
    const l = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
    return l > 150 ? '#111' : '#fff';
  }

  // 정적 포메이션 미리보기 (라인업 편집용) — DOM 기반이므로 좌표 변환만 제공
  function slotPos(slot) {
    // 세로 경기장, 아래가 우리 골문: left%, top%
    return [slot[2] * 84 + 8, 90 - slot[1] * 82];
  }

  KM.Render = { PitchView, contrast, slotPos, kits };
})(globalThis.KM || (globalThis.KM = {}));
