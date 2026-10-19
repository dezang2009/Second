#!/usr/bin/env python3
"""소파스코어(SofaScore) 공개 JSON API에서 지난 시즌 리그 선수 기록(평점·슈팅·키패스·드리블·태클 등)을 모아
트랜스퍼마크트 선수와 짝지어 저장한다.

사용법: python3 tools/fetch_sofascore_stats.py
결과:   data/sofa_stats.json
  {"season": {...리그별 시즌 이름}, "fetched": "YYYY-MM-DD", "source": "sofascore",
   "fields": [...아래 순서], "players": {"<TM 선수 id>": [값, ...]}}

배열 필드 순서 (FIELDS 와 같음, 리그 경기만·시즌 합계):
   0 rating                    평균 평점 (출전 시간 가중 평균, 소수 2자리)
   1 apps                      출전 경기 수
   2 minutes                   출전 시간(분)
   3 goals                     골
   4 assists                   도움
   5 xG                        기대 득점 (소수 2자리)
   6 shots                     슈팅
   7 keyPasses                 키패스
   8 bigChancesCreated         빅찬스 생성
   9 accuratePassesPercentage  패스 성공률 % (출전 시간 가중, 소수 1자리)
  10 successfulDribbles        드리블 성공
  11 tackles                   태클
  12 interceptions             인터셉트
  13 clearances                클리어링
  14 aerialDuelsWon            공중볼 경합 승리
  15 saves                     선방
  16 goalsConceded             뛰는 동안 팀 실점 (골키퍼가 아니어도 나옴; 값이 없으면 null)
값이 없으면 null.

시즌: 유럽 5대 리그는 2025/26, K리그1은 2025 (마지막으로 끝난 시즌).
API:  /api/v1/unique-tournament/{UT}/seasons, .../season/{S}/statistics?limit=100&offset=N&fields=...
      (기본값으로 1경기 이상 뛴 선수가 모두 나온다. 원본 응답은 .tm-cache/sofascore 에 캐시)

짝짓기 (한 소파스코어 선수는 한 TM 선수에게만; 이름은 낱말 단위로, 한국 이름은 로마자 흔들림을 줄인 열쇠로 비교):
  1) 소파스코어 팀 → TM 구단 (아래 TEAM 표, 손으로 확인) 안에서 강한 이름 일치
  2) 같은 리그 → 6개 리그 전체의 남은 선수끼리, 강한 일치(≥0.9) + 생년 일치 + 양쪽 모두 유일할 때만
     (지난 시즌 다른 구단·리그에서 뛴 선수)
  3) 같은 구단 안 느슨한 일치(같은 성 / 성이 이름에 포함, 예: Ally Samatta ↔ Mbwana Samatta) + 생년 일치
  4) 같은 리그 → 전체, 성+이름 앞 두 글자(애칭: Andy/Andrew, Kostas/Konstantinos) + 생년 + 양쪽 유일
  생년은 소파스코어 /api/v1/player/{id} 의 dateOfBirth 와 TM 'age'(transfermarkt.json 'fetched' 기준)로 확인한다.
  같은 소파스코어 선수가 두 리그에 기록이 있으면(겨울 이적) 합산한다 (평점·패스 성공률은 출전 시간 가중).
"""
import hashlib, json, os, sys, time
from datetime import date
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__))))
from official._common import get_json, norm
from official.RSK1 import _SUR
import re

API = 'https://www.sofascore.com/api/v1'
HDR = {'Referer': 'https://www.sofascore.com/', 'Accept': 'application/json'}
CACHE = os.path.join(os.environ.get('TM_CACHE', '.tm-cache'), 'sofascore')
TM_FILE = 'data/transfermarkt.json'
OUT = 'data/sofa_stats.json'

