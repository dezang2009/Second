"""K리그1 공식 사이트(kleague.com)의 구단별 현역 선수 명단과 공식 프로필 사진
명단: www.kleague.com/player.do?type=active&leagueId=1&teamId={K코드}&pos={gk|df|mf|fw}&page=N (HTML)
사진: d2tfp74nsbbrkr.cloudfront.net/v1/player/{연도}/{K코드}/player_{선수 id}.png
  (구단이 연맹에 낸 프로필 컷, 배경 투명 PNG, 대개 1000px 이상. 연도는 사진이 올라온 가장 최근 시즌 — 명단 페이지가 고른 것을 그대로 쓴다)
짝짓기: 트랜스퍼마크트 'ko'(한글 이름) = 공식 한글 이름 (+등번호). 남은 선수(주로 외국인)는
선수 상세 페이지(record/playerDetail.do)의 영문명·생년월일·등번호로 짝짓는다"""
import re
from urllib.parse import quote
from concurrent.futures import ThreadPoolExecutor
from ._common import get, norm, name_score

SITE = 'https://www.kleague.com'
HDR = {'Referer': 'https://www.kleague.com/'}
POS = ('gk', 'df', 'mf', 'fw')
# 트랜스퍼마크트 구단 id → 연맹 구단 코드 (모르는 구단은 한글 이름으로 찾는다)
CODES = {6502: 'K05', 3535: 'K01', 6499: 'K10', 6505: 'K35', 21459: 'K21', 6500: 'K09',
         38898: 'K27', 19684: 'K04', 2996: 'K18', 35759: 'K26', 30925: 'K22', 311: 'K03'}
SEASON = 2026

CARD = re.compile(r'onPlayerClicked\((\d+)\)">\s*<div class="img-box">\s*<img src="([^"]*)"(.*?)(?=onPlayerClicked\(|class="pagination|$)', re.S)


def _club_codes():
    t = get(f'{SITE}/player.do', HDR) or ''
    return dict((n.strip(), c) for c, n in re.findall(r'<option value="(K\d+)">([^<]+)</option>', t))


def _code_for(club, codes):
    if club['id'] in CODES:
        return CODES[club['id']]
    tm = set(club['name'].replace(' ', ''))
    best, bc = 0, None
    for n, c in codes.items():
        s = len(tm & set(n.replace(' ', ''))) / max(1, min(len(tm), len(set(n.replace(' ', '')))))
        if s > best:
            best, bc = s, c
    return bc if best >= 0.6 else None


def _roster(code):
    """구단 현역 선수 [{pid, ko, num, pos, url}] (감독·코치 제외: 포지션별로 받는다)"""
    out, seen = [], set()
    for pos in POS:
        for page in range(1, 10):
            t = get(f'{SITE}/player.do?type=active&leagueId=1&teamId={code}&pos={pos}&page={page}', HDR)
            if not t:
                break
            new = 0
            for pid, img, rest in CARD.findall(t):
                if pid in seen:
                    continue
                seen.add(pid); new += 1
                nm = re.search(r'class="name">([^<]*)<', rest)
                no = re.search(r'No\.\s*(\d+)', rest)
                if '/v1/player/' not in img:  # 사진 없는 선수
                    continue
                out.append({'pid': pid, 'ko': (nm.group(1) if nm else '').strip(), 'num': int(no.group(1)) if no else None,
                            'pos': pos, 'url': img})
            if not new or f'goToPage({page + 1});">{page + 1}' not in t:
                break
    return out


def _detail(o):
    """상세 페이지의 영문명·생년"""
    t = get(f"{SITE}/record/playerDetail.do?playerId={o['pid']}", HDR) or ''
    tx = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' | ', t))
    en = re.search(r'영문명 \|[ |]*([A-Za-z][^|가-힣]*?) \|', tx)
    by = re.search(r'생년월일 \|[ |]*(\d{4})/', tx)
    o['en'] = en.group(1).strip() if en else ''
    o['by'] = int(by.group(1)) if by else None
    return o


# 한국어 로마자 표기 흔들림 (Lee/Yi, Jeong/Jung/Chung, eo/o, oo/u ...) 을 줄여 비교
_SUR = {'lee': 'i', 'yi': 'i', 'rhee': 'i', 'rhie': 'i', 'park': 'bak', 'pak': 'bak', 'bak': 'bak', 'choi': 'choe', 'choe': 'choe',
        'chung': 'jung', 'jeong': 'jung', 'jung': 'jung', 'cheong': 'jung', 'kang': 'gang', 'gang': 'gang', 'koo': 'gu', 'ku': 'gu',
        'goo': 'gu', 'gu': 'gu', 'kwon': 'gwon', 'gwon': 'gwon', 'shin': 'sin', 'sin': 'sin', 'yoon': 'yun', 'yun': 'yun',
        'oh': 'o', 'o': 'o', 'noh': 'no', 'roh': 'no', 'no': 'no', 'ryu': 'yu', 'yoo': 'yu', 'yu': 'yu', 'lim': 'im', 'im': 'im',
        'rim': 'im', 'ri': 'i', 'jang': 'jang', 'chang': 'jang', 'cho': 'jo', 'jo': 'jo', 'jin': 'jin', 'chin': 'jin', 'han': 'han',
        'hwang': 'hwang', 'song': 'song', 'son': 'son', 'sohn': 'son', 'seo': 'so', 'suh': 'so', 'seoh': 'so', 'go': 'go', 'ko': 'go',
        'koh': 'go', 'kim': 'gim', 'gim': 'gim', 'moon': 'mun', 'mun': 'mun', 'baek': 'baek', 'paik': 'baek', 'paek': 'baek',
        'bae': 'bae', 'pae': 'bae', 'ahn': 'an', 'an': 'an', 'hong': 'hong', 'heo': 'ho', 'hur': 'ho', 'huh': 'ho', 'nam': 'nam',
        'jeon': 'jon', 'jun': 'jon', 'chun': 'jon', 'chon': 'jon', 'yang': 'yang', 'kwak': 'gwak', 'gwak': 'gwak', 'woo': 'u',
        'u': 'u', 'min': 'min', 'byun': 'byon', 'byeon': 'byon', 'ha': 'ha', 'na': 'na', 'ra': 'na', 'um': 'om', 'eom': 'om',
        'maeng': 'maeng', 'yeon': 'yon', 'yon': 'yon'}


