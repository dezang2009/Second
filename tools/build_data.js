// data/transfermarkt.json + data/club_colors.json → src/realdata.js
// 사용법: node tools/build_data.js
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const tm = JSON.parse(fs.readFileSync(path.join(root, 'data/transfermarkt.json'), 'utf8'));
// 지난 시즌 실제 기록 (python3 tools/fetch_tm_stats.py): [출전, 골, 도움, 경고, 퇴장, 출전시간(분), 경기당 승점]
let STATS = { season: null, players: {} };
try { STATS = JSON.parse(fs.readFileSync(path.join(root, 'data/tm_stats.json'), 'utf8')); } catch (e) { /* 없음 */ }
// 지난 시즌 세부 기록 (python3 tools/fetch_sofascore_stats.py, SofaScore): 평점·슈팅·키패스·드리블·태클 등
let SOFA = { players: {} };
try { SOFA = JSON.parse(fs.readFileSync(path.join(root, 'data/sofa_stats.json'), 'utf8')); } catch (e) { /* 없음 */ }
// 한글 이름: ① 트랜스퍼마크트 프로필의 본국 이름(한국 선수) ② 위키데이터 한국어 표기 ③ 직접 음역한 목록
const KO = {};
try { Object.assign(KO, JSON.parse(fs.readFileSync(path.join(root, 'data/names_wikidata.json'), 'utf8'))); } catch (e) { /* 없음 */ }
for (const f of fs.readdirSync(path.join(root, 'data')).filter((x) => /^names_ko_\d+\.txt$/.test(x))) {
  for (const line of fs.readFileSync(path.join(root, 'data', f), 'utf8').split('\n')) {
    const [id, ko] = line.split('|');
    if (id && ko) KO[id.trim()] = ko.trim();
  }
}
let colors = {};
try { colors = JSON.parse(fs.readFileSync(path.join(root, 'data/club_colors.json'), 'utf8')); } catch (e) { /* 없으면 기본색 */ }

// 로고 색과 실제 홈 유니폼이 다른 구단 보정 (영문/한글 구단명 기준)
const KIT = {
  'Real Madrid': ['#f4f4f4', '#1d2f6f'], '토트넘 홋스퍼 FC': ['#f4f4f4', '#132257'], '유벤투스 FC': ['#f4f4f4', '#161616'],
  'Leeds United': ['#f4f4f4', '#1d428a'], 'Fulham FC': ['#f4f4f4', '#111111'], 'Valencia CF': ['#f4f4f4', '#111111'],
  'Inter Milan': ['#0a3a8c', '#111111'], 'AC Milan': ['#c8102e', '#111111'], 'FC Barcelona': ['#a50044', '#004d98'],
  'Borussia Dortmund': ['#fde100', '#111111'], 'SSC Napoli': ['#12a0d7', '#ffffff'], 'Newcastle United': ['#111111', '#f4f4f4'],
  'Liverpool FC': ['#c8102e', '#f6eb61'], 'Atlético de Madrid': ['#cb3524', '#f4f4f4'], 'Eintracht Frankfurt': ['#111111', '#e1000f'],
  'RB Leipzig': ['#f4f4f4', '#dd0741'], 'VfB Stuttgart': ['#f4f4f4', '#e32219'], 'Olympique Marseille': ['#f4f4f4', '#2faee0'],
  'Hamburger SV': ['#f4f4f4', '#0a3f86'], 'Real Sociedad': ['#0067b1', '#f4f4f4'], 'Sevilla FC': ['#f4f4f4', '#d71920'],
  'RCD Espanyol Barcelona': ['#1a5bb5', '#f4f4f4'], 'Atalanta BC': ['#1e71b8', '#111111'], 'Udinese Calcio': ['#f4f4f4', '#111111'],
  'FC Schalke 04': ['#004d9d', '#f4f4f4'], 'Borussia Mönchengladbach': ['#f4f4f4', '#111111'], 'Como 1907': ['#1a3f7a', '#f4f4f4'],
  '전북 현대 모터스': ['#1a7a3c', '#f4f4f4'], 'FC 서울': ['#b5121b', '#111111'], '포항 스틸러스': ['#c8102e', '#111111'],
};

function percentile(arr, q) {
  const s = arr.slice().sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) * q)] : 0;
}

const leagues = tm.leagues.map((lg) => {
  const vals = lg.clubs.flatMap((c) => c.players.map((p) => p.value)).filter((v) => v > 0);
  const floor = percentile(vals, 0.15) || 100000;
  return {
    code: lg.code, name: lg.name,
    clubs: lg.clubs.map((c) => {
      if (KIT[c.name]) colors[c.id] = KIT[c.name];
      return {
        id: c.id, name: c.name, slug: c.slug, stadium: c.stadium || '', cap: c.cap || 0,
        // [id, 한글 이름, 포지션, 등번호, 나이, 국적, 키, 주발, 계약만료, 가치(€), 사진키, 원어 이름]
        players: c.players.map((p) => {
          // 시장 가치가 없는 선수(주로 유망주·백업)는 리그 하위권 가치로 추정
          const ageF = p.age <= 19 ? 0.6 : p.age >= 33 ? 0.5 : 0.8;
          const value = p.value > 0 ? p.value : Math.round((floor * ageF) / 25000) * 25000;
          const photo = (p.photo || '').replace(/^.*\/portrait\/medium\//, '').replace(/\.jpg$/, '');
          const st = STATS.players[String(p.id)];
          return [p.id, p.ko || KO[p.id] || p.name, p.pos, p.num, p.age, p.nat, p.h, p.foot, p.until, value, photo, p.name, st ? st.slice(0, 6) : 0, SOFA.players[String(p.id)] ? SOFA.players[String(p.id)].map((v) => (v == null ? null : Math.round(v * 100) / 100)) : 0];
        }),
      };
    }),
  };
});

const out = `// 자동 생성 파일: node tools/build_data.js
// 출처: ${tm.source} (수집일 ${tm.fetched}). 선수 사진·구단 로고는 트랜스퍼마크트 CDN에서 불러온다.
(function (KM) {
  'use strict';
  const RAW = ${JSON.stringify({ season: tm.season, fetched: tm.fetched, statsSeason: STATS.season, sofaFields: SOFA.fields, colors, leagues })};
  const F = ['id', 'name', 'pos', 'num', 'age', 'nat', 'h', 'foot', 'until', 'value', 'photo', 'en', 'st', 'ss'];
  for (const lg of RAW.leagues) for (const c of lg.clubs) {
    c.players = c.players.map((row) => { const o = {}; F.forEach((k, i) => { o[k] = row[i]; }); return o; });
  }
  KM.REAL = RAW;
})(globalThis.KM || (globalThis.KM = {}));
`;
fs.writeFileSync(path.join(root, 'src/realdata.js'), out);
console.log('src/realdata.js', (out.length / 1024).toFixed(0) + 'KB');