# TM 리그 코드 → (소파스코어 unique tournament id, 시즌 이름의 year)
LEAGUES = {'GB1': (17, '25/26'), 'ES1': (8, '25/26'), 'L1': (35, '25/26'),
           'IT1': (23, '25/26'), 'FR1': (34, '25/26'), 'RSK1': (410, '2025')}

FIELDS = ['rating', 'apps', 'minutes', 'goals', 'assists', 'xG', 'shots', 'keyPasses', 'bigChancesCreated',
          'accuratePassesPercentage', 'successfulDribbles', 'tackles', 'interceptions', 'clearances',
          'aerialDuelsWon', 'saves', 'goalsConceded']
# 소파스코어 응답 키 (FIELDS 순서)
API_KEYS = ['rating', 'appearances', 'minutesPlayed', 'goals', 'assists', 'expectedGoals', 'totalShots', 'keyPasses',
            'bigChancesCreated', 'accuratePassesPercentage', 'successfulDribbles', 'tackles', 'interceptions',
            'clearances', 'aerialDuelsWon', 'saves', 'goalsConceded']
AVG = {'rating': 2, 'accuratePassesPercentage': 1}   # 합산 대신 출전 시간 가중 평균 (반올림 자릿수)

# 소파스코어 팀 이름 → TM 구단 id (2026/27 우리 데이터에 있는 구단만; 강등된 구단 등은 없음 → 리그 전체 짝짓기로)
TEAM = {
    # 프리미어리그
    'Arsenal': 11, 'Aston Villa': 405, 'Bournemouth': 989, 'Brentford': 1148, 'Brighton & Hove Albion': 1237,
    'Chelsea': 631, 'Crystal Palace': 873, 'Everton': 29, 'Fulham': 931, 'Leeds United': 399, 'Liverpool FC': 31,
    'Manchester City': 281, 'Manchester United': 985, 'Newcastle United': 762, 'Nottingham Forest': 703,
    'Sunderland': 289, 'Tottenham Hotspur': 148,
    # 라리가
    'Athletic Club': 621, 'Atlético Madrid': 13, 'Celta Vigo': 940, 'Deportivo Alavés': 1108, 'Elche': 1531,
    'Espanyol': 714, 'FC Barcelona': 131, 'Getafe': 3709, 'Levante UD': 3368, 'Osasuna': 331,
    'Rayo Vallecano': 367, 'Real Betis': 150, 'Real Madrid': 418, 'Real Sociedad': 681, 'Sevilla': 368,
    'Valencia': 1049, 'Villarreal': 1050,
    # 분데스리가
    '1. FC Köln': 3, '1. FC Union Berlin': 89, '1. FSV Mainz 05': 39, 'Bayer 04 Leverkusen': 15,
    'Borussia Dortmund': 16, "Borussia M'gladbach": 18, 'Eintracht Frankfurt': 24, 'FC Augsburg': 167,
    'FC Bayern München': 27, 'Hamburger SV': 41, 'RB Leipzig': 23826, 'SC Freiburg': 60,
    'SV Werder Bremen': 86, 'TSG Hoffenheim': 533, 'VfB Stuttgart': 79,
    # 세리에 A
    'AC Milan': 5, 'AS Roma': 12, 'Atalanta': 800, 'Bologna': 1025, 'Cagliari': 1390, 'Como': 1047,
    'Fiorentina': 430, 'Genoa': 252, 'Inter': 46, 'Juventus': 506, 'Lazio': 398, 'Lecce': 1005, 'Parma': 130,
    'SSC Napoli': 6195, 'Sassuolo': 6574, 'Torino': 416, 'Udinese': 410,
    # 리그 1
    'AS Monaco': 162, 'Angers': 1420, 'Auxerre': 290, 'Le Havre': 738, 'Lille': 1082, 'Lorient': 1158,
    'Olympique Lyonnais': 1041, 'Olympique de Marseille': 244, 'Paris FC': 10004, 'Paris Saint-Germain': 583,
    'RC Lens': 826, 'RC Strasbourg': 667, 'Stade Brestois': 3911, 'Stade Rennais': 273, 'Toulouse': 415,
    'Nice': 417,
    # K리그1
    'Bucheon FC 1995': 35759, 'Daejeon Hana Citizen': 6499, 'FC Anyang': 38898, 'FC Seoul': 6500,
    'Gangwon FC': 21459, 'Gimcheon Sangmu FC': 6505, 'Gwangju FC': 30925, 'Jeju SK': 19684,
    'Jeonbuk Hyundai Motors': 6502, 'Pohang Steelers': 311, 'Ulsan HD': 3535,
}
# 일부러 비워 둔 팀 (2026/27 우리 데이터에 없음): Burnley, West Ham United, Wolverhampton, Girona FC, Mallorca,
# Real Oviedo, 1. FC Heidenheim, FC St. Pauli, VfL Wolfsburg, Cremonese, Hellas Verona, Pisa, Metz, Nantes,
# Rodez AF, Saint-Étienne, Daegu FC, Seoul E-Land FC, Suwon FC


