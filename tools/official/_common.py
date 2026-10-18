"""리그별 공식 사진 수집기가 같이 쓰는 도구: HTTP(curl), 이름 정규화, 트랜스퍼마크트 선수와 짝짓기"""
import json, re, subprocess, time, unicodedata

UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36'


def get(url, headers=None, binary=False, tries=3, timeout=40):
    """curl로 받아 온다 (프록시 환경에서 urllib보다 안정적). 실패하면 None"""
    cmd = ['curl', '-s', '-L', '--compressed', '-m', str(timeout), '-A', UA, '-w', '\n%{http_code}']
    for k, v in (headers or {}).items():
        cmd += ['-H', f'{k}: {v}']
    for i in range(tries):
        r = subprocess.run(cmd + [url], capture_output=True)
        body, _, code = r.stdout.rpartition(b'\n')
        if code.strip() == b'200' and body:
            return body if binary else body.decode('utf-8', 'replace')
        if code.strip() in (b'403', b'404'):
            return None
        time.sleep(1.5 * (i + 1))
    return None


def get_json(url, headers=None):
    t = get(url, headers)
    try:
        return json.loads(t) if t else None
    except ValueError:
        return None


def norm(s):
    """악센트·특수문자를 떼고 소문자 낱말로"""
    s = unicodedata.normalize('NFKD', str(s or '')).encode('ascii', 'ignore').decode().lower()
    s = s.replace('ø', 'o').replace('ß', 'ss')
    return [w for w in re.split(r'[^a-z0-9]+', s) if w]


def name_score(a, b):
    """두 이름이 같은 사람일 가능성 (0~1)"""
    A, B = norm(a), norm(b)
    if not A or not B:
        return 0
    if A == B:
        return 1
    if ' '.join(A) in ' '.join(B) or ' '.join(B) in ' '.join(A):
        return 0.9
    if A[-1] == B[-1]:
        return 0.8 if A[0][0] == B[0][0] else 0.7
    common = set(A) & set(B)
    if common and max(len(w) for w in common) >= 4:
        return 0.6
    return 0


def match(tm_players, official):
    """tm_players: 트랜스퍼마크트 선수 목록(같은 구단), official: [{name, num, url, ...}]
    → {tm_id: official 항목}. 이름 점수 + 등번호 일치로 짝짓고 한 사람은 한 번만"""
    cands = []
    for p in tm_players:
        for o in official:
            sc = name_score(p['name'], o['name'])
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
        out[str(pid)] = o
    return out


def club_match(tm_club, names):
    """트랜스퍼마크트 구단(slug·이름)과 가장 비슷한 공식 구단 이름의 인덱스 (없으면 None)"""
    tm = set(norm(tm_club['slug'].replace('-', ' '))) | set(norm(tm_club['name']))
    skip = {'fc', 'cf', 'ac', 'afc', 'sc', 'ssc', 'as', 'rc', 'ss', 'us', 'club', 'de', 'and', 'the', '1', 'calcio', 'football'}
    tm -= skip
    best, bi = 0, None
    for i, n in enumerate(names):
        w = set(norm(n)) - skip
        s = len(tm & w) / max(1, min(len(tm), len(w)))
        if s > best:
            best, bi = s, i
    return bi if best >= 0.5 else None
