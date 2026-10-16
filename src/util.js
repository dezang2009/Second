// 공용 유틸리티: 시드 난수, 수학 함수, 포맷터
(function (KM) {
  'use strict';

  // mulberry32 시드 난수 생성기 — 상태를 숫자 하나로 저장할 수 있어 세이브에 넣기 쉽다
  function RNG(seed) {
    this.s = (seed >>> 0) || 1;
  }
  RNG.prototype.next = function () {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  RNG.prototype.range = function (a, b) { return a + (b - a) * this.next(); };
  RNG.prototype.int = function (a, b) { return Math.floor(a + (b - a + 1) * this.next()); };
  RNG.prototype.pick = function (arr) { return arr[Math.floor(this.next() * arr.length)]; };
  RNG.prototype.chance = function (p) { return this.next() < p; };
  // 근사 정규분포 (중심극한)
  RNG.prototype.gauss = function (mu, sd) {
    const u = this.next() + this.next() + this.next() + this.next() - 2;
    return mu + u * sd * 1.2247;
  };
  RNG.prototype.shuffle = function (arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  };

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  const sigmoid = (x) => 1 / (1 + Math.exp(-x));

  // 금액 단위: 천 유로(k€) → "€4,500만", "€1.80억", "€4,900"
  function money(k) {
    const neg = k < 0;
    const v = Math.abs(k);
    let s;
    if (v >= 100000) s = '€' + (v / 100000).toFixed(v >= 1000000 ? 1 : 2) + '억';
    else if (v >= 10) s = '€' + Math.round(v / 10).toLocaleString('ko-KR') + '만';
    else s = '€' + Math.round(v * 1000).toLocaleString('ko-KR');
    return (neg ? '-' : '') + s;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // 조사 처리: 받침 유무에 따라 이/가, 을/를, 은/는, 와/과
  function josa(word, pair) {
    const ch = String(word).trim().slice(-1);
    const code = ch.charCodeAt(0);
    let has;
    if (code >= 0xac00 && code <= 0xd7a3) has = (code - 0xac00) % 28 !== 0;
    else has = /[013678lmnLMN]$/.test(ch);
    const [a, b] = pair.split('/');
    return word + (has ? a : b);
  }

  KM.RNG = RNG;
  KM.clamp = clamp;
  KM.lerp = lerp;
  KM.dist = dist;
  KM.sigmoid = sigmoid;
  KM.money = money;
  KM.esc = esc;
  KM.josa = josa;
})(globalThis.KM || (globalThis.KM = {}));
