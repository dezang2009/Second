// 화면 구성과 사용자 입력
(function (KM) {
  'use strict';
  const S = KM.Season, W = KM.World, D = KM.DATA;
  const { esc, money, clamp, josa } = KM;

  const SLOTS = 3;
  const KEY = (n) => 'kickoff-manager.v1.slot' + n;
  const UI = {
    G: null, slot: 0, tab: 'home', sub: { squad: 'list', league: 'table', transfer: 'market', club: 'club' },
    filter: { pos: 'ALL', sort: 'pos', budget: false, div: 0, round: null },
    selSlot: null, live: null, draft: null, newGame: null, confirm: null,
  };
  KM.UI = UI;

  const $ = (sel, root) => (root || document).querySelector(sel);
  const app = () => $('#app');

  // ── 저장 ───────────────────────────────────────────────────
  function save() {
    if (!UI.G) return false;
    try {
      localStorage.setItem(KEY(UI.slot), JSON.stringify(UI.G));
      return true;
    } catch (e) {
      toast('저장 공간이 부족해 저장하지 못했어요.');
      return false;
    }
  }
  function loadSlot(n) {
    try {
      const raw = localStorage.getItem(KEY(n));
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function slotInfo(n) {
    const G = loadSlot(n);
    if (!G) return null;
    const t = G.teams[G.user.teamId];
    return { team: t, year: G.year, week: G.week, name: G.user.name, div: t.div };
  }
  function deleteSlot(n) { try { localStorage.removeItem(KEY(n)); } catch (e) { /* 무시 */ } }

  // ── 공용 조각 ──────────────────────────────────────────────
  function crest(t, cls) {
    return `<span class="crest ${cls || ''}" style="background:${t.c1};border-color:${t.c2};color:${KM.Render.contrast(t.c1)}">${esc(t.short)}</span>`;
  }
  function ovrCls(o) { return o >= 78 ? 't1' : o >= 70 ? 't2' : o >= 62 ? 't3' : 't4'; }
  function ovrBadge(o) { return `<span class="ovr ${ovrCls(o)}">${o}</span>`; }
  function posTag(pos) { return `<span class="pos ${pos}">${pos}</span>`; }
  function stars(p) {
    const n = clamp(Math.round((p.pot - 45) / 10), 1, 5);
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

  function toast(msg) {
    const old = $('.toast'); if (old) old.remove();
    const el = document.createElement('div');
    el.className = 'toast'; el.textContent = msg; el.setAttribute('role', 'status');
    document.body.appendChild(el);
    clearTimeout(UI._tt);
    UI._tt = setTimeout(() => el.remove(), 2600);
  }

  function sheet(html, onClose) {
    closeSheet();
    const bg = document.createElement('div');
    bg.className = 'sheet-bg';
    bg.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div>`;
    bg.addEventListener('click', (e) => { if (e.target === bg) { closeSheet(); if (onClose) onClose(); } });
    document.body.appendChild(bg);
    UI._sheetClose = onClose || null;
    return bg.firstChild;
  }
  function closeSheet() { const s = $('.sheet-bg'); if (s) s.remove(); }

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
    const weekText = ev ? `${G.year} 시즌 · ${G.week + 1}/${G.calendar.length}주` : `${G.year} 시즌 종료`;
    const win = S.windowOpen(G) ? ' · <span style="color:var(--flood)">이적시장 열림</span>' : '';
    const offers = G.offers.length;
    app().innerHTML = `
      <header class="topbar">
        <div class="club">${crest(t)}<div style="min-width:0"><b>${esc(t.name)}</b><div class="meta">${weekText}${win}</div></div></div>
        <div class="bal">잔고<span class="num">${money(t.balance)}</span></div>
      </header>
      <main class="view" id="view">${viewHtml()}</main>
      <nav class="tabs" aria-label="메뉴"><div class="in">
        ${[['home', '홈'], ['squad', '선수단'], ['league', '리그'], ['transfer', '이적'], ['club', '구단']].map(([k, l]) =>
          `<button data-act="tab" data-v="${k}" class="${UI.tab === k ? 'on' : ''}" aria-current="${UI.tab === k}">${ICON[k]}${l}${k === 'transfer' && offers ? '<span class="dot"></span>' : ''}</button>`).join('')}
      </div></nav>`;
    afterRender();
  }
  function rerenderView() {
    const v = $('#view');
    if (!v) return render();
    v.innerHTML = viewHtml();
    afterRender();
  }
  function afterRender() {
    const c = $('#momchart');
    if (c && UI._mom) drawMomentum(c, UI._mom.data, UI._mom.sides);
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
  function renderTitle() {
    const ng = UI.newGame;
    if (ng) return renderNewGame();
    const slots = [];
    for (let i = 0; i < SLOTS; i++) slots.push(slotInfo(i));
    app().innerHTML = `
      <div class="title-screen">
        <div class="lights" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
        <h1 class="logo">킥오프<em>매니저</em></h1>
        <p class="muted" style="margin:0;max-width:34ch">32개 구단, 1·2부 승강제와 컵 대회. 22명이 실제로 뛰는 2D 경기를 보면서 전술과 교체로 흐름을 바꾸세요.</p>
        <div class="stack">
          ${slots.map((s, i) => s ? `
            <div class="card row">
              ${crest(s.team)}
              <div class="grow"><div style="font-weight:600">${esc(s.team.name)}</div><div class="muted" style="font-size:12px">${esc(s.name)} 감독 · ${s.year} 시즌 ${s.week + 1}주차 · ${s.div}부</div></div>
              <button class="btn sm primary" data-act="load" data-v="${i}">이어하기</button>
            </div>` : `
            <div class="card row">
              <div class="crest" style="border-style:dashed;border-color:var(--rule);background:none;color:var(--muted)">${i + 1}</div>
              <div class="grow muted">빈 슬롯</div>
              <button class="btn sm" data-act="newgame" data-v="${i}">새 커리어</button>
            </div>`).join('')}
        </div>
        ${slots.some(Boolean) ? `<details class="card"><summary class="muted" style="cursor:pointer">슬롯 관리</summary><div class="stack" style="margin-top:10px">${slots.map((s, i) => s ? `<div class="row"><span class="grow">슬롯 ${i + 1} · ${esc(s.team.name)}</span>${UI.confirm === 'del' + i ? `<button class="btn sm danger" data-act="delslot" data-v="${i}">정말 삭제</button>` : `<button class="btn sm ghost" data-act="askdel" data-v="${i}">삭제</button>`}</div>` : '').join('')}</div></details>` : ''}
        <p class="muted" style="font-size:12px;margin:0">세이브는 이 기기의 브라우저에 저장돼요.</p>
      </div>`;
  }

  function renderNewGame() {
    const ng = UI.newGame;
    if (!ng.G) {
      ng.G = S.newGame({ teamId: 0, name: '감독', seed: ng.seed });
    }
    const G = ng.G;
    const div = ng.div || 0;
    const ids = G.divs[div].slice().sort((a, b) => W.squadOvr(G, G.teams[b]) - W.squadOvr(G, G.teams[a]));
    const sel = ng.team;
    app().innerHTML = `
      <div class="title-screen" style="padding-top:calc(20px + env(safe-area-inset-top, 0px))">
        <div class="row"><button class="btn sm ghost" data-act="ngback">← 뒤로</button><span class="grow"></span></div>
        <h1 class="logo" style="font-size:30px">새 커리어</h1>
        <label class="stack" style="gap:6px"><span class="eyebrow">감독 이름</span>
          <input class="txt" id="ng-name" maxlength="10" value="${esc(ng.name || '')}" placeholder="예: 김감독" autocomplete="off"></label>
        <div class="stack" style="gap:8px"><span class="eyebrow">구단 선택</span>
          ${seg('ngdiv', [['0', '1부 리그'], ['1', '2부 리그 (도전)']], String(div))}
        </div>
        <div class="card" style="padding:4px 12px"><div class="list">
          ${ids.map((id) => {
            const t = G.teams[id];
            const o = W.squadOvr(G, t);
            const rank = ids.indexOf(id);
            const exp = div === 0 ? (rank < 2 ? '우승 후보' : rank < 5 ? '상위권' : rank < 10 ? '중위권' : '잔류 경쟁') : (rank < 4 ? '승격 후보' : rank < 10 ? '중위권' : '하위권');
            return `<div class="li tap" data-act="ngteam" data-v="${id}" style="${sel === id ? 'background:var(--panel-2);border-radius:10px;padding-inline:8px' : ''}">
              ${crest(t)}<div class="grow"><div class="name">${esc(t.name)}</div><div class="sub">${exp} · 예산 ${money(t.balance)} · ${esc(t.stadium)}</div></div>${ovrBadge(o)}</div>`;
          }).join('')}
        </div></div>
        <button class="btn primary big block" data-act="ngstart" ${sel == null ? 'disabled' : ''}>${sel == null ? '구단을 고르세요' : esc(G.teams[sel].name) + '에서 시작'}</button>
      </div>`;
  }

  // ── 해임 화면 ──────────────────────────────────────────────
  function renderSacked() {
    const G = UI.G;
    const offers = S.jobOffers(G);
    app().innerHTML = `
      <div class="title-screen">
        <h1 class="logo" style="font-size:34px">해임 통보</h1>
        <p class="muted" style="margin:0">구단주가 성적 부진을 이유로 ${esc(G.user.name)} 감독과의 계약을 해지했습니다. 다행히 몇몇 구단이 관심을 보이고 있어요.</p>
        <div class="card"><h2>새 구단 제의</h2><div class="list">
          ${offers.map((id) => { const t = G.teams[id]; return `<div class="li">${crest(t)}<div class="grow"><div class="name">${esc(t.name)}</div><div class="sub">${t.div}부 · 선수단 OVR ${W.squadOvr(G, t)}</div></div><button class="btn sm primary" data-act="takejob" data-v="${id}">수락</button></div>`; }).join('') || '<div class="empty">제의가 없습니다.</div>'}
        </div></div>
        <button class="btn ghost" data-act="totitle">메인 화면으로</button>
      </div>`;
  }

  // ── 홈 ─────────────────────────────────────────────────────
  function homeView() {
    const G = UI.G, t = S.userTeam(G);
    const parts = [];
    const ev = S.currentEvent(G);
    if (!ev) {
      parts.push(`<section class="card hero-match stack"><span class="eyebrow">시즌 종료</span><h2 style="font-family:var(--f-display);font-size:22px">${G.year} 시즌이 끝났습니다</h2><p class="muted" style="margin:0">최종 순위 ${S.position(G, t.id)}위. 결산을 확인하고 다음 시즌을 시작하세요.</p><button class="btn primary big" data-act="endseason">시즌 결산 보기</button></section>`);
    } else {
      const fx = S.userFixture(G);
      if (fx) {
        const home = fx.m.h === t.id;
        const opp = S.team(G, home ? fx.m.a : fx.m.h);
        const hT = S.team(G, fx.m.h), aT = S.team(G, fx.m.a);
        parts.push(`<section class="card hero-match stack">
          <div class="row"><span class="eyebrow">다음 경기 · ${esc(fx.label)}</span><span class="grow"></span><span class="tag">${home ? '홈' : '원정'}</span></div>
          <div class="fixture">
            <div class="tm">${crest(hT, 'lg')}<b>${esc(hT.name)}</b>${formHtml(hT.form)}</div>
            <div class="vs">VS</div>
            <div class="tm">${crest(aT, 'lg')}<b>${esc(aT.name)}</b>${formHtml(aT.form)}</div>
          </div>
          <div class="row" style="justify-content:center;gap:18px;font-size:12.5px" >
            <span class="muted">우리 전력 <b class="num" style="color:var(--chalk)">${W.teamRating(G, t)}</b></span>
            <span class="muted">상대 전력 <b class="num" style="color:var(--chalk)">${W.teamRating(G, opp)}</b></span>
            <span class="muted">상대 순위 <b class="num" style="color:var(--chalk)">${fx.ev.k === 'L' ? S.position(G, opp.id) + '위' : opp.div + '부'}</b></span>
          </div>
          <button class="btn primary big" data-act="prematch">경기 준비 ▸</button>
        </section>`);
      } else {
        const label = ev.k === 'C' ? `코리아 컵 ${S.CUP_NAMES[ev.r]}` : '리그';
        parts.push(`<section class="card hero-match stack"><span class="eyebrow">이번 주 · ${label}</span><p style="margin:0">이번 주는 우리 경기가 없습니다. 다른 구단의 경기 결과를 확인하세요.</p><button class="btn primary big" data-act="simweek">다음 주로 ▸</button></section>`);
      }
    }
    // 지난 경기 + 기자회견
    const lm = G.lastMatch;
    if (lm) {
      const opp = S.team(G, lm.opp);
      const pq = S.pressQuestions(G);
      const motm = lm.motm != null && G.players[lm.motm];
      parts.push(`<section class="card stack">
        <h2>지난 경기 <small>${esc(lm.label)}</small></h2>
        <div class="row"><span class="tag ${lm.r === 'W' ? 'green' : lm.r === 'L' ? 'red' : 'amber'}">${lm.r === 'W' ? '승' : lm.r === 'L' ? '패' : '무'}</span>
          <b class="grow">${lm.home ? '' : '@ '}${esc(opp.name)}</b><span class="num" style="font-size:20px;font-weight:700">${lm.gf} - ${lm.ga}</span></div>
        ${lm.pens ? `<div class="muted" style="font-size:12px">승부차기 ${lm.home ? lm.pens[0] + '-' + lm.pens[1] : lm.pens[1] + '-' + lm.pens[0]}</div>` : ''}
        ${motm ? `<div class="muted" style="font-size:12.5px">경기 최우수 선수: <b style="color:var(--chalk)">${esc(motm.name)}</b></div>` : ''}
        ${pq && !lm.answered ? `<div class="stack" style="gap:8px;border-top:1px solid var(--rule);padding-top:12px"><span class="eyebrow">기자회견</span><div style="font-weight:600">“${esc(pq.q)}”</div>
          ${pq.a.map((a, i) => `<button class="btn sm ghost" style="justify-content:flex-start;text-align:left" data-act="press" data-v="${i}">${esc(a.t)}</button>`).join('')}</div>` : lm.answer ? `<div class="muted" style="font-size:12.5px">기자회견: “${esc(lm.answer)}”</div>` : ''}
      </section>`);
    }
    // 알림
    const alerts = [];
    if (G.offers.length) alerts.push(`<button class="li tap" data-act="goto" data-tab="transfer" data-sub="offers" style="background:none;border:0;width:100%;text-align:left"><span class="tag amber">제안</span><span class="grow">우리 선수 영입 제안 ${G.offers.length}건</span><span class="muted">›</span></button>`);
    const expiring = t.squad.map((id) => G.players[id]).filter((p) => p.contract <= 1);
    if (expiring.length && G.week >= 20) alerts.push(`<button class="li tap" data-act="goto" data-tab="squad" data-sub="list" style="background:none;border:0;width:100%;text-align:left"><span class="tag amber">계약</span><span class="grow">시즌 후 계약 만료 ${expiring.length}명 — 재계약하지 않으면 떠나요</span><span class="muted">›</span></button>`);
    const unavailable = t.lineup.map((id) => G.players[id]).filter((p) => p && (p.inj > 0 || p.sus > 0));
    if (unavailable.length) alerts.push(`<div class="li"><span class="tag red">결장</span><span class="grow">${unavailable.map((p) => esc(p.name)).join(', ')} 출전 불가</span></div>`);
    if (alerts.length) parts.push(`<section class="card" style="padding-block:4px"><div class="list">${alerts.join('')}</div></section>`);
    // 구단주
    const conf = Math.round(G.board.conf);
    parts.push(`<section class="card stack" style="gap:8px">
      <h2>구단주 신뢰도 <small>목표: ${esc(G.board.goal.text)}</small></h2>
      <div class="meter"><i style="width:${conf}%;background:${conf >= 60 ? 'var(--win)' : conf >= 35 ? 'var(--draw)' : 'var(--loss)'}"></i></div>
      <div class="row muted" style="font-size:12.5px"><span class="grow">${conf >= 75 ? '구단주가 매우 만족하고 있어요.' : conf >= 55 ? '구단주가 지켜보고 있어요.' : conf >= 35 ? '구단주가 불안해하고 있어요.' : '경질 위기입니다!'}</span><span>현재 ${S.position(G, t.id)}위</span></div>
    </section>`);
    // 미니 순위표
    const tb = S.table(G, t.div - 1);
    const pos = tb.findIndex((r) => r.id === t.id);
    const from = clamp(pos - 2, 0, tb.length - 5);
    parts.push(`<section class="card"><h2>${t.div}부 리그 <small><button class="btn sm ghost" data-act="goto" data-tab="league" data-sub="table">전체</button></small></h2>${tableHtml(G, t.div - 1, tb.slice(from, from + 5), from)}</section>`);
    // 소식
    parts.push(`<section class="card news"><h2>구단 소식</h2><div class="list">${G.news.slice(0, 8).map(newsItem).join('') || '<div class="empty">아직 소식이 없습니다.</div>'}</div></section>`);
    return parts.join('');
  }
  function newsItem(n) {
    return `<div class="li"><span class="ic" aria-hidden="true">${NEWS_IC[n.tag] || '•'}</span><div class="grow"><div class="t">${esc(n.title)}</div><div class="b">${esc(n.body)}</div></div></div>`;
  }

  function tableHtml(G, div, rows, offset) {
    const uid = G.user.teamId;
    return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th></th><th>#</th><th style="text-align:left">구단</th><th>경기</th><th>승</th><th>무</th><th>패</th><th>득실</th><th>승점</th></tr></thead><tbody>
      ${rows.map((r, i) => {
        const n = offset + i + 1;
        const zone = div === 0 ? (n >= 14 ? 'down' : '') : (n <= 3 ? 'up' : '');
        const t = G.teams[r.id];
        return `<tr class="${r.id === uid ? 'me' : ''}" data-act="teamsheet" data-v="${r.id}" style="cursor:pointer"><td class="zone ${zone}"></td><td>${n}</td><td class="tn"><span class="row" style="gap:6px">${crest(t, 'sm')}${esc(t.name)}</span></td><td>${r.p}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td>${r.gf - r.ga > 0 ? '+' : ''}${r.gf - r.ga}</td><td class="pts">${r.pts}</td></tr>`;
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
    const f = {
      pos: (a, b) => po[a.pos] - po[b.pos] || b.ovr - a.ovr,
      ovr: (a, b) => b.ovr - a.ovr,
      age: (a, b) => a.age - b.age,
      cond: (a, b) => a.cond - b.cond,
      value: (a, b) => b.value - a.value,
      pot: (a, b) => b.pot - a.pot,
    }[sort] || ((a, b) => b.ovr - a.ovr);
    return arr.sort(f);
  }

  function playerListView() {
    const G = UI.G, t = S.userTeam(G);
    const fl = UI.filter;
    let ps = t.squad.map((id) => G.players[id]);
    if (fl.pos !== 'ALL') ps = ps.filter((p) => p.pos === fl.pos);
    sortPlayers(ps, fl.sort);
    const starters = new Set(t.lineup);
    return `<div class="row wrap" style="gap:8px">
      <div class="chips grow">${['ALL', 'GK', 'DF', 'MF', 'FW'].map((k) => `<button class="chip ${fl.pos === k ? 'on' : ''}" data-act="fpos" data-v="${k}">${k === 'ALL' ? '전체' : k}</button>`).join('')}</div>
      <select class="sel" data-act="fsort" aria-label="정렬">${[['pos', '포지션순'], ['ovr', '능력순'], ['pot', '잠재력순'], ['age', '나이순'], ['cond', '컨디션 낮은순'], ['value', '가치순']].map(([k, l]) => `<option value="${k}" ${fl.sort === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
    </div>
    <section class="card" style="padding-block:4px"><div class="list">
      ${ps.map((p) => `<div class="li tap" data-act="player" data-v="${p.id}">
        ${posTag(p.pos)}
        <div class="grow"><div class="name">${starters.has(p.id) ? '<span style="color:var(--flood)">●</span> ' : ''}${esc(p.name)} <span class="muted num" style="font-weight:400">#${p.num}</span></div>
          <div class="sub">${p.age}세 · ${esc(p.nat)} · 사기 ${moraleText(p.morale)} ${statusTags(p)}</div>
          <div class="bar" style="margin-top:4px;max-width:120px"><i style="width:${p.cond}%;background:${condColor(p.cond)}"></i></div></div>
        ${ovrBadge(p.ovr)}
      </div>`).join('')}
    </div></section>
    <p class="muted" style="font-size:12px;margin:0;text-align:center">선수단 ${t.squad.length}명 · 주급 합계 ${money(W.wageBill(G, t))}/주</p>`;
  }

  // 라인업 편집기 (선수단 탭과 경기 전 화면 공용)
  function lineupEditor(t) {
    const G = UI.G;
    W.validateLineup(G, t);
    const slots = D.FORMATIONS[t.tactics.formation];
    const sel = UI.selSlot;
    const tc = KM.Render.contrast(t.c1);
    const discs = slots.map((sl, i) => {
      const p = G.players[t.lineup[i]];
      const [l, tp] = KM.Render.slotPos(sl);
      const ro = p ? W.roleOvr(p, sl[0]) : 0;
      const bad = p && (D.ROLE_FIT[sl[0]][p.pos] || 0) < 0.85;
      return `<button class="slot ${sel === i ? 'sel' : ''} ${bad ? 'bad' : ''}" style="left:${l}%;top:${tp}%" data-act="slot" data-v="${i}" aria-label="${sl[0]} ${p ? esc(p.name) : ''}">
        <span class="disc" style="background:${sl[0] === 'GK' ? '#e9d23b' : t.c1};border-color:${sl[0] === 'GK' ? '#222' : t.c2};color:${sl[0] === 'GK' ? '#111' : tc}">${p ? p.num : '?'}</span>
        <span class="lbl">${p ? esc(p.name) : '비어 있음'}</span><span class="rt">${sl[0]} ${ro}</span></button>`;
    }).join('');
    const inXI = new Set(t.lineup);
    const others = t.squad.map((id) => G.players[id]).filter((p) => !inXI.has(p.id));
    sortPlayers(others, 'pos');
    const benchSet = new Set(t.bench);
    const role = sel != null ? slots[sel][0] : null;
    return `<section class="card stack">
      <div class="row"><h2 style="margin:0;font-family:var(--f-display);font-size:17px" class="grow">선발 라인업</h2>
        <select class="sel" data-act="formation" aria-label="포메이션">${Object.keys(D.FORMATIONS).map((f) => `<option ${f === t.tactics.formation ? 'selected' : ''}>${f}</option>`).join('')}</select>
        <button class="btn sm" data-act="autolineup">자동 선발</button></div>
      <div class="row muted" style="font-size:12.5px"><span class="grow">${sel != null ? `<b style="color:var(--flood)">${slots[sel][0]}</b> 자리에 넣을 선수를 고르세요. 다른 자리를 누르면 서로 바뀌어요.` : '자리를 눌러 선수를 바꾸세요.'}</span><span>전력 <b class="num" style="color:var(--chalk)">${W.teamRating(G, t)}</b></span></div>
      <div class="pitch-ed"><span class="halfc"></span>${discs}</div>
      <div class="list">
        ${others.map((p) => {
          const out = p.inj > 0 || p.sus > 0;
          const fitO = role ? W.roleOvr(p, role) : null;
          return `<div class="li ${out ? '' : 'tap'}" ${out ? '' : `data-act="pickp" data-v="${p.id}"`} style="${out ? 'opacity:.5' : ''}">
          ${posTag(p.pos)}<div class="grow"><div class="name">${esc(p.name)} ${benchSet.has(p.id) ? '<span class="tag">교체 명단</span>' : ''}</div><div class="sub">컨디션 ${p.cond}% · ${statusTags(p) || '출전 가능'}</div></div>
          ${fitO != null ? `<span class="muted num" style="font-size:12px">${role} ${fitO}</span>` : ''}${ovrBadge(p.ovr)}</div>`;
        }).join('')}
      </div>
    </section>`;
  }

  function tacticsPanel(tac, scope) {
    const L = D.TACTIC_LABELS;
    const row = (k, title) => `<div class="stack" style="gap:6px"><span class="eyebrow">${title}</span><div class="seg">${L[k].map((l, i) => `<button data-act="tac" data-scope="${scope}" data-k="${k}" data-v="${i}" class="${tac[k] === i ? 'on' : ''}">${l}</button>`).join('')}</div></div>`;
    return `<section class="card stack"><h2 style="margin:0">전술</h2>
      ${row('mentality', '공격 성향')}${row('style', '패스 스타일')}${row('press', '압박 강도')}${row('line', '수비 라인')}${row('width', '공격 폭')}
      <p class="muted" style="font-size:12px;margin:0">${tacticHint(tac)}</p></section>`;
  }
  function tacticHint(t) {
    const out = [];
    if (t.press === 2) out.push('전방 압박은 공을 빨리 되찾지만 체력 소모가 커요.');
    if (t.line === 2 && t.press < 2) out.push('높은 수비 라인은 압박과 함께 써야 뒷공간이 덜 노출돼요.');
    if (t.style === 0) out.push('짧은 패스는 점유율을 높이고 실수를 줄여요.');
    if (t.style === 2) out.push('직선적인 패스는 빠르게 전진하지만 공을 자주 잃어요.');
    if (t.mentality >= 3) out.push('공격적인 성향은 슈팅이 늘지만 역습에 약해요.');
    if (t.mentality <= 1) out.push('수비적인 성향은 실점을 줄이지만 득점 기회도 줄어요.');
    return out.join(' ') || '균형 잡힌 기본 전술이에요.';
  }

  function trainingView() {
    const G = UI.G, t = S.userTeam(G);
    const tr = G.training;
    const focus = [['bal', '균형'], ['atk', '공격'], ['def', '수비'], ['tec', '기술'], ['phy', '체력']];
    const young = t.squad.map((id) => G.players[id]).filter((p) => p.age <= 23).sort((a, b) => (b.pot - b.ovr) - (a.pot - a.ovr));
    return `<section class="card stack">
      <h2 style="margin:0">주간 훈련</h2>
      <div class="stack" style="gap:6px"><span class="eyebrow">훈련 초점</span><div class="seg">${focus.map(([k, l]) => `<button data-act="tfocus" data-v="${k}" class="${tr.focus === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div class="stack" style="gap:6px"><span class="eyebrow">훈련 강도</span><div class="seg">${['가볍게', '보통', '강하게'].map((l, i) => `<button data-act="tint" data-v="${i}" class="${tr.intensity === i ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <p class="muted" style="margin:0;font-size:12.5px">${['회복이 빠르지만 성장이 느려요.', '성장과 회복의 균형을 맞춰요.', '성장이 40% 빨라지지만 컨디션 회복이 느리고 부상 위험이 있어요.'][tr.intensity]} 훈련장 ${t.facilities.train}단계 효과로 성장 속도 +${(t.facilities.train - 1) * 12}%.</p>
    </section>
    <section class="card"><h2>유망주 <small>23세 이하 ${young.length}명</small></h2><div class="list">
      ${young.map((p) => `<div class="li tap" data-act="player" data-v="${p.id}">${posTag(p.pos)}<div class="grow"><div class="name">${esc(p.name)} <span class="muted" style="font-weight:400">${p.age}세</span></div>
        <div class="sub">잠재력 <span class="stars">${stars(p)}</span> · 출전 ${p.season.apps}경기</div>
        <div class="bar" style="margin-top:4px"><i style="width:${Math.round(p.ovr / Math.max(p.pot, 1) * 100)}%;background:var(--info)"></i></div></div>${ovrBadge(p.ovr)}</div>`).join('') || '<div class="empty">23세 이하 선수가 없어요.</div>'}
    </div></section>`;
  }

  // ── 선수 상세 시트 ─────────────────────────────────────────
  function openPlayer(pid, state) {
    const G = UI.G;
    const p = G.players[pid];
    if (!p) return;
    if (state) UI.draft = state;
    else if (!UI.draft || UI.draft.pid !== pid) UI.draft = { pid };
    const d = UI.draft;
    const t = p.teamId != null ? S.team(G, p.teamId) : null;
    const mine = p.teamId === G.user.teamId;
    const st = p.season;
    const avg = st.apps ? (st.rsum / st.apps).toFixed(2) : '-';
    const attrs = (p.pos === 'GK' ? ['gk', 'pas', 'phy', 'pac'] : ['pac', 'sho', 'pas', 'dri', 'def', 'phy']).map((k) =>
      `<div class="attr"><span class="muted">${W.ATTR_KO[k]}</span><div class="bar"><i style="width:${p.attr[k]}%;background:${p.attr[k] >= 75 ? 'var(--win)' : p.attr[k] >= 60 ? 'var(--draw)' : 'var(--loss)'}"></i></div><span class="num">${p.attr[k]}</span></div>`).join('');
    const shortlisted = (G.short || []).includes(pid);
    let actions = '';
    if (mine) {
      if (d.mode === 'renew') {
        const dem = S.renewDemand(G, p);
        actions = `<div class="card stack" style="background:var(--panel-2)"><b>재계약 협상</b><div class="muted" style="font-size:13px">요구 주급 <b style="color:var(--chalk)">${money(dem)}</b> (현재 ${money(p.wage)})</div>
          <div class="seg">${[1, 2, 3, 4].map((y) => `<button data-act="renew" data-v="${y}">${y}년</button>`).join('')}</div>
          <button class="btn sm ghost" data-act="pmode" data-v="">취소</button></div>`;
      } else if (d.mode === 'release') {
        const comp = Math.round(p.wage * 16 * Math.max(1, p.contract) / 5) * 5;
        actions = `<div class="card stack" style="background:var(--panel-2)"><b>${esc(p.name)} 방출</b><div class="muted" style="font-size:13px">위약금 ${money(comp)}를 내고 계약을 해지합니다. 되돌릴 수 없어요.</div>
          <div class="row"><button class="btn sm ghost grow" data-act="pmode" data-v="">취소</button><button class="btn sm danger grow" data-act="release">방출 확정</button></div></div>`;
      } else {
        actions = `<div class="grid2"><button class="btn" data-act="pmode" data-v="renew">재계약</button><button class="btn" data-act="list">${p.listed ? '이적 리스트 해제' : '이적 리스트 등록'}</button></div>
          <button class="btn ghost" data-act="pmode" data-v="release">방출</button>`;
      }
    } else {
      actions = bidPanel(p, d);
    }
    const html = `
      <div class="row">${posTag(p.pos)}<h2 class="grow">${esc(p.name)}</h2>${ovrBadge(p.ovr)}</div>
      <div class="row muted" style="font-size:12.5px;margin-top:-8px;flex-wrap:wrap;gap:6px 10px">
        ${t ? `<span class="row" style="gap:6px">${crest(t, 'sm')}${esc(t.name)}</span>` : '<span class="tag">자유계약</span>'}
        <span>#${p.num || '-'}</span><span>${p.age}세</span><span>${esc(p.nat)}</span><span>잠재력 <span class="stars">${stars(p)}</span></span>
        ${!mine ? `<button class="chip ${shortlisted ? 'on' : ''}" data-act="short" data-v="${pid}">${shortlisted ? '★ 관심 선수' : '☆ 관심 등록'}</button>` : ''}
      </div>
      ${statusTags(p) ? `<div>${statusTags(p)}</div>` : ''}
      <div class="kv"><div><small>가치</small><b>${money(p.value)}</b></div><div><small>주급</small><b>${money(p.wage)}</b></div><div><small>계약</small><b>${p.teamId != null ? p.contract + '년' : '-'}</b></div></div>
      <div class="attrs">${attrs}</div>
      <div class="kv"><div><small>컨디션</small><b style="color:${condColor(p.cond)}">${p.cond}%</b></div><div><small>사기</small><b>${moraleText(p.morale)}</b></div><div><small>폼</small><b>${p.ratings.length ? p.form.toFixed(1) : '-'}</b></div></div>
      <div class="kv"><div><small>시즌 출전</small><b>${st.apps}</b></div><div><small>골 / 도움</small><b>${st.goals} / ${st.assists}</b></div><div><small>평균 평점</small><b>${avg}</b></div></div>
      <div class="muted" style="font-size:12px">통산 ${p.career.apps}경기 ${p.career.goals}골 ${p.career.assists}도움</div>
      ${actions}`;
    sheet(html, () => { UI.draft = null; });
  }

  function bidPanel(p, d) {
    const G = UI.G, ut = S.userTeam(G);
    const free = p.teamId == null;
    const open = S.windowOpen(G);
    if (d.stage === 'contract') {
      const wage = d.wage;
      return `<div class="card stack" style="background:var(--panel-2)"><b>${esc(p.name)} 연봉 협상</b>
        <div class="muted" style="font-size:13px">${d.fee ? `이적료 ${money(d.fee)} 합의 · ` : ''}요구 주급 <b style="color:var(--chalk)">${money(wage)}</b></div>
        <div class="muted" style="font-size:12px">현재 주급 합계 ${money(W.wageBill(G, ut))} → ${money(W.wageBill(G, ut) + wage)}</div>
        <div class="seg">${[1, 2, 3, 4, 5].map((y) => `<button data-act="sign" data-v="${y}">${y}년 계약</button>`).join('')}</div>
        <button class="btn sm ghost" data-act="bidcancel">협상 취소</button></div>`;
    }
    if (free) {
      return `<button class="btn primary" data-act="freesign">자유계약 협상 (요구 주급 ${money(S.wageDemand(G, p, ut))})</button>`;
    }
    if (!open) return `<div class="muted" style="font-size:13px;text-align:center">이적시장이 닫혀 있어요. 시즌 첫 4주와 17~21주에 열려요.</div>`;
    const amt = d.amount || Math.round(p.value / 100) * 100;
    return `<div class="card stack" style="background:var(--panel-2)">
      <div class="row"><b class="grow">이적 제안</b><span class="muted" style="font-size:12px">잔고 ${money(ut.balance)}</span></div>
      <div class="row"><button class="btn sm" data-act="amt" data-v="-1">−</button><div class="grow num" style="text-align:center;font-size:22px;font-weight:700">${money(amt)}</div><button class="btn sm" data-act="amt" data-v="1">+</button></div>
      <div class="muted" style="font-size:12px;text-align:center">선수 가치 ${money(p.value)} · 탭할 때마다 5%씩 조정</div>
      ${d.msg ? `<div style="font-size:13px;color:${d.ok ? 'var(--win)' : 'var(--flood)'}">${esc(d.msg)}</div>` : ''}
      <button class="btn primary" data-act="bid">제안하기</button></div>`;
  }

  // ── 리그 ───────────────────────────────────────────────────
  function leagueView() {
    const G = UI.G, sub = UI.sub.league;
    let body = '';
    if (sub === 'table') {
      const div = UI.filter.div;
      body = `<div class="chips">${[0, 1].map((d) => `<button class="chip ${div === d ? 'on' : ''}" data-act="fdiv" data-v="${d}">${d + 1}부 리그</button>`).join('')}</div>
        <section class="card">${tableHtml(G, div, S.table(G, div), 0)}
        <p class="muted" style="font-size:12px;margin:10px 0 0">${div === 0 ? '하위 3팀은 2부로 강등돼요.' : '상위 3팀은 1부로 승격해요.'} 구단을 누르면 정보를 볼 수 있어요.</p></section>`;
    } else if (sub === 'fixtures') body = fixturesView();
    else if (sub === 'cup') body = cupView();
    else body = statsView();
    return seg('league', [['table', '순위'], ['fixtures', '일정·결과'], ['cup', '컵'], ['stats', '기록']], sub) + body;
  }

  function fixturesView() {
    const G = UI.G, t = S.userTeam(G);
    const div = t.div - 1;
    const rounds = G.fixtures[div];
    let lastDone = -1;
    rounds.forEach((r, i) => { if (r[0].hs != null) lastDone = i; });
    const cur = UI.filter.round != null ? UI.filter.round : clamp(lastDone, 0, rounds.length - 1);
    const mine = rounds.map((r, i) => ({ i, m: r.find((m) => m.h === t.id || m.a === t.id) }));
    return `<section class="card"><h2>우리 일정</h2><div class="list">
      ${mine.map(({ i, m }) => {
        const home = m.h === t.id; const opp = S.team(G, home ? m.a : m.h);
        let res = '<span class="muted">예정</span>';
        if (m.hs != null) { const gf = home ? m.hs : m.as, ga = home ? m.as : m.hs; const r = gf > ga ? 'W' : gf < ga ? 'L' : 'D'; res = `<span class="form"><i class="${r}">${r === 'W' ? '승' : r === 'D' ? '무' : '패'}</i></span> <b class="num">${gf}-${ga}</b>`; }
        return `<div class="li"><span class="muted num" style="width:30px">${i + 1}R</span>${crest(opp, 'sm')}<span class="grow name" style="font-weight:500">${home ? '' : '@ '}${esc(opp.name)}</span>${res}</div>`;
      }).join('')}</div></section>
      <section class="card"><div class="row" style="margin-bottom:8px"><h2 class="grow" style="margin:0">${div + 1}부 라운드 결과</h2>
        <select class="sel" data-act="fround" aria-label="라운드">${rounds.map((r, i) => `<option value="${i}" ${i === cur ? 'selected' : ''}>${i + 1}라운드</option>`).join('')}</select></div>
        <div class="list">${rounds[cur].map((m) => matchLine(G, m)).join('')}</div></section>`;
  }
  function matchLine(G, m) {
    const h = S.team(G, m.h), a = S.team(G, m.a), uid = G.user.teamId;
    const me = m.h === uid || m.a === uid;
    return `<div class="li" style="${me ? 'color:var(--flood)' : ''}"><span class="grow" style="text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(h.name)}</span>${crest(h, 'sm')}
      <b class="num" style="width:52px;text-align:center">${m.hs != null ? m.hs + ' - ' + m.as : 'vs'}</b>${crest(a, 'sm')}<span class="grow" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(a.name)}</span></div>
      ${m.pens ? `<div class="muted" style="font-size:11.5px;text-align:center;margin-top:-6px;padding-bottom:6px">승부차기 ${m.pens[0]}-${m.pens[1]}</div>` : ''}`;
  }
  function cupView() {
    const G = UI.G;
    const rounds = G.cup.rounds;
    return `<section class="card stack"><h2 style="margin:0">코리아 컵 ${G.cup.winner != null ? `<small>우승: ${esc(S.team(G, G.cup.winner).name)}</small>` : ''}</h2>
      <p class="muted" style="margin:0;font-size:12.5px">1·2부 32개 구단이 참가하는 단판 토너먼트. 무승부면 승부차기로 가려요.</p></section>
      ${rounds.slice().reverse().map((rd, ri) => { const idx = rounds.length - 1 - ri; return `<section class="card"><h2>${S.CUP_NAMES[idx]}</h2><div class="list">${rd.map((m) => matchLine(G, m)).join('')}</div></section>`; }).join('')}`;
  }
  function statsView() {
    const G = UI.G, t = S.userTeam(G);
    const ps = Object.values(G.players).filter((p) => p.teamId != null && S.team(G, p.teamId).div === t.div);
    const list = (title, key, fmt) => {
      const top = ps.filter((p) => p.season.apps > 0).sort(key).slice(0, 10);
      return `<section class="card"><h2>${title}</h2><div class="list">${top.map((p, i) => `<div class="li tap" data-act="player" data-v="${p.id}"><span class="muted num" style="width:18px">${i + 1}</span>${crest(S.team(G, p.teamId), 'sm')}<div class="grow"><div class="name" style="${p.teamId === t.id ? 'color:var(--flood)' : ''}">${esc(p.name)}</div></div><b class="num">${fmt(p)}</b></div>`).join('') || '<div class="empty">아직 기록이 없어요.</div>'}</div></section>`;
    };
    return list('득점 순위', (a, b) => b.season.goals - a.season.goals || a.season.apps - b.season.apps, (p) => p.season.goals + '골')
      + list('도움 순위', (a, b) => b.season.assists - a.season.assists, (p) => p.season.assists + '도움')
      + list('평균 평점 (5경기 이상)', (a, b) => (b.season.apps >= 5) - (a.season.apps >= 5) || b.season.rsum / b.season.apps - a.season.rsum / a.season.apps, (p) => (p.season.rsum / p.season.apps).toFixed(2));
  }

  function openTeam(id) {
    const G = UI.G, t = S.team(G, id);
    const ps = sortPlayers(t.squad.map((x) => G.players[x]), 'pos');
    sheet(`<div class="row">${crest(t, 'lg')}<div class="grow"><h2>${esc(t.name)}</h2><div class="muted" style="font-size:12.5px">${t.div}부 · ${S.position(G, id)}위 · ${esc(t.stadium)} (${t.cap.toLocaleString('ko-KR')}석)</div></div></div>
      <div class="kv"><div><small>선수단 OVR</small><b>${W.squadOvr(G, t)}</b></div><div><small>포메이션</small><b>${t.tactics.formation}</b></div><div><small>최근 폼</small><b style="font-size:12px">${formHtml(t.form)}</b></div></div>
      <div class="list">${ps.map((p) => `<div class="li tap" data-act="player" data-v="${p.id}">${posTag(p.pos)}<div class="grow"><div class="name">${esc(p.name)}</div><div class="sub">${p.age}세 · 가치 ${money(p.value)}</div></div>${ovrBadge(p.ovr)}</div>`).join('')}</div>`);
  }

  // ── 이적 ───────────────────────────────────────────────────
  function transferView() {
    const G = UI.G, sub = UI.sub.transfer;
    let body;
    if (sub === 'offers') body = offersView();
    else if (sub === 'free') body = marketList(G.freeAgents.map((id) => G.players[id]).filter(Boolean), true);
    else if (sub === 'short') body = marketList((G.short || []).map((id) => G.players[id]).filter((p) => p && p.teamId !== G.user.teamId), false, true);
    else if (sub === 'news') body = `<section class="card"><h2>이적 소식</h2><div class="list">${G.transfers.slice(0, 40).map((x) => {
      const p = G.players[x.pid];
      const from = x.from != null ? S.team(G, x.from).short : '자유계약', to = x.to != null ? S.team(G, x.to).short : '방출';
      return `<div class="li"><div class="grow"><div class="name">${p ? esc(p.name) : '은퇴 선수'}</div><div class="sub">${esc(from)} → ${esc(to)} · ${x.s}시즌 ${x.w + 1}주</div></div><b class="num">${x.fee ? money(x.fee) : '-'}</b></div>`;
    }).join('') || '<div class="empty">아직 이적이 없어요.</div>'}</div></section>`;
    else {
      const ut = S.userTeam(G);
      let ps = Object.values(G.players).filter((p) => p.teamId != null && p.teamId !== ut.id);
      body = marketList(ps, false);
    }
    const open = S.windowOpen(G);
    const banner = `<div class="card row" style="padding:10px 14px"><span class="tag ${open ? 'green' : ''}">${open ? '열림' : '닫힘'}</span><span class="grow" style="font-size:13px">${open ? '이적시장이 열려 있어요. 다른 구단 선수에게 제안할 수 있어요.' : '이적시장이 닫혀 있어요. 자유계약 선수는 언제든 영입할 수 있어요.'}</span></div>`;
    return seg('transfer', [['market', '선수 찾기'], ['free', '자유계약'], ['offers', `제안${G.offers.length ? ' ' + G.offers.length : ''}`], ['short', '관심'], ['news', '소식']], sub) + banner + body;
  }
  function marketList(ps, free, short) {
    const G = UI.G, ut = S.userTeam(G), fl = UI.filter;
    if (fl.pos !== 'ALL') ps = ps.filter((p) => p.pos === fl.pos);
    if (fl.budget && !free) ps = ps.filter((p) => p.value <= ut.balance);
    const sort = fl.sort === 'pos' ? 'ovr' : fl.sort;
    sortPlayers(ps, sort);
    const total = ps.length;
    ps = ps.slice(0, 60);
    return `<div class="row wrap" style="gap:8px">
      <div class="chips grow">${['ALL', 'GK', 'DF', 'MF', 'FW'].map((k) => `<button class="chip ${fl.pos === k ? 'on' : ''}" data-act="fpos" data-v="${k}">${k === 'ALL' ? '전체' : k}</button>`).join('')}
      ${free || short ? '' : `<button class="chip ${fl.budget ? 'on' : ''}" data-act="fbudget">예산 내</button>`}</div>
      <select class="sel" data-act="fsort" aria-label="정렬">${[['ovr', '능력순'], ['pot', '잠재력순'], ['value', '가치순'], ['age', '나이순']].map(([k, l]) => `<option value="${k}" ${sort === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <section class="card" style="padding-block:4px"><div class="list">
      ${ps.map((p) => { const t = p.teamId != null ? S.team(G, p.teamId) : null; return `<div class="li tap" data-act="player" data-v="${p.id}">${posTag(p.pos)}
        <div class="grow"><div class="name">${esc(p.name)}</div><div class="sub">${p.age}세 · ${t ? esc(t.name) : '무소속'} · <span class="stars" style="font-size:11px">${stars(p)}</span></div></div>
        <div style="text-align:right"><div class="num" style="font-weight:600">${free ? money(S.wageDemand(G, p, ut)) + '/주' : money(p.value)}</div></div>${ovrBadge(p.ovr)}</div>`; }).join('') || `<div class="empty">${short ? '관심 선수로 등록한 선수가 없어요. 선수 정보에서 ☆를 눌러 추가하세요.' : '조건에 맞는 선수가 없어요.'}</div>`}
      </div></section>${total > 60 ? `<p class="muted" style="font-size:12px;text-align:center;margin:0">상위 60명 표시 (전체 ${total}명)</p>` : ''}`;
  }
  function offersView() {
    const G = UI.G;
    if (!G.offers.length) return '<section class="card"><div class="empty">받은 제안이 없어요. 선수를 이적 리스트에 올리면 제안이 늘어나요.</div></section>';
    return `<section class="card"><h2>받은 제안</h2><div class="list">${G.offers.map((o) => {
      const p = G.players[o.pid], t = S.team(G, o.from);
      return `<div class="li" style="flex-wrap:wrap">${crest(t, 'sm')}<div class="grow"><div class="name">${esc(p.name)} ← ${esc(t.name)}</div><div class="sub">제시액 <b style="color:var(--chalk)">${money(o.amount)}</b> · 선수 가치 ${money(p.value)} · ${o.exp - G.week}주 내 응답</div></div>
        <div class="row" style="gap:6px"><button class="btn sm ghost" data-act="reject" data-v="${o.id}">거절</button><button class="btn sm primary" data-act="accept" data-v="${o.id}">수락</button></div></div>`;
    }).join('')}</div></section>`;
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
    return `<section class="card stack"><div class="row">${crest(t, 'lg')}<div class="grow"><h2 style="font-family:var(--f-display);font-size:22px">${esc(t.name)}</h2><div class="muted" style="font-size:12.5px">${t.div}부 리그 · 감독 ${esc(G.user.name)}</div></div></div>
      <div class="kv"><div><small>경기장</small><b style="font-size:13px">${esc(t.stadium)}</b></div><div><small>수용 인원</small><b>${Math.round(t.cap * (1 + (t.facilities.stadium - 1) * 0.15)).toLocaleString('ko-KR')}</b></div><div><small>팬 열기</small><b>${Math.round(t.fans)}</b></div></div>
      <div class="kv"><div><small>구단 평판</small><b>${t.rep}</b></div><div><small>선수단 OVR</small><b>${W.squadOvr(G, t)}</b></div><div><small>리그 순위</small><b>${S.position(G, t.id)}위</b></div></div></section>
      <section class="card stack"><h2 style="margin:0">구단주</h2><div class="meter"><i style="width:${conf}%;background:${conf >= 60 ? 'var(--win)' : conf >= 35 ? 'var(--draw)' : 'var(--loss)'}"></i></div>
      <div class="muted" style="font-size:13px">신뢰도 ${conf}/100 · 시즌 목표 <b style="color:var(--chalk)">${esc(G.board.goal.text)}</b>. 신뢰도가 바닥나면 해임될 수 있어요.</div></section>`;
  }
  function financeView() {
    const G = UI.G, t = S.userTeam(G);
    const cat = G.fin.cat || {};
    const entries = Object.entries(cat).sort((a, b) => b[1] - a[1]);
    const max = Math.max(1, ...entries.map((e) => Math.abs(e[1])));
    const net = entries.reduce((s, e) => s + e[1], 0);
    return `<section class="card stack"><h2 style="margin:0">재정 현황</h2>
      <div class="kv"><div><small>잔고</small><b>${money(t.balance)}</b></div><div><small>주급 합계/주</small><b>${money(W.wageBill(G, t))}</b></div><div><small>시즌 손익</small><b style="color:${net >= 0 ? 'var(--win)' : 'var(--loss)'}">${net >= 0 ? '+' : ''}${money(net)}</b></div></div></section>
      <section class="card"><h2>이번 시즌 항목별</h2><div class="stack" style="gap:9px">
        ${entries.map(([k, v]) => `<div><div class="row" style="font-size:13px"><span class="grow">${esc(k)}</span><b class="num" style="color:${v >= 0 ? 'var(--win)' : 'var(--loss)'}">${v >= 0 ? '+' : ''}${money(v)}</b></div>
          <div class="bar" style="margin-top:4px;height:7px"><i style="width:${Math.abs(v) / max * 100}%;background:${v >= 0 ? 'var(--win)' : 'var(--loss)'}"></i></div></div>`).join('') || '<div class="empty">아직 기록이 없어요.</div>'}
      </div></section>
      <section class="card"><h2>최근 거래</h2><div class="list">${G.fin.log.slice(0, 15).map((e) => `<div class="li"><span class="grow" style="font-size:13px">${esc(e.label)}<span class="muted"> · ${e.w + 1}주</span></span><b class="num" style="color:${e.amount >= 0 ? 'var(--win)' : 'var(--loss)'}">${e.amount >= 0 ? '+' : ''}${money(e.amount)}</b></div>`).join('')}</div></section>`;
  }
  function facilitiesView() {
    const G = UI.G, t = S.userTeam(G);
    return Object.keys(S.FAC).map((k) => {
      const f = S.FAC[k], lv = t.facilities[k];
      const building = t.build && t.build.k === k;
      return `<section class="card stack"><div class="row"><h2 class="grow" style="margin:0">${f.name}</h2><span class="stars">${'●'.repeat(lv)}<span style="opacity:.25">${'●'.repeat(5 - lv)}</span></span></div>
        <div class="muted" style="font-size:13px">${f.desc} · 현재 ${lv}단계</div>
        ${building ? `<div class="tag amber" style="align-self:flex-start">공사 중 · ${t.build.weeks}주 남음</div>` : lv >= 5 ? '<div class="tag green" style="align-self:flex-start">최고 단계</div>' :
          `<button class="btn" data-act="upgrade" data-v="${k}" ${t.build ? 'disabled' : ''}>${lv + 1}단계 공사 · ${money(S.facCost(t, k))}</button>`}</section>`;
    }).join('') + '<p class="muted" style="font-size:12px;margin:0;text-align:center">공사는 한 번에 하나씩만 할 수 있어요.</p>';
  }
  function careerView() {
    const G = UI.G, u = G.user;
    const games = u.wins + u.draws + u.losses;
    return `<section class="card stack"><h2 style="margin:0">${esc(u.name)} 감독</h2>
      <div class="kv"><div><small>경기</small><b>${games}</b></div><div><small>승-무-패</small><b>${u.wins}-${u.draws}-${u.losses}</b></div><div><small>승률</small><b>${games ? Math.round(u.wins / games * 100) : 0}%</b></div></div>
      <div class="kv"><div><small>감독 평판</small><b>${u.rep}</b></div><div><small>시즌</small><b>${u.seasons}</b></div><div><small>트로피</small><b>${u.trophies.length}</b></div></div></section>
      <section class="card"><h2>트로피</h2><div class="list">${u.trophies.map((x) => `<div class="li"><span>🏆</span><span class="grow">${esc(x.name)}</span><span class="muted num">${x.year}</span></div>`).join('') || '<div class="empty">첫 트로피를 향해!</div>'}</div></section>
      <section class="card"><h2>시즌 기록</h2><div class="list">${u.history.slice().reverse().map((h) => `<div class="li"><span class="num muted">${h.year}</span><span class="grow">${esc(h.team)} · ${h.div}부 ${h.pos}위</span><span class="muted" style="font-size:12px">컵 ${esc(h.cup)}</span></div>`).join('') || '<div class="empty">첫 시즌 진행 중</div>'}</div></section>
      <section class="card"><h2>업적 <small>${Object.keys(G.ach).length}/${Object.keys(S.ACH).length}</small></h2><div class="grid2">${Object.entries(S.ACH).map(([k, [n, d]]) => {
        const on = !!G.ach[k];
        return `<div style="background:var(--panel-2);border-radius:10px;padding:9px 10px;${on ? '' : 'opacity:.45'}"><div style="font-weight:600;font-size:13px">${on ? '★' : '☆'} ${esc(n)}</div><div class="muted" style="font-size:11.5px">${esc(d)}</div></div>`;
      }).join('')}</div></section>`;
  }
  function settingsView() {
    const G = UI.G;
    return `<section class="card stack"><h2 style="margin:0">게임</h2>
      <div class="stack" style="gap:6px"><span class="eyebrow">기본 경기 속도</span><div class="seg">${[1, 2, 4].map((s) => `<button data-act="defspeed" data-v="${s}" class="${G.settings.speed === s ? 'on' : ''}">${s}배속</button>`).join('')}</div></div>
      <button class="btn" data-act="save">지금 저장 (슬롯 ${UI.slot + 1})</button>
      <button class="btn ghost" data-act="totitle">메인 화면으로</button></section>
      <section class="card stack"><h2 style="margin:0">도움말</h2><div class="muted" style="font-size:13px;line-height:1.6">
      · 홈에서 <b style="color:var(--chalk)">경기 준비</b>를 눌러 라인업과 전술을 정하고 킥오프하세요.<br>
      · 경기 중에는 배속을 바꾸거나 전술·교체로 흐름을 바꿀 수 있어요. 경기당 교체는 5명까지예요.<br>
      · 시즌 첫 4주와 17~21주에 이적시장이 열려요. 자유계약 선수는 언제든 영입할 수 있어요.<br>
      · 1부 하위 3팀은 강등, 2부 상위 3팀은 승격돼요. 구단주 신뢰도가 바닥나면 해임돼요.</div></section>`;
  }

  // ── 시즌 결산 ──────────────────────────────────────────────
  function showSeasonReport(r) {
    const G = UI.G;
    const nm = (id) => esc(S.team(G, id).name);
    const u = r.user;
    sheet(`<span class="eyebrow">${r.year} 시즌 결산</span>
      <h2>${u.pos === 1 ? `${u.div}부 리그 우승!` : `${u.div}부 리그 ${u.pos}위`}</h2>
      <div class="kv"><div><small>목표</small><b style="font-size:13px">${esc(u.goal.text)}</b></div><div><small>달성</small><b style="color:${u.met ? 'var(--win)' : 'var(--loss)'}">${u.met ? '성공' : '실패'}</b></div><div><small>컵</small><b style="font-size:13px">${esc(u.cup)}</b></div></div>
      <div class="list">
        <div class="li"><span class="grow muted">1부 우승</span><b>${nm(r.champions[0])}</b></div>
        <div class="li"><span class="grow muted">2부 우승</span><b>${nm(r.champions[1])}</b></div>
        <div class="li"><span class="grow muted">승격</span><span style="text-align:right">${r.promoted.map(nm).join(', ')}</span></div>
        <div class="li"><span class="grow muted">강등</span><span style="text-align:right">${r.relegated.map(nm).join(', ')}</span></div>
        ${r.awards.scorer ? `<div class="li"><span class="grow muted">1부 득점왕</span><b>${esc(r.awards.scorer.name)}</b></div>` : ''}
        ${r.awards.mvp ? `<div class="li"><span class="grow muted">1부 MVP</span><b>${esc(r.awards.mvp.name)}</b></div>` : ''}
        ${r.retired.length ? `<div class="li"><span class="grow muted">은퇴</span><span style="text-align:right">${r.retired.map(esc).join(', ')}</span></div>` : ''}
        ${r.left.length ? `<div class="li"><span class="grow muted">계약 만료로 이탈</span><span style="text-align:right">${r.left.map(esc).join(', ')}</span></div>` : ''}
        ${r.youth.length ? `<div class="li"><span class="grow muted">유스 승격</span><span style="text-align:right">${r.youth.map((p) => `${esc(p.name)} (${p.pos})`).join(', ')}</span></div>` : ''}
      </div>
      <div class="muted" style="font-size:13px">구단주 신뢰도 ${Math.round(u.conf)}/100${r.newGoal ? ` · 새 시즌 목표: <b style="color:var(--chalk)">${esc(r.newGoal.text)}</b>` : ''}</div>
      <button class="btn primary big" data-act="closereport">${u.sacked ? '결과 확인' : `${G.year} 시즌 시작`}</button>`, () => render());
  }

  // ── 경기 전 / 경기 ─────────────────────────────────────────
  function openPrematch() {
    const G = UI.G;
    const fx = S.userFixture(G);
    if (!fx) return;
    UI.prematch = true;
    UI.selSlot = null;
    renderPrematch();
  }
  function renderPrematch() {
    const G = UI.G, fx = S.userFixture(G), t = S.userTeam(G);
    const home = fx.m.h === t.id;
    const opp = S.team(G, home ? fx.m.a : fx.m.h);
    W.autoLineup(G, opp);
    const oppStar = opp.lineup.map((id) => G.players[id]).sort((a, b) => b.ovr - a.ovr)[0];
    let el = $('.match-screen');
    if (!el) { el = document.createElement('div'); el.className = 'match-screen'; document.body.appendChild(el); }
    el.innerHTML = `<div class="in">
      <div class="row"><button class="btn sm ghost" data-act="closepre">← 닫기</button><span class="grow"></span><span class="eyebrow">${esc(fx.label)}</span></div>
      <section class="card stack"><div class="row">${crest(opp, 'lg')}<div class="grow"><div class="eyebrow">${home ? '홈 경기' : '원정 경기'} 상대</div><h2 style="font-family:var(--f-display);font-size:20px">${esc(opp.name)}</h2>
        <div class="muted" style="font-size:12.5px">${opp.tactics.formation} · 전력 ${W.teamRating(G, opp)} · ${formHtml(opp.form)}</div></div></div>
        ${oppStar ? `<div class="muted" style="font-size:12.5px">경계 대상: <b style="color:var(--chalk)">${esc(oppStar.name)}</b> (${oppStar.pos}, OVR ${oppStar.ovr}, 시즌 ${oppStar.season.goals}골)</div>` : ''}</section>
      ${lineupEditor(t)}
      ${tacticsPanel(t.tactics, 'team')}
      <div class="grid2"><button class="btn" data-act="quickmatch">결과만 보기</button><button class="btn primary big" data-act="kickoff" style="padding:12px">킥오프 ▸</button></div>
    </div>`;
  }

  function startLive(quick) {
    const G = UI.G, fx = S.userFixture(G);
    const t = S.userTeam(G);
    W.validateLineup(G, t);
    const m = S.createMatch(G, fx);
    const userSide = fx.m.h === t.id ? 0 : 1;
    UI.prematch = false;
    if (quick) { m.runToEnd(); return finishMatch(m, fx); }
    UI.live = { m, fx, userSide, speed: G.settings.speed || 1, paused: false, acc: 0, evShown: 0, tab: 'feed', selOut: null, last: 0 };
    let el = $('.match-screen');
    if (!el) { el = document.createElement('div'); el.className = 'match-screen'; document.body.appendChild(el); }
    const h = m.sides[0].team, a = m.sides[1].team;
    const kit = KM.Render.kits(h, a);
    el.innerHTML = `<div class="in">
      <div class="scoreboard"><div class="tm">${crest(h, 'sm')}<b>${esc(h.short)}</b></div><div class="mid"><div class="score" id="lv-score">0 - 0</div><div class="clock" id="lv-clock">00:00</div></div><div class="tm away">${crest(a, 'sm')}<b>${esc(a.short)}</b></div></div>
      <div class="possbar" aria-hidden="true"><i id="lv-ph" style="background:${kit[0].fill};width:50%"></i><i id="lv-pa" style="background:${kit[1].fill};flex:1"></i></div>
      <div class="pitch-wrap"><canvas class="pitch" id="lv-canvas" aria-label="경기 화면"></canvas><div id="lv-flash"></div></div>
      <div class="ctrl"><button class="btn" data-act="lvpause" id="lv-pause">일시정지</button><button class="btn" data-act="lvspeed" id="lv-speed">${UI.live.speed}배속</button><button class="btn" data-act="lvskip">결과로 ▸▸</button></div>
      <div class="seg" id="lv-tabs">${[['feed', '중계'], ['stats', '기록'], ['tac', '전술'], ['subs', '교체']].map(([k, l]) => `<button data-act="lvtab" data-v="${k}" class="${k === 'feed' ? 'on' : ''}">${l}</button>`).join('')}</div>
      <section class="card" id="lv-panel"></section>
      <button class="btn primary big" id="lv-done" data-act="lvdone" hidden>경기 결과 확인</button>
    </div>`;
    const cv = $('#lv-canvas');
    UI.live.view = new KM.Render.PitchView(cv, m, userSide);
    UI.live.view.snapshot();
    UI.live.panelSig = '';
    renderLivePanel(true);
    UI.live.last = performance.now();
    requestAnimationFrame(liveLoop);
    tryWakeLock();
  }

  function tryWakeLock() {
    try { if (navigator.wakeLock) navigator.wakeLock.request('screen').then((l) => { UI.wake = l; }).catch(() => {}); } catch (e) { /* 무시 */ }
  }

  const STEPS_PER_SEC = 40; // 1배속 = 초당 엔진 4초 → 90분 경기가 약 5분
  function liveLoop(now) {
    const L = UI.live;
    if (!L) return;
    const m = L.m;
    const dt = Math.min(0.1, (now - L.last) / 1000);
    L.last = now;
    if (!L.paused && !m.finished) {
      L.acc += dt * STEPS_PER_SEC * L.speed;
      let n = 0;
      while (L.acc >= 1 && n < 400) {
        L.view.snapshot();
        m.step();
        L.acc -= 1; n++;
        if (m.flash) showFlash(m.flash);
        if (m.finished) break;
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

  function showFlash(f) {
    const box = $('#lv-flash');
    if (!box) return;
    const L = UI.live;
    const mine = f.side === L.userSide;
    if (f.type === 'goal') box.innerHTML = `<div class="flash">${mine ? '골!!' : '실점'}<small>${esc(f.name)}</small></div>`;
    else if (f.type === 'red') box.innerHTML = `<div class="flash red">퇴장<small>${esc(f.name)}</small></div>`;
    else if (f.type === 'pen') box.innerHTML = `<div class="flash" style="font-size:38px">페널티킥</div>`;
    if (navigator.vibrate && f.type === 'goal' && mine) try { navigator.vibrate(120); } catch (e) { /* 무시 */ }
  }

  function updateLiveHud() {
    const L = UI.live, m = L.m;
    const sc = `${m.score[0]} - ${m.score[1]}`;
    const s = $('#lv-score'); if (s && s.textContent !== sc) s.textContent = sc;
    const c = $('#lv-clock'); const ct = m.finished ? '경기 종료' : m.state === 'kickoff' && m.half === 2 && m.t <= KM.Engine.HALF + m.added[0] + 0.01 ? '후반 시작' : m.clockText();
    if (c && c.textContent !== ct) c.textContent = ct;
    const pp = m.possPct();
    const ph = $('#lv-ph'); if (ph) ph.style.width = pp + '%';
    if (m.events.length !== L.evShown || (performance.now() - (L.panelT || 0) > 1000)) {
      L.evShown = m.events.length;
      L.panelT = performance.now();
      renderLivePanel(false);
    }
  }

  function renderLivePanel(force) {
    const L = UI.live; if (!L) return;
    const m = L.m, panel = $('#lv-panel'); if (!panel) return;
    if (L.tab === 'tac' && !force) return; // 전술 탭은 사용자가 조작할 때만 다시 그림
    if (L.tab === 'subs' && !force && !L.dirtySubs) { return; }
    L.dirtySubs = false;
    let html = '';
    if (L.tab === 'feed') {
      const evs = m.events.slice().reverse();
      html = `<div class="feed">${evs.map((e) => `<div class="ev ${e.type}"><span class="t">${e.type === 'half' || e.type === 'ft' ? '' : e.min + "'"}</span><span class="x">${evIcon(e)} ${esc(e.text)}</span></div>`).join('') || '<div class="empty">킥오프!</div>'}</div>`;
    } else if (L.tab === 'stats') {
      html = liveStats(m);
    } else if (L.tab === 'tac') {
      const tac = m.sides[L.userSide].tactics;
      html = `<div class="stack"><div class="row"><span class="eyebrow grow">포메이션</span><select class="sel" data-act="lvform">${Object.keys(D.FORMATIONS).map((f) => `<option ${f === tac.formation ? 'selected' : ''}>${f}</option>`).join('')}</select></div>
        ${['mentality', 'press', 'style', 'line', 'width'].map((k) => `<div class="stack" style="gap:6px"><span class="eyebrow">${{ mentality: '공격 성향', press: '압박 강도', style: '패스 스타일', line: '수비 라인', width: '공격 폭' }[k]}</span><div class="seg">${D.TACTIC_LABELS[k].map((l, i) => `<button data-act="tac" data-scope="live" data-k="${k}" data-v="${i}" class="${tac[k] === i ? 'on' : ''}">${l}</button>`).join('')}</div></div>`).join('')}
        <p class="muted" style="margin:0;font-size:12px">변경 사항은 즉시 경기에 반영돼요.</p></div>`;
    } else {
      const s = L.userSide;
      const on = m.onPitch(s).slice().sort((a, b) => a.bx - b.bx);
      const bench = m.sides[s].bench.filter((p) => !m.used.has(p.id));
      html = `<div class="row" style="margin-bottom:8px"><b class="grow">교체 <span class="muted" style="font-weight:400">남은 횟수 ${m.subsLeft[s]}</span></b>${L.selOut ? '<span class="tag amber">들어갈 선수를 고르세요</span>' : '<span class="muted" style="font-size:12px">나갈 선수를 먼저 고르세요</span>'}</div>
        <div class="list">${on.map((x) => `<div class="li tap" data-act="lvout" data-v="${x.id}" style="${L.selOut === x.id ? 'background:var(--panel-2);border-radius:8px' : ''}"><span class="pos ${x.grp}">${x.role}</span><div class="grow"><div class="name">${esc(x.p.name)} ${x.yellow ? '<span class="tag amber">경고</span>' : ''}${x.injured ? '<span class="tag red">부상</span>' : ''}</div>
          <div class="bar" style="margin-top:4px;max-width:140px"><i style="width:${Math.round(x.st * 100)}%;background:${condColor(x.st * 100)}"></i></div></div><span class="num muted">${Math.round(x.st * 100)}%</span></div>`).join('')}</div>
        <div class="eyebrow" style="margin:12px 0 4px">벤치</div>
        <div class="list">${bench.map((p) => `<div class="li ${L.selOut && m.subsLeft[s] > 0 ? 'tap' : ''}" ${L.selOut && m.subsLeft[s] > 0 ? `data-act="lvin" data-v="${p.id}"` : ''} style="${L.selOut ? '' : 'opacity:.7'}">${posTag(p.pos)}<div class="grow"><div class="name">${esc(p.name)}</div><div class="sub">컨디션 ${p.cond}%</div></div>${ovrBadge(p.ovr)}</div>`).join('') || '<div class="empty">벤치 선수가 없어요.</div>'}</div>`;
    }
    panel.innerHTML = html;
    if (L.tab === 'stats') { const c = $('#momchart'); if (c) drawMomentum(c, m.momentum, m.sides); }
  }
  function evIcon(e) {
    return { goal: '⚽', yellow: '🟨', red: '🟥', sub: '⇄', inj: '✚', save: '🧤', miss: '✖', pen: '❗', half: '⏸', ft: '⏹', chance: '•' }[e.type] || '•';
  }
  function liveStats(m) {
    const s0 = m.stats[0], s1 = m.stats[1];
    const pp = m.possPct();
    const row = (label, a, b, fmt) => {
      const tot = a + b || 1;
      return `<div class="statrow"><span class="num">${fmt ? fmt(a) : a}</span><div><div class="mid">${label}</div><div class="dual"><i style="flex:${a / tot};background:${m.sides[0].team.c1}"></i><i style="flex:${b / tot};background:${m.sides[1].team.c1}"></i></div></div><span class="num">${fmt ? fmt(b) : b}</span></div>`;
    };
    return `${row('점유율', pp, 100 - pp, (v) => v + '%')}${row('슈팅', s0.shots, s1.shots)}${row('유효 슈팅', s0.sot, s1.sot)}${row('기대 득점(xG)', s0.xg, s1.xg, (v) => v.toFixed(2))}
      ${row('패스 성공', s0.passOk, s1.passOk)}${row('태클', s0.tkl, s1.tkl)}${row('코너킥', s0.corners, s1.corners)}${row('파울', s0.fouls, s1.fouls)}${row('경고', s0.yel, s1.yel)}
      <div class="eyebrow" style="margin-top:10px">흐름 (위: ${esc(m.sides[0].team.short)}, 아래: ${esc(m.sides[1].team.short)})</div><canvas class="mom" id="momchart"></canvas>`;
  }
  function drawMomentum(c, data, sides) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = c.clientWidth || 300, h = c.clientHeight || 90;
    c.width = w * dpr; c.height = h * dpr;
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
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
      const x = (d.min / 95) * w;
      g.fillStyle = v >= 0 ? sides[0].team.c1 : sides[1].team.c1;
      const bh = Math.abs(v) * (mid - 4);
      g.fillRect(x, v >= 0 ? mid - bh : mid, Math.max(1, bw - 1), bh);
    }
  }

  function finishMatch(m, fx) {
    const G = UI.G;
    const summary = S.playWeek(G, m);
    UI.live = null;
    if (UI.wake) { try { UI.wake.release(); } catch (e) { /* 무시 */ } UI.wake = null; }
    const el = $('.match-screen'); if (el) el.remove();
    save();
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
    const div = S.userTeam(G).div - 1;
    const others = ev.k === 'L' ? summary.results.filter((x) => x.div === div && x !== summary.user) : summary.results.filter((x) => x !== summary.user);
    const pp = m.possPct();
    sheet(`<span class="eyebrow">${ev.k === 'L' ? `리그 ${ev.r + 1}라운드` : `코리아 컵 ${S.CUP_NAMES[ev.r]}`} · 경기 결과</span>
      <div class="fixture"><div class="tm">${crest(h, 'lg')}<b>${esc(h.name)}</b></div><div class="sc num">${m.score[0]} - ${m.score[1]}</div><div class="tm">${crest(a, 'lg')}<b>${esc(a.name)}</b></div></div>
      ${res.pens ? `<div class="muted" style="text-align:center">승부차기 ${res.pens[0]} - ${res.pens[1]}</div>` : ''}
      ${goals.length ? `<div class="stack" style="gap:4px;font-size:13px">${goals.map((g) => `<div style="text-align:${g.side === 0 ? 'left' : 'right'}">⚽ ${esc(G.players[g.pid] ? G.players[g.pid].name : '')} <span class="muted">${g.min}'</span></div>`).join('')}</div>` : ''}
      <div class="kv"><div><small>점유율</small><b>${pp}% : ${100 - pp}%</b></div><div><small>슈팅</small><b>${m.stats[0].shots} : ${m.stats[1].shots}</b></div><div><small>xG</small><b>${m.stats[0].xg.toFixed(1)} : ${m.stats[1].xg.toFixed(1)}</b></div></div>
      ${motm ? `<div class="row"><span class="tag amber">경기 최우수 선수</span><b class="grow">${esc(motm.p.name)}</b><span class="rating hi">${motm.rating.toFixed(1)}</span></div>` : ''}
      <div><div class="eyebrow" style="margin-bottom:4px">우리 선수 평점</div><div class="list">${mine.map((x) => `<div class="li"><span class="pos ${x.p.pos}">${x.role}</span><span class="grow name" style="font-weight:500">${esc(x.p.name)} ${x.goals ? '⚽'.repeat(x.goals) : ''}${x.ast ? ' 🅰'.repeat(x.ast) : ''}</span><span class="muted num" style="font-size:12px">${x.mins}'</span><span class="rating ${ratingCls(x.rating)}">${x.rating.toFixed(1)}</span></div>`).join('')}</div></div>
      ${others.length ? `<div><div class="eyebrow" style="margin-bottom:4px">다른 경기</div><div class="list">${others.slice(0, 8).map((x) => matchLine(G, x.m)).join('')}</div></div>` : ''}
      <button class="btn primary" data-act="closesheet">확인</button>`, () => afterWeek(summary));
    UI._afterWeek = summary;
  }

  function afterWeek(summary) {
    const G = UI.G;
    UI._afterWeek = null;
    if (G.newAch && G.newAch.length) {
      const k = G.newAch.shift();
      toast(`업적 달성: ${S.ACH[k][0]}`);
      G.newAch = [];
    }
    if (G.user.sacked) { save(); render(); return; }
    if (summary && summary.seasonOver) render();
  }

  // 사용자 경기가 없는 주
  function simWeek() {
    const G = UI.G;
    const summary = S.playWeek(G, null);
    save();
    render();
    if (summary && summary.results.length) {
      const ev = summary.ev;
      sheet(`<span class="eyebrow">${ev.k === 'C' ? `코리아 컵 ${S.CUP_NAMES[ev.r]}` : '리그'} 결과</span><h2>이번 주 결과</h2>
        <div class="list">${summary.results.slice(0, 16).map((x) => matchLine(G, x.m)).join('')}</div>
        <button class="btn primary" data-act="closesheet">확인</button>`, () => afterWeek(summary));
    }
  }

  // ── 입력 처리 ──────────────────────────────────────────────
  const actions = {
    tab(el) { UI.tab = el.dataset.v; UI.selSlot = null; UI.filter.pos = 'ALL'; render(); window.scrollTo(0, 0); },
    sub(el) {
      const k = el.dataset.k, v = el.dataset.v;
      if (k === 'ngdiv') { UI.newGame.div = +v; UI.newGame.team = null; UI.newGame.name = ($('#ng-name') || {}).value; return renderNewGame(); }
      UI.sub[k] = v; UI.selSlot = null; rerenderView();
    },
    goto(el) { UI.tab = el.dataset.tab; UI.sub[el.dataset.tab] = el.dataset.sub; render(); window.scrollTo(0, 0); },
    fpos(el) { UI.filter.pos = el.dataset.v; rerenderView(); },
    fdiv(el) { UI.filter.div = +el.dataset.v; rerenderView(); },
    fbudget() { UI.filter.budget = !UI.filter.budget; rerenderView(); },
    player(el) { openPlayer(+el.dataset.v, { pid: +el.dataset.v }); },
    teamsheet(el) { openTeam(+el.dataset.v); },
    closesheet() { const cb = UI._sheetClose; closeSheet(); if (cb) cb(); },

    // 타이틀
    load(el) {
      const n = +el.dataset.v;
      const G = loadSlot(n);
      if (!G) return toast('세이브를 불러오지 못했어요.');
      UI.G = G; UI.slot = n; UI.tab = 'home'; render();
    },
    newgame(el) { UI.newGame = { slot: +el.dataset.v, div: 0, team: null, seed: (Date.now() ^ (Math.random() * 1e9)) >>> 0 }; render(); },
    ngback() { UI.newGame = null; render(); },
    ngteam(el) { UI.newGame.team = +el.dataset.v; UI.newGame.name = ($('#ng-name') || {}).value; renderNewGame(); },
    ngstart() {
      const ng = UI.newGame;
      const name = (($('#ng-name') || {}).value || '').trim() || '감독';
      const G = ng.G;
      G.user.teamId = ng.team; G.user.name = name;
      G.news = [];
      S.setupSeason(G);
      const t = S.userTeam(G);
      S.news(G, 'board', `${name} 감독 부임`, `${josa(t.name, '이/가')} ${name} 감독을 새 사령탑으로 선임했습니다. 구단주의 목표는 '${G.board.goal.text}'입니다.`);
      UI.G = G; UI.slot = ng.slot; UI.newGame = null; UI.tab = 'home';
      save(); render();
    },
    askdel(el) { UI.confirm = 'del' + el.dataset.v; render(); },
    delslot(el) { deleteSlot(+el.dataset.v); UI.confirm = null; render(); },
    totitle() { save(); UI.G = null; closeSheet(); render(); },
    takejob(el) { S.takeJob(UI.G, +el.dataset.v); save(); UI.tab = 'home'; render(); },

    // 홈
    prematch() { openPrematch(); },
    simweek() { simWeek(); },
    press(el) { S.answerPress(UI.G, +el.dataset.v); save(); rerenderView(); toast('기자회견을 마쳤어요.'); },
    endseason() {
      const r = S.endSeason(UI.G);
      save();
      showSeasonReport(r);
    },
    closereport() { closeSheet(); UI.tab = 'home'; render(); },

    // 선수단 / 라인업
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
    formation(el) { const t = S.userTeam(UI.G); t.tactics.formation = el.value; W.autoLineup(UI.G, t); UI.selSlot = null; refreshLineupHost(); },
    autolineup() { W.autoLineup(UI.G, S.userTeam(UI.G)); UI.selSlot = null; refreshLineupHost(); toast('가장 강한 라인업으로 채웠어요.'); },
    tac(el) {
      const k = el.dataset.k, v = +el.dataset.v;
      if (el.dataset.scope === 'live') {
        const L = UI.live; L.m.sides[L.userSide].tactics[k] = v; L.m.sides[L.userSide].baseMent = L.m.sides[L.userSide].tactics.mentality;
        renderLivePanel(true); return;
      }
      S.userTeam(UI.G).tactics[k] = v; refreshLineupHost();
    },
    tfocus(el) { UI.G.training.focus = el.dataset.v; rerenderView(); },
    tint(el) { UI.G.training.intensity = +el.dataset.v; rerenderView(); },

    // 선수 시트
    pmode(el) { UI.draft.mode = el.dataset.v || null; openPlayer(UI.draft.pid, UI.draft); },
    renew(el) { const r = S.renew(UI.G, UI.draft.pid, +el.dataset.v); toast(r.msg); UI.draft.mode = null; save(); openPlayer(UI.draft.pid, UI.draft); rerenderView(); },
    list() { const p = UI.G.players[UI.draft.pid]; p.listed = !p.listed; toast(p.listed ? '이적 리스트에 올렸어요. 이적시장에서 제안이 들어와요.' : '이적 리스트에서 내렸어요.'); openPlayer(p.id, UI.draft); rerenderView(); },
    release() { const r = S.releasePlayer(UI.G, UI.draft.pid); toast(r.msg); if (r.ok) { closeSheet(); UI.draft = null; save(); render(); } },
    short(el) {
      const G = UI.G; G.short = G.short || [];
      const id = +el.dataset.v;
      G.short = G.short.includes(id) ? G.short.filter((x) => x !== id) : G.short.concat(id);
      openPlayer(id, UI.draft); if (UI.tab === 'transfer') rerenderView();
    },
    amt(el) {
      const d = UI.draft, p = UI.G.players[d.pid];
      const step = Math.max(100, Math.round(p.value * 0.05 / 100) * 100);
      d.amount = Math.max(100, (d.amount || Math.round(p.value / 100) * 100) + step * +el.dataset.v);
      d.msg = null; openPlayer(d.pid, d);
    },
    bid() {
      const d = UI.draft, p = UI.G.players[d.pid];
      const amount = d.amount || Math.round(p.value / 100) * 100;
      const r = S.makeBid(UI.G, d.pid, amount);
      d.msg = r.msg; d.ok = r.status === 'accept';
      if (r.status === 'accept') { d.stage = 'contract'; d.fee = r.fee; d.wage = r.wage; }
      if (r.status === 'counter') d.amount = r.counter;
      openPlayer(d.pid, d);
    },
    freesign() {
      const d = UI.draft, p = UI.G.players[d.pid];
      if (S.userTeam(UI.G).squad.length >= 30) return toast('선수단이 30명으로 가득 찼어요.');
      d.stage = 'contract'; d.fee = 0; d.wage = S.wageDemand(UI.G, p, S.userTeam(UI.G));
      openPlayer(d.pid, d);
    },
    sign(el) {
      const d = UI.draft;
      const r = S.completeSigning(UI.G, d.pid, d.fee || 0, d.wage, +el.dataset.v);
      toast(r.msg);
      if (r.ok) { closeSheet(); UI.draft = null; save(); render(); }
    },
    bidcancel() { UI.draft = { pid: UI.draft.pid }; openPlayer(UI.draft.pid, UI.draft); },
    accept(el) { const r = S.acceptOffer(UI.G, +el.dataset.v); toast(r.msg); save(); render(); },
    reject(el) { S.rejectOffer(UI.G, +el.dataset.v); save(); render(); },
    fround(el) { UI.filter.round = +el.value; rerenderView(); },

    // 구단
    upgrade(el) { const r = S.upgradeFacility(UI.G, el.dataset.v); toast(r.msg); save(); render(); },
    save() { if (save()) toast('저장했어요.'); },
    defspeed(el) { UI.G.settings.speed = +el.dataset.v; save(); rerenderView(); },

    // 경기
    closepre() { UI.prematch = false; const el = $('.match-screen'); if (el) el.remove(); save(); render(); },
    kickoff() { startLive(false); },
    quickmatch() { startLive(true); },
    lvpause(el) { const L = UI.live; L.paused = !L.paused; el.textContent = L.paused ? '재개' : '일시정지'; },
    lvspeed(el) { const L = UI.live; const sp = [1, 2, 4, 8]; L.speed = sp[(sp.indexOf(L.speed) + 1) % sp.length]; el.textContent = L.speed + '배속'; },
    lvskip() { const L = UI.live; L.view.snapshot(); L.m.runToEnd(); },
    lvtab(el) { const L = UI.live; L.tab = el.dataset.v; L.selOut = null; document.querySelectorAll('#lv-tabs button').forEach((b) => b.classList.toggle('on', b === el)); renderLivePanel(true); },
    lvform(el) { const L = UI.live; L.m.setFormation(L.userSide, el.value); renderLivePanel(true); toast(`${el.value}로 변경했어요.`); },
    lvout(el) { const L = UI.live; L.selOut = L.selOut === +el.dataset.v ? null : +el.dataset.v; renderLivePanel(true); },
    lvin(el) {
      const L = UI.live, m = L.m, s = L.userSide;
      const out = m.onPitch(s).find((x) => x.id === L.selOut);
      const p = m.sides[s].bench.find((x) => x.id === +el.dataset.v);
      if (out && p && m.substitute(s, out, p)) toast(`${out.p.name} ↔ ${p.name}`);
      L.selOut = null; renderLivePanel(true);
    },
    lvdone() { const L = UI.live; finishMatch(L.m, L.fx); },
  };

  function refreshLineupHost() {
    if (UI.prematch) renderPrematch();
    else rerenderView();
  }

  function onClick(e) {
    const el = e.target.closest('[data-act]');
    if (!el || el.tagName === 'SELECT') return;
    if (el.disabled) return;
    const fn = actions[el.dataset.act];
    if (fn) { e.preventDefault(); fn(el); }
  }
  function onChange(e) {
    const el = e.target.closest('select[data-act]');
    if (!el) return;
    const fn = actions[el.dataset.act];
    if (fn) fn(el);
  }

  function init() {
    document.addEventListener('click', onClick);
    document.addEventListener('change', onChange);
    window.addEventListener('resize', () => { if (UI.live) UI.live.view.resize(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && UI.G && !UI.live) save(); });
    render();
  }

  UI.init = init;
  UI.render = render;
})(globalThis.KM || (globalThis.KM = {}));
