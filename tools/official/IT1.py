"""세리에A 공식 사이트(legaseriea.it)의 구단별 1군 명단과 공식 프로필 사진
구단 목록: api-sdp.legaseriea.it/v1/serie-a/football/competitions/{대회}/seasons, seasons/{시즌}/teams (공개 JSON)
선수 명단: www.legaseriea.it/team/{구단}/squad 페이지에 들어 있는 Next.js 데이터 (playerId·이름·등번호·playerImage)
사진: media-sdp.legaseriea.it/playerImages/{대회}/{시즌}/{구단}/home/{선수}_left.webp
      (구단이 제공한 홈 유니폼 상반신 컷, 1024x1024 RGBA 배경 투명)"""
import re, subprocess
from concurrent.futures import ThreadPoolExecutor
from ._common import UA, get, get_json, norm, name_score, club_match

SDP = 'https://api-sdp.legaseriea.it/v1/serie-a/football'
SITES = ('https://www.legaseriea.it', 'https://en.legaseriea.it')  # 이탈리아어 페이지가 가끔 빈 명단을 주면 영어 페이지로
COMP = 'serie-a::Football_Competition::ec93b94f74294dc98ab5bcfd67fc0d88'  # Serie A
HDR = {'Referer': 'https://www.legaseriea.it/', 'Origin': 'https://www.legaseriea.it'}
# 이름만으로는 헷갈리는 구단 (Inter Milan ↔ Milan): 트랜스퍼마크트 구단 id → 공식 shortName
FIXED = {46: 'Inter', 5: 'Milan'}


def fetch(league):
    """올 시즌 공식 명단에서 찾는다. 올 시즌 사진이 아직 안 올라온 선수는 같은 구단의 지난 시즌 사진 주소로,
    그것도 없으면 뺀다 (명단 페이지는 현재 시즌만 보여 주므로 지난 시즌 명단 자체로 되짚어 가지는 않는다)"""
    seasons = (get_json(f'{SDP}/competitions/{COMP}/seasons?locale=it-IT', HDR) or {}).get('seasons') or []
    seasons.sort(key=lambda s: s.get('seasonName') or '', reverse=True)
    if not seasons:
        return {}
    out = fetch_season(league, seasons[0]['seasonId'])
    cur = seasons[0]['seasonId'].split('::')[-1]
    prev = seasons[1]['seasonId'].split('::')[-1] if len(seasons) > 1 else None

    def check(k):
        u = out[k]['url']
        if exists(u):
            return k, u
        if prev and f'/{cur}/' in u:
            u2 = u.replace(f'/{cur}/', f'/{prev}/')
            if exists(u2):
                return k, u2
        return k, None

    with ThreadPoolExecutor(4) as ex:
        for k, u in list(ex.map(check, list(out))):
            if u:
                out[k]['url'] = u
            else:
                del out[k]
    return out


def exists(url, tries=3):
    """사진이 실제로 있는지 (앞부분만 받아 본다). 없으면 S3가 403"""
    for _ in range(tries):
        r = subprocess.run(['curl', '-s', '-m', '30', '-A', UA, '-r', '0-63', '-o', '/dev/null', '-w', '%{http_code}', url],
                           capture_output=True, text=True)
        if r.stdout in ('200', '206'):
            return True
        if r.stdout in ('403', '404'):
            return False
    return False


def slugify(s):
    return '-'.join(norm(s))


def fetch_season(league, season_id):
    teams = (get_json(f'{SDP}/seasons/{season_id}/teams?locale=it-IT', HDR) or {}).get('teams') or []
    teams = [t for t in teams if not t.get('isTeamFake')]
    names = [t.get('shortName') or t.get('officialName') or '' for t in teams]
    out = {}
    for club in league['clubs']:
        i = names.index(FIXED[club['id']]) if FIXED.get(club['id']) in names else club_match(club, names)
        if i is None:
            continue
        off = squad(teams[i])
        out.update(match(club['players'], off))
    return out


def squad(team):
    """구단 명단 페이지의 선수 목록 → [{name, names, num, url, headers}]"""
    tid = team['teamId']
    html = None
    slugs = [s for s in dict.fromkeys([slugify(team.get('shortName')), slugify(team.get('officialName')), slugify(team.get('mediaShortName'))]) if s]
    for site in SITES:
        for slug in slugs:
            html = get(f'{site}/team/{slug}/squad', tries=2)
            if html and tid in html and 'playerImages/' in html:
                break
            html = None
        if html:
            break
    if not html:
        return []
    t = html.replace('\\"', '"')
    off, seen = [], set()
    for m in re.finditer(r'"playerId":"serie-a::Football_Player::([0-9a-f]+)"(.*?)(?="playerId":|$)', t, re.S):
        pid, w = m.group(1), m.group(2)[:4000]
        g = lambda k: (re.search(r'"%s":"([^"]*)"' % k, w) or [None, None])[1]
        img = g('playerImage')
        if pid in seen or g('teamId') != tid or not img or 'playerImages/' not in img or 'fallback' in img:
            continue
        seen.add(pid)
        first, last = g('mediaFirstName') or '', g('mediaLastName') or ''
        cands = [g('shortName'), g('shirtName'), f'{first} {last}'.strip()]
        num = g('bibNumber')
        off.append({'name': cands[0] or cands[2], 'names': [c for c in cands if c], 'num': int(num) if num and num.isdigit() else None,
                    'url': img, 'headers': HDR})
    return off


LATIN = str.maketrans({'ı': 'i', 'İ': 'I', 'ð': 'd', 'Ð': 'D', 'þ': 'th', 'Þ': 'Th', 'ł': 'l', 'Ł': 'L', 'đ': 'd', 'Đ': 'D', 'æ': 'ae', 'Æ': 'Ae'})


def lat(s):
    """NFKD로 안 풀리는 글자(터키어 ı, 아이슬란드어 ð·þ, 폴란드어 ł 등)를 라틴 글자로"""
    return str(s or '').translate(LATIN)


def surname_shared(a, names):
    """첫 낱말(이름)이 아닌 낱말을 하나라도 공유하는지"""
    A = set(norm(lat(a))[1:])
    return any(A & set(norm(lat(n))[1:]) for n in names)


def match(tm_players, official):
    """_common.match와 같되, 공식 쪽 이름 후보(짧은 이름·유니폼 이름·전체 이름) 중 가장 잘 맞는 것으로 점수를 매긴다"""
    cands = []
    for p in tm_players:
        for o in official:
            sc = max(name_score(lat(p['name']), lat(n)) for n in o['names'])
            if sc < 0.7 and not surname_shared(p['name'], o['names']):
                continue  # 이름(first name)만 같은 다른 선수가 등번호까지 같아 짝지어지는 것 방지
            if p.get('num') and o.get('num') and int(p['num']) == int(o['num']):
                sc += 0.25
            if sc >= 0.7:
                cands.append((sc, p['id'], id(o), o))
    cands.sort(key=lambda x: -x[0])
    out, used_p, used_o = {}, set(), set()
    for sc, pid, oid, o in cands:
        if pid in used_p or oid in used_o:
            continue
        used_p.add(pid); used_o.add(oid)
        out[str(pid)] = {'url': o['url'], 'headers': o['headers'], 'name': o['name']}
    return out
