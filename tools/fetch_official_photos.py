#!/usr/bin/env python3
"""구단·리그 공식 사이트의 선수 프로필 사진을 모은다.

  python3 tools/fetch_official_photos.py [GB1 ES1 ...]
  → data/official_photos.json {트랜스퍼마크트 선수 id: 사진 주소}
  → .official-cache/{선수 id}.png (원본, 저장소에 올리지 않음)
리그마다 tools/official/{리그 코드}.py 의 fetch(league) 가 {선수 id: {url, headers}} 를 돌려준다.
사진 저작권은 각 구단·리그에 있다 (개인 비상업 용도).
"""
import importlib, json, os, sys
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from official._common import get

CACHE = '.official-cache'


def main():
    data = json.load(open('data/transfermarkt.json', encoding='utf-8'))
    want = [a for a in sys.argv[1:] if not a.startswith('-')]
    try:
        index = json.load(open('data/official_photos.json'))
    except (OSError, ValueError):
        index = {}
    os.makedirs(CACHE, exist_ok=True)
    for lg in data['leagues']:
        code = lg['code']
        if want and code not in want:
            continue
        try:
            mod = importlib.import_module(f'official.{code}')
        except ImportError:
            print(code, '수집기 없음', file=sys.stderr)
            continue
        found = mod.fetch(lg)
        total = sum(len(c['players']) for c in lg['clubs'])

        def dl(item):
            pid, o = item
            path = f'{CACHE}/{pid}.png'
            if os.path.exists(path) and os.path.getsize(path) > 2000:
                return pid, True
            b = get(o['url'], o.get('headers'), binary=True)
            if b and len(b) > 2000:
                open(path, 'wb').write(b)
                return pid, True
            return pid, False
        with ThreadPoolExecutor(8) as ex:
            ok = [pid for pid, good in ex.map(dl, found.items()) if good]
        for pid in ok:
            index[pid] = found[pid]['url']
        print(f'{code}: 공식 사진 {len(ok)}/{total}명', file=sys.stderr)
        json.dump(index, open('data/official_photos.json', 'w'), separators=(',', ':'))


if __name__ == '__main__':
    main()
