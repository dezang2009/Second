#!/usr/bin/env python3
"""트랜스퍼마크트 구단별 시즌 기록(출전·골·도움·카드·출전 시간)을 모은다.

사용법: python3 tools/fetch_tm_stats.py [시즌ID, 기본 2025 = 2025/26 시즌]
결과:   data/tm_stats.json  {season, players: {선수ID: [출전, 골, 도움, 경고, 퇴장, 출전시간(분), 승점/경기]}}

구단마다 한 페이지(전 대회 합산)만 요청한다. 같은 선수가 여러 구단에 나오면(시즌 중 이적) 합산한다.
"""
import hashlib, json, os, re, subprocess, sys, time
from bs4 import BeautifulSoup
sys.path.insert(0, 'tools')
from fetch_transfermarkt import BASE, UA, CACHE, DELAY


def get(url):
    """curl로 받아 캐시 (프록시 환경에서 urllib이 405로 막히는 경우가 있어 curl 사용)"""
    os.makedirs(CACHE, exist_ok=True)
    fn = os.path.join(CACHE, hashlib.sha1(url.encode()).hexdigest() + '.html')
    if os.path.exists(fn):
        return open(fn, encoding='utf-8').read()
    for attempt in range(4):
        r = subprocess.run(['curl', '-s', '-L', '--max-time', '40', '-A', UA, '-H', 'Accept-Language: ko-KR,ko;q=0.9', url], capture_output=True)
        html = r.stdout.decode('utf-8', 'replace')
        if r.returncode == 0 and 'table' in html:
            open(fn, 'w', encoding='utf-8').write(html)
            time.sleep(DELAY)
            return html
        time.sleep(DELAY * (attempt + 2))
    raise RuntimeError('failed: ' + url)

SEASON = next((a for a in sys.argv[1:] if a.isdigit()), '2025')


def num(t):
    t = t.strip().replace("'", '').replace('.', '').replace(',', '')
    return int(t) if t.isdigit() else 0


def main():
    data = json.load(open('data/transfermarkt.json', encoding='utf-8'))
    out = {}
    clubs = [c for lg in data['leagues'] for c in lg['clubs']]
    for i, c in enumerate(clubs):
        url = f"{BASE}/{c['slug']}/leistungsdaten/verein/{c['id']}/reldata/%26{SEASON}/plus/1"
        try:
            html = get(url)
        except Exception as e:
            print('skip', c['name'], e, file=sys.stderr)
            continue
        s = BeautifulSoup(html, 'html.parser')
        tb = s.select_one('table.items')
        if not tb:
            continue
        n = 0
        for tr in tb.select('tbody > tr'):
            a = tr.select_one('a[href*="/spieler/"]')
            if not a:
                continue
            m = re.search(r'/spieler/(\d+)', a['href'])
            tds = tr.find_all('td', recursive=False)
            if not m or len(tds) < 15:
                continue
            cells = [td.get_text(' ', strip=True) for td in tds]
            # 열: #, 선수, 나이, 국적, 스쿼드, 출장, 득점, 도움, 경고, 경고누적퇴장, 퇴장, 교체IN, 교체OUT, PPG, 출전시간
            apps, g, ast, y, y2, r = (num(cells[k]) for k in (5, 6, 7, 8, 9, 10))
            mins = num(cells[14])
            ppg = float(cells[13].replace(',', '.')) if re.match(r'^[\d.,]+$', cells[13]) else 0
            pid = m.group(1)
            prev = out.get(pid)
            row = [apps, g, ast, y, y2 + r, mins, ppg]
            out[pid] = [a + b for a, b in zip(prev[:6], row[:6])] + [max(prev[6], ppg)] if prev else row
            n += 1
        print(f'{i + 1}/{len(clubs)} {c["name"]} {n}', file=sys.stderr)
    json.dump({'season': int(SEASON), 'players': out}, open('data/tm_stats.json', 'w'), separators=(',', ':'))
    print('players', len(out), file=sys.stderr)


if __name__ == '__main__':
    main()