def _rom(w):
    w = w.replace('eo', 'o').replace('oo', 'u').replace('ou', 'u').replace('ee', 'i').replace('wu', 'u').replace('ae', 'e')
    w = re.sub(r'^k', 'g', re.sub(r'^p', 'b', re.sub(r'^t', 'd', re.sub(r'^ch', 'j', w))))
    return w


def _keys(name):
    """한국식 이름 → 비교용 열쇠 집합 (성 앞/뒤 두 가지 어순 모두)"""
    w = norm(name)
    if len(w) < 2:
        return set()
    out = set()
    for sur, giv in ((w[0], w[1:]), (w[-1], w[:-1])):
        if sur in _SUR:
            out.add(_SUR[sur] + '|' + ''.join(_rom(x) for x in giv))
    return out


def _sim(tm_name, en):
    if not en:
        return 0
    if _keys(tm_name) & _keys(en):
        return 1
    return name_score(tm_name, en)


def _byear_ok(p, by):
    return bool(by and p.get('age')) and SEASON - p['age'] - 1 <= by <= SEASON - p['age']


def _match(players, off, pool):
    out, used_p, used_o = {}, set(), set()

    def take(cands):
        cands.sort(key=lambda x: -x[0])
        for sc, p, o in cands:
            if p['id'] in used_p or o['pid'] in used_o:
                continue
            used_p.add(p['id']); used_o.add(o['pid'])
            out[str(p['id'])] = {'url': o['url'], 'headers': HDR}

    # 1) 한글 이름이 같은 사람
    c = []
    for p in players:
        ko = (p.get('ko') or '').replace(' ', '')
        for o in off:
            if ko and ko == o['ko'].replace(' ', ''):
                c.append((2 + (0.5 if p.get('num') and p['num'] == o['num'] else 0), p, o))
    take(c)
    rest_p = [p for p in players if p['id'] not in used_p]
    rest_o = [o for o in off if o['pid'] not in used_o]
    if not rest_p or not rest_o:
        return out
    # 2) 상세 페이지 영문명 + 등번호 + 생년
    list(pool.map(_detail, [o for o in rest_o if 'en' not in o]))
    c = []
    for p in rest_p:
        for o in rest_o:
            s = _sim(p['name'], o['en'])
            num = bool(p.get('num') and p['num'] == o['num'])
            by = _byear_ok(p, o['by'])
            if o['by'] and p.get('age') and not by and abs(SEASON - p['age'] - o['by']) > 1:
                continue  # 나이가 분명히 다르면 다른 사람
            if s >= 0.9 or (s >= 0.6 and (num or by)) or (not p.get('ko') and num and by and not _keys(o['en'])):  # 이름이 안 맞는 외국인은 번호·생년이 같고 공식 영문명이 한국식이 아닐 때만
                c.append((s + 0.3 * num + 0.3 * by, p, o))
    take(c)
    return out


def _search(p, code):
    """현역 명단에 없는 선수(전역·이적·말소)를 전체 선수 검색에서 한글 이름 + 생년으로 찾는다.
    사진은 최근 시즌(SEASON-2 이후) 것만, 같은 이름이 둘 이상이면 이 구단 사진인 사람만"""
    t = get(f"{SITE}/player.do?type=all&searchWord={quote(p['ko'])}", HDR) or ''
    c = []
    for pid, img, rest in CARD.findall(t):
        nm = re.search(r'class="name">([^<]*)<', rest)
        y = re.search(r'/v1/player/(\d{4})/(K\d+)/', img)
        if nm and nm.group(1).strip().replace(' ', '') == p['ko'].replace(' ', '') and y and int(y.group(1)) >= SEASON - 2:
            o = _detail({'pid': pid, 'url': img})
            if _byear_ok(p, o['by']):
                c.append((y.group(2) == code, o))
    if len(c) > 1:
        c = [x for x in c if x[0]]
    return c[0][1] if len(c) == 1 else None


def fetch(league):
    codes = _club_codes()
    out = {}
    with ThreadPoolExecutor(4) as pool:
        clubs = [(c, _code_for(c, codes)) for c in league['clubs']]
        clubs = [(c, k) for c, k in clubs if k]
        rosters = list(pool.map(lambda ck: _roster(ck[1]), clubs))
        for (club, _), off in zip(clubs, rosters):
            out.update(_match(club['players'], off, pool))
        # 현역 명단에 없거나 사진이 없는 선수: 이름 검색 (이미 다른 선수에게 준 사진은 제외)
        taken = {v['url'] for v in out.values()}
        miss = [(p, k) for c, k in clubs for p in c['players'] if str(p['id']) not in out and p.get('ko')]
        for (p, _), o in zip(miss, pool.map(lambda pk: _search(*pk), miss)):
            if o and o['url'] not in taken:
                taken.add(o['url'])
                out[str(p['id'])] = {'url': o['url'], 'headers': HDR}
    return out