def cached_json(url):
    os.makedirs(CACHE, exist_ok=True)
    fn = os.path.join(CACHE, hashlib.sha1(url.encode()).hexdigest() + '.json')
    if os.path.exists(fn):
        return json.load(open(fn, encoding='utf-8'))
    d = get_json(url, HDR)
    if d is not None:
        json.dump(d, open(fn, 'w', encoding='utf-8'))
    time.sleep(0.5)
    return d


def season_id(ut, year):
    d = cached_json(f'{API}/unique-tournament/{ut}/seasons') or {}
    for s in d.get('seasons', []):
        if s.get('year') == year:
            return s['id'], s['name']
    raise RuntimeError(f'season {year} not found for tournament {ut}')


def fetch_rows(ut, sid):
    rows, off = [], 0
    fields = ','.join(API_KEYS)
    while True:
        url = (f'{API}/unique-tournament/{ut}/season/{sid}/statistics?limit=100&offset={off}'
               f'&order=-rating&accumulation=total&fields={fields}')
        d = cached_json(url)
        if d is None:
            raise RuntimeError('failed: ' + url)
        r = d.get('results') or []
        rows += r
        if len(r) < 100 or off // 100 + 1 >= d.get('pages', 0):
            break
        off += 100
    return rows


# ---------- 이름 비교 ----------
_TR = str.maketrans({'ø': 'o', 'Ø': 'O', 'æ': 'ae', 'Æ': 'Ae', 'œ': 'oe', 'ß': 'ss', 'đ': 'd', 'Đ': 'D', 'ł': 'l',
                     'Ł': 'L', 'ı': 'i', 'þ': 'th', 'Þ': 'Th', 'ð': 'd', 'Ð': 'D'})


def N(s):
    """norm() 전에 NFKD로 안 풀리는 글자(ø, æ, ß, đ, ł ...)를 바꿔 둔다"""
    return norm(str(s or '').translate(_TR))


def _ko(w):
    """한국 이름 음절 로마자 흔들림을 줄인다 (eo/u/o, k/g, p/b, t/d, ch/j, sh/s, 겹자음 ...)"""
    w = w.replace('eo', 'o').replace('oo', 'u').replace('ou', 'u').replace('ee', 'i').replace('wu', 'u').replace('ae', 'e')
    w = w.replace('ck', 'k').replace('u', 'o').replace('ch', 'j').replace('sh', 's').replace('k', 'g').replace('p', 'b').replace('t', 'd')
    w = w.replace('r', 'l')
    return re.sub(r'(.)\1', r'\1', w)


def _keys(name):
    """한국식 이름 → 비교용 열쇠 집합 (성 앞/뒤 두 어순). 낱말 2~3개, 성이 흔한 한국 성일 때만"""
    w = N(name)
    if not 2 <= len(w) <= 3:
        return set()
    out = set()
    for sur, giv in ((w[0], w[1:]), (w[-1], w[:-1])):
        if sur in _SUR and len(''.join(giv)) <= 12:
            out.add(_SUR[sur] + '|' + _ko(''.join(giv)))
    return out


