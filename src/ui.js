// 화면 구성과 사용자 입력
(function (KM) {
  'use strict';
  const S = KM.Season, W = KM.World, D = KM.DATA;
  const { esc, money, clamp } = KM;

  const SLOTS = 3;
  const KEY = (n) => 'kickoff-manager.v2.slot' + n;
  const IMG = 'https://img.a.transfermarkt.technology';
  const UI = {
    G: null, slot: 0, tab: 'home', sub: { squad: 'list', league: 'table', transfer: 'market', club: 'club' },
    filter: { pos: 'ALL', sort: 'pos', budget: false, league: null, round: null, mlg: -1, q: '', age: '', limit: 40 },
    selSlot: null, live: null, draft: null, newGame: null, confirm: null,
  };
  KM.UI = UI;

  const $ = (sel, root) => (root || document).querySelector(sel);
  const app = () => $('#app');

  // ── 저장: gzip 압축 후 localStorage (지원하지 않으면 원본 JSON) ─────
  async function gz(str) {
    if (typeof CompressionStream === 'undefined') return 'J' + str;
    const cs = new Blob([str]).stream().pipeThrough(new CompressionStream('gzip'));
    const buf = new Uint8Array(await new Response(cs).arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return 'Z' + btoa(bin);
  }
  async function gunz(s) {
    if (s[0] === 'J') return s.slice(1);
    if (s[0] !== 'Z') return s;
    const bin = atob(s.slice(1));
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    const ds = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
    return await new Response(ds).text();
  }
  function save(silent) {
    if (!UI.G) return Promise.resolve(false);
    const G = UI.G;
    const pools = G._pools; delete G._pools;
    const json = JSON.stringify(G);
    G._pools = pools;
    const t = S.userTeam(G);
    const meta = { team: { name: t.name, tm: t.tm, c1: t.c1, c2: t.c2, short: t.short }, year: G.year, week: G.week, name: G.user.name, league: S.leagueOf(G, t).name,
      savedAt: Date.now(), date: S.currentEvent(G) ? S.dateText(G, G.day) : '시즌 종료', pos: S.position(G, t.id), trophies: G.user.trophies.length, wins: G.user.wins, draws: G.user.draws, losses: G.user.losses };
    return gz(json).then((data) => {
      try {
        localStorage.setItem(KEY(UI.slot), data);
        localStorage.setItem(KEY(UI.slot) + '.meta', JSON.stringify(meta));
        return true;
      } catch (e) {
        if (!silent) toast('저장 공간이 부족해 저장하지 못했어요. 다른 슬롯을 지워보세요.');
        return false;
      }
    }).catch(() => false);
  }
  async function loadSlot(n) {
    try {
      const raw = localStorage.getItem(KEY(n));
      return raw ? migrate(JSON.parse(await gunz(raw))) : null;
    } catch (e) { return null; }
  }
  // 예전 세이브: 실제 선수 이름을 최신 데이터(한글 이름)로 바꾼다
  function migrate(G) {
    const names = {};
    for (const l of KM.REAL.leagues) for (const c of l.clubs) for (const p of c.players) names[p.id] = p;
    for (const id in G.players) {
      const p = G.players[id], r = names[id];
      if (r) { p.name = r.name; p.en = r.en; }
    }
    S.ensureDays(G);
    for (const t of G.teams) D.normTactics(t.tactics);
    return G;
  }
  function slotInfo(n) {
    try { const m = localStorage.getItem(KEY(n) + '.meta'); return m ? JSON.parse(m) : null; } catch (e) { return null; }
  }
  function deleteSlot(n) { try { localStorage.removeItem(KEY(n)); localStorage.removeItem(KEY(n) + '.meta'); } catch (e) { /* 무시 */ } }

  // ── 사진과 엠블럼 ──────────────────────────────────────────
  function initials(name) {
    if (/[가-힣]/.test(name)) return String(name).slice(0, 2);
    const parts = String(name).split(/[\s-]+/).filter(Boolean);
    return ((parts[0] || '?')[0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }
  function spriteCss(sheetUrl, col, row, cw, chh, w, cols) {
    const sc = w / cw;
    return `background-image:url(${sheetUrl});background-size:${cols * cw * sc}px auto;background-position:-${col * cw * sc}px -${row * chh * sc}px`;
  }
  // 선수 사진: 얼굴이 잘리지 않는 3:4 세로 카드. size는 대략적인 크기(px), ring = 아래 띠 색(구단 색)
  function avatar(p, size, ring) {
    size = Math.round((size || 40) * 0.82);
    const st = `width:${size}px;height:${Math.round(size * 1.3)}px;--ring:${ring || 'var(--line)'}`;
    const HD = KM.PHOTOS;
    // 앱(APK): 선수마다 고화질 사진 파일 (240×312)
    if (HD && HD.p[p.id]) return `<img class="ph" style="${st}" src="ph/p/${p.id}.webp" alt="" loading="lazy" decoding="async" data-ini="${esc(initials(p.name))}">`;
    const SP = KM.SPRITES;
    if (SP && SP.p[p.id]) {
      const [sheet, i] = SP.p[p.id];
      return `<span class="ph" style="${st};${spriteCss(`assets/p${sheet}.webp`, i % 12, Math.floor(i / 12), SP.pw, SP.ph, size, 12)}" role="img" aria-label="${esc(p.name)}"></span>`;
    }
    if (p.photo && !SP) return `<img class="ph" style="${st}" src="${IMG}/portrait/big/${p.photo}.jpg" alt="" loading="lazy" referrerpolicy="no-referrer" data-ini="${esc(initials(p.name))}">`;
    return `<span class="ph fb" style="${st};font-size:${Math.round(size * 0.36)}px">${esc(initials(p.name))}</span>`;
  }
  function bigPhoto(p) {
    if (KM.PHOTOS && KM.PHOTOS.p[p.id]) return `<img src="ph/p/${p.id}.webp" alt="" decoding="async">`;
    const SP = KM.SPRITES;
    if (SP && SP.p[p.id]) { const [sheet, i] = SP.p[p.id]; return `<span class="spr" style="${spriteCss(`assets/p${sheet}.webp`, i % 12, Math.floor(i / 12), SP.pw, SP.ph, 128, 12)}"></span>`; }
    if (p.photo && !SP) return `<img src="${IMG}/portrait/big/${p.photo}.jpg" alt="" referrerpolicy="no-referrer">`;
    return '';
  }
  function logo(t, size) {
    size = size || 32;
    if (KM.PHOTOS && KM.PHOTOS.l[t.tm]) return `<img class="logo" style="width:${size}px;height:${size}px" src="ph/l/${t.tm}.webp" alt="" decoding="async" data-ini="${esc(t.short)}" data-c="${t.c1}">`;
    const SP = KM.SPRITES;
    if (SP && SP.l[t.tm] != null) {
      const i = SP.l[t.tm];
      return `<span class="logo" style="width:${size}px;height:${size}px;${spriteCss('assets/logos.webp', i % 12, Math.floor(i / 12), SP.lw, SP.lw, size, 12)}" role="img" aria-label="${esc(t.name)}"></span>`;
    }
    if (!SP && t.tm) return `<img class="logo" style="width:${size}px;height:${size}px" src="${IMG}/wappen/big/${t.tm}.png" alt="" referrerpolicy="no-referrer" data-ini="${esc(t.short)}" data-c="${t.c1}">`;
    return `<span class="logo fb" style="width:${size}px;height:${size}px;--fb-bg:${t.c1};--fb-ink:${KM.Render.contrast(t.c1)}">${esc(t.short)}</span>`;
  }
  // 이미지를 못 불러오면 이니셜로 대체
  function onImgError(e) {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.dataset.ini) {
      if (img instanceof HTMLImageElement && img.closest('.shot')) img.remove();
      return;
    }
    const span = document.createElement('span');
    span.className = img.className + ' fb';
    span.setAttribute('style', img.getAttribute('style') || '');
    if (img.dataset.c) { span.style.setProperty('--fb-bg', img.dataset.c); span.style.setProperty('--fb-ink', KM.Render.contrast(img.dataset.c)); }
    span.textContent = img.dataset.ini;
    img.replaceWith(span);
  }

  // ── 공용 조각 ──────────────────────────────────────────────
  function ovrCls(o) { return o >= 82 ? 't1' : o >= 74 ? 't2' : o >= 66 ? 't3' : 't4'; }
  function ovrBadge(o) { return `<span class="ovr ${ovrCls(o)}">${o}</span>`; }
  function posTag(p) { const r = p.role || p.pos; return `<span class="pos ${D.ROLE_GROUP[r] || p.pos}">${r}</span>`; }
  function stars(p) {
    const n = clamp(Math.round((p.pot - 50) / 9), 1, 5);
    return '★'.repeat(n) + '<span style="opacity:.25">' + '★'.repeat(5 - n) + '</span>';
  }
  function formHtml(arr) { return `<span class="form">${(arr || []).slice(-5).map((r) => `<i class="${r}">${r === 'W' ? '승' : r === 'D' ? '무' : '패'}</i>`).join('')}</span>`; }
  function ratingCls(r) { return r >= 7.3 ? 'hi' : r >= 6.2 ? 'mid' : 'lo'; }
  function condColor(c) { return c >= 80 ? 'var(--win)' : c >= 60 ? 'var(--draw)' : 'var(--loss)'; }
  function statusTags(p) {
    const out = [];
    if (p.inj > 0) out.push(`<span class="tag red">부상 ${p.inj}주</span>`);
    if (p.sus > 0) out.push(`<span class="tag red">징계 ${p.sus}</span>`);
    if (p.listed) out.push('<span class="tag amber">이적 리스트</span>');
    if (p.contract <= 1 && p.teamId === UI.G.user.teamId) out.push('<span class="tag amber">계약 만료 임박</span>');
    return out.join(' ');
  }
  function moraleText(m) { return m >= 80 ? '최고' : m >= 62 ? '좋음' : m >= 45 ? '보통' : m >= 28 ? '나쁨' : '최악'; }
  function teamOf(p) { return p.teamId != null ? UI.G.teams[p.teamId] : null; }
  function seasonLabel(y) { return `${y}/${String(y + 1).slice(2)}`; }

  function toast(msg) {
    const old = $('.toast'); if (old) old.remove();
    const el = document.createElement('div');
    el.className = 'toast'; el.textContent = msg; el.setAttribute('role', 'status');
    document.body.appendChild(el);
    clearTimeout(UI._tt);
    UI._tt = setTimeout(() => el.remove(), 2600);
  }

  // opts.update: 이미 열린 시트의 내용만 바꾼다 (깜빡임·스크롤 초기화 없이)
  function sheet(html, onClose, opts) {
    const cur = $('.sheet-bg');
    if (cur && opts && opts.update) {
      const sh = cur.firstChild, y = sh.scrollTop;
      sh.innerHTML = `<div class="grab"></div>${html}`;
      sh.scrollTop = y;
      UI._sheetClose = onClose || null;
      return sh;
    }
    closeSheet();
    const bg = document.createElement('div');
    bg.className = 'sheet-bg';
    bg.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div>`;
    bg.addEventListener('click', (e) => { if (e.target === bg) { closeSheet(); if (onClose) onClose(); } });
    document.body.appendChild(bg);
    lockScroll();
    UI._sheetClose = onClose || null;
    return bg.firstChild;
  }
  // 팝업·경기 화면이 열려 있으면 뒤 화면이 스크롤되지 않도록 고정
  function lockScroll() {
    const locked = !!($('.sheet-bg') || $('.match-screen'));
    document.documentElement.classList.toggle('locked', locked);
  }
  function closeSheet() { const s = $('.sheet-bg'); if (s) s.remove(); lockScroll(); }

  const ICON = {
    home: '<svg viewBox="0 0 24 24"><path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15V15H9v5.5H5.5A1.5 1.5 0 0 1 4 19z"/></svg>',
    squad: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19.5c0-3.2 2.4-5.5 5.5-5.5s5.5 2.3 5.5 5.5"/><circle cx="17" cy="9.5" r="2.4"/><path d="M16.5 14.2c2.6-.2 4 1.7 4 4.3"/></svg>',
    league: '<svg viewBox="0 0 24 24"><path d="M7 4h10v4a5 5 0 0 1-10 0z"/><path d="M7 6H4.5a2.5 2.5 0 0 0 2.6 3.4M17 6h2.5a2.5 2.5 0 0 1-2.6 3.4"/><path d="M12 13v4M8.5 20h7M10 17h4"/></svg>',
    transfer: '<svg viewBox="0 0 24 24"><path d="M4 8h13"/><path d="m13.5 4.5 3.5 3.5-3.5 3.5"/><path d="M20 16H7"/><path d="m10.5 12.5-3.5 3.5 3.5 3.5"/></svg>',
    club: '<svg viewBox="0 0 24 24"><path d="M12 3.5 19 6v5.5c0 4.3-2.9 7.3-7 8.5-4.1-1.2-7-4.2-7-8.5V6z"/><path d="m12 9 1.1 2.2 2.4.3-1.8 1.7.5 2.4-2.2-1.2-2.2 1.2.5-2.4-1.8-1.7 2.4-.3z"/></svg>',
  };
  const NEWS_IC = { match: '⚽', transfer: '⇄', injury: '✚', board: '▣', cup: '🏆', offer: '✉', ach: '★', club: '⌂' };

  // ── 최상위 렌더 ────────────────────────────────────────────
  function render() {
    if (UI.live) return;
    const G = UI.G;
    if (!G) return renderTitle();
    if (G.user.sacked) return renderSacked();
    const t = S.userTeam(G);
    const ev = S.currentEvent(G);
    const lg = S.leagueOf(G, t);
    void lg;
    const dateText = ev ? esc(S.dateText(G, G.day)) : `${seasonLabel(G.year)} 시즌 종료`;
    const win = S.windowOpen(G) ? '<span class="open">이적시장</span>' : '';
    // 오른쪽 아래에 떠 있는 '계속' 버튼 (엄지로 누르기 편하게)
    app().innerHTML = `
      <header class="topbar">
        <div class="club">${logo(t, 36)}<div style="min-width:0"><b>${esc(t.name)}</b><div class="meta"><span>${dateText}</span>${win}</div></div></div>
        <div class="bal"><small>구단 잔고</small><span class="num">${money(t.balance)}</span></div>
      </header>
      <main class="view" id="view">${viewHtml()}</main>
      ${contBtn(G)}
      <nav class="tabs" aria-label="메뉴"><div class="in">
        ${[['home', '홈'], ['squad', '선수단'], ['league', '리그'], ['transfer', '이적'], ['club', '구단']].map(([k, l]) =>
          `<button data-act="tab" data-v="${k}" class="${UI.tab === k ? 'on' : ''}" aria-current="${UI.tab === k}">${ICON[k]}${l}${k === 'transfer' && G.offers.length ? '<span class="dot"></span>' : ''}${k === 'home' && G.news.some((n) => n.read === false && !n.gen) ? '<span class="dot"></span>' : ''}</button>`).join('')}
      </div></nav>`;
  }
  // FM식 '계속' 버튼: 경기일이면 경기 준비, 아니면 하루 진행
  function contBtn(G) {
    const ev = S.currentEvent(G);
    let label = '계속', sub = '다음 날';
    if (!ev) { label = '시즌 결산'; sub = '시즌 종료'; }
    else if (S.userFixture(G) && ev.day <= G.day) { label = '경기 준비'; sub = '오늘 경기'; }
    else { const d = S.userFixture(G) ? ev.day - G.day : 0; sub = d ? `경기까지 ${d}일` : '다음 날'; }
    return `<button class="cont ${label === '경기 준비' ? 'match' : ''}" data-act="cont"><span><b>${label}</b><small>${sub}</small></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l8 7-8 7"/></svg></button>`;
  }
  function rerenderView() {
    const v = $('#view');
    if (!v) return render();
    const y = window.scrollY;
    v.innerHTML = viewHtml();
    window.scrollTo(0, y);
  }
  function viewHtml() {
    switch (UI.tab) {
      case 'squad': return squadView();
      case 'league': return leagueView();
      case 'transfer': return transferView();
      case 'club': return clubView();
      default: return homeView();
    }
  }
  function seg(name, items, cur) {
    return `<div class="seg" role="tablist">${items.map(([k, l]) => `<button data-act="sub" data-k="${name}" data-v="${k}" class="${cur === k ? 'on' : ''}" role="tab" aria-selected="${cur === k}">${l}</button>`).join('')}</div>`;
  }

  // ── 타이틀 / 새 게임 ───────────────────────────────────────
  // ── 로비 ───────────────────────────────────────────────────
  function heroStars() {
    // 몸값 상위 선수 5명을 부채꼴로 (가운데가 가장 비싼 선수)
    const top = KM.REAL.leagues.flatMap((l) => l.clubs.flatMap((c) => c.players)).filter((p) => p.photo).sort((a, b) => b.value - a.value).slice(0, 5);
    const order = [top[3], top[1], top[0], top[2], top[4]].filter(Boolean);
    return order.map((p, i) => `<div class="star s${i}">${avatar({ id: p.id, name: p.name, photo: p.photo }, i === 2 ? 118 : i % 4 === 0 ? 86 : 100)}${i === 2 ? `<span>${esc(p.name)}</span>` : ''}</div>`).join('');
  }
  function crestStrip() {
    const cols = KM.REAL.colors || {};
    const clubs = KM.REAL.leagues.flatMap((l) => l.clubs).map((c) => ({ tm: c.id, name: c.name, short: c.name.slice(0, 3), c1: (cols[c.id] || ['#2d3a4a'])[0] }));
    const row = clubs.map((t) => `<i class="cr">${logo(t, 28)}</i>`).join('');
    return `<div class="crests" aria-hidden="true"><div class="track">${row}${row}</div></div>`;
  }
  function mgrName(n) { n = n || '감독'; return /감독$/.test(n) ? n : n + ' 감독'; }
  function ago(ts) {
    if (!ts) return '';
    const m = Math.round((Date.now() - ts) / 60000);
    return m < 1 ? '방금 전' : m < 60 ? `${m}분 전` : m < 1440 ? `${Math.round(m / 60)}시간 전` : `${Math.round(m / 1440)}일 전`;
  }
  function renderTitle() {
    if (UI.newGame) return renderNewGame();
    const slots = [];
    for (let i = 0; i < SLOTS; i++) slots.push(slotInfo(i));
    const used = slots.map((s, i) => s && { s, i }).filter(Boolean).sort((a, b) => (b.s.savedAt || 0) - (a.s.savedAt || 0));
    const last = used[0];
    const free = slots.findIndex((s) => !s);
    const lastCard = last ? (() => {
      const s = last.s, t = s.team;
      return `<button class="resume" data-act="load" data-v="${last.i}" style="--tc:${t.c1 || '#3b3f7a'}">
        <span class="glow"></span>${logo(t, 64)}
        <span class="info"><small>이어하기 · 슬롯 ${last.i + 1}${s.savedAt ? ` · ${ago(s.savedAt)}` : ''}</small><b>${esc(t.name)}</b>
          <span>${esc(mgrName(s.name))} · ${esc(s.league)} ${seasonLabel(s.year)}${s.pos ? ` · ${s.pos}위` : ''}</span>
          ${s.date ? `<span class="d">${esc(s.date)}${s.wins != null ? ` · ${s.wins}승 ${s.draws}무 ${s.losses}패` : ''}${s.trophies ? ` · 🏆 ${s.trophies}` : ''}</span>` : ''}</span>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button>`;
    })() : '';
    app().innerHTML = `
      <div class="lobby">
        <div class="lobby-bg" aria-hidden="true"><svg viewBox="0 0 400 700" preserveAspectRatio="xMidYMid slice"><rect x="20" y="20" width="360" height="660" rx="6"/><line x1="20" y1="350" x2="380" y2="350"/><circle cx="200" cy="350" r="62"/><circle cx="200" cy="350" r="3"/><rect x="110" y="20" width="180" height="96"/><rect x="110" y="584" width="180" height="96"/></svg></div>
        <div class="lobby-in">
          <div class="lobby-top"><span class="pill">${KM.REAL.season ? `${seasonLabel(+KM.REAL.season)} 시즌` : '2026/27 시즌'} · 6개 리그 · 108개 구단</span></div>
          <h1 class="logo-type"><span>KICK-OFF</span><em>MANAGER</em></h1>
          <p class="tagline">실제 선수단으로 펼치는 나만의 감독 커리어</p>
          <div class="stars">${heroStars()}</div>
          ${crestStrip()}
          <div class="lobby-actions">
            ${lastCard}
            ${free >= 0 ? `<button class="btn big new-career ${last ? 'ghosty' : ''}" data-act="newgame" data-v="${free}">${last ? '+ 새 커리어' : '새 커리어 시작'}</button>` : ''}
            ${used.length > 1 || (used.length && free < 0) ? `<div class="slots">${used.slice(1).map(({ s, i }) => `<button class="slot-row" data-act="load" data-v="${i}">${logo(s.team, 30)}<span class="grow"><b>${esc(s.team.name)}</b><small>${esc(s.name)} · ${seasonLabel(s.year)}${s.pos ? ` · ${s.pos}위` : ''}${s.savedAt ? ` · ${ago(s.savedAt)}` : ''}</small></span><i>슬롯 ${i + 1}</i></button>`).join('')}</div>` : ''}
            ${used.length ? `<details class="manage"><summary>슬롯 관리</summary><div class="stack" style="margin-top:8px">${slots.map((s, i) => s ? `<div class="row"><span class="grow">슬롯 ${i + 1} · ${esc(s.team.name)}</span>${UI.confirm === 'del' + i ? `<button class="btn sm danger" data-act="delslot" data-v="${i}">정말 삭제</button>` : `<button class="btn sm ghost" data-act="askdel" data-v="${i}">삭제</button>`}</div>` : '').join('')}</div></details>` : ''}
          </div>
          <p class="credit">데이터·사진: <a href="https://www.transfermarkt.co.kr" target="_blank" rel="noopener">Transfermarkt</a> (${esc(KM.REAL.fetched)} 기준) · 능력치는 시장 가치와 실제 기록으로 추정한 값이에요.</p>
        </div>
      </div>`;
  }
  function renderNewGame() {
    const ng = UI.newGame;
    if (!ng.G) ng.G = S.createWorld(ng.seed);
    const G = ng.G;
    const li = ng.league || 0;
    const ids = G.leagues[li].teams.slice().sort((a, b) => W.squadOvr(G, G.teams[b]) - W.squadOvr(G, G.teams[a]) || G.teams[b].rep - G.teams[a].rep);
    const sel = ng.team;
    app().innerHTML = `
      <div class="title-screen">
        <div class="row"><button class="btn sm ghost" data-act="ngback">← 뒤로</button></div>
        <h1 style="font-family:var(--f-display);font-size:28px">새 커리어</h1>
        <label class="stack" style="gap:6px"><span class="eyebrow">감독 이름</span>
          <input class="txt" id="ng-name" maxlength="10" value="${esc(ng.name || '')}" placeholder="예: 김감독" autocomplete="off"></label>
        <div class="stack" style="gap:8px"><span class="eyebrow">리그</span>
          <div class="chips">${G.leagues.map((l, i) => `<button class="chip ${li === i ? 'on' : ''}" data-act="nglg" data-v="${i}">${esc(l.name)}</button>`).join('')}</div></div>
        <div class="card" style="padding-block:4px"><div class="list">
          ${ids.map((id, rank) => {
            const t = G.teams[id];
            const n = ids.length;
            const exp = rank < 2 ? '우승 후보' : rank < 5 ? '상위권' : rank < n / 2 + 1 ? '중위권' : '잔류 경쟁';
            const star = t.squad.map((x) => G.players[x]).sort((a, b) => b.value - a.value)[0];
            return `<div class="li tap" data-act="ngteam" data-v="${id}" style="${sel === id ? 'background:color-mix(in srgb,var(--accent) 30%,var(--surface));border-radius:12px;padding-inline:8px' : ''}">
              ${logo(t, 38)}<div class="grow"><div class="name">${esc(t.name)}</div><div class="sub">${exp} · 예산 ${money(t.balance)} · 핵심 ${esc(star.name)}</div></div>${ovrBadge(W.squadOvr(G, t))}</div>`;
          }).join('')}
        </div></div>
        <div style="position:sticky;bottom:calc(10px + env(safe-area-inset-bottom, 0px))"><button class="btn primary big block" data-act="ngstart" ${sel == null ? 'disabled' : ''}>${sel == null ? '구단을 고르세요' : esc(G.teams[sel].name) + ' 감독으로 시작'}</button></div>
      </div>`;
  }

  function renderSacked() {
    const G = UI.G;
    const offers = S.jobOffers(G);
    app().innerHTML = `
      <div class="title-screen">
        <section class="hero"><h1 style="font-family:var(--f-display);font-size:30px">해임 통보</h1>
        <p style="margin:0;opacity:.85">구단주가 성적 부진을 이유로 ${esc(G.user.name)} 감독과의 계약을 해지했습니다. 몇몇 구단이 관심을 보이고 있어요.</p></section>
        <div class="card"><h2>새 구단 제의</h2><div class="list">
          ${offers.map((id) => { const t = G.teams[id]; return `<div class="li">${logo(t, 36)}<div class="grow"><div class="name">${esc(t.name)}</div><div class="sub">${esc(G.leagues[t.league].name)} · 선수단 OVR ${W.squadOvr(G, t)}</div></div><button class="btn sm primary" data-act="takejob" data-v="${id}">수락</button></div>`; }).join('') || '<div class="empty">제의가 없습니다.</div>'}
        </div></div>
        <button class="btn ghost" data-act="totitle">메인 화면으로</button>
      </div>`;
  }

  // ── 홈 ─────────────────────────────────────────────────────
  function compare(label, a, b, fmt) {
    const tot = a + b || 1;
    return `<div class="compare"><span class="num">${fmt ? fmt(a) : a}</span><div><div class="mid">${label}</div><div class="dual"><i style="flex:${a / tot};background:var(--brand)"></i><i style="flex:${b / tot};background:var(--muted)"></i></div></div><span class="num">${fmt ? fmt(b) : b}</span></div>`;
  }
  function homeView() {
    const G = UI.G, t = S.userTeam(G);
    const parts = [];
    const ev = S.currentEvent(G);
    if (!ev) {
      parts.push(`<section class="card stack"><span class="eyebrow">시즌 종료</span><h2 style="margin:0">${seasonLabel(G.year)} 시즌이 끝났습니다</h2><p class="muted" style="margin:0">최종 순위 ${S.position(G, t.id)}위. 결산을 확인하고 다음 시즌을 시작하세요.</p><button class="btn primary big" data-act="endseason">시즌 결산 보기</button></section>`);
    } else {
      parts.push(dayStrip(G));
      const fx = S.userFixture(G);
      if (fx) {
        const home = fx.m.h === t.id;
        const opp = S.team(G, home ? fx.m.a : fx.m.h);
        const hT = S.team(G, fx.m.h), aT = S.team(G, fx.m.a);
        const os = opp.lineup.map((id) => G.players[id]).filter(Boolean).sort((a, b) => b.ovr - a.ovr)[0];
        const rv = S.rivalry(G, hT.id, aT.id);
        const rec = rv && G.h2h ? G.h2h[S.h2hKey(hT.id, aT.id)] : null;
        parts.push(`<section class="card matchcard ${rv ? 'derby' : ''}" style="--hc:${hT.c1};--ac:${aT.c1}">
          <div class="band stack">
            ${rv ? `<div class="derby-tag">🔥 ${esc(rv.name)}${'<i>★</i>'.repeat(rv.lvl)}${rec ? `<span>감독 부임 후 ${rec.w}승 ${rec.d}무 ${rec.l}패</span>` : ''}</div>` : ''}
            <div class="row"><span class="eyebrow" style="color:#aeb9c9">${esc(fx.label)}</span><span class="grow"></span><span class="tag" style="background:#ffffff1a;color:#fff">${home ? '홈' : '원정'} · ${esc(hT.stadium)}</span></div>
            <div class="fixture">
              <div class="tm">${logo(hT, 64)}<b>${esc(hT.name)}</b>${formHtml(hT.form)}</div>
              <div class="vs">VS</div>
              <div class="tm">${logo(aT, 64)}<b>${esc(aT.name)}</b>${formHtml(aT.form)}</div>
            </div>
          </div>
          <div class="foot">
            ${compare('전력', W.teamRating(G, hT), W.teamRating(G, aT))}
            ${fx.ev.k === 'L' && G.week > 0 ? compare('리그 순위', S.position(G, hT.id), S.position(G, aT.id), (v) => v + '위') : ''}
            ${os ? `<div class="row" style="font-size:12.5px">${avatar(os, 36, opp.c1)}<span class="grow muted">경계 대상 <b style="color:var(--ink)">${esc(os.name)}</b> · ${os.role} · 시즌 ${os.season.goals}골 ${os.season.assists}도움</span>${ovrBadge(os.ovr)}</div>` : ''}
            ${ev.day <= G.day ? '<button class="btn primary big" data-act="prematch">경기 준비</button>' : `<div class="grid2"><button class="btn" data-act="nextday">다음 날로</button><button class="btn primary" data-act="tomatch">경기일까지 진행</button></div>`}
          </div>
        </section>`);
      } else {
        const label = ev.k === 'C' ? `${G.cup.name} ${S.cupRoundName(G, ev.r)}` : ev.k === 'E' ? `유럽 대항전 ${S.EURO_ROUNDS[ev.r]}` : '리그';
        parts.push(`<section class="card stack"><span class="eyebrow">${esc(S.dateText(G, ev.day))} · ${esc(label)}</span><p style="margin:0">이번 일정에는 우리 경기가 없어요. 다른 구단 경기는 그날 자동으로 치러져요.</p><div class="grid2"><button class="btn" data-act="nextday">다음 날로</button><button class="btn primary" data-act="tomatch">다음 경기까지</button></div></section>`);
      }
    }
    const lm = G.lastMatch;
    if (lm) {
      const opp = S.team(G, lm.opp);
      const pq = S.pressQuestions(G);
      const motm = lm.motm != null && G.players[lm.motm];
      parts.push(`<section class="card stack">
        <h2 style="margin:0">지난 경기 <small>${esc(lm.label)}</small></h2>
        <div class="row">${logo(opp, 30)}<b class="grow">${lm.home ? 'vs' : '@'} ${esc(opp.name)}</b><span class="tag ${lm.r === 'W' ? 'green' : lm.r === 'L' ? 'red' : 'amber'}">${lm.r === 'W' ? '승' : lm.r === 'L' ? '패' : '무'}</span><span class="num" style="font-size:24px;font-weight:700">${lm.gf} - ${lm.ga}</span></div>
        ${lm.agg || lm.pens ? `<div class="muted" style="font-size:12px">${lm.agg ? `합계 ${lm.agg[0]}-${lm.agg[1]}` : ''}${lm.agg && lm.pens ? ' · ' : ''}${lm.pens ? `승부차기 ${lm.home ? lm.pens[0] + '-' + lm.pens[1] : lm.pens[1] + '-' + lm.pens[0]}` : ''}</div>` : ''}
        ${lm.an ? `<button class="btn an-btn" data-act="lmanalysis">📊 경기 분석 · xG ${lm.an.sides[lm.us].st.xg.toFixed(1)} : ${lm.an.sides[1 - lm.us].st.xg.toFixed(1)}</button>` : ''}
        ${motm ? `<div class="row" style="font-size:12.5px">${avatar(motm, 30, 'var(--accent)')}<span class="muted">경기 최우수 선수 <b style="color:var(--ink)">${esc(motm.name)}</b></span></div>` : ''}
        ${pq && !lm.answered ? `<div class="stack" style="gap:8px;border-top:1px solid var(--line);padding-top:12px"><span class="eyebrow">기자회견</span><div style="font-weight:700">“${esc(pq.q)}”</div>
          ${pq.a.map((a, i) => `<button class="btn sm ghost" style="justify-content:flex-start;text-align:left;font-weight:600" data-act="press" data-v="${i}">${esc(a.t)}</button>`).join('')}</div>` : lm.answer ? `<div class="muted" style="font-size:12.5px">기자회견: “${esc(lm.answer)}”</div>` : ''}
      </section>`);
    }
    const alerts = [];
    if (G.offers.length) alerts.push(`<button class="li tap" data-act="goto" data-tab="transfer" data-sub="offers" style="background:none;border:0;width:100%;text-align:left"><span class="tag live">제안</span><span class="grow">우리 선수 영입 제안 ${G.offers.length}건</span><span class="muted">›</span></button>`);
    const expiring = t.squad.map((id) => G.players[id]).filter((p) => p.contract <= 1);
    if (expiring.length && G.week >= G.calendar.length * 0.6) alerts.push(`<button class="li tap" data-act="goto" data-tab="squad" data-sub="list" style="background:none;border:0;width:100%;text-align:left"><span class="tag amber">계약</span><span class="grow">시즌 후 계약 만료 ${expiring.length}명 — 재계약하지 않으면 떠나요</span><span class="muted">›</span></button>`);
    const unavailable = t.lineup.map((id) => G.players[id]).filter((p) => p && (p.inj > 0 || p.sus > 0));
    if (unavailable.length) alerts.push(`<div class="li"><span class="tag red">결장</span><span class="grow">${unavailable.map((p) => esc(p.name)).join(', ')} 출전 불가</span></div>`);
    if (alerts.length) parts.push(`<section class="card" style="padding-block:4px"><div class="list">${alerts.join('')}</div></section>`);
    const conf = Math.round(G.board.conf);
    parts.push(`<section class="card stack" style="gap:8px">
      <h2 style="margin:0">구단주 신뢰도 <small>목표: ${esc(G.board.goal.text)}</small></h2>
      <div class="meter"><i style="width:${conf}%;background:${conf >= 60 ? 'var(--win)' : conf >= 35 ? 'var(--draw)' : 'var(--loss)'}"></i></div>
      <div class="row muted" style="font-size:12.5px"><span class="grow">${conf >= 75 ? '구단주가 매우 만족하고 있어요.' : conf >= 55 ? '구단주가 지켜보고 있어요.' : conf >= 35 ? '구단주가 불안해하고 있어요.' : '경질 위기입니다!'}</span><span>현재 ${S.position(G, t.id)}위</span></div>
    </section>`);
    const tb = S.table(G, t.league);
    const pos = tb.findIndex((r) => r.id === t.id);
    const from = clamp(pos - 2, 0, tb.length - 5);
    parts.push(`<section class="card"><h2>${esc(S.leagueOf(G, t).name)} <small><button class="btn sm ghost" data-act="goto" data-tab="league" data-sub="table">전체 순위</button></small></h2>${tableHtml(G, t.league, tb.slice(from, from + 5), from)}</section>`);
    const inbox = G.news.filter((n) => !n.gen);
    const unread = inbox.filter((n) => n.read === false).length;
    parts.splice(ev ? 2 : 1, 0, `<section class="card inbox"><div class="row"><h2 class="grow" style="margin:0">받은 편지함 ${unread ? `<span class="badge">${unread}</span>` : ''}</h2><button class="btn sm ghost" data-act="inboxall">전체 보기</button></div>
      <div class="list">${inbox.slice(0, 5).map(mailItem).join('') || '<div class="empty">새 메시지가 없어요.</div>'}</div></section>`);
    return parts.join('');
  }
  // 오늘부터 7일 일정: 경기일·훈련일을 한눈에
  function dayStrip(G) {
    const uid = G.user.teamId;
    const ev = S.currentEvent(G);
    const left = ev ? ev.day - G.day : 0;
    const days = [];
    for (let d = G.day; d < G.day + 7; d++) {
      const e = G.calendar.find((x) => x.day === d);
      let kind = 'train', label = '훈련';
      if (e) {
        const ul = S.leagueOf(G, S.userTeam(G));
        const uc = S.euroUserComp(G);
        const mine = e.k === 'L' ? ul.fixtures[e.r].some((m) => m.h === uid || m.a === uid)
          : e.k === 'E' ? !!uc && (uc.rounds[e.r] ? uc.rounds[e.r].some((m) => m.h === uid || m.a === uid) : S.euroStatus(G, uc).indexOf('탈락') < 0)
            : G.cup.rounds[e.r] ? G.cup.rounds[e.r].some((m) => (m.h === uid || m.a === uid) && m.h != null && m.a != null) : e.r < (G.cup.rounds.length + 1) && !G.cup.winner;
        kind = mine ? 'match' : 'other'; label = e.k === 'C' ? '컵' : e.k === 'E' ? (uc && mine ? uc.short : '유럽') : '리그';
      } else if (G.calendar.some((x) => x.day === d + 1)) { kind = 'rest'; label = '회복'; }
      const dt = S.dateOf(G, d);
      days.push(`<div class="day ${kind} ${d === G.day ? 'today' : ''}"><small>${'일월화수목금토'[dt.getDay()]}</small><b class="num">${dt.getDate()}</b><span>${kind === 'match' ? '⚽' : kind === 'other' ? '·' : ''}${label}</span></div>`);
    }
    return `<section class="card day-card"><div class="row"><div class="grow"><div class="eyebrow">오늘</div><div class="h2" style="margin:0">${esc(S.dateText(G, G.day))}</div></div>
      ${ev ? `<span class="dday ${left <= 0 ? 'now' : ''}">${left <= 0 ? '경기일' : `다음 경기 D-${left}`}</span>` : ''}</div>
      <div class="days">${days.join('')}</div></section>`;
  }

  const SENDER_IC = { '수석 코치': '코', '단장': '단', '의료팀장': '의', '구단주': '주', '대회 운영국': '컵', '구단 기록관': '★', '구단 사무국': '사', '수석 스카우트': '스', '어시스턴트 매니저': '수', '피트니스 코치': '피', '이적 소식': '⇄' };
  function mailItem(n) {
    return `<button class="li tap mail ${n.read === false ? 'unread' : ''}" data-act="mail" data-v="${n.id || ''}" data-i="${UI.G.news.indexOf(n)}">
      <span class="who" aria-hidden="true">${SENDER_IC[n.from] || NEWS_IC[n.tag] || '•'}</span>
      <div class="grow"><div class="from">${esc(n.from || '구단 사무국')}<span>${n.d != null ? esc(shortDate(n.d)) : ''}</span></div><div class="t">${esc(n.title)}</div><div class="b">${esc(n.body)}</div></div></button>`;
  }
  function shortDate(d) { const dt = S.dateOf(UI.G, d); return `${dt.getMonth() + 1}/${dt.getDate()}`; }
  function openMail(n) {
    const G = UI.G;
    n.read = true;
    const pls = (n.pids || []).map((id) => G.players[id]).filter(Boolean);
    const opp = n.opp != null ? G.teams[n.opp] : null;
    sheet(`<div class="row"><span class="who big">${SENDER_IC[n.from] || NEWS_IC[n.tag] || '•'}</span><div class="grow"><div class="eyebrow">${esc(n.from || '구단 사무국')} · ${n.d != null ? esc(S.dateText(G, n.d)) : ''}</div><h2 style="margin:2px 0 0">${esc(n.title)}</h2></div></div>
      ${opp ? `<div class="row">${logo(opp, 44)}<b class="grow">${esc(opp.name)}</b><span class="muted">${opp.tactics.formation}</span></div>` : ''}
      <div style="font-size:14px;line-height:1.75">${esc(n.body).replace(/\. /g, '.<br>')}</div>
      ${pls.length ? `<div class="list">${pls.map((p) => `<div class="li tap" data-act="player" data-v="${p.id}">${avatar(p, 40)}<div class="grow"><div class="name">${esc(p.name)}</div><div class="sub">${posTag(p)} ${p.age}세 · ${money(p.value)} · ${esc(teamOf(p) ? teamOf(p).name : '자유계약')}</div></div>${ovrBadge(p.ovr)}</div>`).join('')}</div>` : ''}
      ${n.tag === 'offer' ? '<button class="btn" data-act="goto" data-tab="transfer" data-sub="offers">이적 제안 보기</button>' : ''}
      <button class="btn primary" data-act="closesheet">확인</button>`, () => rerenderView());
  }
  function newsItem(n) {
    return `<div class="li"><span class="ic" aria-hidden="true">${NEWS_IC[n.tag] || '•'}</span><div class="grow"><div class="t">${esc(n.title)}</div><div class="b">${esc(n.body)}</div></div></div>`;
  }

  function tableHtml(G, li, rows, offset) {
    const uid = G.user.teamId;
    const n = G.leagues[li].teams.length;
    const euro = G.leagues[li].code !== 'RSK1';
    return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th></th><th>#</th><th style="text-align:left">구단</th><th>경기</th><th>승</th><th>무</th><th>패</th><th>득실</th><th>승점</th></tr></thead><tbody>
      ${rows.map((r, i) => {
        const k = offset + i + 1;
        const zone = k <= (euro ? 4 : 3) ? 'up' : k > n - 3 ? 'down' : '';
        const t = G.teams[r.id];
        return `<tr class="${r.id === uid ? 'me' : ''}" data-act="teamsheet" data-v="${r.id}" style="cursor:pointer"><td class="zone ${zone}"></td><td>${k}</td><td class="tn"><span class="row" style="gap:7px">${logo(t, 20)}${esc(t.name)}</span></td><td>${r.p}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td>${r.gf - r.ga > 0 ? '+' : ''}${r.gf - r.ga}</td><td class="pts">${r.pts}</td></tr>`;
      }).join('')}</tbody></table></div>`;
  }

  // ── 선수단 ─────────────────────────────────────────────────
  function squadView() {
    const sub = UI.sub.squad;
    let body = '';
    if (sub === 'lineup') body = lineupEditor(S.userTeam(UI.G)) + tacticsPanel(S.userTeam(UI.G).tactics, 'team');
    else if (sub === 'train') body = trainingView();
    else body = playerListView();
    return seg('squad', [['list', '선수 목록'], ['lineup', '라인업·전술'], ['train', '훈련·육성']], sub) + body;
  }

  function sortPlayers(arr, sort) {
    const po = { GK: 0, DF: 1, MF: 2, FW: 3 };
    const ro = { GK: 0, CB: 1, LB: 2, RB: 3, DM: 4, CM: 5, LM: 6, RM: 7, AM: 8, LW: 9, RW: 10, ST: 11 };
    const f = {
      pos: (a, b) => po[a.pos] - po[b.pos] || ro[a.role] - ro[b.role] || b.ovr - a.ovr,
      ovr: (a, b) => b.ovr - a.ovr,
      age: (a, b) => a.age - b.age,
      cond: (a, b) => a.cond - b.cond,
      value: (a, b) => b.value - a.value,
      pot: (a, b) => b.pot - a.pot,
    }[sort] || ((a, b) => b.ovr - a.ovr);
    return arr.sort(f);
  }

  function posChips() {
    const fl = UI.filter;
    return `<div class="chips">${['ALL', 'GK', 'DF', 'MF', 'FW'].map((k) => `<button class="chip ${fl.pos === k ? 'on' : ''}" data-act="fpos" data-v="${k}">${k === 'ALL' ? '전체' : D.POS_KO[k]}</button>`).join('')}</div>`;
  }

  function playerListView() {
    const G = UI.G, t = S.userTeam(G);
    const fl = UI.filter;
    let ps = t.squad.map((id) => G.players[id]);
    if (fl.pos !== 'ALL') ps = ps.filter((p) => p.pos === fl.pos);
    sortPlayers(ps, fl.sort);
    const starters = new Set(t.lineup);
    return `<div class="row wrap" style="gap:8px"><div class="grow" style="min-width:0">${posChips()}</div>
      <select class="sel" data-act="fsort" aria-label="정렬">${[['pos', '포지션순'], ['ovr', '능력순'], ['pot', '잠재력순'], ['age', '나이순'], ['cond', '컨디션 낮은순'], ['value', '가치순']].map(([k, l]) => `<option value="${k}" ${fl.sort === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <section class="card" style="padding-block:4px"><div class="list">
      ${ps.map((p) => `<div class="li tap" data-act="player" data-v="${p.id}">
        ${avatar(p, 44, starters.has(p.id) ? 'var(--brand)' : 'var(--line)')}
        <div class="grow"><div class="name">${esc(p.name)} <span class="muted num" style="font-weight:600">#${p.num}</span></div>
          <div class="sub">${posTag(p)} ${p.age}세 · ${money(p.value)} ${statusTags(p)}</div>
          <div class="bar" style="margin-top:5px;max-width:130px"><i style="width:${p.cond}%;background:${condColor(p.cond)}"></i></div></div>
        ${ovrBadge(p.ovr)}
      </div>`).join('')}
    </div></section>
    <p class="muted" style="font-size:12px;margin:0;text-align:center">선수단 ${t.squad.length}명 · 주급 합계 ${money(W.wageBill(G, t))}/주 · 초록 테두리는 선발</p>`;
  }

  function shortPlayerName(n) {
    if (/[가-힣]/.test(n)) return n;
    const parts = n.split(' ');
    return parts.length > 1 ? parts[parts.length - 1] : n;
  }

  const DUTY_S = ['수', '지', '공'];
  function roleTag(r) { return `${D.ROLE_AB[r[0]]}<i class="duty d${r[1]}">${DUTY_S[r[1]]}</i>`; }
  // part: 'pitch' | 'roles' | 'bench' (경기 준비 화면의 스와이프 페이지용), 없으면 전부
  function lineupEditor(t, part) {
    const G = UI.G;
    W.validateLineup(G, t);
    const slots = D.FORMATIONS[t.tactics.formation];
    const roles = W.validateRoles(t);
    const sel = UI.selSlot;
    const discs = slots.map((sl, i) => {
      const p = G.players[t.lineup[i]];
      const [l, tp] = KM.Render.slotPos(sl);
      const ro = p ? W.roleOvr(p, sl[0]) : 0;
      const bad = p && D.fit(sl[0], p) < 0.86;
      return `<button class="slot ${sel === i ? 'sel' : ''} ${bad ? 'bad' : ''}" style="left:${l}%;top:${tp}%" data-act="slot" data-v="${i}" aria-label="${sl[0]} ${p ? esc(p.name) : ''}">
        ${p ? avatar(p, 42, t.c1) : '<span class="ph fb" style="width:36px;height:47px">?</span>'}
        <span class="lbl">${p ? esc(shortPlayerName(p.name)) : '비어 있음'}</span><span class="rt">${roleTag(roles[i])} ${ro}</span></button>`;
    }).join('');
    const fam = Math.round(t.tactics.formationOP ? (W.famOf(t, t.tactics.formation) + W.famOf(t, t.tactics.formationOP)) / 2 : W.famOf(t, t.tactics.formation));
    const inXI = new Set(t.lineup);
    const others = sortPlayers(t.squad.map((id) => G.players[id]).filter((p) => !inXI.has(p.id)), 'pos');
    const benchSet = new Set(t.bench);
    const role = sel != null ? slots[sel][0] : null;
    // 스와이프 페이지에서는 자리를 고르면 바로 아래에 후보 목록을 보여준다
    const cands = part === 'pitch' && sel != null ? `<section class="card stack"><div class="row"><h2 class="grow h2" style="margin:0">${slots[sel][0]} 자리 후보</h2><button class="btn sm ghost" data-act="slot" data-v="${sel}">취소</button></div>
      <div class="list">${others.slice().sort((a, b) => W.roleOvr(b, role) - W.roleOvr(a, role)).map((p) => benchRow(p, role, benchSet.has(p.id))).join('')}</div></section>` : '';
    const pitchHtml = `<section class="card stack">
      <div class="row"><h2 class="grow h2" style="margin:0">선발 라인업</h2><button class="btn sm" data-act="autolineup">자동</button></div>
      <div class="grid2 form-pick">
        <label><span class="eyebrow">공격 시 포메이션</span><select class="sel" data-act="formation" aria-label="공격 시 포메이션">${Object.keys(D.FORMATIONS).map((f) => `<option ${f === t.tactics.formation ? 'selected' : ''}>${f}</option>`).join('')}</select></label>
        <label><span class="eyebrow">수비 시 포메이션</span><select class="sel" data-act="formationop" aria-label="수비 시 포메이션"><option value="">공격 시와 같게</option>${Object.keys(D.FORMATIONS).map((f) => `<option ${f === t.tactics.formationOP ? 'selected' : ''}>${f}</option>`).join('')}</select></label>
      </div>
      <div class="fam"><span class="eyebrow">전술 숙련도</span><div class="meter"><i style="width:${fam}%;background:${fam >= 80 ? 'var(--win)' : fam >= 60 ? 'var(--draw)' : 'var(--loss)'}"></i></div><b class="num">${fam}%</b></div>
      <div class="row muted" style="font-size:12.5px"><span class="grow">${sel != null ? `<b style="color:var(--ink)">${slots[sel][0]}</b> 자리에 넣을 선수를 아래에서 고르세요. 다른 자리를 누르면 서로 바뀌어요.` : '자리를 눌러 선수를 바꾸세요. 숫자는 그 자리에서의 능력치예요.'}</span><span>전력 <b class="num" style="color:var(--ink);font-size:17px">${W.teamRating(G, t)}</b></span></div>
      <div class="pitch-ed">
        <span class="ln" style="inset:3% 4%;border-radius:4px"></span><span class="ln" style="left:4%;right:4%;top:50%;border-width:2px 0 0"></span>
        <span class="ln" style="left:50%;top:50%;width:26%;aspect-ratio:1;transform:translate(-50%,-50%);border-radius:50%"></span>
        <span class="ln" style="left:24%;right:24%;bottom:3%;height:16%;border-bottom:0"></span><span class="ln" style="left:24%;right:24%;top:3%;height:16%;border-top:0"></span>
        ${discs}</div>
      <p class="muted" style="margin:0;font-size:11.5px">${fam < 70 ? '아직 익숙하지 않은 포메이션이라 선수들의 움직임이 조금 둔해요. 경기와 훈련(전술 초점)으로 숙련도가 올라가요.' : '선수들이 이 포메이션에 익숙해요.'}${t.tactics.formationOP ? ` 공을 잃으면 ${t.tactics.formationOP} 대형으로 바꿔 수비해요.` : ''}</p>
    </section>`;
    const rolesHtml = rolesCard(slots.map((sl, i) => ({ i, pos: sl[0], p: G.players[t.lineup[i]], r: roles[i] })), 'team');
    const benchHtml = `<section class="card stack">
      <div class="row"><h2 class="grow h2" style="margin:0">교체 명단 <small style="margin-left:6px">${t.bench.length}/9</small></h2>
        <button class="btn sm ghost" data-act="benchauto">자동 구성</button></div>
      <p class="muted" style="margin:0;font-size:12.5px">${sel != null ? '아래 선수를 누르면 선택한 자리에 들어가요.' : '경기 중 교체로 투입할 수 있는 선수는 이 명단의 9명뿐이에요. 오른쪽 버튼으로 넣고 빼세요.'}${t.bench.some((id) => G.players[id] && G.players[id].pos === 'GK') ? '' : ' <b style="color:var(--loss)">교체 골키퍼가 없어요.</b>'}</p>
      <div class="list">${others.filter((p) => benchSet.has(p.id)).sort((a, b) => t.bench.indexOf(a.id) - t.bench.indexOf(b.id)).map((p) => benchRow(p, role, true)).join('') || '<div class="empty">교체 명단이 비어 있어요.</div>'}</div>
      <div class="eyebrow" style="margin-top:4px">명단 외 ${others.filter((p) => !benchSet.has(p.id)).length}명</div>
      <div class="list">${others.filter((p) => !benchSet.has(p.id)).map((p) => benchRow(p, role, false)).join('') || '<div class="empty">모든 선수가 명단에 있어요.</div>'}</div>
    </section>`;
    if (part === 'pitch') return pitchHtml + cands;
    if (part === 'roles') return rolesHtml;
    if (part === 'bench') return benchHtml;
    return pitchHtml + rolesHtml + benchHtml;
  }
  function benchRow(p, role, onBench) {
    const out = p.inj > 0 || p.sus > 0;
    const fitO = role ? W.roleOvr(p, role) : null;
    return `<div class="li ${out ? '' : 'tap'}" ${out ? '' : `data-act="pickp" data-v="${p.id}"`} style="${out ? 'opacity:.55' : ''}">
      ${avatar(p, 36)}<div class="grow"><div class="name">${esc(p.name)}</div><div class="sub">${posTag(p)} 컨디션 ${p.cond}% ${statusTags(p)}</div></div>
      ${fitO != null ? `<span class="muted num" style="font-size:14px;font-weight:700">${role} ${fitO}</span>` : ''}${ovrBadge(p.ovr)}
      ${out ? '' : `<button class="bench-btn ${onBench ? 'on' : ''}" data-act="benchtoggle" data-v="${p.id}" aria-label="${onBench ? '교체 명단에서 빼기' : '교체 명단에 넣기'}">${onBench ? '−' : '+'}</button>`}</div>`;
  }

  // 선수 역할·임무 (FM식): 행을 누르면 그 자리에서 고를 수 있는 역할이 펼쳐진다
  function rolesCard(entries, scope) {
    const open = UI.roleOpen;
    return `<section class="card stack roles-card">
      <div class="row"><h2 class="grow h2" style="margin:0">역할과 임무</h2>${scope === 'team' ? '<button class="btn sm ghost" data-act="autoroles">자동 배정</button>' : ''}</div>
      <p class="muted" style="margin:0;font-size:12px">역할은 공을 가졌을 때와 잃었을 때의 움직임, 패스·슈팅·드리블 판단을 바꿔요. 임무는 공격 가담 정도예요.</p>
      <div class="list">${entries.map((e) => {
        const def = D.ROLES[e.r[0]];
        const isOpen = open === scope + e.i;
        let body = '';
        if (isOpen) {
          const dm = e.p ? W.detailMap(e.p) : null;
          body = `<div class="role-pick">
            <div class="role-opts">${D.rolesFor(e.pos).map((k) => {
              const sc = dm ? W.roleScore(e.p, k, dm) : 0;
              return `<button class="role-opt ${k === e.r[0] ? 'on' : ''}" data-act="rolepick" data-scope="${scope}" data-i="${e.i}" data-v="${k}"><b>${D.ROLES[k].n}</b><span class="stars">${dm ? stars5(sc) : ''}</span></button>`;
            }).join('')}</div>
            <div class="muted" style="font-size:12.5px">${esc(def.desc)}</div>
            <div class="seg">${[0, 1, 2].map((d) => `<button ${def.d.includes(d) ? '' : 'disabled'} class="${e.r[1] === d ? 'on' : ''}" data-act="roleduty" data-scope="${scope}" data-i="${e.i}" data-v="${d}">${D.DUTY[d]}</button>`).join('')}</div>
            ${e.p ? `<div class="keyattrs">${def.keyA.map((k) => { const v = W.detailMap(e.p)[k]; return v != null ? `<span>${k} <b class="av a${attrTier(v)}">${v}</b></span>` : ''; }).join('')}</div>` : ''}
          </div>`;
        }
        return `<div class="role-row ${isOpen ? 'open' : ''}"><button class="li tap" data-act="roleopen" data-v="${scope + e.i}" style="width:100%;background:none;border:0;text-align:left">
          <span class="pos ${D.ROLE_GROUP[e.pos]}">${e.pos}</span>
          <div class="grow"><div class="name">${e.p ? esc(e.p.name) : '비어 있음'}</div><div class="sub">${def.n} · ${D.DUTY[e.r[1]]}</div></div>
          ${e.p ? `<span class="stars" title="역할 적합도">${stars5(W.roleScore(e.p, e.r[0]))}</span>` : ''}<span class="muted">${isOpen ? '−' : '›'}</span></button>${body}</div>`;
      }).join('')}</div></section>`;
  }
  function stars5(score) {
    const n = clamp(Math.round((score - 7) / 2.2), 0, 5);
    return '★'.repeat(n) + '<i>' + '★'.repeat(5 - n) + '</i>';
  }
  function attrTier(v) { return v >= 16 ? 4 : v >= 11 ? 3 : v >= 6 ? 2 : 1; }

  // 풋볼 매니저식 전술 화면: 프리셋 + 공격 시 / 수비 시 / 전환 팀 지시
  function tacticsPanel(tac, scope) {
    D.normTactics(tac);
    const cur = D.TACTIC_PRESETS.find((p) => Object.keys(p[3]).every((k) => p[3][k] === tac[k]));
    const open = UI.tacOpen || 'ip';
    return `<section class="card stack tac-panel">
      <h2 class="h2" style="margin:0">전술</h2>
      <div class="eyebrow">전술 스타일</div>
      <div class="tac-presets">${D.TACTIC_PRESETS.map(([k, n, d]) => `<button class="tac-preset ${cur && cur[0] === k ? 'on' : ''}" data-act="tacpreset" data-scope="${scope}" data-v="${k}"><b>${n}</b><span>${d}</span></button>`).join('')}</div>
      ${cur ? '' : '<div class="muted" style="font-size:12px">팀 지시를 직접 바꾼 사용자 전술이에요.</div>'}
      ${D.TACTIC_GROUPS.map((g) => `<div class="tac-group ${open === g.key ? 'open' : ''}">
        <button class="tac-head" data-act="tacgroup" data-v="${g.key}"><b>${g.title}</b><span class="muted">${g.items.map(([k, , labels]) => labels[tac[k]]).slice(0, 3).join(' · ')}…</span><i>${open === g.key ? '−' : '+'}</i></button>
        ${open === g.key ? `<div class="stack" style="gap:12px;padding-top:8px">${g.items.map(([k, title, labels, desc]) => `<div class="stack" style="gap:5px">
          <div class="row"><span class="eyebrow grow">${title}</span><span class="muted" style="font-size:11px">${desc}</span></div>
          <div class="seg">${labels.map((l, i) => `<button data-act="tac" data-scope="${scope}" data-k="${k}" data-v="${i}" class="${tac[k] === i ? 'on' : ''}">${l}</button>`).join('')}</div></div>`).join('')}</div>` : ''}
      </div>`).join('')}
      <p class="muted" style="font-size:12px;margin:0">${tacticHint(tac)}</p></section>`;
  }
  function tacticHint(t) {
    const out = [];
    if (t.press === 2 || t.onLoss === 2) out.push('강한 압박과 카운터 프레스는 공을 빨리 되찾지만 후반에 체력이 크게 떨어져요.');
    if (t.line === 2 && t.block < 2) out.push('높은 수비 라인은 뒷공간을 노리는 침투 패스에 약해요. 높은 블록과 함께 쓰는 편이 좋아요.');
    if (t.block === 0) out.push('낮은 블록은 박스 앞을 촘촘하게 막지만 상대에게 공을 내줘요.');
    if (t.passing <= 1) out.push('짧은 패스는 공을 덜 잃지만 전진이 느려요.');
    if (t.passing >= 3) out.push('직선적인 패스는 빠르게 전진하지만 공을 자주 잃어요.');
    if (t.onWin === 2) out.push('공을 뺏은 직후 몇 초 동안 앞으로 빠르게 찌르고 드리블로 치고 나가요.');
    if (t.finalThird === 3) out.push('크로스 위주일 때는 측면 선수가 넓게 서고 스트라이커가 박스로 쇄도해요.');
    return out.slice(0, 2).join(' ') || '균형 잡힌 기본 전술이에요.';
  }

  function trainingView() {
    const G = UI.G, t = S.userTeam(G);
    const tr = G.training;
    const focus = [['bal', '균형'], ['tac', '전술'], ['atk', '공격'], ['def', '수비'], ['tec', '기술'], ['phy', '체력']];
    const young = t.squad.map((id) => G.players[id]).filter((p) => p.age <= 23).sort((a, b) => (b.pot - b.ovr) - (a.pot - a.ovr));
    return `<section class="card stack">
      <h2 style="margin:0">주간 훈련</h2>
      <div class="stack" style="gap:6px"><span class="eyebrow">훈련 초점</span><div class="seg">${focus.map(([k, l]) => `<button data-act="tfocus" data-v="${k}" class="${tr.focus === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div class="stack" style="gap:6px"><span class="eyebrow">훈련 강도</span><div class="seg">${['가볍게', '보통', '강하게'].map((l, i) => `<button data-act="tint" data-v="${i}" class="${tr.intensity === i ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <p class="muted" style="margin:0;font-size:12.5px">${['회복이 빠르지만 성장이 느려요.', '성장과 회복의 균형을 맞춰요.', '성장이 40% 빨라지지만 컨디션 회복이 느리고 부상 위험이 있어요.'][tr.intensity]} 훈련장 ${t.facilities.train}단계 효과로 성장 속도 +${(t.facilities.train - 1) * 12}%.${tr.focus === 'tac' ? ' 전술 초점: 포메이션 숙련도가 두 배 이상 빨리 올라요.' : ''}</p>
    </section>
    <section class="card"><h2>유망주 <small>23세 이하 ${young.length}명</small></h2><div class="list">
      ${young.map((p) => `<div class="li tap" data-act="player" data-v="${p.id}">${avatar(p, 40)}<div class="grow"><div class="name">${esc(p.name)} <span class="muted" style="font-weight:600">${p.age}세</span></div>
        <div class="sub">${posTag(p)} 잠재력 <span class="stars">${stars(p)}</span> · 출전 ${p.season.apps}경기</div>
        <div class="bar" style="margin-top:5px"><i style="width:${Math.round(p.ovr / Math.max(p.pot, 1) * 100)}%;background:var(--brand)"></i></div></div>${ovrBadge(p.ovr)}</div>`).join('') || '<div class="empty">23세 이하 선수가 없어요.</div>'}
    </div></section>`;
  }

  // ── 선수 상세 ─────────────────────────────────────────────
  function openPlayer(pid, state) {
    const G = UI.G;
    const p = G.players[pid];
    if (!p) return;
    if (state) UI.draft = state;
    else if (!UI.draft || UI.draft.pid !== pid) UI.draft = { pid };
    const d = UI.draft;
    const t = teamOf(p);
    const mine = p.teamId === G.user.teamId;
    const st = p.season;
    const avg = st.apps ? (st.rsum / st.apps).toFixed(2) : '-';
    const ptab = d.tab || 'detail';
    let attrs;
    if (ptab === 'core') {
      attrs = `<div class="attrs">${(p.pos === 'GK' ? ['gk', 'pas', 'phy', 'pac'] : ['pac', 'sho', 'pas', 'dri', 'def', 'phy']).map((k) =>
        `<div class="attr"><span class="muted" style="font-weight:600">${W.ATTR_KO[k]}</span><div class="bar"><i style="width:${p.attr[k]}%;background:${p.attr[k] >= 78 ? 'var(--win)' : p.attr[k] >= 62 ? 'var(--draw)' : 'var(--loss)'}"></i></div><span class="num">${p.attr[k]}</span></div>`).join('')}</div>`;
    } else if (ptab === 'role') {
      const dm = W.detailMap(p);
      const list = Object.keys(D.ROLES).filter((k) => D.ROLES[k].pos.includes(p.role) || (D.ROLES[k].pos.some((x) => D.fit(x, p) >= 0.93))).map((k) => [k, W.roleScore(p, k, dm)]).sort((a, b) => b[1] - a[1]).slice(0, 6);
      attrs = `<div class="list">${list.map(([k, v]) => `<div class="li"><div class="grow"><div class="name">${D.ROLES[k].n} <span class="muted num" style="font-size:12px">${D.ROLE_AB[k]}</span></div><div class="sub">${esc(D.ROLES[k].desc)}</div></div><span class="stars">${stars5(v)}</span></div>`).join('')}</div>`;
    } else {
      // 세부 능력치 1~20: 지금 맡은 역할의 핵심 능력치는 강조
      const ut = S.userTeam(G);
      const idx = mine ? ut.lineup.indexOf(p.id) : -1;
      const rk = idx >= 0 ? W.validateRoles(ut)[idx][0] : null;
      const key = new Set(rk ? D.ROLES[rk].keyA : []);
      attrs = `${rk ? `<div class="muted" style="font-size:12px">강조 표시는 <b style="color:var(--ink)">${D.ROLES[rk].n}</b> 역할의 핵심 능력치예요.</div>` : ''}<div class="fm-attrs">${W.details(p).map((g) => `<div class="col"><div class="eyebrow">${g.title}</div>${g.rows.map(([n, v]) => `<div class="ar ${key.has(n) ? 'key' : ''}"><span>${n}</span><b class="av a${attrTier(v)}">${v}</b></div>`).join('')}</div>`).join('')}</div>`;
    }
    attrs = `<div class="seg">${[['detail', '능력치'], ['core', '요약'], ['role', '역할 적합도']].map(([k, l]) => `<button data-act="ptab" data-v="${k}" class="${ptab === k ? 'on' : ''}">${l}</button>`).join('')}</div>${attrs}`;
    const shortlisted = (G.short || []).includes(pid);
    let actions = '';
    if (mine) {
      if (d.mode === 'renew') {
        actions = `<div class="card stack" style="background:var(--surface-2);box-shadow:none"><b>재계약 협상</b><div class="muted" style="font-size:13px">요구 주급 <b style="color:var(--ink)">${money(S.renewDemand(G, p))}</b> (현재 ${money(p.wage)})</div>
          <div class="seg">${[1, 2, 3, 4, 5].map((y) => `<button data-act="renew" data-v="${y}">${y}년</button>`).join('')}</div>
          <button class="btn sm ghost" data-act="pmode" data-v="">취소</button></div>`;
      } else if (d.mode === 'release') {
        actions = `<div class="card stack" style="background:var(--surface-2);box-shadow:none"><b>${esc(p.name)} 방출</b><div class="muted" style="font-size:13px">위약금 ${money(S.releaseCost(p))}를 내고 계약을 해지합니다. 되돌릴 수 없어요.</div>
          <div class="row"><button class="btn sm ghost grow" data-act="pmode" data-v="">취소</button><button class="btn sm danger grow" data-act="release">방출 확정</button></div></div>`;
      } else {
        actions = `<div class="grid2"><button class="btn" data-act="pmode" data-v="renew">재계약</button><button class="btn" data-act="list">${p.listed ? '이적 리스트 해제' : '이적 리스트 등록'}</button></div>
          <button class="btn ghost" data-act="pmode" data-v="release">방출</button>`;
      }
    } else {
      actions = bidPanel(p, d);
    }
    const c1 = t ? t.c1 : '#3a4656', c2 = t ? t.c2 : '#9aa6b6';
    const ko = /[가-힣]/.test(p.name);
    const html = `
      <div class="pcard" style="--c1:${c1};--c2:${c2};--cink:${KM.Render.contrast(c1)}">
        <div class="info">
          <div class="row" style="gap:8px">${t ? logo(t, 26) : ''}<span style="font-size:12.5px;font-weight:700;opacity:.9">${t ? esc(t.name) : '자유계약'}${p.num ? ' · #' + p.num : ''}</span></div>
          <div class="nm ${ko ? 'ko' : ''}">${esc(p.name)}</div>
          <div class="meta"><span>${esc(D.ROLE_NAME[p.role] || p.role)}</span><span>${p.age}세</span>${p.nat ? `<span>${esc(p.nat)}</span>` : ''}${p.h ? `<span>${p.h}cm</span>` : ''}</div>
          <div class="big"><div><small>OVR</small><span class="o">${p.ovr}</span></div><div style="padding-bottom:6px"><small>잠재력</small><span class="stars" style="color:#ffd23a">${stars(p)}</span></div></div>
        </div>
        <div class="shot">${bigPhoto(p)}</div>
      </div>
      ${p.awards && p.awards.length ? `<div class="awards">${awardChips(p.awards)}</div>` : ''}
      <div class="row wrap" style="gap:6px">${statusTags(p)}${!mine ? `<button class="chip ${shortlisted ? 'on' : ''}" data-act="short" data-v="${pid}">${shortlisted ? '★ 관심 선수' : '☆ 관심 등록'}</button>` : ''}</div>
      <div class="kv"><div><small>시장 가치</small><b>${money(p.value)}</b></div><div><small>주급</small><b>${money(p.wage)}</b></div><div><small>계약</small><b>${p.teamId != null ? p.contract + '년' : '-'}</b></div></div>
      ${attrs}
      <div class="kv"><div><small>컨디션</small><b style="color:${condColor(p.cond)}">${p.cond}%</b></div><div><small>사기</small><b>${moraleText(p.morale)}</b></div><div><small>폼</small><b>${p.ratings.length ? p.form.toFixed(1) : '-'}</b></div></div>
      <div class="kv"><div><small>시즌 출전</small><b>${st.apps}</b></div><div><small>골 / 도움</small><b>${st.goals} / ${st.assists}</b></div><div><small>평균 평점</small><b>${avg}</b></div></div>
      <div class="muted" style="font-size:12px">통산 ${p.career.apps}경기 ${p.career.goals}골 ${p.career.assists}도움${p.gen ? ' · 가상 선수(유스/자유계약)' : ''}</div>
      ${p.last ? `<div class="real-st"><span class="eyebrow">실제 ${KM.REAL.statsSeason ? `${KM.REAL.statsSeason}/${String(KM.REAL.statsSeason + 1).slice(2)}` : '지난'} 시즌 기록 (전 대회)</span><div><b>${p.last.apps}</b>경기 <b>${p.last.g}</b>골 <b>${p.last.a}</b>도움 · ${p.last.min.toLocaleString()}분${p.last.y ? ` · 경고 ${p.last.y}` : ''}${p.last.r ? ` · 퇴장 ${p.last.r}` : ''}</div>${p.foot ? `<small>주발: ${{ right: '오른발', left: '왼발', both: '양발' }[p.foot] || p.foot}</small>` : ''}</div>` : ''}
      ${actions}`;
    const same = $('.sheet-bg') && $('.sheet-bg').dataset.pid === String(pid);
    sheet(html, () => { UI.draft = null; }, { update: same });
    $('.sheet-bg').dataset.pid = String(pid);
  }

  // 수상 내역: 같은 상은 묶어서 ×n
  function awardChips(list) {
    const cnt = new Map();
    for (const a of list) { const k = a.replace(/^\d{4}[·\s]?(\d+월\s)?/, '').replace(/^\d+월\s/, ''); const e = cnt.get(k) || { n: 0, last: a }; e.n++; e.last = a; cnt.set(k, e); }
    const icon = (k) => (/발롱도르 1위/.test(k) ? '🏆' : /발롱도르|골든/.test(k) ? '🥇' : /올해의 팀/.test(k) ? '⭐' : '🏅');
    return [...cnt.entries()].reverse().map(([k, e]) => `<span class="award">${icon(k)} ${esc(k)}${e.n > 1 ? ` ×${e.n}` : ''}</span>`).join('');
  }
  function bidPanel(p, d) {
    const G = UI.G, ut = S.userTeam(G);
    if (d.stage === 'contract') {
      return `<div class="card stack" style="background:var(--surface-2);box-shadow:none"><b>${esc(p.name)} 연봉 협상</b>
        <div class="muted" style="font-size:13px">${d.fee ? `이적료 ${money(d.fee)} 합의 · ` : ''}요구 주급 <b style="color:var(--ink)">${money(d.wage)}</b></div>
        <div class="muted" style="font-size:12px">주급 합계 ${money(W.wageBill(G, ut))} → ${money(W.wageBill(G, ut) + d.wage)}</div>
        <div class="seg">${[1, 2, 3, 4, 5].map((y) => `<button data-act="sign" data-v="${y}">${y}년</button>`).join('')}</div>
        <button class="btn sm ghost" data-act="bidcancel">협상 취소</button></div>`;
    }
    if (p.teamId == null) return `<button class="btn primary" data-act="freesign">자유계약 협상 (요구 주급 ${money(S.wageDemand(G, p, ut))})</button>`;
    if (!S.windowOpen(G)) return `<div class="muted" style="font-size:13px;text-align:center">이적시장이 닫혀 있어요. 시즌 첫 4주와 시즌 중반 4주 동안 열려요.</div>`;
    const amt = d.amount || Math.round(p.value / 25) * 25;
    return `<div class="card stack" style="background:var(--surface-2);box-shadow:none">
      <div class="row"><b class="grow">이적 제안</b><span class="muted" style="font-size:12px">잔고 ${money(ut.balance)}</span></div>
      <div class="row"><button class="btn sm" data-act="amt" data-v="-1" aria-label="낮추기">−</button><div class="grow num" style="text-align:center;font-size:28px;font-weight:700">${money(amt)}</div><button class="btn sm" data-act="amt" data-v="1" aria-label="올리기">+</button></div>
      <div class="muted" style="font-size:12px;text-align:center">시장 가치 ${money(p.value)} · 누를 때마다 5%씩 조정</div>
      ${d.msg ? `<div style="font-size:13px;font-weight:700;color:${d.ok ? 'var(--win)' : 'var(--loss)'}">${esc(d.msg)}</div>` : ''}
      <button class="btn primary" data-act="bid">제안하기</button></div>`;
  }

  // ── 리그 ───────────────────────────────────────────────────
  function leagueView() {
    const G = UI.G, sub = UI.sub.league;
    if (UI.filter.league == null) UI.filter.league = S.userTeam(G).league;
    const li = UI.filter.league;
    const chips = `<div class="chips">${G.leagues.map((l, i) => `<button class="chip ${li === i ? 'on' : ''}" data-act="flg" data-v="${i}">${esc(l.name)}</button>`).join('')}</div>`;
    let body = '';
    if (sub === 'table') {
      const euro = G.leagues[li].code !== 'RSK1';
      body = chips + `<section class="card">${tableHtml(G, li, S.table(G, li), 0)}
        <p class="muted" style="font-size:12px;margin:10px 0 0"><span style="color:var(--brand)">■</span> ${euro ? '챔피언스리그권' : 'ACL권'} · <span style="color:var(--loss)">■</span> 강등권 (여기서 마치면 구단주 신뢰도가 크게 떨어져요)</p></section>`;
    } else if (sub === 'fixtures') body = chips + fixturesView(li);
    else if (sub === 'cup') body = cupView();
    else if (sub === 'euro') body = euroView();
    else body = chips + statsView(li);
    return seg('league', [['table', '순위'], ['fixtures', '일정·결과'], ['cup', '컵'], ['euro', '유럽'], ['stats', '기록']], sub) + body;
  }

  function fixturesView(li) {
    const G = UI.G, t = S.userTeam(G);
    const rounds = G.leagues[li].fixtures;
    let lastDone = -1;
    rounds.forEach((r, i) => { if (r.length && r[0].hs != null) lastDone = i; });
    const cur = UI.filter.round != null && UI.filter.round < rounds.length ? UI.filter.round : clamp(lastDone, 0, rounds.length - 1);
    let mineHtml = '';
    if (li === t.league) {
      const mine = rounds.map((r, i) => ({ i, m: r.find((m) => m.h === t.id || m.a === t.id) })).filter((x) => x.m);
      mineHtml = `<section class="card"><h2>우리 일정</h2><div class="list">
      ${mine.map(({ i, m }) => {
        const home = m.h === t.id; const opp = S.team(G, home ? m.a : m.h);
        let res = '<span class="muted" style="font-size:12px">예정</span>';
        if (m.hs != null) { const gf = home ? m.hs : m.as, ga = home ? m.as : m.hs; const r = gf > ga ? 'W' : gf < ga ? 'L' : 'D'; res = `<span class="form"><i class="${r}">${r === 'W' ? '승' : r === 'D' ? '무' : '패'}</i></span> <b class="num" style="font-size:16px">${gf}-${ga}</b>`; }
        return `<div class="li"><span class="muted num" style="width:30px;font-weight:700">${i + 1}R</span>${logo(opp, 24)}<span class="grow name" style="font-weight:600">${home ? '' : '@ '}${esc(opp.name)}</span>${res}</div>`;
      }).join('')}</div></section>`;
    }
    return mineHtml + `<section class="card"><div class="row" style="margin-bottom:8px"><h2 class="grow" style="margin:0">라운드 결과</h2>
        <select class="sel" data-act="fround" aria-label="라운드">${rounds.map((r, i) => `<option value="${i}" ${i === cur ? 'selected' : ''}>${i + 1}라운드</option>`).join('')}</select></div>
        <div class="list">${rounds[cur].map((m) => matchLine(G, m)).join('')}</div></section>`;
  }
  function matchLine(G, m) {
    if (m.h == null || m.a == null) {
      const t = S.team(G, m.h == null ? m.a : m.h);
      return `<div class="li"><span class="grow row" style="justify-content:center;gap:6px">${logo(t, 20)} ${esc(t.name)} <span class="muted">부전승</span></span></div>`;
    }
    const h = S.team(G, m.h), a = S.team(G, m.a), uid = G.user.teamId;
    const me = m.h === uid || m.a === uid;
    return `<div class="li" style="${me ? 'background:color-mix(in srgb,var(--accent) 22%,transparent);border-radius:8px' : ''}"><span class="grow" style="text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600">${esc(h.name)}</span>${logo(h, 22)}
      <b class="num" style="width:54px;text-align:center;font-size:17px">${m.hs != null ? m.hs + ' - ' + m.as : 'vs'}</b>${logo(a, 22)}<span class="grow" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600">${esc(a.name)}</span></div>
      ${m.agg || m.pens ? `<div class="muted" style="font-size:11.5px;text-align:center;margin-top:-4px;padding-bottom:6px">${m.agg ? `합계 ${m.agg[0]}-${m.agg[1]}` : ''}${m.agg && m.pens ? ' · ' : ''}${m.pens ? `승부차기 ${m.pens[0]}-${m.pens[1]}` : ''}</div>` : ''}`;
  }
  // ── 경기 분석 (데이터 허브) ────────────────────────────────
  // an: 엔진 기록 요약 (슈팅·패스 연결·위치 표본), us: 우리 팀 쪽(0/1). 우리 팀은 항상 오른쪽으로 공격하게 그린다
  const AN_TABS = [['shots', '슈팅'], ['pass', '패스 연결'], ['heat', '히트맵'], ['players', '선수 기록'], ['season', '시즌 추세']];
  function openAnalysis(an, us, title, onClose) {
    UI.anState = { an, us, onClose: onClose || null, title: title || '경기 분석', tab: (UI.anState && UI.anState.an === an && UI.anState.tab) || 'shots', side: us, pid: null, cap: '' };
    renderAnalysis();
  }
  function renderAnalysis() {
    const st = UI.anState; if (!st) return;
    const G = UI.G, an = st.an, us = st.us, them = 1 - us;
    let body = '';
    if (st.tab === 'shots') body = anShots(an, us);
    else if (st.tab === 'pass') body = anPass(an, st.side, us);
    else if (st.tab === 'heat') body = anHeat(an, us, st.pid);
    else if (st.tab === 'players') body = anPlayers(an, us);
    else body = anSeason(G);
    const S0 = an.sides[us].st, S1 = an.sides[them].st;
    const same = !!$('.sheet-bg') && !!$('.sheet .an');
    sheet(`<div class="an"><span class="eyebrow">${esc(st.title)}</span>
      <div class="an-sum">
        <div><small>xG</small><b class="num"><i class="sw us"></i>${S0.xg.toFixed(2)}<span>:</span>${S1.xg.toFixed(2)}<i class="sw them"></i></b></div>
        <div><small>슈팅 (유효)</small><b class="num">${S0.shots} (${S0.sot})<span>:</span>${S1.shots} (${S1.sot})</b></div>
        <div><small>점유율</small><b class="num">${an.sides[us].poss}%<span>:</span>${an.sides[them].poss}%</b></div>
      </div>
      <div class="seg an-tabs">${AN_TABS.map(([k, l]) => `<button data-act="antab" data-v="${k}" class="${st.tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      ${body}
      <div class="an-cap" id="an-cap" aria-live="polite">${st.cap || '그래프의 점·선·칸을 누르면 자세한 내용이 보여요.'}</div>
      <button class="btn primary" data-act="closesheet">닫기</button></div>`, st.onClose, { update: same });
  }
  function anPitch(inner, opts) {
    opts = opts || {};
    const half = opts.half;
    const vb = half ? '52.5 0 52.5 68' : '0 0 105 68';
    return `<svg class="an-pitch" viewBox="${vb}" role="img" aria-label="${esc(opts.label || '경기장')}">
      <rect x="0" y="0" width="105" height="68" class="pf"/>
      <g class="pl"><rect x="0.3" y="0.3" width="104.4" height="67.4"/><line x1="52.5" y1="0" x2="52.5" y2="68"/><circle cx="52.5" cy="34" r="9.15"/>
      <rect x="0.3" y="13.84" width="16.5" height="40.32"/><rect x="88.2" y="13.84" width="16.5" height="40.32"/><rect x="0.3" y="24.84" width="5.5" height="18.32"/><rect x="99.2" y="24.84" width="5.5" height="18.32"/></g>
      ${opts.arrow ? '<g class="dir"><line x1="40" y1="64.5" x2="65" y2="64.5"/><path d="M65 64.5l-2.2-1.6v3.2z"/></g>' : ''}
      ${inner}</svg>`;
  }
  function pname(id) { const p = UI.G.players[id]; return p ? p.name : '선수'; }
  const OUTCOME = { goal: '골', save: '선방에 막힘', wide: '빗나감', block: '수비 맞고 굴절' };
  function anShots(an, us) {
    // 우리 슈팅은 오른쪽 골대, 상대 슈팅은 왼쪽 골대 쪽에 그린다
    const dots = an.shots.slice().sort((a, b) => (a[4] === 'goal') - (b[4] === 'goal') || b[3] - a[3]).map(([s, x, y, xg, o, min, pid]) => {
      const mine = s === us;
      const cx = mine ? x : 105 - x, cy = mine ? y : 68 - y;
      const r = Math.max(1.3, Math.sqrt(xg) * 6.5);
      const cls = `${mine ? 'us' : 'them'} ${o === 'goal' ? 'goal' : o === 'save' ? 'on' : 'off'}`;
      const tip = `${min}' ${pname(pid)} · xG ${xg.toFixed(2)} · ${OUTCOME[o] || o}`;
      // 골은 바깥 고리를 하나 더 그려 모양으로도 구분
      return `${o === 'goal' ? `<circle class="ring" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(r + 0.9).toFixed(2)}"/>` : ''}<circle class="shot ${cls}" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(2)}" data-act="antip" data-v="${esc(tip)}"><title>${esc(tip)}</title></circle>`;
    }).join('');
    const mineShots = an.shots.filter((x) => x[0] === us);
    const big = mineShots.filter((x) => x[3] >= 0.2).length, bigA = an.shots.filter((x) => x[0] !== us && x[3] >= 0.2).length;
    const best = mineShots.slice().sort((a, b) => b[3] - a[3])[0];
    return `<div class="an-legend"><span><i class="sw us"></i>우리 → 오른쪽 골대</span><span><i class="sw them"></i>상대 → 왼쪽 골대</span></div>
      ${anPitch(dots, { label: '슈팅 지도' })}
      <div class="an-legend sm"><span><i class="mk goal"></i>골</span><span><i class="mk on"></i>유효 슈팅</span><span><i class="mk off"></i>빗나감·막힘</span><span>원 크기 = xG</span></div>
      <div class="kv"><div><small>결정적 기회</small><b>${big} : ${bigA}</b></div><div><small>슈팅당 xG</small><b>${mineShots.length ? (mineShots.reduce((a, x) => a + x[3], 0) / mineShots.length).toFixed(2) : '-'}</b></div><div><small>최고 기회</small><b style="font-size:13px">${best ? `${esc(shortPlayerName(pname(best[6])))} ${best[3].toFixed(2)}` : '-'}</b></div></div>`;
  }
  function anPass(an, side, us) {
    const sd = an.sides[side];
    const flip = side !== us; // 상대 팀도 왼쪽→오른쪽 공격으로 보여준다 (자기 기준)
    void flip;
    const pos = {}; for (const p of sd.pl) pos[p.id] = p;
    const links = sd.links.filter(([a, b]) => pos[a] && pos[b]);
    const max = Math.max(1, ...links.map((l) => l[2]));
    const inv = {}; for (const [a, b, v] of links) { inv[a] = (inv[a] || 0) + v; inv[b] = (inv[b] || 0) + v; }
    const maxInv = Math.max(1, ...Object.values(inv));
    const cls = side === us ? 'us' : 'them';
    // 출전 시간이 긴 선수 위주 (교체로 짧게 뛴 선수는 흐리게)
    const edges = links.filter((l) => l[2] >= 3).sort((a, b) => a[2] - b[2]).map(([a, b, v]) => {
      const A = pos[a], B = pos[b];
      const tip = `${pname(a)} → ${pname(b)} 패스 ${v}회`;
      return `<line class="edge ${cls}" x1="${A.ax}" y1="${A.ay}" x2="${B.ax}" y2="${B.ay}" stroke-width="${(0.35 + 1.6 * v / max).toFixed(2)}" stroke-opacity="${(0.25 + 0.6 * v / max).toFixed(2)}" data-act="antip" data-v="${esc(tip)}"><title>${esc(tip)}</title></line>`;
    }).join('');
    const nodes = sd.pl.map((p) => {
      const r = 1.6 + 2.2 * Math.sqrt((inv[p.id] || 0) / maxInv);
      const pl = UI.G.players[p.id];
      const tip = `${pname(p.id)} (${p.role}) · 연결 패스 ${inv[p.id] || 0}회 · 평점 ${p.rating != null ? p.rating.toFixed(1) : '-'}`;
      return `<g class="node ${cls} ${p.mins < 30 ? 'dim' : ''}" data-act="antip" data-v="${esc(tip)}"><circle cx="${p.ax}" cy="${p.ay}" r="${r.toFixed(2)}"/><text x="${p.ax}" y="${(p.ay + 0.9).toFixed(1)}">${pl ? pl.num || '' : ''}</text><title>${esc(tip)}</title></g>`;
    }).join('');
    const top = links.slice().sort((a, b) => b[2] - a[2]).slice(0, 3);
    return `<div class="seg sm">${[[us, '우리 팀'], [1 - us, '상대 팀']].map(([v, l]) => `<button data-act="anside" data-v="${v}" class="${side === v ? 'on' : ''}">${l}</button>`).join('')}</div>
      ${anPitch(edges + nodes, { arrow: true, label: '패스 연결망' })}
      <p class="muted" style="margin:0;font-size:12px">점은 선수의 평균 위치(번호 = 등번호), 크기는 패스를 주고받은 횟수, 선 굵기는 두 선수 사이 패스 수예요. 3회 이상만 그렸어요. 화살표 방향으로 공격해요.</p>
      ${top.length ? `<div class="list">${top.map(([a, b, v]) => `<div class="li"><span class="grow"><b>${esc(shortPlayerName(pname(a)))}</b> → <b>${esc(shortPlayerName(pname(b)))}</b></span><span class="num" style="font-weight:800">${v}회</span></div>`).join('')}</div>` : ''}`;
  }
  function anHeat(an, us, pid) {
    const sd = an.sides[us];
    const HX = KM.Engine.HX, HY = KM.Engine.HY;
    const sel = pid != null ? sd.pl.find((p) => p.id === pid) : null;
    const grid = new Array(HX * HY).fill(0);
    for (const p of sel ? [sel] : sd.pl.filter((p) => p.role !== 'GK')) p.heat.forEach((v, i) => { grid[i] += v; });
    const max = Math.max(1, ...grid), tot = grid.reduce((a, b) => a + b, 0) || 1;
    const cw = 105 / HX, ch = 68 / HY;
    const cells = grid.map((v, i) => {
      const x = (i % HX) * cw, y = Math.floor(i / HX) * ch;
      const pct = Math.round(v / tot * 1000) / 10;
      return `<rect class="hc" x="${(x + 0.25).toFixed(2)}" y="${(y + 0.25).toFixed(2)}" width="${(cw - 0.5).toFixed(2)}" height="${(ch - 0.5).toFixed(2)}" rx="0.8" fill-opacity="${(0.04 + 0.86 * Math.pow(v / max, 0.8)).toFixed(2)}" data-act="antip" data-v="이 칸에 머문 시간 ${pct}%"><title>${pct}%</title></rect>`;
    }).join('');
    const dot = sel ? `<circle class="avg" cx="${sel.ax}" cy="${sel.ay}" r="1.6"/>` : '';
    const players = sd.pl.filter((p) => p.mins >= 1).sort((a, b) => ['GK', 'CB', 'LB', 'RB', 'DM', 'CM', 'LM', 'RM', 'AM', 'LW', 'RW', 'ST'].indexOf(a.role) - ['GK', 'CB', 'LB', 'RB', 'DM', 'CM', 'LM', 'RM', 'AM', 'LW', 'RW', 'ST'].indexOf(b.role));
    return `<div class="chips">${[`<button class="chip ${sel ? '' : 'on'}" data-act="anpid" data-v="">팀 전체</button>`].concat(players.map((p) => `<button class="chip ${sel && sel.id === p.id ? 'on' : ''}" data-act="anpid" data-v="${p.id}">${esc(shortPlayerName(pname(p.id)))}</button>`)).join('')}</div>
      ${anPitch(cells + dot, { arrow: true, label: '히트맵' })}
      <div class="an-legend sm"><span>적게</span><i class="ramp"></i><span>많이</span><span>${sel ? `· 흰 점 = 평균 위치 · ${sel.mins}분 출전 · 공 터치 ${sel.t || 0}회` : '· 골키퍼 제외 팀 전체'}</span></div>`;
  }
  function anPlayers(an, us) {
    const sd = an.sides[us];
    const rows = sd.pl.slice().sort((a, b) => (b.rating || 0) - (a.rating || 0));
    return `<div class="tbl-wrap"><table class="tbl an-tbl"><thead><tr><th style="text-align:left">선수</th><th>분</th><th>평점</th><th>골</th><th>도움</th><th>슈팅</th><th>키패스</th><th>패스</th><th>성공률</th><th>태클</th><th>가로채기</th><th>드리블</th></tr></thead><tbody>
      ${rows.map((p) => { const x = p.s || {}; return `<tr data-act="player" data-v="${p.id}" style="cursor:pointer"><td class="tn"><span class="row" style="gap:6px"><span class="pos ${D.ROLE_GROUP[p.role]}">${p.role}</span>${esc(shortPlayerName(pname(p.id)))}</span></td><td>${p.mins}</td><td><span class="rating ${ratingCls(p.rating || 6)}">${(p.rating || 6).toFixed(1)}</span></td><td>${x.g || 0}</td><td>${x.a || 0}</td><td>${x.sh || 0}</td><td>${x.key || 0}</td><td>${x.pass || 0}</td><td>${x.pass ? Math.round(x.ok / x.pass * 100) + '%' : '-'}</td><td>${x.tkl || 0}</td><td>${x.int || 0}</td><td>${x.drb || 0}</td></tr>`; }).join('')}</tbody></table></div>
      <p class="muted" style="margin:0;font-size:12px">옆으로 밀면 기록이 더 있어요. 줄을 누르면 선수 정보가 열려요.</p>`;
  }
  function anSeason(G) {
    const log = (G.xgLog || []).filter((x) => x.s === G.season);
    if (!log.length) return '<div class="empty">이번 시즌 직접 지휘한 경기 기록이 아직 없어요.</div>';
    const n = log.length, avg = (k) => log.reduce((a, x) => a + x[k], 0) / n;
    const gf = log.reduce((a, x) => a + x.gf, 0), xf = log.reduce((a, x) => a + x.xf, 0);
    const ga = log.reduce((a, x) => a + x.ga, 0), xa = log.reduce((a, x) => a + x.xa, 0);
    // 경기별 막대: 위 = 우리 xG, 아래 = 상대 xG (같은 축)
    const W0 = 320, H0 = 150, mid = 75, max = Math.max(1, ...log.map((x) => Math.max(x.xf, x.xa)));
    const bw = Math.min(16, (W0 - 20) / n - 2), step = (W0 - 20) / n;
    const bars = log.map((x, i) => {
      const cx = 10 + i * step + step / 2;
      const hf = (x.xf / max) * (mid - 14), ha = (x.xa / max) * (mid - 14);
      const res = x.gf > x.ga ? 'W' : x.gf < x.ga ? 'L' : 'D';
      const tip = `${x.label} vs ${G.teams[x.opp] ? G.teams[x.opp].name : ''} ${x.gf}-${x.ga} · xG ${x.xf.toFixed(2)} : ${x.xa.toFixed(2)}`;
      return `<g data-act="antip" data-v="${esc(tip)}"><title>${esc(tip)}</title><rect x="${cx - step / 2}" y="0" width="${step}" height="${H0}" fill="transparent"/>
        <rect class="xb us" x="${(cx - bw / 2).toFixed(1)}" y="${(mid - 1 - hf).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0.5, hf).toFixed(1)}" rx="${Math.min(3, bw / 3).toFixed(1)}"/>
        <rect class="xb them" x="${(cx - bw / 2).toFixed(1)}" y="${(mid + 1).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0.5, ha).toFixed(1)}" rx="${Math.min(3, bw / 3).toFixed(1)}"/>
        ${n <= 24 ? `<text class="res ${res}" x="${cx.toFixed(1)}" y="${H0 - 2}">${res === 'W' ? '승' : res === 'L' ? '패' : '무'}</text>` : ''}</g>`;
    }).join('');
    return `<div class="an-tiles">
        <div><small>경기당 xG</small><b class="num">${avg('xf').toFixed(2)}</b></div>
        <div><small>경기당 상대 xG</small><b class="num">${avg('xa').toFixed(2)}</b></div>
        <div><small>골 - xG</small><b class="num" style="color:${gf - xf >= 0 ? 'var(--win)' : 'var(--loss)'}">${gf - xf >= 0 ? '+' : ''}${(gf - xf).toFixed(1)}</b></div>
        <div><small>실점 - 상대 xG</small><b class="num" style="color:${ga - xa <= 0 ? 'var(--win)' : 'var(--loss)'}">${ga - xa >= 0 ? '+' : ''}${(ga - xa).toFixed(1)}</b></div>
      </div>
      <div class="an-legend"><span><i class="sw us"></i>우리 xG (위)</span><span><i class="sw them"></i>상대 xG (아래)</span></div>
      <svg class="an-trend" viewBox="0 0 ${W0} ${H0}" role="img" aria-label="경기별 xG"><line class="base" x1="6" x2="${W0 - 6}" y1="${mid}" y2="${mid}"/>${bars}</svg>
      <p class="muted" style="margin:0;font-size:12px">직접 지휘한 ${n}경기 기준. 골 - xG가 플러스면 기대보다 많이 넣은 것(결정력이 좋았거나 운이 따랐음)이에요. 평균 점유율 ${Math.round(avg('poss'))}%, 경기당 슈팅 ${avg('sh').toFixed(1)}개.</p>`;
  }

  // ── 유럽 대항전 ────────────────────────────────────────────
  function euroView() {
    const G = UI.G;
    if (!G.euro || !G.euro.comps.length) return '<section class="card"><div class="empty">이번 시즌에는 유럽 대항전 일정이 없어요. 다음 시즌부터 열려요.</div></section>';
    const uc = S.euroUserComp(G);
    const key = UI.filter.euro || (uc ? uc.key : 'UCL');
    const comp = G.euro.comps.find((c) => c.key === key) || G.euro.comps[0];
    const uid = G.user.teamId;
    const played = comp.rounds.filter((r) => r && r.length && r[0].hs != null).length;
    const groups = comp.groups.map((g, gi) => {
      const tb = S.euroGroupTable(comp, gi);
      return `<section class="card"><h2>${'ABCD'[gi]}조</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th></th><th style="text-align:left">구단</th><th>경기</th><th>승</th><th>무</th><th>패</th><th>득실</th><th>승점</th></tr></thead><tbody>
        ${tb.map((r, i) => { const t = G.teams[r.id]; return `<tr class="${r.id === uid ? 'me' : ''}" data-act="teamsheet" data-v="${r.id}" style="cursor:pointer"><td class="zone ${i < 2 ? 'up' : ''}"></td><td class="tn"><span class="row" style="gap:7px">${logo(t, 20)}${esc(t.name)}</span></td><td>${r.p}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td>${r.gf - r.ga > 0 ? '+' : ''}${r.gf - r.ga}</td><td class="pts">${r.pts}</td></tr>`; }).join('')}</tbody></table></div></section>`;
    }).join('');
    const ko = [[6, 7, '8강'], [8, 9, '4강'], [10, null, '결승']].map(([a, b, name]) => {
      const rd = comp.rounds[b != null ? b : a] || comp.rounds[a];
      if (!rd) return '';
      return `<section class="card"><h2>${name}${b != null ? ' <small>홈 앤드 어웨이 합산</small>' : ' <small>단판</small>'}</h2><div class="list">${rd.map((m) => matchLine(G, m)).join('')}</div></section>`;
    }).reverse().join('');
    const next = comp.rounds.findIndex((r) => r && r.length && r[0].hs == null);
    return `<div class="chips">${G.euro.comps.map((c) => `<button class="chip ${c.key === comp.key ? 'on' : ''}" data-act="feuro" data-v="${c.key}">${esc(c.name)}</button>`).join('')}</div>
      <section class="card stack euro-hero ${comp.key.toLowerCase()}"><div class="row"><span class="euro-badge">${comp.key === 'UCL' ? '★' : '◆'}</span><div class="grow"><div class="eyebrow">${seasonLabel(G.year)}</div><h2 style="margin:0">${esc(comp.name)}</h2></div></div>
        <div class="muted" style="font-size:12.5px">${comp.winner != null ? `우승 <b style="color:var(--ink)">${esc(G.teams[comp.winner].name)}</b>` : next >= 0 ? `다음 일정: ${S.EURO_ROUNDS[next]}${(() => { const ev = G.calendar.find((e) => e.k === 'E' && e.r === next); return ev ? ` · ${esc(S.dateText(G, ev.day))}` : ''; })()}` : ''}${uc && uc.key === comp.key ? ` · 우리 성적: <b style="color:var(--ink)">${esc(S.euroStatus(G, comp))}</b>` : ''}</div>
        <div class="muted" style="font-size:12px">4개 조 상위 2팀이 8강에 올라요. 8강·4강은 홈 앤드 어웨이 합산, 결승은 단판이에요. ${played ? '' : '조별리그 첫 경기 때 출전 상금을 받아요.'}</div></section>
      ${played > 6 ? ko + groups : groups + ko}`;
  }
  function euroLabel(G, r) { const uc = S.euroUserComp(G); return `${uc ? uc.short : '유럽'} ${S.EURO_ROUNDS[r]}`; }
  function cupView() {
    const G = UI.G;
    const rounds = G.cup.rounds;
    return `<section class="card stack"><h2 style="margin:0">${esc(G.cup.name)} ${G.cup.winner != null ? `<small>우승: ${esc(S.team(G, G.cup.winner).name)}</small>` : ''}</h2>
      <p class="muted" style="margin:0;font-size:12.5px">${esc(S.leagueOf(G, S.userTeam(G)).name)} 구단이 참가하는 단판 토너먼트예요. 무승부면 승부차기로 가려요.</p></section>
      ${rounds.slice().reverse().map((rd, ri) => { const idx = rounds.length - 1 - ri; return `<section class="card"><h2>${S.cupRoundName(G, idx)}</h2><div class="list">${rd.map((m) => matchLine(G, m)).join('')}</div></section>`; }).join('')}`;
  }
  function statsView(li) {
    const G = UI.G, uid = G.user.teamId;
    const ps = Object.values(G.players).filter((p) => p.teamId != null && G.teams[p.teamId].league === li && p.season.apps > 0);
    const list = (title, key, fmt) => {
      const top = ps.slice().sort(key).slice(0, 10);
      return `<section class="card"><h2>${title}</h2><div class="list">${top.map((p, i) => `<div class="li tap" data-act="player" data-v="${p.id}"><span class="muted num" style="width:16px;font-weight:700">${i + 1}</span>${avatar(p, 36, G.teams[p.teamId].c1)}<div class="grow"><div class="name" style="${p.teamId === uid ? 'color:var(--brand)' : ''}">${esc(p.name)}</div><div class="sub">${esc(G.teams[p.teamId].name)}</div></div><b class="num" style="font-size:18px">${fmt(p)}</b></div>`).join('') || '<div class="empty">아직 기록이 없어요.</div>'}</div></section>`;
    };
    return totwCard(G, li) + list('득점 순위', (a, b) => b.season.goals - a.season.goals || a.season.apps - b.season.apps, (p) => p.season.goals + '골')
      + list('도움 순위', (a, b) => b.season.assists - a.season.assists || a.season.apps - b.season.apps, (p) => p.season.assists + '도움')
      + list('평균 평점 (5경기 이상)', (a, b) => (b.season.apps >= 5) - (a.season.apps >= 5) || b.season.rsum / b.season.apps - a.season.rsum / a.season.apps, (p) => (p.season.rsum / p.season.apps).toFixed(2));
  }

  // 주간 베스트 11 (4-3-3 배치)
  function totwCard(G, li) {
    const tw = G.totw;
    if (!tw || li !== S.userTeam(G).league) return '';
    const slots = D.FORMATIONS['4-3-3'];
    // 슬롯 순서: GK, LB, CB, CB, RB, CM, DM, CM, LW, ST, RW → 기록 순서: GK, DF×4, MF×3, FW×3
    const discs = tw.ids.map(([id, role, rating], i) => {
      const p = G.players[id]; if (!p) return '';
      const [l, t] = KM.Render.slotPos(slots[i]);
      const mine = p.teamId === G.user.teamId;
      return `<button class="slot" style="left:${l}%;top:${t}%" data-act="player" data-v="${id}">${avatar(p, 38, mine ? 'var(--fm)' : '#fff')}<span class="lbl">${esc(shortPlayerName(p.name))}</span><span class="rt">${rating.toFixed(1)}</span></button>`;
    }).join('');
    return `<section class="card stack"><h2 style="margin:0">${tw.r + 1}라운드 베스트 11 <small>보라 테두리 = 우리 선수</small></h2>
      <div class="pitch-ed totw"><span class="ln" style="inset:3% 4%;border-radius:4px"></span><span class="ln" style="left:4%;right:4%;top:50%;border-width:2px 0 0"></span>
        <span class="ln" style="left:50%;top:50%;width:26%;aspect-ratio:1;transform:translate(-50%,-50%);border-radius:50%"></span>${discs}</div></section>`;
  }
  function openTeam(id) {
    const G = UI.G, t = S.team(G, id);
    const ps = sortPlayers(t.squad.map((x) => G.players[x]), 'pos');
    sheet(`<div class="row">${logo(t, 64)}<div class="grow"><h2>${esc(t.name)}</h2><div class="muted" style="font-size:12.5px">${esc(G.leagues[t.league].name)} ${S.position(G, id)}위 · ${esc(t.stadium)} (${t.cap.toLocaleString('ko-KR')}석)</div></div></div>
      <div class="kv"><div><small>선수단 OVR</small><b>${W.squadOvr(G, t)}</b></div><div><small>포메이션</small><b>${t.tactics.formation}</b></div><div><small>선수단 가치</small><b>${money(t.squad.reduce((s, x) => s + G.players[x].value, 0))}</b></div></div>
      <div class="list">${ps.map((p) => `<div class="li tap" data-act="player" data-v="${p.id}">${avatar(p, 38, t.c1)}<div class="grow"><div class="name">${esc(p.name)}</div><div class="sub">${posTag(p)} ${p.age}세 · ${money(p.value)}</div></div>${ovrBadge(p.ovr)}</div>`).join('')}</div>`);
  }

  // ── 이적 ───────────────────────────────────────────────────
  function transferView() {
    const G = UI.G, sub = UI.sub.transfer;
    const ut = S.userTeam(G);
    let body;
    if (sub === 'offers') body = offersView();
    else if (sub === 'free') body = searchBar('free') + `<div id="tx-results">${txResults('free')}</div>`;
    else if (sub === 'short') body = `<div id="tx-results">${txResults('short')}</div>`;
    else if (sub === 'news') body = newsTxView();
    else body = searchBar('market') + recommendHtml() + `<div id="tx-results">${txResults('market')}</div>`;
    const short = (G.short || []).filter((id) => G.players[id] && G.players[id].teamId !== ut.id).length;
    return txHero() + seg('transfer', [['market', '선수 찾기'], ['free', '자유계약'], ['offers', `제안${G.offers.length ? ' ' + G.offers.length : ''}`], ['short', `관심${short ? ' ' + short : ''}`], ['news', '이적 소식']], sub) + body;
  }

  function windowInfo(G) {
    const w = G.week, len = G.calendar.length;
    if (w >= len) return { open: false, text: '시즌 종료 후 새 시즌에 열려요' };
    if (w < 4) return { open: true, text: `여름 이적시장 · ${4 - w}주 남음` };
    if (w >= G.window.mid0 && w <= G.window.mid1) return { open: true, text: `겨울 이적시장 · ${G.window.mid1 - w + 1}주 남음` };
    if (w < G.window.mid0) return { open: false, text: `겨울 이적시장까지 ${G.window.mid0 - w}주` };
    return { open: false, text: '다음 시즌에 다시 열려요' };
  }
  function txHero() {
    const G = UI.G, ut = S.userTeam(G);
    const wi = windowInfo(G);
    return `<section class="tx-hero">
      <div class="row"><div class="grow"><div class="eyebrow" style="color:#9fb0c6">TRANSFER CENTER</div><h2 class="tx-title">이적시장</h2></div>
        <span class="tx-pill ${wi.open ? 'on' : ''}"><i></i>${wi.open ? '열림' : '닫힘'}</span></div>
      <div class="tx-sub">${esc(wi.text)}${wi.open ? '' : ' · 자유계약 선수는 언제든 영입할 수 있어요'}</div>
      <div class="tx-stats">
        <div><small>이적 예산</small><b>${money(ut.balance)}</b></div>
        <div><small>주급 총액</small><b>${money(W.wageBill(G, ut))}</b></div>
        <div><small>선수단</small><b>${ut.squad.length}<span>/32</span></b></div>
      </div></section>`;
  }

  function searchBar(mode) {
    const G = UI.G, fl = UI.filter;
    const sorts = mode === 'free' ? [['ovr', '능력순'], ['pot', '잠재력순'], ['age', '나이순']] : [['ovr', '능력순'], ['pot', '잠재력순'], ['value', '가치 높은순'], ['cheap', '가치 낮은순'], ['age', '나이순']];
    const sort = sorts.some((s) => s[0] === fl.sort) ? fl.sort : 'ovr';
    return `<section class="tx-search">
      <label class="tx-q"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/></svg>
        <input id="tx-q" type="search" inputmode="search" autocomplete="off" placeholder="선수·구단·국적 검색 (한글/영문)" value="${esc(fl.q || '')}" aria-label="선수 검색">
        ${fl.q ? '<button class="tx-clear" data-act="txclear" aria-label="검색어 지우기">×</button>' : ''}</label>
      <div class="row" style="gap:6px"><div class="grow" style="min-width:0">${posChips()}</div>${mode === 'market' ? `<button class="chip ${fl.budget ? 'on' : ''}" data-act="fbudget" style="flex:none">예산 안</button>` : ''}</div>
      <div class="tx-filters">
        ${mode === 'market' ? `<select class="sel" data-act="fmlg2" aria-label="리그"><option value="-1">전체 리그</option>${G.leagues.map((l, i) => `<option value="${i}" ${fl.mlg === i ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select>` : ''}
        <select class="sel" data-act="fage" aria-label="나이"><option value="">모든 나이</option>${[['u21', '21세 이하'], ['mid', '22~28세'], ['vet', '29세 이상']].map(([k, l]) => `<option value="${k}" ${fl.age === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <select class="sel" data-act="fsort" aria-label="정렬">${sorts.map(([k, l]) => `<option value="${k}" ${sort === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      </div></section>`;
  }

  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
  function txPool(mode) {
    const G = UI.G, ut = S.userTeam(G), fl = UI.filter;
    let ps;
    if (mode === 'free') ps = G.freeAgents.map((id) => G.players[id]).filter(Boolean);
    else if (mode === 'short') ps = (G.short || []).map((id) => G.players[id]).filter((p) => p && p.teamId !== ut.id);
    else {
      ps = Object.values(G.players).filter((p) => p.teamId != null && p.teamId !== ut.id);
      if (fl.mlg >= 0) ps = ps.filter((p) => G.teams[p.teamId].league === fl.mlg);
      if (fl.budget) ps = ps.filter((p) => p.value <= ut.balance);
    }
    if (mode !== 'short') {
      if (fl.pos !== 'ALL') ps = ps.filter((p) => p.pos === fl.pos);
      if (fl.age === 'u21') ps = ps.filter((p) => p.age <= 21);
      else if (fl.age === 'mid') ps = ps.filter((p) => p.age >= 22 && p.age <= 28);
      else if (fl.age === 'vet') ps = ps.filter((p) => p.age >= 29);
      const q = norm(fl.q);
      if (q) {
        const terms = q.split(' ');
        ps = ps.filter((p) => {
          const t = teamOf(p);
          const hay = norm([p.name, p.en, t && t.name, t && t.short, p.nat, D.ROLE_NAME[p.role], p.role].join(' '));
          return terms.every((x) => hay.includes(x));
        });
      }
    }
    const sort = UI.filter.sort;
    if (sort === 'cheap') ps.sort((a, b) => a.value - b.value || b.ovr - a.ovr);
    else sortPlayers(ps, sort === 'pos' || sort === 'cond' ? 'ovr' : sort);
    return ps;
  }
  function txResults(mode) {
    const G = UI.G, ut = S.userTeam(G);
    const all = txPool(mode);
    const LIMIT = UI.filter.limit || 40;
    const ps = all.slice(0, LIMIT);
    const empty = mode === 'short' ? '관심 선수가 없어요. 선수 정보에서 ☆를 눌러 추가하세요.' : UI.filter.q ? `'${esc(UI.filter.q)}'에 맞는 선수가 없어요.` : '조건에 맞는 선수가 없어요.';
    return `<div class="row" style="padding:0 4px;margin-bottom:6px"><span class="eyebrow grow">${mode === 'short' ? '관심 선수' : '검색 결과'} ${all.length.toLocaleString('ko-KR')}명</span></div>
      <section class="card tx-list">${ps.map((p) => txRow(p, mode, ut)).join('') || `<div class="empty">${empty}</div>`}</section>
      ${all.length > LIMIT ? `<button class="btn ghost block" data-act="txmore" style="margin-top:10px">더 보기 (${Math.min(40, all.length - LIMIT)}명)</button>` : ''}`;
  }
  function txRow(p, mode, ut) {
    const G = UI.G, t = teamOf(p);
    const fav = (G.short || []).includes(p.id);
    const price = mode === 'free' ? `${money(S.wageDemand(G, p, ut))}<small>/주</small>` : money(p.value);
    const affordable = mode === 'free' || p.value <= ut.balance;
    return `<div class="tx-row tap" data-act="player" data-v="${p.id}">
      ${avatar(p, 50, t ? t.c1 : null)}
      <div class="grow" style="min-width:0">
        <div class="tx-name">${esc(p.name)}</div>
        ${p.en && p.en !== p.name ? `<div class="tx-en">${esc(p.en)}</div>` : ''}
        <div class="tx-meta">${posTag(p)}<span>${p.age}세</span>${t ? `<span class="row" style="gap:4px;min-width:0">${logo(t, 16)}<span class="tx-club">${esc(t.name)}</span></span>` : '<span>무소속</span>'}</div>
      </div>
      <div class="tx-right">
        <div class="tx-price ${affordable ? '' : 'over'}">${price}</div>
        <div class="row" style="gap:6px;justify-content:flex-end">${ovrBadge(p.ovr)}<button class="tx-fav ${fav ? 'on' : ''}" data-act="short" data-v="${p.id}" aria-label="${fav ? '관심 해제' : '관심 등록'}">${fav ? '★' : '☆'}</button></div>
      </div></div>`;
  }

  // 추천 영입: 선발 라인업에서 가장 약한 자리를 확실히 메워줄, 예산 안의 선수
  function recommendHtml() {
    const G = UI.G, ut = S.userTeam(G), fl = UI.filter;
    if (fl.q || fl.pos !== 'ALL' || fl.age || fl.mlg >= 0) return '';
    const slots = D.FORMATIONS[ut.tactics.formation];
    let weak = null;
    ut.lineup.forEach((id, i) => {
      const p = G.players[id]; if (!p) return;
      const v = W.roleOvr(p, slots[i][0]);
      if (!weak || v < weak.v) weak = { role: slots[i][0], v, p };
    });
    if (!weak) return '';
    const cands = Object.values(G.players).filter((p) => p.teamId != null && p.teamId !== ut.id && p.value <= ut.balance && S.willingToJoin(G, p, ut))
      .map((p) => ({ p, v: W.roleOvr(p, weak.role) })).filter((x) => x.v >= weak.v + 2)
      .sort((a, b) => b.v - a.v || a.p.value - b.p.value).slice(0, 10);
    if (!cands.length) return '';
    return `<section class="tx-rec">
      <div class="row" style="padding:0 2px"><div class="grow"><div class="h2" style="margin:0">추천 영입</div>
        <div class="muted" style="font-size:12px">가장 약한 자리 <b style="color:var(--ink)">${weak.role}</b> (현재 ${esc(weak.p.name)} ${weak.v}) · 예산 안에서 영입 가능</div></div></div>
      <div class="tx-rail">${cands.map(({ p, v }) => { const t = teamOf(p); return `<button class="tx-card" data-act="player" data-v="${p.id}" style="--c1:${t.c1}">
        <span class="tx-card-top">${logo(t, 18)}<span class="ovr ${ovrCls(v)}">${v}</span></span>
        ${avatar(p, 74, t.c1)}
        <b>${esc(shortPlayerName(p.name))}</b><span class="muted">${weak.role} · ${p.age}세</span><span class="tx-card-price">${money(p.value)}</span></button>`; }).join('')}</div>
    </section>`;
  }

  function newsTxView() {
    const G = UI.G;
    return `<section class="card tx-list">${G.transfers.slice(0, 40).map((x) => {
      const p = G.players[x.pid];
      const from = x.from != null ? S.team(G, x.from) : null, to = x.to != null ? S.team(G, x.to) : null;
      return `<div class="tx-row ${p ? 'tap' : ''}" ${p ? `data-act="player" data-v="${p.id}"` : ''}>${p ? avatar(p, 44) : ''}
        <div class="grow" style="min-width:0"><div class="tx-name">${p ? esc(p.name) : '은퇴 선수'}</div>
          <div class="tx-route">${from ? logo(from, 16) + `<span>${esc(from.short)}</span>` : '<span>자유계약</span>'}<i>→</i>${to ? logo(to, 16) + `<span>${esc(to.short)}</span>` : '<span>방출</span>'}</div></div>
        <div class="tx-right"><div class="tx-price">${x.fee ? money(x.fee) : '자유 이적'}</div><div class="muted" style="font-size:11px">${x.s}시즌 ${x.w + 1}주</div></div></div>`;
    }).join('') || '<div class="empty">아직 이적이 없어요.</div>'}</section>`;
  }

  function offersView() {
    const G = UI.G;
    if (!G.offers.length) return '<section class="card"><div class="empty">받은 제안이 없어요. 선수를 이적 리스트에 올리면 이적시장 기간에 제안이 들어와요.</div></section>';
    return G.offers.map((o) => {
      const p = G.players[o.pid], t = S.team(G, o.from);
      const ratio = o.amount / Math.max(1, p.value);
      return `<section class="card tx-offer">
        <div class="row">${avatar(p, 50)}<div class="grow" style="min-width:0"><div class="tx-name">${esc(p.name)}</div><div class="tx-meta">${posTag(p)}<span>${p.age}세</span><span>OVR ${p.ovr}</span></div></div>
          <span class="tag ${o.exp - G.week <= 1 ? 'red' : ''}">${o.exp - G.week}주 내 응답</span></div>
        <div class="tx-offer-body">${logo(t, 36)}<div class="grow"><div class="muted" style="font-size:12px">${esc(t.name)}의 제안</div><b class="num" style="font-size:24px">${money(o.amount)}</b></div>
          <div style="text-align:right"><div class="muted" style="font-size:12px">시장 가치 대비</div><b class="num" style="font-size:18px;color:${ratio >= 1 ? 'var(--win)' : 'var(--loss)'}">${Math.round(ratio * 100)}%</b></div></div>
        ${o.agreed ? '<div class="tag green" style="align-self:flex-start">우리 요구액에 합의</div>' : o.final ? '<div class="tag amber" style="align-self:flex-start">상대의 최종 제안 · 더 올리면 결렬될 수 있어요</div>' : ''}
        ${UI.counter && UI.counter.id === o.id ? `<div class="tx-counter">
          <div class="muted" style="font-size:12px">요구할 금액</div>
          <div class="row"><button class="btn sm" data-act="oamt" data-v="-1" aria-label="낮추기">−</button><b class="grow num" style="text-align:center;font-size:24px">${money(UI.counter.amount)}</b><button class="btn sm" data-act="oamt" data-v="1" aria-label="올리기">+</button></div>
          <div class="grid2"><button class="btn ghost" data-act="ocancel">취소</button><button class="btn accent" data-act="osend">이 금액 요구</button></div></div>`
        : `<div class="grid3"><button class="btn ghost" data-act="reject" data-v="${o.id}">거절</button>${o.agreed ? '' : `<button class="btn" data-act="ocounter" data-v="${o.id}">더 요구하기</button>`}<button class="btn primary" data-act="accept" data-v="${o.id}">수락</button></div>`}
      </section>`;
    }).join('');
  }

  // ── 구단 ───────────────────────────────────────────────────
  function clubView() {
    const sub = UI.sub.club;
    let body;
    if (sub === 'fin') body = financeView();
    else if (sub === 'fac') body = facilitiesView();
    else if (sub === 'career') body = careerView();
    else if (sub === 'set') body = settingsView();
    else body = clubInfoView();
    return seg('club', [['club', '구단'], ['fin', '재정'], ['fac', '시설'], ['career', '커리어'], ['set', '설정']], sub) + body;
  }
  function clubInfoView() {
    const G = UI.G, t = S.userTeam(G);
    const conf = Math.round(G.board.conf);
    return `<section class="card stack"><div class="row">${logo(t, 72)}<div class="grow"><h2 style="font-family:var(--f-display);font-size:24px">${esc(t.name)}</h2><div class="muted" style="font-size:12.5px">${esc(S.leagueOf(G, t).name)} · 감독 ${esc(G.user.name)}</div></div></div>
      <div class="kv"><div><small>홈구장</small><b style="font-size:14px">${esc(t.stadium)}</b></div><div><small>수용 인원</small><b>${Math.round(t.cap * (1 + (t.facilities.stadium - 1) * 0.15)).toLocaleString('ko-KR')}</b></div><div><small>팬 열기</small><b>${Math.round(t.fans)}</b></div></div>
      <div class="kv"><div><small>구단 평판</small><b>${t.rep}</b></div><div><small>선수단 OVR</small><b>${W.squadOvr(G, t)}</b></div><div><small>리그 순위</small><b>${S.position(G, t.id)}위</b></div></div></section>
      <section class="card stack"><h2 style="margin:0">구단주</h2><div class="meter"><i style="width:${conf}%;background:${conf >= 60 ? 'var(--win)' : conf >= 35 ? 'var(--draw)' : 'var(--loss)'}"></i></div>
      <div class="muted" style="font-size:13px">신뢰도 ${conf}/100 · 시즌 목표 <b style="color:var(--ink)">${esc(G.board.goal.text)}</b>. 신뢰도가 바닥나면 해임될 수 있어요.</div></section>`;
  }
  function financeView() {
    const G = UI.G, t = S.userTeam(G);
    const entries = Object.entries(G.fin.cat || {}).sort((a, b) => b[1] - a[1]);
    const max = Math.max(1, ...entries.map((e) => Math.abs(e[1])));
    const net = entries.reduce((s, e) => s + e[1], 0);
    return `<section class="card stack"><h2 style="margin:0">재정 현황</h2>
      <div class="kv"><div><small>잔고</small><b>${money(t.balance)}</b></div><div><small>주급 합계/주</small><b>${money(W.wageBill(G, t))}</b></div><div><small>시즌 손익</small><b style="color:${net >= 0 ? 'var(--win)' : 'var(--loss)'}">${net >= 0 ? '+' : ''}${money(net)}</b></div></div></section>
      <section class="card"><h2>이번 시즌 항목별</h2><div class="stack" style="gap:9px">
        ${entries.map(([k, v]) => `<div><div class="row" style="font-size:13px"><span class="grow" style="font-weight:600">${esc(k)}</span><b class="num" style="font-size:15px;color:${v >= 0 ? 'var(--win)' : 'var(--loss)'}">${v >= 0 ? '+' : ''}${money(v)}</b></div>
          <div class="bar" style="margin-top:4px;height:7px"><i style="width:${Math.abs(v) / max * 100}%;background:${v >= 0 ? 'var(--win)' : 'var(--loss)'}"></i></div></div>`).join('') || '<div class="empty">아직 기록이 없어요.</div>'}
      </div></section>
      <section class="card"><h2>최근 거래</h2><div class="list">${G.fin.log.slice(0, 15).map((e) => `<div class="li"><span class="grow" style="font-size:13px">${esc(e.label)}<span class="muted"> · ${e.w + 1}주</span></span><b class="num" style="font-size:15px;color:${e.amount >= 0 ? 'var(--win)' : 'var(--loss)'}">${e.amount >= 0 ? '+' : ''}${money(e.amount)}</b></div>`).join('') || '<div class="empty">아직 기록이 없어요.</div>'}</div></section>`;
  }
  function facilitiesView() {
    const G = UI.G, t = S.userTeam(G);
    return Object.keys(S.FAC).map((k) => {
      const f = S.FAC[k], lv = t.facilities[k];
      const building = t.build && t.build.k === k;
      return `<section class="card stack"><div class="row"><h2 class="grow" style="margin:0">${f.name}</h2><span class="stars" style="color:var(--brand)">${'●'.repeat(lv)}<span style="opacity:.25">${'●'.repeat(5 - lv)}</span></span></div>
        <div class="muted" style="font-size:13px">${f.desc} · 현재 ${lv}단계</div>
        ${building ? `<div class="tag amber" style="align-self:flex-start">공사 중 · ${t.build.weeks}주 남음</div>` : lv >= 5 ? '<div class="tag green" style="align-self:flex-start">최고 단계</div>' :
          `<button class="btn" data-act="upgrade" data-v="${k}" ${t.build ? 'disabled' : ''}>${lv + 1}단계 공사 · ${money(S.facCost(t, k))}</button>`}</section>`;
    }).join('') + '<p class="muted" style="font-size:12px;margin:0;text-align:center">공사는 한 번에 하나씩만 할 수 있어요.</p>';
  }
  function careerView() {
    const G = UI.G, u = G.user;
    const games = u.wins + u.draws + u.losses;
    return `<section class="card stack"><h2 style="margin:0">${esc(mgrName(u.name))}</h2>
      <div class="kv"><div><small>경기</small><b>${games}</b></div><div><small>승-무-패</small><b>${u.wins}-${u.draws}-${u.losses}</b></div><div><small>승률</small><b>${games ? Math.round(u.wins / games * 100) : 0}%</b></div></div>
      <div class="kv"><div><small>감독 평판</small><b>${u.rep}</b></div><div><small>시즌</small><b>${u.seasons}</b></div><div><small>트로피</small><b>${u.trophies.length}</b></div></div></section>
      <section class="card"><h2>트로피</h2><div class="list">${u.trophies.map((x) => `<div class="li"><span>🏆</span><span class="grow" style="font-weight:600">${esc(x.name)}</span><span class="muted num">${seasonLabel(x.year)}</span></div>`).join('') || '<div class="empty">첫 트로피를 향해!</div>'}</div></section>
      ${u.awards && u.awards.length ? `<section class="card"><h2>감독 수상</h2><div class="list">${u.awards.slice().reverse().map((a) => `<div class="li"><span>🏅</span><span class="grow" style="font-weight:600">${esc(a)}</span></div>`).join('')}</div></section>` : ''}
      <section class="card"><h2>시즌 기록</h2><div class="list">${u.history.slice().reverse().map((h) => `<div class="li"><span class="num muted" style="font-weight:700">${seasonLabel(h.year)}</span><span class="grow">${esc(h.team)} · ${esc(h.league)} ${h.pos}위</span><span class="muted" style="font-size:12px">컵 ${esc(h.cup)}${h.euro ? ` · ${esc(h.euro)}` : ''}</span></div>`).join('') || '<div class="empty">첫 시즌 진행 중</div>'}</div></section>
      <section class="card"><h2>업적 <small>${Object.keys(G.ach).length}/${Object.keys(S.ACH).length}</small></h2><div class="grid2">${Object.entries(S.ACH).map(([k, [n, d]]) => {
        const on = !!G.ach[k];
        return `<div style="background:var(--surface-2);border-radius:11px;padding:9px 10px;${on ? '' : 'opacity:.45'}"><div style="font-weight:700;font-size:13px">${on ? '★' : '☆'} ${esc(n)}</div><div class="muted" style="font-size:11.5px">${esc(d)}</div></div>`;
      }).join('')}</div></section>`;
  }
  function settingsView() {
    const G = UI.G;
    return `<section class="card stack"><h2 style="margin:0">게임</h2>
      <div class="stack" style="gap:6px"><span class="eyebrow">화면 테마</span><div class="seg">${[['dark', 'FM 다크'], ['light', '라이트'], ['system', '시스템']].map(([k, l]) => `<button data-act="theme" data-v="${k}" class="${UI.theme === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div class="stack" style="gap:6px"><span class="eyebrow">기본 경기 속도</span><div class="seg">${[1, 2, 4].map((s) => `<button data-act="defspeed" data-v="${s}" class="${G.settings.speed === s ? 'on' : ''}">${s}배속</button>`).join('')}</div></div>
      <button class="btn" data-act="save">지금 저장 (슬롯 ${UI.slot + 1})</button>
      <button class="btn ghost" data-act="totitle">메인 화면으로</button></section>
      <section class="card stack"><h2 style="margin:0">도움말</h2><div class="muted" style="font-size:13px;line-height:1.65">
      · 홈에서 <b style="color:var(--ink)">경기 준비</b>를 눌러 라인업과 전술을 정하고 킥오프하세요.<br>
      · 경기 중 배속을 바꾸거나 전술·교체(최대 5명)로 흐름을 바꿀 수 있어요.<br>
      · 시즌 첫 4주와 시즌 중반 4주 동안 이적시장이 열려요. 자유계약 선수는 언제든 영입할 수 있어요.<br>
      · 능력치는 실제 시장 가치·나이·포지션으로 추정한 값이고, 이후에는 출전과 훈련으로 변해요.</div></section>
      <p class="credit">데이터·사진 출처: <a href="https://www.transfermarkt.co.kr" target="_blank" rel="noopener">Transfermarkt</a> (${esc(G.dataDate || KM.REAL.fetched)} 기준)</p>`;
  }

  // ── 시즌 결산 ──────────────────────────────────────────────
  function showSeasonReport(r) {
    const G = UI.G;
    const u = r.user;
    sheet(`<span class="eyebrow">${seasonLabel(r.year)} 시즌 결산</span>
      <h2>${u.pos === 1 ? `${esc(u.league)} 우승!` : `${esc(u.league)} ${u.pos}위`}</h2>
      <div class="kv"><div><small>목표</small><b style="font-size:14px">${esc(u.goal.text)}</b></div><div><small>달성</small><b style="color:${u.met ? 'var(--win)' : 'var(--loss)'}">${u.met ? '성공' : '실패'}</b></div><div><small>컵</small><b style="font-size:14px">${esc(u.cup)}</b></div></div>
      ${u.euro || u.euroNext ? `<div class="kv" style="grid-template-columns:1fr 1fr"><div><small>유럽 대항전</small><b style="font-size:14px">${esc(u.euro || '-')}</b></div><div><small>다음 시즌 출전권</small><b style="font-size:14px">${esc(u.euroNext || '없음')}</b></div></div>` : ''}
      <div class="list">
        ${r.champions.map((c) => `<div class="li"><span class="grow muted" style="white-space:nowrap">${esc(c.league)} 우승</span>${logo(G.teams[c.team], 22)}<b>${esc(G.teams[c.team].name)}</b></div>`).join('')}
        ${(r.euroWinners || []).filter((c) => c.team != null && G.teams[c.team]).map((c) => `<div class="li"><span class="grow muted" style="white-space:nowrap">${esc(c.name)} 우승</span>${logo(G.teams[c.team], 22)}<b>${esc(G.teams[c.team].name)}</b></div>`).join('')}
      </div>
      ${r.ballon && r.ballon.length ? `<div class="ballon"><div class="eyebrow">${r.year} 발롱도르</div>
        <div class="podium">${[1, 0, 2].map((i) => { const x = r.ballon[i]; const p = x && G.players[x.id]; return x ? `<div class="pod p${i + 1}">${p ? avatar(p, i === 0 ? 64 : 48, i === 0 ? '#ffd23a' : 'var(--line)') : ''}<b>${esc(shortPlayerName(x.name))}</b><small>${i + 1}위 · ${esc(G.teams[x.team] ? G.teams[x.team].name : '')}</small></div>` : ''; }).join('')}</div>
        <div class="list">
          ${r.goldenBoy ? `<div class="li"><span class="grow muted">골든보이 (21세 이하)</span><b>${esc(r.goldenBoy.name)}</b></div>` : ''}
          ${r.goldenShoe ? `<div class="li"><span class="grow muted">유러피언 골든슈</span><b>${esc(r.goldenShoe.name)} (${r.goldenShoe.goals}골)</b></div>` : ''}
          ${r.bestXI && r.bestXI.length ? `<div class="li" style="align-items:flex-start"><span class="muted" style="flex:none">${esc(u.league)} 올해의 팀</span><span class="grow" style="text-align:right;font-size:12.5px">${r.bestXI.map((x) => `<b style="${x.team === G.user.teamId ? 'color:var(--fm)' : ''}">${esc(shortPlayerName(x.name))}</b>`).join(', ')}</span></div>` : ''}
        </div></div>` : ''}
      <div class="list">
        ${r.awards.scorer ? `<div class="li"><span class="grow muted" style="white-space:nowrap">득점왕</span>${avatar(r.awards.scorer, 28)}<b>${esc(r.awards.scorer.name)} (${r.awards.scorerGoals}골)</b></div>` : ''}
        ${r.awards.mvp ? `<div class="li"><span class="grow muted" style="white-space:nowrap">시즌 MVP</span>${avatar(r.awards.mvp, 28)}<b>${esc(r.awards.mvp.name)}</b></div>` : ''}
        ${r.retired.length ? `<div class="li" style="align-items:flex-start"><span class="muted" style="flex:none;white-space:nowrap">은퇴</span><span class="grow" style="text-align:right">${r.retired.map(esc).join(', ')}</span></div>` : ''}
        ${r.left.length ? `<div class="li" style="align-items:flex-start"><span class="muted" style="flex:none;white-space:nowrap">계약 만료로 이탈</span><span class="grow" style="text-align:right">${r.left.map(esc).join(', ')}</span></div>` : ''}
        ${r.youth.length ? `<div class="li" style="align-items:flex-start"><span class="muted" style="flex:none;white-space:nowrap">유스 승격</span><span class="grow" style="text-align:right">${r.youth.map((p) => `${esc(p.name)} (${p.role})`).join(', ')}</span></div>` : ''}
      </div>
      <div class="muted" style="font-size:13px">구단주 신뢰도 ${Math.round(u.conf)}/100${r.newGoal ? ` · 새 시즌 목표: <b style="color:var(--ink)">${esc(r.newGoal.text)}</b>` : ''}</div>
      <button class="btn primary big" data-act="closereport">${u.sacked ? '결과 확인' : '새 시즌 시작'}</button>`, () => render());
  }

  // ── 경기 전 / 경기 ─────────────────────────────────────────
  function openPrematch() {
    if (!S.userFixture(UI.G)) return;
    UI.prematch = true;
    UI.prePage = 0;
    UI.selSlot = null;
    renderPrematch();
  }
  function renderPrematch() {
    const G = UI.G, fx = S.userFixture(G), t = S.userTeam(G);
    const home = fx.m.h === t.id;
    const opp = S.team(G, home ? fx.m.a : fx.m.h);
    W.autoLineup(G, opp);
    const oppXI = opp.lineup.map((id) => G.players[id]).filter(Boolean).sort((a, b) => b.ovr - a.ovr).slice(0, 5);
    let el = $('.match-screen');
    if (!el) { el = document.createElement('div'); el.className = 'match-screen pre'; document.body.appendChild(el); lockScroll(); }
    // 다시 그려도 보던 페이지와 각 페이지의 스크롤 위치를 유지
    const oldPages = el.querySelectorAll('.pre-page');
    const keepY = Array.from(oldPages).map((x) => x.scrollTop);
    const page = UI.prePage || 0;
    el.innerHTML = `<div class="pre-head">
      <div class="row"><button class="btn sm ghost" data-act="closepre">← 닫기</button><span class="grow"></span><span class="eyebrow">${esc(fx.label)}</span></div>
      <div class="pre-tabs" role="tablist">${PRE_TABS.map(([, l], i) => `<button role="tab" data-act="pretab" data-v="${i}" class="${i === page ? 'on' : ''}" aria-selected="${i === page}">${l}</button>`).join('')}<i class="ink" style="--i:${page}"></i></div></div>
      <div class="pre-pages" id="pre-pages"><div class="pre-track" style="transform:translateX(${-page * 100}%)">
      <div class="pre-page">${(() => { const rv = S.rivalry(G, t.id, opp.id); return rv ? `<div class="derby-tag big">🔥 ${esc(rv.name)}${'<i>★</i>'.repeat(rv.lvl)}<span>이기면 사기·팬·구단주 신뢰도가 크게 오르고, 지면 크게 떨어져요.</span></div>` : ''; })()}<section class="card stack"><div class="row">${logo(opp, 56)}<div class="grow"><div class="eyebrow">${home ? '홈 경기' : '원정 경기'} 상대</div><h2 style="font-family:var(--f-display);font-size:22px">${esc(opp.name)}</h2>
        <div class="muted" style="font-size:12.5px">${opp.tactics.formation} · 전력 ${W.teamRating(G, opp)} · ${formHtml(opp.form)}</div></div></div>
        <div class="row" style="gap:6px;overflow-x:auto">${oppXI.map((p) => `<div style="text-align:center;width:62px;flex:none">${avatar(p, 44, opp.c1)}<div style="font-size:11px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(shortPlayerName(p.name))}</div><div class="num" style="font-weight:700;color:var(--accent)">${p.ovr}</div></div>`).join('')}</div></section>
      ${reportCard()}
      <p class="swipe-hint">← 옆으로 넘겨 라인업·역할·교체 명단·전술을 확인하세요 →</p></div>
      <div class="pre-page">${lineupEditor(t, 'pitch')}</div>
      <div class="pre-page">${lineupEditor(t, 'roles')}</div>
      <div class="pre-page">${lineupEditor(t, 'bench')}</div>
      <div class="pre-page">${tacticsPanel(t.tactics, 'team')}</div>
      </div></div>
      <div class="pre-foot"><button class="btn" data-act="quickmatch">결과만 보기</button><button class="btn accent big" data-act="kickoff">킥오프</button></div>`;
    const box = $('#pre-pages');
    box.querySelectorAll('.pre-page').forEach((x, i) => { x.scrollTop = keepY[i] || 0; });
    bindSwipe(el, box);
  }
  // 손가락으로 좌우로 끌어 페이지 넘기기 (브라우저 가로 스크롤에 기대지 않고 직접 처리)
  function goPrePage(el, i, animate) {
    const n = PRE_TABS.length;
    i = clamp(i, 0, n - 1);
    UI.prePage = i;
    const track = el.querySelector('.pre-track');
    if (track) { track.style.transition = animate === false ? 'none' : ''; track.style.transform = `translateX(${-i * 100}%)`; }
    el.querySelectorAll('.pre-tabs button').forEach((b, j) => { b.classList.toggle('on', j === i); b.setAttribute('aria-selected', j === i); });
    const ink = el.querySelector('.pre-tabs .ink'); if (ink) ink.style.setProperty('--i', i);
  }
  function bindSwipe(el, box) {
    const track = box.querySelector('.pre-track');
    let st = null;
    const reset = () => { st = null; };
    box.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.target.closest('select, input, textarea')) return;
      st = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), dx: 0, lock: null, w: box.clientWidth };
    });
    box.addEventListener('pointermove', (e) => {
      if (!st || e.pointerId !== st.id) return;
      const dx = e.clientX - st.x, dy = e.clientY - st.y;
      if (!st.lock) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        st.lock = Math.abs(dx) > Math.abs(dy) * 1.1 ? 'x' : 'y';
        if (st.lock === 'x') { try { box.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ } track.style.transition = 'none'; }
      }
      if (st.lock !== 'x') return;
      e.preventDefault();
      const i = UI.prePage || 0, n = PRE_TABS.length;
      let d = dx;
      if ((i === 0 && d > 0) || (i === n - 1 && d < 0)) d *= 0.3; // 끝에서는 살짝만 끌린다
      st.dx = d;
      track.style.transform = `translateX(calc(${-i * 100}% + ${d}px))`;
    });
    const end = (e) => {
      if (!st || e.pointerId !== st.id) return;
      const s0 = st; reset();
      if (s0.lock !== 'x') return;
      const v = s0.dx / Math.max(1, performance.now() - s0.t);
      let i = UI.prePage || 0;
      if (s0.dx < -s0.w * 0.22 || v < -0.45) i++;
      else if (s0.dx > s0.w * 0.22 || v > 0.45) i--;
      UI.swipedAt = performance.now();
      goPrePage(el, i, true);
    };
    box.addEventListener('pointerup', end);
    box.addEventListener('pointercancel', end);
    // 끌다가 손을 뗀 직후의 클릭(선수 선택 등)은 무시
    box.addEventListener('click', (e) => { if (UI.swipedAt && performance.now() - UI.swipedAt < 250) { e.stopPropagation(); e.preventDefault(); } }, true);
  }
  const PRE_TABS = [['opp', '상대'], ['xi', '라인업'], ['roles', '역할'], ['bench', '교체 명단'], ['tac', '전술']];

  // 어시스턴트 매니저의 상대 분석
  function reportCard() {
    const r = S.oppReport(UI.G);
    if (!r) return '';
    return `<section class="card stack report"><div class="row"><span class="who">수</span><div class="grow"><div class="eyebrow">어시스턴트 매니저 보고서</div><b>${esc(r.opp.name)} 분석</b></div></div>
      <div class="kv"><div><small>예상 포메이션</small><b>${r.formation}</b></div><div><small>예상 전술</small><b>${esc(r.presetName)}</b></div><div><small>약점</small><b>${r.weak}</b></div></div>
      ${r.tips.length ? `<ul class="tips">${r.tips.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</section>`;
  }

  function startLive(quick) {
    const G = UI.G, fx = S.userFixture(G);
    const t = S.userTeam(G);
    W.validateLineup(G, t);
    const m = S.createMatch(G, fx);
    const userSide = fx.m.h === t.id ? 0 : 1;
    UI.prematch = false;
    if (quick) { m.user = -1; m.runToEnd(); return finishMatch(m); } // 결과만 보기: 교체는 코치진이 알아서
    UI.live = { m, fx, userSide, speed: G.settings.speed || 1, talk: null, paused: false, acc: 0, evShown: 0, tab: 'feed', selOut: null, last: 0, owner: null };
    let el = $('.match-screen');
    if (!el) { el = document.createElement('div'); document.body.appendChild(el); lockScroll(); }
    el.className = 'match-screen';
    const h = m.sides[0].team, a = m.sides[1].team;
    const kit = KM.Render.kits(h, a);
    el.innerHTML = `<div class="in">
      <div class="scoreboard" style="--hc:${kit[0].fill};--ac:${kit[1].fill}"><div class="tm">${logo(h, 34)}<b>${esc(h.short)}</b></div><div class="mid"><div class="score" id="lv-score">0 - 0</div><div class="clock" id="lv-clock">00:00</div></div><div class="tm away">${logo(a, 34)}<b>${esc(a.short)}</b></div></div>
      <div class="possbar" aria-hidden="true"><i id="lv-ph" style="background:${kit[0].fill};width:50%"></i><i style="background:${kit[1].fill};flex:1"></i></div>
      <div class="pitch-wrap"><canvas class="pitch" id="lv-canvas" aria-label="경기 화면"></canvas><div class="owner" id="lv-owner"></div><div id="lv-flash"></div><div id="lv-ht" class="ht-wrap" hidden></div></div>
      <div class="ctrl"><button class="btn" data-act="lvpause" id="lv-pause">일시정지</button><button class="btn" data-act="lvspeed" id="lv-speed">${speedLabel(UI.live.speed)}</button><button class="btn" data-act="lvskip">결과로</button></div>
      <div class="seg" id="lv-tabs">${[['feed', '중계'], ['stats', '기록'], ['tac', '전술'], ['subs', '교체']].map(([k, l]) => `<button data-act="lvtab" data-v="${k}" class="${k === 'feed' ? 'on' : ''}">${l}</button>`).join('')}</div>
      <section class="card" id="lv-panel"></section>
      <button class="btn accent big" id="lv-done" data-act="lvdone" hidden>경기 결과 확인</button>
    </div>`;
    UI.live.view = new KM.Render.PitchView($('#lv-canvas'), m, userSide);
    UI.live.view.snapshot();
    renderLivePanel(true);
    showTalk('pre');
    UI.live.last = performance.now();
    requestAnimationFrame(liveLoop);
    try { if (navigator.wakeLock) navigator.wakeLock.request('screen').then((l) => { UI.wake = l; }).catch(() => {}); } catch (e) { /* 무시 */ }
  }

  const STEPS_PER_SEC = 40; // 1배속 = 초당 엔진 4초 → 90분 경기가 약 5분
  function speedLabel(sp) { return sp === 'hl' ? '하이라이트' : sp + '배속'; }
  // 하이라이트: 평소에는 빠르게 넘기고, 위험 지역 공격·세트피스·슈팅 장면만 천천히 보여준다
  function hlSpeed(m) {
    if (m.shot || m.setPiece || m.state === 'goal' || (m.restart && (m.restart.kind === 'pen' || m.restart.kind === 'corner'))) return 1.2;
    const b = m.ball, s = b.owner ? b.owner.side : m.pass ? m.pass.from.side : m.poss;
    const f = KM.Engine.fx(s, b.x);
    return f > 74 && Math.abs(KM.Engine.fy(s, b.y) - 34) < 26 ? 1.5 : 12;
  }
  function liveLoop(now) {
    const L = UI.live;
    if (!L) return;
    const m = L.m;
    const dt = Math.min(0.1, (now - L.last) / 1000);
    L.last = now;
    if (!L.paused && !m.finished) {
      const sp = L.speed === 'hl' ? hlSpeed(m) : L.speed;
      L.hlSlow = L.speed === 'hl' && sp < 2;
      L.acc += dt * STEPS_PER_SEC * sp;
      let n = 0;
      while (L.acc >= 1 && n < 400) {
        L.view.snapshot();
        m.step();
        L.acc -= 1; n++;
        if (m.flash) showFlash(m.flash);
        if (m.finished) break;
        if (m.half === 2 && !L.htShown) { L.htShown = true; L.acc = 0; showHalftime(); break; }
      }
    }
    L.view.draw(m.finished ? 1 : clamp(L.acc, 0, 1));
    updateLiveHud();
    if (m.finished && !L.doneShown) {
      L.doneShown = true;
      $('#lv-done').hidden = false;
      $('#lv-pause').disabled = true; $('#lv-speed').disabled = true;
      renderLivePanel(true);
    }
    requestAnimationFrame(liveLoop);
  }

  // 팀 토크: 경기 전과 하프타임에 선수들에게 말을 건다. 반응에 따라 사기와 경기력이 바뀐다
  function talkCtx() {
    const L = UI.live, m = L.m, s = L.userSide;
    const fav = W.teamRating(UI.G, m.sides[s].team) - W.teamRating(UI.G, m.sides[1 - s].team);
    return { fav, gd: m.score[s] - m.score[1 - s], xgd: m.stats[s].xg - m.stats[1 - s].xg };
  }
  function showTalk(phase) {
    const L = UI.live;
    L.paused = true; L.talk = phase;
    const pb = $('#lv-pause'); if (pb) pb.textContent = '재개';
    const box = $('#lv-ht'); if (!box) return;
    const c = talkCtx();
    const sit = phase === 'pre' ? (c.fav > 2 ? '우리가 우세하다는 평가예요.' : c.fav < -2 ? '상대가 한 수 위라는 평가예요.' : '팽팽한 승부가 예상돼요.')
      : (c.gd > 0 ? '앞서고 있어요.' : c.gd < 0 ? '끌려가고 있어요.' : '동점이에요.') + (Math.abs(c.xgd) > 0.4 ? (c.xgd > 0 ? ' 내용은 우리가 더 좋았어요.' : ' 내용에서도 밀렸어요.') : '');
    box.innerHTML = `<div class="ht-card talk">
      <div class="eyebrow" style="color:#ffd23a">${phase === 'pre' ? '경기 전 팀 토크' : 'HALF TIME · 팀 토크'}</div>
      ${phase === 'ht' ? htSummary() : ''}
      <p style="margin:0">${sit} 선수들에게 뭐라고 할까요?</p>
      <div class="talk-opts">${S.TALKS[phase].map(([k, n, q]) => `<button class="btn" data-act="talk" data-v="${k}"><b>${n}</b><small>${esc(q)}</small></button>`).join('')}</div>
      <button class="btn ghost sm" data-act="talkskip">${phase === 'pre' ? '말없이 킥오프' : '말없이 후반 시작'}</button></div>`;
    box.hidden = false;
    box.scrollTop = 0;
  }
  function htSummary() {
    const m = UI.live.m, s0 = m.stats[0], s1 = m.stats[1], pp = m.possPct();
    const h = m.sides[0].team, a = m.sides[1].team;
    return `<div class="ht-score">${logo(h, 30)}<b class="num">${m.score[0]} - ${m.score[1]}</b>${logo(a, 30)}</div>
      <div class="ht-stats"><span>점유율 <b>${pp} : ${100 - pp}</b></span><span>슈팅 <b>${s0.shots} : ${s1.shots}</b></span><span>xG <b>${s0.xg.toFixed(1)} : ${s1.xg.toFixed(1)}</b></span></div>`;
  }
  function doTalk(tone) {
    const L = UI.live, m = L.m, s = L.userSide, phase = L.talk;
    const mps = m.onPitch(s);
    const res = S.teamTalk(UI.G, mps.map((x) => x.p), tone, talkCtx());
    for (const x of mps) x.setMorale(x.p.morale);
    const name = S.TALKS[phase].find((x) => x[0] === tone)[1];
    m.log('talk', s, `팀 토크: “${name}”`);
    const avg = res.reduce((a, r) => a + r.d, 0) / Math.max(1, res.length);
    const box = $('#lv-ht');
    box.innerHTML = `<div class="ht-card talk">
      <div class="eyebrow" style="color:#ffd23a">선수 반응</div>
      <p style="margin:0">${avg >= 3 ? '선수들이 크게 고무됐어요!' : avg >= 0.5 ? '선수들이 집중하고 있어요.' : avg > -2 ? '반응이 미지근해요.' : '선수들이 동요하고 있어요…'}</p>
      <div class="reacts">${res.sort((a, b) => b.d - a.d).map((r) => `<div class="react ${r.r[0]}">${avatar(r.p, 28)}<span class="grow">${esc(shortPlayerName(r.p.name))}</span><small>${r.r[1]}</small></div>`).join('')}</div>
      <div class="grid2">${phase === 'ht' ? '<button class="btn" data-act="httac">전술·교체</button>' : '<button class="btn" data-act="lvtacnow">전술 확인</button>'}<button class="btn accent" data-act="htgo">${phase === 'pre' ? '킥오프' : '후반 시작'}</button></div></div>`;
    box.scrollTop = 0;
  }

  // 하프타임: 경기를 멈추고 전반 요약 + 진영 교체 안내 + 팀 토크
  function showHalftime() { showTalk('ht'); }

  function showFlash(f) {
    const box = $('#lv-flash');
    if (!box) return;
    const L = UI.live;
    const mine = f.side === L.userSide;
    const pl = f.pid != null ? UI.G.players[f.pid] : null;
    if (f.type === 'goal') box.innerHTML = `<div class="flash">${pl ? avatar(pl, 64, 'var(--accent)') : ''}<span class="w">${mine ? 'GOAL!' : '실점'}</span><small>${esc(f.name)}</small></div>`;
    else if (f.type === 'red') box.innerHTML = `<div class="flash red"><span class="w">퇴장</span><small>${esc(f.name)}</small></div>`;
    else if (f.type === 'pen') box.innerHTML = `<div class="flash"><span class="w" style="font-size:44px">페널티킥</span></div>`;
    if (navigator.vibrate && f.type === 'goal' && mine) try { navigator.vibrate(120); } catch (e) { /* 무시 */ }
  }

  function updateLiveHud() {
    const L = UI.live, m = L.m;
    const sc = `${m.score[0]} - ${m.score[1]}`;
    const s = $('#lv-score'); if (s && s.textContent !== sc) s.textContent = sc;
    const c = $('#lv-clock'); const ct = m.finished ? '종료' : m.clockText();
    if (c && c.textContent !== ct) c.textContent = ct;
    const ph = $('#lv-ph'); if (ph) ph.style.width = m.possPct() + '%';
    const ow = m.ball.owner;
    if (ow !== L.owner) {
      L.owner = ow;
      const box = $('#lv-owner');
      if (box) box.innerHTML = ow ? `${avatar(ow.p, 30, m.sides[ow.side].team.c1)}<span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(ow.p.name)}</span>` : '';
    }
    if (m.events.length !== L.evShown || (L.tab === 'stats' && performance.now() - (L.panelT || 0) > 1000)) {
      L.evShown = m.events.length;
      L.panelT = performance.now();
      renderLivePanel(false);
    }
  }

  function renderLivePanel(force) {
    const L = UI.live; if (!L) return;
    const m = L.m, panel = $('#lv-panel'); if (!panel) return;
    if ((L.tab === 'tac' || L.tab === 'subs') && !force) return;
    // 중계 목록을 내려 보던 위치와 화면 스크롤을 유지한다
    const feedEl = panel.querySelector('.feed');
    const feedY = feedEl ? feedEl.scrollTop : 0, feedH = feedEl ? feedEl.scrollHeight : 0;
    const scr = $('.match-screen'), scrY = scr ? scr.scrollTop : 0;
    let html = '';
    if (L.tab === 'feed') {
      const evs = m.events.slice().reverse();
      html = `<div class="feed">${evs.map((e) => {
        const pl = e.pid != null ? UI.G.players[e.pid] : null;
        const pic = pl && (e.type === 'goal' || e.type === 'red' || e.type === 'sub') ? avatar(pl, 26) : `<span style="width:26px;text-align:center;flex:none">${evIcon(e)}</span>`;
        return `<div class="ev ${e.type}"><span class="t">${e.type === 'half' || e.type === 'ft' ? '' : e.min + "'"}</span><span class="x row" style="gap:8px">${pic}<span class="grow">${esc(e.text)}</span></span></div>`;
      }).join('') || '<div class="empty">킥오프!</div>'}</div>`;
    } else if (L.tab === 'stats') {
      html = liveStats(m);
    } else if (L.tab === 'tac') {
      const tac = m.sides[L.userSide].tactics;
      const s = L.userSide;
      const ents = m.mp[s].map((x, i) => ({ i, pos: x.role, p: x.p, r: [x.R.key, x.R.duty], on: x.on })).filter((e) => e.on);
      html = `<div class="stack"><div class="grid2 form-pick">
          <label><span class="eyebrow">공격 시</span><select class="sel" data-act="lvform">${Object.keys(D.FORMATIONS).map((f) => `<option ${f === tac.formation ? 'selected' : ''}>${f}</option>`).join('')}</select></label>
          <label><span class="eyebrow">수비 시</span><select class="sel" data-act="formationop"><option value="">같게</option>${Object.keys(D.FORMATIONS).map((f) => `<option ${f === tac.formationOP ? 'selected' : ''}>${f}</option>`).join('')}</select></label></div>
        <p class="muted" style="margin:0;font-size:12px">변경 사항은 바로 경기에 반영돼요.</p></div>` + tacticsPanel(tac, 'live') + rolesCard(ents, 'live');
    } else {
      const s = L.userSide;
      const on = m.onPitch(s).slice().sort((a, b) => a.bx - b.bx);
      const bench = m.sides[s].bench.filter((p) => !m.used.has(p.id));
      m.ratings();
      html = `<div class="row" style="margin-bottom:8px"><b class="grow">교체 <span class="muted" style="font-weight:600">남은 횟수 ${m.subsLeft[s]}</span></b>${L.selOut ? '<span class="tag amber">들어갈 선수를 고르세요</span>' : '<span class="muted" style="font-size:12px">나갈 선수를 먼저 고르세요</span>'}</div>
        <div class="list">${on.map((x) => `<div class="li tap" data-act="lvout" data-v="${x.id}" style="${L.selOut === x.id ? 'background:#1f2a3a;border-radius:10px' : ''}">${avatar(x.p, 36)}<div class="grow"><div class="name">${esc(x.p.name)} <span class="pos ${x.grp}">${x.role}</span> ${x.yellow ? '<span class="tag amber">경고</span>' : ''}${x.injured ? '<span class="tag red">부상</span>' : ''}</div>
          <div class="bar" style="margin-top:4px;max-width:150px"><i style="width:${Math.round(x.st * 100)}%;background:${condColor(x.st * 100)}"></i></div></div><span class="num" style="font-weight:700">${Math.round(x.st * 100)}%</span><span class="rating ${ratingCls(x.rating)}">${x.rating.toFixed(1)}</span></div>`).join('')}</div>
        <div class="eyebrow" style="margin:12px 0 4px">벤치</div>
        <div class="list">${bench.map((p) => `<div class="li ${L.selOut && m.subsLeft[s] > 0 ? 'tap' : ''}" ${L.selOut && m.subsLeft[s] > 0 ? `data-act="lvin" data-v="${p.id}"` : ''} style="${L.selOut ? '' : 'opacity:.7'}">${avatar(p, 36)}<div class="grow"><div class="name">${esc(p.name)}</div><div class="sub">${posTag(p)} 컨디션 ${p.cond}%</div></div>${ovrBadge(p.ovr)}</div>`).join('') || '<div class="empty">벤치 선수가 없어요.</div>'}</div>`;
    }
    panel.innerHTML = html;
    const nf = panel.querySelector('.feed');
    if (nf && feedY > 0) nf.scrollTop = feedY + (nf.scrollHeight - feedH); // 새 소식이 위에 추가돼도 보던 줄 유지
    if (scr) scr.scrollTop = scrY;
    if (L.tab === 'stats') { const c = $('#momchart'); if (c) drawMomentum(c, m.momentum, KM.Render.kits(m.sides[0].team, m.sides[1].team)); }
  }
  function evIcon(e) {
    return { goal: '⚽', yellow: '🟨', red: '🟥', sub: '⇄', inj: '✚', save: '🧤', miss: '✖', pen: '❗', half: '⏸', ft: '⏹', chance: '•', talk: '🗣', com: '🎙', off: '🚩' }[e.type] || '•';
  }
  function liveStats(m) {
    const s0 = m.stats[0], s1 = m.stats[1];
    const pp = m.possPct();
    const kit = KM.Render.kits(m.sides[0].team, m.sides[1].team);
    const row = (label, a, b, fmt) => {
      const tot = a + b || 1;
      return `<div class="statrow"><span class="num">${fmt ? fmt(a) : a}</span><div><div class="mid">${label}</div><div class="dual"><i style="flex:${a / tot};background:${kit[0].fill}"></i><i style="flex:${b / tot};background:${kit[1].fill}"></i></div></div><span class="num">${fmt ? fmt(b) : b}</span></div>`;
    };
    return `${row('점유율', pp, 100 - pp, (v) => v + '%')}${row('슈팅', s0.shots, s1.shots)}${row('유효 슈팅', s0.sot, s1.sot)}${row('기대 득점(xG)', s0.xg, s1.xg, (v) => v.toFixed(2))}
      ${row('패스 성공', s0.passOk, s1.passOk)}${row('태클', s0.tkl, s1.tkl)}${row('코너킥', s0.corners, s1.corners)}${row('오프사이드', s0.off || 0, s1.off || 0)}${row('파울', s0.fouls, s1.fouls)}${row('경고', s0.yel, s1.yel)}
      <div class="eyebrow" style="margin-top:10px">경기 흐름 (위 ${esc(m.sides[0].team.short)} · 아래 ${esc(m.sides[1].team.short)})</div><canvas class="mom" id="momchart"></canvas>`;
  }
  function drawMomentum(c, data, kit) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = c.clientWidth || 300, h = c.clientHeight || 90;
    c.width = w * dpr; c.height = h * dpr;
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const mid = h / 2;
    g.strokeStyle = 'rgba(143,155,179,.35)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, mid); g.lineTo(w, mid); g.stroke();
    const x45 = (45 / 95) * w;
    g.setLineDash([3, 3]); g.beginPath(); g.moveTo(x45, 4); g.lineTo(x45, h - 4); g.stroke(); g.setLineDash([]);
    if (!data.length) return;
    const max = Math.max(0.02, ...data.map((d) => Math.abs(d.v)));
    const bw = w / 95;
    for (const d of data) {
      const v = d.v / max;
      g.fillStyle = v >= 0 ? kit[0].fill : kit[1].fill;
      const bh = Math.abs(v) * (mid - 4);
      g.fillRect((d.min / 95) * w, v >= 0 ? mid - bh : mid, Math.max(1, bw - 1), bh);
    }
  }

  function finishMatch(m) {
    const G = UI.G;
    const summary = S.playWeek(G, m);
    UI.live = null;
    if (UI.wake) { try { UI.wake.release(); } catch (e) { /* 무시 */ } UI.wake = null; }
    const el = $('.match-screen'); if (el) el.remove(); lockScroll();
    save(true);
    render();
    showPostMatch(m, summary);
  }

  function showPostMatch(m, summary) {
    const G = UI.G;
    const uSide = summary.user.m.h === G.user.teamId ? 0 : 1;
    const h = m.sides[0].team, a = m.sides[1].team;
    const res = summary.user.res;
    const mine = res.players.filter((x) => m.mp[uSide].some((mp) => mp.p === x.p)).sort((x, y) => y.rating - x.rating);
    const goals = m.events.filter((e) => e.type === 'goal');
    const motm = res.players.slice().sort((x, y) => y.rating - x.rating)[0];
    const ev = summary.ev;
    const li = S.userTeam(G).league;
    const others = summary.results.filter((x) => x !== summary.user && (ev.k === 'C' || (ev.k === 'E' ? x.euro === (summary.user.euro || x.euro) : x.li === li)));
    const pp = m.possPct();
    UI.lastAn = m.analysis ? { an: summary.user.res.an, us: uSide } : null;
    sheet(`<span class="eyebrow">${ev.k === 'L' ? `리그 ${ev.r + 1}라운드` : ev.k === 'E' ? esc(euroLabel(G, ev.r)) : `${esc(G.cup.name)} ${S.cupRoundName(G, ev.r)}`} · 경기 결과</span>
      <div class="fixture"><div class="tm">${logo(h, 64)}<b>${esc(h.name)}</b></div><div class="sc num">${m.score[0]} - ${m.score[1]}</div><div class="tm">${logo(a, 64)}<b>${esc(a.name)}</b></div></div>
      ${res.agg || res.pens ? `<div class="muted" style="text-align:center;font-weight:700">${res.agg ? `합계 ${res.agg[0]} - ${res.agg[1]}` : ''}${res.agg && res.pens ? ' · ' : ''}${res.pens ? `승부차기 ${res.pens[0]} - ${res.pens[1]}` : ''}</div>` : ''}
      ${summary.user.res.an ? '<button class="btn an-btn" data-act="analysis">📊 경기 분석 보기</button>' : ''}
      ${goals.length ? `<div class="stack" style="gap:4px;font-size:13px">${goals.map((g) => `<div style="text-align:${g.side === 0 ? 'left' : 'right'}">⚽ <b>${esc(G.players[g.pid] ? G.players[g.pid].name : '')}${g.og ? ' (자책골)' : ''}</b> <span class="muted num" style="font-size:15px">${g.min}'</span></div>`).join('')}</div>` : ''}
      <div class="kv"><div><small>점유율</small><b>${pp} : ${100 - pp}</b></div><div><small>슈팅</small><b>${m.stats[0].shots} : ${m.stats[1].shots}</b></div><div><small>xG</small><b>${m.stats[0].xg.toFixed(1)} : ${m.stats[1].xg.toFixed(1)}</b></div></div>
      ${motm ? `<div class="row" class="motm">${avatar(motm.p, 48, 'var(--fm)')}<div class="grow"><div class="eyebrow">경기 최우수 선수</div><b style="font-size:16px">${esc(motm.p.name)}</b></div><span class="rating hi" style="font-size:20px">${motm.rating.toFixed(1)}</span></div>` : ''}
      <div><div class="eyebrow" style="margin-bottom:4px">우리 선수 평점</div><div class="list">${mine.map((x) => `<div class="li">${avatar(x.p, 34)}<span class="grow name" style="font-weight:600">${esc(x.p.name)} ${x.goals ? '⚽'.repeat(x.goals) : ''}${x.ast ? ' 🅰'.repeat(x.ast) : ''}</span><span class="pos ${D.ROLE_GROUP[x.role]}">${x.role}</span><span class="muted num" style="font-size:14px">${x.mins}'</span><span class="rating ${ratingCls(x.rating)}">${x.rating.toFixed(1)}</span></div>`).join('')}</div></div>
      ${others.length ? `<div><div class="eyebrow" style="margin-bottom:4px">같은 날 다른 경기</div><div class="list">${others.slice(0, 10).map((x) => matchLine(G, x.m)).join('')}</div></div>` : ''}
      <button class="btn primary" data-act="closesheet">확인</button>`, () => afterWeek(summary));
  }

  function afterWeek(summary) {
    const G = UI.G;
    if (G.newAch && G.newAch.length) { toast(`업적 달성: ${S.ACH[G.newAch[0]][0]}`); G.newAch = []; }
    if (G.user.sacked) { save(true); render(); return; }
    if (summary && summary.seasonOver) render();
  }

  // 하루씩 진행 (n=60이면 다음 우리 경기일까지)
  function dayAdvance(n) {
    const G = UI.G;
    const startDay = G.day;
    const logs = [], autos = [];
    for (let i = 0; i < n; i++) {
      const ev = S.currentEvent(G);
      if (!ev || G.user.sacked) break;
      if (S.userFixture(G) && ev.day <= G.day) break; // 우리 경기일
      const r = S.advanceDay(G);
      logs.push(...r.log); autos.push(...r.auto.filter(Boolean));
      if (n === 1) break;
    }
    save(true);
    render();
    window.scrollTo(0, 0);
    const passed = G.day - startDay;
    const cupAuto = autos.filter((a) => a.ev.k === 'C' || a.ev.k === 'E');
    const gains = logs.filter((l) => /\+\d/.test(l));
    const other = logs.filter((l) => !/\+\d/.test(l));
    if (cupAuto.length || (passed > 1 && (gains.length || other.length))) {
      const li = S.userTeam(G).league;
      sheet(`<span class="eyebrow">${passed}일 진행 · ${esc(S.dateText(G, G.day))}</span><h2>그동안의 소식</h2>
        ${gains.length ? `<div><div class="eyebrow" style="margin-bottom:4px">훈련 성과</div><div class="muted" style="font-size:13px;line-height:1.7">${gains.slice(0, 12).map(esc).join('<br>')}${gains.length > 12 ? `<br>외 ${gains.length - 12}건` : ''}</div></div>` : ''}
        ${other.length ? `<div class="muted" style="font-size:13px">${other.map(esc).join('<br>')}</div>` : ''}
        ${cupAuto.map((a) => `<div><div class="eyebrow" style="margin-bottom:4px">${a.ev.k === 'E' ? `유럽 대항전 ${S.EURO_ROUNDS[a.ev.r]}` : `${esc(G.cup.name)} ${S.cupRoundName(G, a.ev.r)}`}</div><div class="list">${(a.ev.k === 'E' ? a.results.filter((x) => x.euro === ((S.euroUserComp(G) || {}).key || 'UCL')) : a.results).slice(0, 16).map((x) => matchLine(G, x.m)).join('')}</div></div>`).join('')}
        <button class="btn primary" data-act="closesheet">확인</button>`, () => afterWeek(null));
    } else {
      toast(`${S.dateText(G, G.day)}${gains.length ? ` · 훈련 성과 ${gains.length}건` : ' · 훈련을 마쳤어요'}`);
    }
    if (!S.currentEvent(G)) render();
  }

  function simWeek() {
    const G = UI.G;
    const summary = S.playWeek(G, null);
    save(true);
    render();
    if (summary && summary.results.length) {
      const ev = summary.ev;
      const li = S.userTeam(G).league;
      const shown = summary.results.filter((x) => ev.k === 'C' || x.li === li);
      sheet(`<span class="eyebrow">${ev.k === 'C' ? `${esc(G.cup.name)} ${S.cupRoundName(G, ev.r)}` : '리그'} 결과</span><h2>이번 주 결과</h2>
        <div class="list">${shown.slice(0, 16).map((x) => matchLine(G, x.m)).join('')}</div>
        <button class="btn primary" data-act="closesheet">확인</button>`, () => afterWeek(summary));
    }
  }

  // ── 입력 처리 ──────────────────────────────────────────────
  const actions = {
    tab(el) { UI.tab = el.dataset.v; UI.selSlot = null; UI.filter.pos = 'ALL'; render(); window.scrollTo(0, 0); },
    sub(el) { UI.sub[el.dataset.k] = el.dataset.v; UI.selSlot = null; rerenderView(); },
    goto(el) { UI.tab = el.dataset.tab; UI.sub[el.dataset.tab] = el.dataset.sub; render(); window.scrollTo(0, 0); },
    fpos(el) { UI.filter.pos = el.dataset.v; UI.filter.limit = 40; rerenderView(); },
    analysis() { if (UI.lastAn && UI.lastAn.an) { const cb = UI._sheetClose; closeSheet(); openAnalysis(UI.lastAn.an, UI.lastAn.us, '경기 분석', cb); } },
    lmanalysis() { const lm = UI.G.lastMatch; if (lm && lm.an) openAnalysis(lm.an, lm.us, `${lm.label} 분석`); },
    antab(el) { UI.anState.tab = el.dataset.v; UI.anState.cap = ''; renderAnalysis(); const sh = $('.sheet'); if (sh) sh.scrollTop = 0; },
    anside(el) { UI.anState.side = +el.dataset.v; UI.anState.cap = ''; renderAnalysis(); },
    anpid(el) { UI.anState.pid = el.dataset.v === '' ? null : +el.dataset.v; UI.anState.cap = ''; renderAnalysis(); },
    antip(el) { UI.anState.cap = el.dataset.v; const c = $('#an-cap'); if (c) c.textContent = el.dataset.v; document.querySelectorAll('.an .sel-mark').forEach((x) => x.classList.remove('sel-mark')); el.classList.add('sel-mark'); },
    feuro(el) { UI.filter.euro = el.dataset.v; rerenderView(); },
    flg(el) { UI.filter.league = +el.dataset.v; UI.filter.round = null; rerenderView(); },
    fmlg(el) { UI.filter.mlg = +el.dataset.v; rerenderView(); },
    fmlg2(el) { UI.filter.mlg = +el.value; UI.filter.limit = 40; rerenderView(); },
    fage(el) { UI.filter.age = el.value; UI.filter.limit = 40; rerenderView(); },
    txclear() { UI.filter.q = ''; UI.filter.limit = 40; rerenderView(); const i = $('#tx-q'); if (i) i.focus(); },
    txmore() { UI.filter.limit = (UI.filter.limit || 40) + 40; refreshTxResults(); },
    fbudget() { UI.filter.budget = !UI.filter.budget; rerenderView(); },
    player(el) { openPlayer(+el.dataset.v, { pid: +el.dataset.v }); },
    teamsheet(el) { openTeam(+el.dataset.v); },
    mail(el) { const n = UI.G.news[+el.dataset.i]; if (n) openMail(n); },
    inboxall() {
      const G = UI.G;
      UI.inboxF = UI.inboxF || 'mail';
      const list = G.news.filter((n) => (UI.inboxF === 'mail' ? !n.gen : true));
      sheet(`<h2>받은 편지함</h2>${`<div class="seg">${[['mail', '메시지'], ['all', '모든 소식']].map(([k, l]) => `<button data-act="inboxf" data-v="${k}" class="${UI.inboxF === k ? 'on' : ''}">${l}</button>`).join('')}</div>`}
        <button class="btn sm ghost" data-act="readall">모두 읽음으로 표시</button>
        <div class="list inbox">${list.map(mailItem).join('') || '<div class="empty">메시지가 없어요.</div>'}</div>
        <button class="btn primary" data-act="closesheet">닫기</button>`, () => rerenderView(), { update: !!$('.sheet-bg') });
    },
    inboxf(el) { UI.inboxF = el.dataset.v; actions.inboxall(); },
    readall() { for (const n of UI.G.news) n.read = true; actions.inboxall(); },
    cont() {
      const G = UI.G;
      const ev = S.currentEvent(G);
      if (!ev) return actions.endseason();
      if (S.userFixture(G) && ev.day <= G.day) return openPrematch();
      dayAdvance(1);
    },
    theme(el) { setTheme(el.dataset.v); rerenderView(); },
    closesheet() { const cb = UI._sheetClose; closeSheet(); if (cb) cb(); },

    load(el) {
      const n = +el.dataset.v;
      el.disabled = true; el.textContent = '불러오는 중…';
      loadSlot(n).then((G) => {
        if (!G) { toast('세이브를 불러오지 못했어요.'); render(); return; }
        UI.G = G; UI.slot = n; UI.tab = 'home'; UI.filter.league = null; render();
      });
    },
    newgame(el) { UI.newGame = { slot: +el.dataset.v, league: 0, team: null, seed: (Date.now() ^ (Math.random() * 1e9)) >>> 0 }; render(); },
    ngback() { UI.newGame = null; render(); },
    nglg(el) { UI.newGame.league = +el.dataset.v; UI.newGame.team = null; UI.newGame.name = ($('#ng-name') || {}).value; renderNewGame(); window.scrollTo(0, 0); },
    ngteam(el) { UI.newGame.team = +el.dataset.v; UI.newGame.name = ($('#ng-name') || {}).value; renderNewGame(); },
    ngstart() {
      const ng = UI.newGame;
      const name = (($('#ng-name') || {}).value || '').trim() || '감독';
      S.startCareer(ng.G, ng.team, name);
      UI.G = ng.G; UI.slot = ng.slot; UI.newGame = null; UI.tab = 'home'; UI.filter.league = null;
      save(); render(); window.scrollTo(0, 0);
    },
    askdel(el) { UI.confirm = 'del' + el.dataset.v; render(); },
    delslot(el) { deleteSlot(+el.dataset.v); UI.confirm = null; render(); },
    totitle() { const p = save(true); UI.G = null; closeSheet(); p.then(render); },
    takejob(el) { S.takeJob(UI.G, +el.dataset.v); UI.filter.league = null; save(true); UI.tab = 'home'; render(); },

    prematch() { openPrematch(); },
    simweek() { simWeek(); },
    press(el) { S.answerPress(UI.G, +el.dataset.v); save(true); rerenderView(); toast('기자회견을 마쳤어요.'); },
    endseason() { const r = S.endSeason(UI.G); UI.filter.league = null; save(true); showSeasonReport(r); },
    closereport() { closeSheet(); UI.tab = 'home'; render(); },

    fsort(el) { UI.filter.sort = el.value; rerenderView(); },
    slot(el) {
      const i = +el.dataset.v;
      const t = S.userTeam(UI.G);
      if (UI.selSlot == null) UI.selSlot = i;
      else if (UI.selSlot === i) UI.selSlot = null;
      else { const a = t.lineup[UI.selSlot]; t.lineup[UI.selSlot] = t.lineup[i]; t.lineup[i] = a; UI.selSlot = null; }
      refreshLineupHost();
    },
    pickp(el) {
      const t = S.userTeam(UI.G);
      const pid = +el.dataset.v;
      if (UI.selSlot == null) return toast('먼저 경기장에서 바꿀 자리를 누르세요.');
      const outId = t.lineup[UI.selSlot];
      t.lineup[UI.selSlot] = pid;
      t.bench = t.bench.filter((id) => id !== pid);
      if (outId != null && !t.bench.includes(outId)) t.bench.unshift(outId);
      t.bench = t.bench.slice(0, 9);
      UI.selSlot = null;
      refreshLineupHost();
    },
    formation(el) { const t = S.userTeam(UI.G); t.tactics.formation = el.value; W.autoLineup(UI.G, t); W.autoRoles(UI.G, t); UI.selSlot = null; UI.roleOpen = null; refreshLineupHost(); },
    formationop(el) {
      if (UI.live) { const L = UI.live; L.m.setOPFormation(L.userSide, el.value); renderLivePanel(true); toast(el.value ? `수비 시 ${el.value}로 바꿔요.` : '수비 시에도 같은 대형을 써요.'); return; }
      const t = S.userTeam(UI.G); t.tactics.formationOP = el.value; refreshLineupHost();
    },
    roleopen(el) { UI.roleOpen = UI.roleOpen === el.dataset.v ? null : el.dataset.v; if (UI.live) renderLivePanel(true); else refreshLineupHost(); },
    rolepick(el) { setRole(el.dataset.scope, +el.dataset.i, el.dataset.v, null); },
    roleduty(el) { setRole(el.dataset.scope, +el.dataset.i, null, +el.dataset.v); },
    autoroles() { W.autoRoles(UI.G, S.userTeam(UI.G)); UI.roleOpen = null; refreshLineupHost(); toast('선수 능력에 맞춰 역할을 정했어요.'); },
    autolineup() { W.autoLineup(UI.G, S.userTeam(UI.G)); UI.selSlot = null; refreshLineupHost(); toast('가장 강한 라인업으로 채웠어요.'); },
    nextday() { dayAdvance(1); },
    tomatch() { dayAdvance(60); },
    benchtoggle(el) {
      const t = S.userTeam(UI.G), id = +el.dataset.v;
      t.benchManual = true;
      if (t.bench.includes(id)) t.bench = t.bench.filter((x) => x !== id);
      else if (t.bench.length >= 9) return toast('교체 명단은 9명까지예요. 먼저 한 명을 빼세요.');
      else t.bench.push(id);
      refreshLineupHost();
    },
    benchauto() { const t = S.userTeam(UI.G); t.benchManual = false; t.bench = []; W.validateLineup(UI.G, t); refreshLineupHost(); toast('능력순으로 교체 명단을 채웠어요.'); },
    tacpreset(el) {
      const pr = D.TACTIC_PRESETS.find((x) => x[0] === el.dataset.v);
      if (el.dataset.scope === 'live') {
        const L = UI.live; const sd = L.m.sides[L.userSide];
        Object.assign(sd.tactics, pr[3]); D.normTactics(sd.tactics); sd.baseMent = sd.tactics.mentality;
        renderLivePanel(true); toast(`${pr[1]} 전술로 바꿨어요.`); return;
      }
      const t = S.userTeam(UI.G); Object.assign(t.tactics, pr[3]); D.normTactics(t.tactics); refreshLineupHost(); toast(`${pr[1]} 전술을 적용했어요.`);
    },
    tacgroup(el) { UI.tacOpen = UI.tacOpen === el.dataset.v ? '' : el.dataset.v; if (UI.live) renderLivePanel(true); else refreshLineupHost(); },
    ocounter(el) { const o = UI.G.offers.find((x) => x.id === +el.dataset.v); if (!o) return; UI.counter = { id: o.id, amount: Math.round(o.amount * 1.1 / 25) * 25 }; rerenderView(); },
    oamt(el) { const c = UI.counter; const o = UI.G.offers.find((x) => x.id === c.id); const step = Math.max(25, Math.round(o.amount * 0.05 / 25) * 25); c.amount = Math.max(o.amount + step, c.amount + step * +el.dataset.v); rerenderView(); },
    ocancel() { UI.counter = null; rerenderView(); },
    osend() { const r = S.counterOffer(UI.G, UI.counter.id, UI.counter.amount); UI.counter = null; toast(r.msg); save(true); render(); },
    tac(el) {
      const k = el.dataset.k, v = +el.dataset.v;
      if (el.dataset.scope === 'live') {
        const L = UI.live; const sd = L.m.sides[L.userSide];
        sd.tactics[k] = v; D.normTactics(sd.tactics); sd.baseMent = sd.tactics.mentality;
        renderLivePanel(true); return;
      }
      const tt = S.userTeam(UI.G).tactics; tt[k] = v; D.normTactics(tt); refreshLineupHost();
    },
    tfocus(el) { UI.G.training.focus = el.dataset.v; rerenderView(); },
    tint(el) { UI.G.training.intensity = +el.dataset.v; rerenderView(); },

    ptab(el) { UI.draft.tab = el.dataset.v; openPlayer(UI.draft.pid, UI.draft); },
    pmode(el) { UI.draft.mode = el.dataset.v || null; openPlayer(UI.draft.pid, UI.draft); },
    renew(el) { const r = S.renew(UI.G, UI.draft.pid, +el.dataset.v); toast(r.msg); UI.draft.mode = null; save(true); openPlayer(UI.draft.pid, UI.draft); rerenderView(); },
    list() { const p = UI.G.players[UI.draft.pid]; p.listed = !p.listed; toast(p.listed ? '이적 리스트에 올렸어요. 이적시장에서 제안이 들어와요.' : '이적 리스트에서 내렸어요.'); openPlayer(p.id, UI.draft); rerenderView(); },
    release() { const r = S.releasePlayer(UI.G, UI.draft.pid); toast(r.msg); if (r.ok) { closeSheet(); UI.draft = null; save(true); render(); } },
    short(el) {
      const G = UI.G; G.short = G.short || [];
      const id = +el.dataset.v;
      G.short = G.short.includes(id) ? G.short.filter((x) => x !== id) : G.short.concat(id);
      if ($('.sheet-bg')) openPlayer(id, UI.draft);
      if (UI.tab === 'transfer') { const y = window.scrollY; rerenderView(); window.scrollTo(0, y); }
    },
    amt(el) {
      const d = UI.draft, p = UI.G.players[d.pid];
      const step = Math.max(25, Math.round(p.value * 0.05 / 25) * 25);
      d.amount = Math.max(25, (d.amount || Math.round(p.value / 25) * 25) + step * +el.dataset.v);
      d.msg = null; openPlayer(d.pid, d);
    },
    bid() {
      const d = UI.draft, p = UI.G.players[d.pid];
      const amount = d.amount || Math.round(p.value / 25) * 25;
      const r = S.makeBid(UI.G, d.pid, amount);
      d.msg = r.msg; d.ok = r.status === 'accept';
      if (r.status === 'accept') { d.stage = 'contract'; d.fee = r.fee; d.wage = r.wage; }
      if (r.status === 'counter') d.amount = r.counter;
      openPlayer(d.pid, d);
    },
    freesign() {
      const d = UI.draft, p = UI.G.players[d.pid];
      if (S.userTeam(UI.G).squad.length >= 32) return toast('선수단이 32명으로 가득 찼어요.');
      d.stage = 'contract'; d.fee = 0; d.wage = S.wageDemand(UI.G, p, S.userTeam(UI.G));
      openPlayer(d.pid, d);
    },
    sign(el) {
      const d = UI.draft;
      const r = S.completeSigning(UI.G, d.pid, d.fee || 0, d.wage, +el.dataset.v);
      toast(r.msg);
      if (r.ok) { closeSheet(); UI.draft = null; save(true); render(); }
    },
    bidcancel() { UI.draft = { pid: UI.draft.pid }; openPlayer(UI.draft.pid, UI.draft); },
    accept(el) { const r = S.acceptOffer(UI.G, +el.dataset.v); toast(r.msg); save(true); render(); },
    reject(el) { S.rejectOffer(UI.G, +el.dataset.v); save(true); render(); },
    fround(el) { UI.filter.round = +el.value; rerenderView(); },

    upgrade(el) { const r = S.upgradeFacility(UI.G, el.dataset.v); toast(r.msg); save(true); render(); },
    save() { save().then((ok) => { if (ok) toast('저장했어요.'); }); },
    defspeed(el) { UI.G.settings.speed = +el.dataset.v; save(true); rerenderView(); },

    pretab(el) { const ms = $('.match-screen'); if (ms) goPrePage(ms, +el.dataset.v, true); },
    closepre() { UI.prematch = false; const el = $('.match-screen'); if (el) el.remove(); lockScroll(); save(true); render(); },
    kickoff() { startLive(false); },
    quickmatch() { startLive(true); },
    lvpause(el) { const L = UI.live; L.paused = !L.paused; el.textContent = L.paused ? '재개' : '일시정지'; if (!L.paused) { const h = $('#lv-ht'); if (h) h.hidden = true; } },
    lvspeed(el) { const L = UI.live; const sp = [1, 2, 4, 8, 'hl']; L.speed = sp[(sp.indexOf(L.speed) + 1) % sp.length]; el.textContent = speedLabel(L.speed); },
    lvskip() { const L = UI.live; L.htShown = true; const h = $('#lv-ht'); if (h) h.hidden = true; L.view.snapshot(); L.m.runToEnd(); },
    talk(el) { doTalk(el.dataset.v); },
    talkskip() { actions.htgo(); },
    lvtacnow() { const L = UI.live; $('#lv-ht').hidden = true; L.tab = 'tac'; document.querySelectorAll('#lv-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.v === 'tac')); renderLivePanel(true); const p = $('#lv-panel'); if (p) p.scrollIntoView({ behavior: 'smooth', block: 'start' }); toast('준비가 끝나면 재개를 누르세요.'); },
    htgo() { const L = UI.live; $('#lv-ht').hidden = true; L.talk = null; L.paused = false; L.last = performance.now(); const pb = $('#lv-pause'); if (pb) pb.textContent = '일시정지'; },
    httac() { const L = UI.live; $('#lv-ht').hidden = true; L.tab = 'subs'; document.querySelectorAll('#lv-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.v === 'subs')); renderLivePanel(true); const p = $('#lv-panel'); if (p) p.scrollIntoView({ behavior: 'smooth', block: 'start' }); toast('준비가 끝나면 재개를 누르세요.'); },
    lvtab(el) { const L = UI.live; L.tab = el.dataset.v; L.selOut = null; document.querySelectorAll('#lv-tabs button').forEach((b) => b.classList.toggle('on', b === el)); renderLivePanel(true); },
    lvform(el) { const L = UI.live; L.m.setFormation(L.userSide, el.value); renderLivePanel(true); toast(`${el.value}로 바꿨어요.`); },
    lvout(el) { const L = UI.live; L.selOut = L.selOut === +el.dataset.v ? null : +el.dataset.v; renderLivePanel(true); },
    lvin(el) {
      const L = UI.live, m = L.m, s = L.userSide;
      const out = m.onPitch(s).find((x) => x.id === L.selOut);
      const p = m.sides[s].bench.find((x) => x.id === +el.dataset.v);
      if (out && p && m.substitute(s, out, p)) toast(`${out.p.name} ↔ ${p.name}`);
      L.selOut = null; renderLivePanel(true);
    },
    lvdone() { finishMatch(UI.live.m); },
  };

  function setRole(scope, i, key, duty) {
    if (scope === 'live') {
      const L = UI.live, m = L.m, mp = m.mp[L.userSide][i];
      const r = D.validRole(mp.role, [key || mp.R.key, duty != null ? duty : mp.R.duty]);
      m.setRole(L.userSide, mp, r);
      renderLivePanel(true); return;
    }
    const t = S.userTeam(UI.G);
    const roles = W.validateRoles(t);
    const pos = D.FORMATIONS[t.tactics.formation][i][0];
    roles[i] = D.validRole(pos, [key || roles[i][0], duty != null ? duty : roles[i][1]]);
    refreshLineupHost();
  }
  function refreshLineupHost() {
    if (UI.prematch) renderPrematch();
    else rerenderView();
  }

  function refreshTxResults() {
    const box = $('#tx-results');
    if (box) box.innerHTML = txResults(UI.sub.transfer === 'free' ? 'free' : UI.sub.transfer === 'short' ? 'short' : 'market');
  }
  function onKey(e) {
    if (e.target.id === 'tx-q' && e.key === 'Enter') e.target.blur();
  }
  function onInput(e) {
    if (e.target.id !== 'tx-q') return;
    UI.filter.q = e.target.value;
    UI.filter.limit = 40;
    clearTimeout(UI._qt);
    UI._qt = setTimeout(() => {
      refreshTxResults();
      const rec = $('.tx-rec'); if (rec) rec.hidden = !!UI.filter.q;
    }, 120);
  }
  function onClick(e) {
    const el = e.target.closest('[data-act]');
    if (!el || el.tagName === 'SELECT' || el.disabled) return;
    const fn = actions[el.dataset.act];
    if (fn) { e.preventDefault(); fn(el); }
  }
  function onChange(e) {
    const el = e.target.closest('select[data-act]');
    if (!el) return;
    const fn = actions[el.dataset.act];
    if (fn) fn(el);
  }

  function setTheme(v) {
    try { localStorage.setItem('km.theme', v); } catch (e) { /* 무시 */ }
    applyTheme();
  }
  function applyTheme() {
    let v = 'dark';
    try { v = localStorage.getItem('km.theme') || 'dark'; } catch (e) { /* 무시 */ }
    if (v === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = v;
    UI.theme = v;
  }
  function init() {
    applyTheme();
    document.addEventListener('click', onClick);
    document.addEventListener('change', onChange);
    document.addEventListener('input', onInput);
    document.addEventListener('keydown', onKey);
    document.addEventListener('error', onImgError, true);
    window.addEventListener('resize', () => { if (UI.live) UI.live.view.resize(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && UI.G && !UI.live) save(true); });
    render();
  }

  // 안드로이드 뒤로 가기: 처리했으면 true
  UI.back = function () {
    if (UI.live) { const b = $('#lv-pause'); if (b && !UI.live.paused && !UI.live.m.finished) actions.lvpause(b); return true; }
    if ($('.sheet-bg')) { actions.closesheet(); return true; }
    if (UI.prematch) { actions.closepre(); return true; }
    if (UI.newGame) { actions.ngback(); return true; }
    if (UI.G && UI.tab !== 'home') { UI.tab = 'home'; render(); window.scrollTo(0, 0); return true; }
    if (UI.G) save(true);
    return false;
  };
  UI.autosave = function () { if (UI.G && !UI.live) save(true); };

  UI.init = init;
  UI.render = render;
})(globalThis.KM || (globalThis.KM = {}));
