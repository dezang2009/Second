"""리그1 공식 사이트(ligue1.com)가 쓰는 JSON API(ma-api.ligue1.fr)의 구단별 1군 명단과 공식 프로필 사진
사진: s3.eu-west-3.amazonaws.com/ligue1.image/players/{시즌}/all/player_official_{시즌}_{구단 opta id}_{선수 opta id}-400x300.png
(구단이 제공한 공식 유니폼 상반신 컷, 배경 투명, 실제 크기 800x600 PNG)"""
import subprocess
from concurrent.futures import ThreadPoolExecutor
from ._common import get_json, match, norm, UA

API = 'https://ma-api.ligue1.fr'
HDR = {'Referer': 'https://ligue1.com/', 'Origin': 'https://ligue1.com'}
L1 = '1'  # API 안의 리그1 championship 번호


def fetch(league):
    out = {}
    for season in (2026, 2025):  # 올 시즌 명단 먼저, 빠진 선수는 지난 시즌 명단에서
        for k, v in fetch_season(league, season, skip=out).items():
            out.setdefault(k, v)
    return out


def _exists(url):
    """S3에 실제로 사진이 있는지 (API가 사진 없는 선수에게도 주소를 주는 경우가 있다)"""
    for _ in range(2):
        r = subprocess.run(['curl', '-s', '-I', '-m', '30', '-A', UA, '-o', '/dev/null', '-w', '%{http_code}', url],
                           capture_output=True)
        code = r.stdout.strip()
        if code in (b'200', b'403', b'404'):
            return code == b'200'
    return False


def _player(pid, season):
    p = get_json(f'{API}/championship-player/{pid}', HDR)
    if not p:
        return None
    champ = (p.get('championships') or {}).get(L1) or next(iter((p.get('championships') or {}).values()), {})
    pics = (champ.get('assets') or {})
    url = ((pics.get('bustPictures') or {}).get('large')
           or (pics.get('fullBodyPictures') or {}).get('large'))
    if not url or f'player_official_{season}' not in url:
        return None
    full = ' '.join(x for x in (p.get('firstName'), p.get('lastName')) if x)
    known = p.get('knownName')  # 'Marquinhos', 'Vitinha' 같은 통칭
    return {'name': known or full, 'alt': full if known else p.get('lastName'), 'alt_full': bool(known),
            'num': champ.get('jerseyNumber'), 'url': url, 'headers': HDR}


def _club(tm_club, names):
    """_common.club_match와 같되 동점이면 군더더기 낱말이 적은 쪽 (Paris FC ↔ Paris Saint-Germain 구별)"""
    skip = {'fc', 'ac', 'as', 'rc', 'sc', 'club', 'de', 'og', 'ogc', 'aj', 'losc', 'sco', 'es', 'us', 'fco'}
    tm = (set(norm(tm_club['slug'].replace('-', ' '))) | set(norm(tm_club['name']))) - skip
    best, bi = (0, 0), None
    for i, n in enumerate(names):
        w = set(norm(n)) - skip
        c = len(tm & w)
        s = (c / max(1, min(len(tm), len(w))), c / max(1, len(tm | w)))
        if s > best:
            best, bi = s, i
    return bi if best[0] >= 0.5 else None


def fetch_season(league, season, skip=()):
    if season == 2026:
        j = get_json(f'{API}/championship-clubs', HDR) or {}
        clubs = [c for c in (j.get('championshipsClubs') or {}).values()
                 if (c.get('championships') or {}).get(L1, {}).get('playersIds')]
    else:  # 지난 시즌은 구단 하나씩 (shortId는 시즌이 바뀌어도 그대로)
        cur = get_json(f'{API}/championship-clubs', HDR) or {}
        ids = [c['shortId'] for c in (cur.get('championshipsClubs') or {}).values()
               if (c.get('championships') or {}).get(L1, {}).get('playersIds')]
        with ThreadPoolExecutor(4) as ex:
            clubs = [c for c in ex.map(lambda i: get_json(f'{API}/championship-club/l1_championship_club_{season}_{i}', HDR), ids) if c]
    names = [' '.join(x for x in (c.get('name'), c.get('displayName'), c.get('officialName')) if x) for c in clubs]
    out = {}
    for club in league['clubs']:
        todo = [p for p in club['players'] if str(p['id']) not in skip]
        if not todo:
            continue
        i = _club(club, names)
        if i is None:
            continue
        champs = clubs[i].get('championships') or {}
        pids = champs.get(L1, {}).get('playersIds') or [x for c in champs.values() for x in c.get('playersIds', [])]
        with ThreadPoolExecutor(4) as ex:
            off = [o for o in ex.map(lambda pid: _player(pid, season), pids) if o]
        got = match(todo, off)
        # 통칭으로 안 맞으면 본명으로, 본명이 길어(이름 두 개 등) 안 맞으면 성(lastName)으로 한 번 더
        rest = [p for p in todo if str(p['id']) not in got]
        used = {id(o) for o in got.values()}
        if rest:
            alt = [dict(o, name=o['alt']) for o in off if id(o) not in used and o.get('alt')]
            for k, o in match(rest, alt).items():  # 성만으로는 위험하니 등번호까지 같을 때만
                tm = next(p for p in rest if str(p['id']) == k)
                if o['alt_full'] or (tm.get('num') and o.get('num') and int(tm['num']) == int(o['num'])):
                    got[k] = o
        with ThreadPoolExecutor(4) as ex:
            ok = list(ex.map(lambda kv: _exists(kv[1]['url']), got.items()))
        for (k, o), good in zip(got.items(), ok):
            if good:
                out[k] = {'url': o['url'], 'headers': HDR}
    return out
