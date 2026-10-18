"""분데스리가 공식 사이트(bundesliga.com)의 구단별 1군 명단(squad 페이지에 박힌 ng-state JSON)과 공식 프로필 사진
사진: assets.bundesliga.com/player/{dfl 선수 id}-{dfl 구단 id}-{dfl 시즌 id}.png
(500x500, 배경 투명, 구단 유니폼 상반신 컷. 사이트 JSON에는 '-circle.png'(300x300 원형) 주소만 있어 꼬리를 떼서 쓴다)"""
import json, re, subprocess
from concurrent.futures import ThreadPoolExecutor
from ._common import get, match, club_match

SITE = 'https://www.bundesliga.com/en/bundesliga/clubs'
# 모바일 UA로는 막힐 때가 있어 데스크톱 브라우저처럼 보낸다
PAGE_HDR = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'en-US,en;q=0.9'}
IMG_HDR = {'Referer': 'https://www.bundesliga.com/'}


def fetch(league):
    """사이트는 올 시즌(2026/27) 명단만 보여 준다. 사진 주소에 그 시즌·구단 id가 들어 있다"""
    html = get(SITE, PAGE_HDR)
    if not html:
        return {}
    slugs = sorted(set(re.findall(r'href="/en/bundesliga/clubs/([a-z0-9-]+)"', html)))
    # 'muenchen'·'koeln' 같은 독일어 전자 표기를 트랜스퍼마크트 slug('munchen')에 맞춘다
    names = [s.replace('ae', 'a').replace('oe', 'o').replace('ue', 'u').replace('-', ' ') for s in slugs]
    out = {}
    for club in league['clubs']:
        i = club_match(club, names)
        if i is None:
            continue
        off = squad(slugs[i])
        out.update(match(club['players'], off))
    # 사이트가 주소만 걸어 두고 사진이 없는 선수(신인 등)는 지난 시즌 사진으로, 그것도 없으면 뺀다
    with ThreadPoolExecutor(4) as ex:
        urls = dict(zip(out, ex.map(lambda o: first_ok(o['url']), out.values())))
    return {k: {'url': u, 'headers': IMG_HDR} for k, u in urls.items() if u}


def alive(url):
    r = subprocess.run(['curl', '-s', '-I', '-o', '/dev/null', '-m', '20', '-w', '%{http_code}', url], capture_output=True)
    return r.stdout.strip() == b'200'


def first_ok(url):
    m = re.search(r'-dfl-sea-([0-9a-z]+)\.png$', url)
    cands = [url]
    if m:  # DFL 시즌 id는 36진수로 한 시즌에 1씩 (0001KA=2026/27, 0001K9=2025/26)
        n = int(m.group(1), 36)
        cands += [url[:m.start(1)] + _b36(n - d).zfill(len(m.group(1))) + '.png' for d in (1, 2)]
    return next((u for u in cands if alive(u)), None)


def _b36(n):
    s = ''
    while n:
        n, r = divmod(n, 36)
        s = '0123456789abcdefghijklmnopqrstuvwxyz'[r] + s
    return s or '0'


def squad(slug):
    html = get(f'{SITE}/{slug}/squad', PAGE_HDR)
    m = html and re.search(r'<script id="ng-state" type="application/json">(.*?)</script>', html, re.S)
    if not m:
        return []
    try:
        state = json.loads(m.group(1))
    except ValueError:
        return []
    off = []
    for v in state.values():
        players = isinstance(v, dict) and isinstance(v.get('b'), dict) and v['b'].get('players')
        if not isinstance(players, dict):
            continue
        for group in players.values():
            for p in group:
                img = (p.get('playerImages') or {}).get('FACE_CIRCLE')
                if not img:
                    continue
                n = p.get('name') or {}
                name = n.get('alias') or ' '.join(x for x in (n.get('first'), n.get('last')) if x) or n.get('full')
                num = p.get('shirtNumber')
                off.append({'name': name, 'full': n.get('full'),
                            'num': int(num) if str(num or '').isdigit() else None,
                            'url': img.replace('-circle.png', '.png'), 'headers': IMG_HDR})
    return off