def _subseq(s, l):
    it = iter(l)
    return all(x in it for x in s)


def strong(a, b):
    """강한 일치 (1 또는 0.9, 아니면 0): 같은 낱말 / 같은 한국 이름 열쇠 /
    짧은 쪽(2낱말 이상)이 긴 쪽에 그대로 들어 있음 또는 처음·끝 낱말이 같고 사이 낱말만 빠짐"""
    A, B = N(a), N(b)
    if not A or not B:
        return 0
    if A == B or ''.join(A) == ''.join(B):
        return 1
    ka, kb = _keys(a), _keys(b)
    if ka and kb:
        return 1 if ka & kb else 0   # 한국 이름은 열쇠가 같아야만 (이름 음절 순서는 바뀌면 안 됨)
    if sorted(A) == sorted(B):
        return 1
    s, l = (A, B) if len(A) <= len(B) else (B, A)
    if len(s) >= 2 and any(l[i:i + len(s)] == s for i in range(len(l) - len(s) + 1)):
        return 0.9
    if len(s) >= 2 and s[0] == l[0] and s[-1] == l[-1] and _subseq(s, l):
        return 0.9
    return 0


def loose(a, b):
    """느슨한 점수 (낱말 단위): 강한 일치면 그 값, 같은 성(끝 낱말)+이름 앞 두 글자 같음 0.8 (Andy/Andrew,
    Dani/Daniel), 같은 성 0.7, 한쪽의 성(끝 낱말, 4글자 이상)이 다른 쪽에 있음 0.6.
    한국 이름끼리는 열쇠가 다르면 0 (김·이·박 이 너무 흔하다)"""
    s = strong(a, b)
    if s or (_keys(a) and _keys(b)):
        return s
    A, B = N(a), N(b)
    if not A or not B:
        return 0
    if len(A) >= 2 and len(B) >= 2 and A[-1] == B[-1]:
        return 0.8 if A[0][:2] == B[0][:2] else 0.7
    if (len(A[-1]) >= 4 and A[-1] in B) or (len(B[-1]) >= 4 and B[-1] in A):
        return 0.6
    return 0


def greedy(cands, used_t, used_s, out, ok=lambda tid, sid, sc: True):
    """점수 높은 짝부터 (한 사람은 한 번만). ok 가 거부하면 건너뜀"""
    cands.sort(key=lambda x: -x[0])
    for sc, tid, sid in cands:
        if tid in used_t or sid in used_s or not ok(tid, sid, sc):
            continue
        used_t.add(tid); used_s.add(sid)
        out[tid] = sid


def unique_pass(tm, sofa, used_t, used_s, out, score, minsc, ok):
    """남은 TM 선수 × 남은 소파 선수, score ≥ minsc 이고 생년 확인(ok)을 통과한 후보가 양쪽 다 하나일 때만"""
    tm = [p for p in tm if p['id'] not in used_t]
    sofa = [s for s in sofa if s['id'] not in used_s]
    pairs = [(p['id'], s['id']) for p in tm for s in sofa if score(p['name'], s['name']) >= minsc]
    pairs = [(t, s) for t, s in pairs if ok(t, s, minsc)]
    by_t, by_s = {}, {}
    for t, s in pairs:
        by_t.setdefault(t, []).append(s)
        by_s.setdefault(s, []).append(t)
    n = 0
    for tid, ss in by_t.items():
        if len(ss) == 1 and len(by_s[ss[0]]) == 1:
            used_t.add(tid); used_s.add(ss[0]); out[tid] = ss[0]; n += 1
    return n


def birth_year(sid):
    d = cached_json(f'{API}/player/{sid}') or {}
    dob = (d.get('player') or {}).get('dateOfBirth') or ''
    return int(dob[:4]) if dob[:4].isdigit() else None


