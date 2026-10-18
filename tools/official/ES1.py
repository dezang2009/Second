"""라리가 공식 사이트(laliga.com)의 구단별 1군 명단과 공식 프로필 사진
명단: apim.laliga.com/public-service (laliga.com 이 쓰는 공개 API, 구독 키는 사이트 __NEXT_DATA__ 의 runtimeConfig 에 있음)
사진: assets.laliga.com/squad/{시즌}/t{구단}/p{선수}/1024x1024/..._003_000.png (구단 제공 공식 유니폼 컷, 배경 투명)"""
import re
from ._common import get, get_json, norm, match

API = 'https://apim.laliga.com/public-service/api/v1'
KEY = 'c13c3a8e2f6b46da9c5c425cf61fab3e'  # 사이트에서 못 읽어 올 때 쓰는 기본값
HDR = {'Referer': 'https://www.laliga.com/', 'Origin': 'https://www.laliga.com'}
KINDS = ('003', '001', '002')  # 003: 정사각 상반신(투명), 001: 세로 상반신(투명), 002: jpg (004 는 게임 카드라 안 씀)
SKIP = {'fc', 'cf', 'c', 'f', 'rc', 'rcd', 'ud', 'ca', 'cd', 'sad', 'club', 'de', 'del', 'la', 'a', 'd', 'r', 'futbol'}


def api_key():
    """laliga.com 페이지의 runtimeConfig 에서 구독 키를 읽는다 (바뀌어도 따라가게)"""
    t = get('https://www.laliga.com/en-GB/laliga-easports/clubs') or ''
    m = re.search(r'"backendSubscription"\s*:\s*"([0-9a-f]{32})"', t)
    return m.group(1) if m else KEY


def photo(ph):
    """가장 쓸 만한 종류의 가장 큰 사진 (2048 은 너무 커서 1024 를 우선)"""
    for k in KINDS:
        sizes = (ph or {}).get(k) or {}
        if not sizes:
            continue
        def w(s):
            n = int(s.split('x')[0])
            return (n == 1024, n)
        return sizes[max(sizes, key=w)]
    return None


def pick_teams(clubs, teams):
    """트랜스퍼마크트 구단 → 라리가 구단 (낱말 자카드 점수가 높은 쌍부터 1:1).
    _common.club_match 는 '바르셀로나'가 들어간 에스파뇰과 바르사를 못 가리고,
    지난 시즌 2부였던 구단을 엉뚱한 구단에 붙여서 따로 둔다"""
    words = lambda *xs: set(norm(' '.join(xs).replace('-', ' '))) - SKIP
    cands = []
    for ci, c in enumerate(clubs):
        tm = words(c['slug'], c['name'])
        for t in teams:
            w = words(t['nickname'], t['name'], t['slug'])
            sc = len(tm & w) / max(1, len(tm | w))
            if sc >= 0.3:
                cands.append((sc, ci, t['slug'], t))
    cands.sort(key=lambda x: -x[0])
    out, used = {}, set()
    for sc, ci, slug, t in cands:
        if ci not in out and slug not in used:
            out[ci] = t; used.add(slug)
    return out


def fetch(league):
    h = dict(HDR, **{'Ocp-Apim-Subscription-Key': api_key()})
    out = {}
    for season in (2026, 2025):  # 올 시즌 명단 먼저, 빠진 선수는 지난 시즌 명단에서
        for k, v in fetch_season(league, season, h).items():
            out.setdefault(k, v)
    return out


def fetch_season(league, season, h):
    sub = f'laliga-easports-{season}'
    j = get_json(f'{API}/teams?subscriptionSlug={sub}&limit=50&contentLanguage=en', h)
    teams = (j or {}).get('teams', [])
    out = {}
    pick = pick_teams(league['clubs'], teams)
    for ci, club in enumerate(league['clubs']):
        t = pick.get(ci)
        if not t:
            continue
        sq = get_json(f"{API}/teams/{t['slug']}/squad-manager?contentLanguage=en&subscriptionSlug={sub}&limit=100", h)
        off = []
        for s in (sq or {}).get('squads', []):
            if (s.get('role') or {}).get('slug') != 'jugador':
                continue
            url = photo(s.get('photos'))
            if url:
                p = s['person']
                off.append({'name': p['name'], 'alt': p.get('nickname'), 'num': s.get('shirt_number'),
                            'url': url, 'headers': HDR})
        got = match(club['players'], off)
        # 정식 이름으로 안 잡힌 선수는 등록명(닉네임)으로 한 번 더
        used = {id(o) for o in got.values()}
        rest_p = [p for p in club['players'] if str(p['id']) not in got]
        rest_o = [dict(o, name=o['alt'], _o=o) for o in off if id(o) not in used and o.get('alt')]
        for k, o in match(rest_p, rest_o).items():
            got[k] = o['_o']
        out.update({k: {'url': o['url'], 'headers': o['headers']} for k, o in got.items()})
    return out
