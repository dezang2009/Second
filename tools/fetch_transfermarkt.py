#!/usr/bin/env python3
"""트랜스퍼마크트(transfermarkt.co.kr)에서 리그·구단·선수 데이터를 모은다.

사용법: python3 tools/fetch_transfermarkt.py [시즌ID]
결과:   data/transfermarkt.json

요청 사이에 간격을 두어 사이트에 부담을 주지 않는다. 개인 학습·비상업 용도로만 사용할 것.
"""
import hashlib, json, os, re, sys, time, urllib.request
from bs4 import BeautifulSoup

SEASON = next((a for a in sys.argv[1:] if a.isdigit()), '2026')
BASE = 'https://www.transfermarkt.co.kr'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
LEAGUES = [
    ('GB1', 'premier-league', '프리미어리그'),
    ('ES1', 'laliga', '라리가'),
    ('L1', 'bundesliga', '분데스리가'),
    ('IT1', 'serie-a', '세리에 A'),
    ('FR1', 'ligue-1', '리그 1'),
    ('RSK1', 'k-league-1', 'K리그 1'),
]
DELAY = 1.5


CACHE = os.environ.get('TM_CACHE', '.tm-cache')


def get(url):
    """페이지를 받아오고 디스크에 캐시한다 (다시 실행해도 같은 페이지를 재요청하지 않음)."""
    os.makedirs(CACHE, exist_ok=True)
    fn = os.path.join(CACHE, hashlib.sha1(url.encode()).hexdigest() + '.html')
    if os.path.exists(fn):
        return open(fn, encoding='utf-8').read()
    html = fetch(url)
    with open(fn, 'w', encoding='utf-8') as f:
        f.write(html)
    return html


def fetch(url):
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9'})
            with urllib.request.urlopen(req, timeout=30) as r:
                html = r.read().decode('utf-8', 'replace')
            time.sleep(DELAY)
            return html
        except Exception as e:  # 일시적 오류는 재시도
            print('  retry', url, e, file=sys.stderr)
            time.sleep(DELAY * (attempt + 2))
    raise RuntimeError('failed: ' + url)


def money(text):
    """'45.00 mil. €' → 45000000, '800 Th. €' → 800000"""
    t = text.replace(',', '.').strip()
    m = re.search(r'([\d.]+)\s*(bil|mil|Th)', t)
    if not m:
        return 0
    v = float(m.group(1))
    return int(v * {'bil': 1e9, 'mil': 1e6, 'Th': 1e3}[m.group(2)])


def clubs_of(code, slug):
    s = BeautifulSoup(get(f'{BASE}/{slug}/startseite/wettbewerb/{code}/saison_id/{SEASON}'), 'html.parser')
    out = []
    for tr in s.select('table.items > tbody > tr'):
        a = tr.select_one('td.hauptlink a[href*="/startseite/verein/"]')
        if not a:
            continue
        cid = int(re.search(r'/verein/(\d+)', a['href']).group(1))
        out.append({'id': cid, 'name': a.get_text(strip=True), 'slug': a['href'].split('/')[1]})
    return out


def squad(club):
    s = BeautifulSoup(get(f"{BASE}/{club['slug']}/kader/verein/{club['id']}/saison_id/{SEASON}/plus/1"), 'html.parser')
    for li in s.select('li.data-header__label'):
        txt = li.get_text(' ', strip=True)
        if txt.startswith('홈구장'):
            a = li.select_one('a')
            club['stadium'] = a.get_text(strip=True) if a else ''
            cap = li.select_one('.tabellenplatz')
            club['cap'] = int(re.sub(r'\D', '', cap.get_text())) if cap else 0
    players = []
    for tr in s.select('table.items > tbody > tr'):
        tds = tr.find_all('td', recursive=False)
        if len(tds) < 9:
            continue
        link = tr.select_one('td.hauptlink a[href*="/profil/spieler/"]')
        if not link:
            continue
        pid = int(re.search(r'/spieler/(\d+)', link['href']).group(1))
        img = tr.select_one('img.bilderrahmen-fixed')
        photo = (img.get('data-src') or img.get('src') or '') if img else ''
        inline = tr.select('table.inline-table tr')
        pos = inline[1].get_text(strip=True) if len(inline) > 1 else ''
        num = tds[0].get_text(strip=True)
        age_m = re.search(r'\((\d+)', tds[2].get_text())
        nats = [i['title'] for i in tds[3].select('img.flaggenrahmen')]
        height = tds[4].get_text(strip=True)
        foot = tds[5].get_text(strip=True)
        contract = tds[8].get_text(strip=True) if len(tds) > 8 else ''
        cy = re.search(r'(\d{4})년', contract)
        value = money(tds[-1].get_text())
        players.append({
            'id': pid, 'name': link.get_text(strip=True), 'pos': pos,
            'num': int(num) if num.isdigit() else 0,
            'age': int(age_m.group(1)) if age_m else 25,
            'nat': nats[0] if nats else '', 'h': height, 'foot': foot,
            'until': int(cy.group(1)) if cy else int(SEASON) + 1,
            'value': value,
            'photo': '' if 'default' in photo or photo.startswith('data:') else photo.split('?')[0],
        })
    return players


def main():
    data = {'season': int(SEASON), 'fetched': time.strftime('%Y-%m-%d'), 'source': BASE, 'leagues': []}
    for code, slug, name in LEAGUES:
        print('league', code, file=sys.stderr)
        league = {'code': code, 'name': name, 'clubs': []}
        for c in clubs_of(code, slug):
            c['players'] = squad(c)
            print(f"  {c['name']}: {len(c['players'])}", file=sys.stderr)
            league['clubs'].append(c)
        data['leagues'].append(league)
    with open('data/transfermarkt.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    print('saved data/transfermarkt.json', file=sys.stderr)




def korean_names():
    """한국 국적 선수의 한글 이름을 프로필 페이지에서 가져와 data/transfermarkt.json에 'ko'로 추가한다.
    사용법: python3 tools/fetch_transfermarkt.py --korean-names"""
    with open('data/transfermarkt.json', encoding='utf-8') as f:
        data = json.load(f)
    targets = [p for lg in data['leagues'] for c in lg['clubs'] for p in c['players'] if p['nat'] == '대한민국' and not p.get('ko')]
    print('profiles', len(targets), file=sys.stderr)
    for i, p in enumerate(targets):
        s = BeautifulSoup(get(f"{BASE}/x/profil/spieler/{p['id']}"), 'html.parser')
        for sp in s.select('span.info-table__content--regular'):
            if sp.get_text(strip=True).startswith('본국 이름'):
                nxt = sp.find_next_sibling('span')
                if nxt:
                    p['ko'] = nxt.get_text(strip=True)
                break
        if i % 25 == 0:
            print(f'  {i}/{len(targets)}', file=sys.stderr)
    with open('data/transfermarkt.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    print('saved korean names', file=sys.stderr)


if __name__ == '__main__':
    if '--korean-names' in sys.argv:
        korean_names()
    else:
        main()