def combine(rows):
    """같은 선수의 여러 리그 기록 합산 → FIELDS 순서 배열"""
    mins = [r.get('minutesPlayed') or 0 for r in rows]
    out = []
    for f, k in zip(FIELDS, API_KEYS):
        vals = [r.get(k) for r in rows]
        if all(v is None for v in vals):
            out.append(None)
        elif f in AVG:
            w = [(v, m) for v, m in zip(vals, mins) if v is not None]
            sw = sum(m for _, m in w)
            out.append(round(sum(v * m for v, m in w) / sw, AVG[f]) if sw else round(sum(v for v, _ in w) / len(w), AVG[f]))
        else:
            s = sum(v for v in vals if v is not None)
            out.append(round(s, 2) if isinstance(s, float) else s)
    return out


def main():
    tmd = json.load(open(TM_FILE, encoding='utf-8'))
    leagues = {l['code']: l for l in tmd['leagues']}
    club_of = {}                              # TM 선수 id → TM 구단 id
    for l in tmd['leagues']:
        for c in l['clubs']:
            for p in c['players']:
                club_of[p['id']] = c['id']

    # 1. 소파스코어 기록 받기
    rows_by_league, seasons, people = {}, {}, {}   # people: 소파 id → {id, name, rows, teams, leagues}
    for code, (ut, year) in LEAGUES.items():
        sid, sname = season_id(ut, year)
        rows = fetch_rows(ut, sid)
        rows_by_league[code] = rows
        seasons[code] = sname
        print(f'{code}: {sname} (ut {ut}, season {sid}) — {len(rows)} players')
        for r in rows:
            pid = r['player']['id']
            p = people.setdefault(pid, {'id': pid, 'name': r['player']['name'], 'rows': [], 'teams': set(), 'leagues': set()})
            p['rows'].append(r); p['teams'].add(r['team']['name']); p['leagues'].add(code)

    # 2. 팀 대응 확인
    tm_clubs = {c['id']: c for l in tmd['leagues'] for c in l['clubs']}
    print('\nTeam mapping (SofaScore → TM):')
    for code in LEAGUES:
        for t in sorted({r['team']['name'] for r in rows_by_league[code]}):
            cid = TEAM.get(t)
            print(f'  {code:5} {t:28} → {tm_clubs[cid]["slug"] if cid in tm_clubs else "-"}')
    bad = [t for t, cid in TEAM.items() if cid not in tm_clubs]
    if bad:
        raise RuntimeError(f'TEAM table points to unknown TM clubs: {bad}')

    out, used_t, used_s = {}, set(), set()
    tm_all = [p for l in tmd['leagues'] for c in l['clubs'] for p in c['players']]
    tm_by_id = {p['id']: p for p in tm_all}
    ref_year = int(str(tmd.get('fetched') or date.today().isoformat())[:4])   # TM 'age' 기준 연도
    pool = ThreadPoolExecutor(3)

    def ok(tid, sid, sc):
        """생년 확인: TM 나이와 소파스코어 생년이 맞아야 한다. 생년을 모르면 강한 이름 일치(≥0.9)만 통과"""
        age, by = tm_by_id[tid].get('age'), birth_year(sid)
        if not age or not by:
            return sc >= 0.9
        return ref_year - age - 1 <= by <= ref_year - age

    def prefetch(pairs):
        list(pool.map(birth_year, sorted({sid for _, sid in pairs})))

    sofa_by_club = {}
    for p in people.values():
        for t in p['teams']:
            if t in TEAM:
                sofa_by_club.setdefault(TEAM[t], []).append(p)
    leagues_pairs = [([p for c in l['clubs'] for p in c['players']],
                      [people[r['player']['id']] for r in rows_by_league.get(code, [])]) for code, l in leagues.items()]
    stage = {}

    how = {}   # TM id → 짝지은 단계 (확인용)

    def count(name):
        stage[name] = len(out) - sum(stage.values())
        for tid in out:
            how.setdefault(tid, name)

    def club_pass(lo, hi, check):
        for cid, sl in sofa_by_club.items():
            cands = [(sc, tp['id'], sp['id']) for tp in tm_clubs[cid]['players'] for sp in sl
                     if lo <= (sc := loose(tp['name'], sp['name'])) <= hi
                     and tp['id'] not in used_t and sp['id'] not in used_s]
            if check:
                prefetch([(t, s) for _, t, s in cands])
            greedy(cands, used_t, used_s, out, ok if check else (lambda *x: True))

    def wide_pass(score, minsc):
        for tm, sofa in leagues_pairs + [(tm_all, list(people.values()))]:   # 같은 리그 먼저, 그다음 전체
            rest_t = [p for p in tm if p['id'] not in used_t]
            rest_s = [x for x in sofa if x['id'] not in used_s]
            prefetch([(p['id'], x['id']) for p in rest_t for x in rest_s if score(p['name'], x['name']) >= minsc])
            unique_pass(tm, sofa, used_t, used_s, out, score, minsc, ok)

    # 3-1. 같은 구단, 강한 이름 일치
    club_pass(0.9, 1, False); count('club strong')
    # 3-2. 같은 리그 → 6개 리그 전체, 강한 이름 일치 + 생년 + 양쪽 유일
    wide_pass(strong, 0.9); count('league/cross strong')
    # 3-3. 같은 구단, 느슨한 이름(성+이니셜 / 같은 성 / 긴 낱말 공유) + 생년
    club_pass(0.6, 0.89, True); count('club loose')
    # 3-4. 같은 리그 → 전체, 성+이니셜(애칭: Andy/Andrew, Kostas/Konstantinos ...) + 생년 + 양쪽 유일
    wide_pass(loose, 0.8); count('league/cross surname+initial')
    pool.shutdown()
    print('\nMatched by stage:', ', '.join(f'{k} {v}' for k, v in stage.items()))

    # 4. 리그별 통계 (분모: 트랜스퍼마크트 2025/26 기록에 출전이 있는 선수 — 하부 리그·컵 포함이라 대략치)
    try:
        played = {int(k) for k, v in json.load(open('data/tm_stats.json'))['players'].items() if v[0] > 0}
    except (OSError, ValueError, KeyError):
        played = set()
    print('\nCoverage (matched / squad, matched-of-played / played-per-TM-stats):')
    for code, l in leagues.items():
        ps = [p for c in l['clubs'] for p in c['players']]
        m = [p for p in ps if p['id'] in out]
        pl = [p for p in ps if p['id'] in played]
        mp = [p for p in pl if p['id'] in out]
        print(f'  {code:5} {len(m):4}/{len(ps):4} ({len(m) / len(ps):.0%})   played {len(mp):4}/{len(pl):4}'
              f' ({len(mp) / max(1, len(pl)):.0%})')
    print(f'  total {len(out)}/{len(tm_all)}')

    data = {
        'season': seasons, 'fetched': date.today().isoformat(), 'source': 'sofascore.com (league matches only)',
        'fields': FIELDS,
        'players': {str(tid): combine(people[sid]['rows']) for tid, sid in sorted(out.items())},
    }
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    print(f'\nwrote {OUT} ({len(data["players"])} players)')

    if '-v' in sys.argv:   # 짝 목록 (확인용)
        name_of = {p['id']: (p['name'], tm_clubs[club_of[p['id']]]['slug']) for p in tm_all}
        for tid, sid in sorted(out.items(), key=lambda x: name_of[x[0]][1]):
            print(f'  {name_of[tid][1]:28} {name_of[tid][0]:30} ← {people[sid]["name"]:30} {"/".join(sorted(people[sid]["teams"]))}  [{how[tid]}]')


if __name__ == '__main__':
    main()
