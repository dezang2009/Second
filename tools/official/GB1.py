"""프리미어리그 공식 사이트(premierleague.com)의 구단별 1군 명단과 공식 프로필 사진
사진: resources.premierleague.com/premierleague25/photos/players/500x500/{선수 id}.png (구단이 제공한 공식 유니폼 컷, 배경 투명)"""
from ._common import get_json, match, club_match

API = 'https://sdp-prem-prod.premier-league-prod.pulselive.com/api'
IMG = 'https://resources.premierleague.com/premierleague25/photos/players/500x500/{}.png'
HDR = {'Referer': 'https://www.premierleague.com/', 'Origin': 'https://www.premierleague.com'}


def fetch(league):
    out = {}
    for season in (2026, 2025):  # 올 시즌 명단 먼저, 빠진 선수는 지난 시즌 명단에서
        for k, v in fetch_season(league, season).items():
            out.setdefault(k, v)
    return out


def fetch_season(league, season):
    teams, nxt = [], None
    while True:
        j = get_json(f'{API}/v1/competitions/8/seasons/{season}/teams?_limit=50' + (f'&_next={nxt}' if nxt else ''), HDR)
        if not j:
            break
        teams += j['data']
        nxt = j['pagination'].get('_next')
        if not nxt:
            break
    out = {}
    names = [t['name'] for t in teams]
    for club in league['clubs']:
        i = club_match(club, names)
        if i is None:
            continue
        sq = get_json(f"{API}/v2/competitions/8/seasons/{season}/teams/{teams[i]['id']}/squad", HDR)
        if not sq:
            continue
        off = [{'name': p['name']['display'], 'num': p.get('shirtNum'), 'url': IMG.format(p['id']), 'headers': HDR} for p in sq.get('players', [])]
        out.update(match(club['players'], off))
    return out
