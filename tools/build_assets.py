#!/usr/bin/env python3
"""구단 로고에서 유니폼 색을 뽑고, (선택) 단일 파일 배포용 사진 스프라이트를 만든다.

  python3 tools/build_assets.py            → data/club_colors.json
  python3 tools/build_assets.py --sprites  → dist/assets/*.webp + data/sprites.json
  python3 tools/build_assets.py --photos   → dist/photos/p/{id}.webp (240×312 고화질 사진), dist/photos/l/{id}.webp (로고 160px)
                                            + data/photos.json (안드로이드 앱이 개별 고화질 사진을 쓴다)

이미지 원본은 트랜스퍼마크트 CDN에서 받아 .tm-cache/img 에 캐시한다.
사진과 로고의 저작권은 각 권리자에게 있으므로 공개 배포 시 사용 허가를 확인할 것.
"""
import io, json, os, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

CDN = 'https://img.a.transfermarkt.technology'
CACHE = os.path.join(os.environ.get('TM_CACHE', '.tm-cache'), 'img')
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'


def fetch(path):
    os.makedirs(CACHE, exist_ok=True)
    fn = os.path.join(CACHE, path.strip('/').replace('/', '_'))
    if os.path.exists(fn):
        return open(fn, 'rb').read()
    for attempt in range(3):
        try:
            req = urllib.request.Request(CDN + path, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                data = r.read()
            with open(fn, 'wb') as f:
                f.write(data)
            time.sleep(0.15)
            return data
        except Exception as e:
            print('  retry', path, e, file=sys.stderr)
            time.sleep(1 + attempt * 2)
    return None


def hexc(c):
    return '#%02x%02x%02x' % tuple(int(v) for v in c[:3])


def dist(a, b):
    return sum((x - y) ** 2 for x, y in zip(a[:3], b[:3])) ** 0.5


def club_colors(png):
    """로고에서 가장 많이 쓰인 두 색 (투명·거의 흰색 테두리 제외)"""
    im = Image.open(io.BytesIO(png)).convert('RGBA')
    im.thumbnail((96, 96))
    px = [p for p in im.getdata() if p[3] > 200]
    if not px:
        return ['#2d3a4a', '#ffffff']
    q = Image.new('RGB', (len(px), 1))
    q.putdata([p[:3] for p in px])
    pal = q.quantize(colors=8, method=Image.Quantize.MEDIANCUT)
    counts = sorted(pal.getcolors(), reverse=True)
    palette = pal.getpalette()
    cols = [(n, tuple(palette[i * 3:i * 3 + 3])) for n, i in counts]
    def score(c):
        n, rgb = c
        mx, mn = max(rgb), min(rgb)
        sat = (mx - mn) / 255
        white = mn > 225
        return n * (0.35 if white else 1) * (0.6 + sat)
    cols.sort(key=score, reverse=True)
    c1 = cols[0][1]
    c2 = next((rgb for _, rgb in cols[1:] if dist(rgb, c1) > 90), None)
    if c2 is None:
        c2 = (255, 255, 255) if sum(c1) < 380 else (20, 20, 20)
    return [hexc(c1), hexc(c2)]


def main():
    data = json.load(open('data/transfermarkt.json', encoding='utf-8'))
    clubs = [c for lg in data['leagues'] for c in lg['clubs']]
    with ThreadPoolExecutor(4) as ex:
        logos = list(ex.map(lambda c: fetch(f"/wappen/head/{c['id']}.png"), clubs))
    colors = {}
    for c, png in zip(clubs, logos):
        if png:
            colors[str(c['id'])] = club_colors(png)
    json.dump(colors, open('data/club_colors.json', 'w'), separators=(',', ':'))
    print('colors', len(colors), file=sys.stderr)
    if '--sprites' in sys.argv:
        sprites(data, clubs, logos)
    if '--photos' in sys.argv:
        photos(data, clubs)


OFFICIAL = '.official-cache'


def official(pid, size):
    """구단·리그 공식 프로필 사진(배경 투명, 정사각형 반신) → 머리와 가슴이 보이는 3:4 세로 RGBA. 없으면 None
    tools/fetch_official_photos.py 가 받아 둔 원본을 쓴다"""
    path = f'{OFFICIAL}/{pid}.png'
    if not os.path.exists(path):
        return None
    try:
        im = Image.open(path).convert('RGBA')
    except Exception:
        return None
    w, h = im.size
    bbox = im.getchannel('A').getbbox()
    if bbox and bbox[3] - bbox[1] < h * 0.98:  # 위쪽 여백이 있으면 머리 꼭대기에 맞춘다
        top = max(0, bbox[1] - int(h * 0.02))
    else:
        top = 0
    cw = int(w * (0.92 if h > w * 1.15 else 0.64))  # 세로로 긴 원본(K리그)은 넓게 잘라 유니폼까지
    if w > h * 1.15 and bbox:  # 가로로 넓고 선수가 작게 서 있는 원본(리그 1): 선수 윤곽에 맞춰 자른다
        cw = int((bbox[2] - bbox[0]) * 0.95)
        left = (bbox[0] + bbox[2]) // 2 - cw // 2
        ch = int(cw * 13 / 10)
        im = im.crop((left, top, left + cw, top + ch))
        return im.resize(size, Image.LANCZOS)
    ch = int(cw * 13 / 10)
    left = (w - cw) // 2
    im = im.crop((left, top, left + cw, min(h, top + ch)))
    if im.height < ch:  # 아래가 모자라면 투명하게 늘린다
        pad = Image.new('RGBA', (cw, ch), (0, 0, 0, 0)); pad.paste(im, (0, 0)); im = pad
    return im.resize(size, Image.LANCZOS)


def tm_or_official(players):
    """공식 사진이 있으면 그것, 없으면 트랜스퍼마크트 사진 → [(선수, 'off'|bytes)]"""
    tm = [p for p in players if p.get('photo') and not os.path.exists(f"{OFFICIAL}/{p['id']}.png")]
    paths = [p['photo'].split('transfermarkt.technology')[-1] for p in tm]
    return tm, paths


def photos(data, clubs):
    """선수마다 고화질 사진 한 장(트랜스퍼마크트 portrait/big 300×390 → 240×312 webp), 로고는 wappen/big 180px → 160px"""
    os.makedirs('dist/photos/p', exist_ok=True)
    os.makedirs('dist/photos/l', exist_ok=True)
    allp = [p for c in clubs for p in c['players']]
    idx = {'p': [], 'l': []}
    n_off = 0
    for p in allp:  # 공식 프로필 사진 먼저 (배경 투명 webp)
        im = official(p['id'], (240, 312))
        if im is not None:
            im.save(f"dist/photos/p/{p['id']}.webp", 'WEBP', quality=84, method=6)
            idx['p'].append(p['id']); n_off += 1
    players, paths = tm_or_official(allp)
    paths = [x.replace('/portrait/medium/', '/portrait/big/') for x in paths]
    with ThreadPoolExecutor(6) as ex:
        imgs = list(ex.map(fetch, paths))
    print('official photos', n_off, file=sys.stderr)
    for p, b in zip(players, imgs):
        if not b:
            continue
        try:
            im = Image.open(io.BytesIO(b)).convert('RGB').resize((240, 312), Image.LANCZOS)
        except Exception:
            continue
        im.save(f"dist/photos/p/{p['id']}.webp", 'WEBP', quality=82, method=6)
        idx['p'].append(p['id'])
    with ThreadPoolExecutor(4) as ex:
        logos = list(ex.map(lambda c: fetch(f"/wappen/big/{c['id']}.png"), clubs))
    for c, b in zip(clubs, logos):
        if not b:
            continue
        im = Image.open(io.BytesIO(b)).convert('RGBA')
        im.thumbnail((160, 160), Image.LANCZOS)
        im.save(f"dist/photos/l/{c['id']}.webp", 'WEBP', quality=90, method=6)
        idx['l'].append(c['id'])
    json.dump(idx, open('data/photos.json', 'w'), separators=(',', ':'))
    print('photos', len(idx['p']), 'players,', len(idx['l']), 'logos', file=sys.stderr)


def sprites(data, clubs, logos):
    """사진 120장/로고 전부를 격자 한 장씩으로 묶어 webp로 저장"""
    os.makedirs('dist/assets', exist_ok=True)
    allp = [p for c in clubs for p in c['players']]
    players, paths = tm_or_official(allp)
    with ThreadPoolExecutor(6) as ex:
        imgs = list(ex.map(fetch, paths))
    index = {'p': {}, 'l': {}, 'pw': 84, 'ph': 109, 'lw': 64}
    PW, PH, COLS, PER = 84, 109, 12, 144
    ok = [(p, 'off') for p in allp if os.path.exists(f"{OFFICIAL}/{p['id']}.png")] + [(p, b) for p, b in zip(players, imgs) if b]
    for s in range(0, len(ok), PER):
        chunk = ok[s:s + PER]
        rows = (len(chunk) + COLS - 1) // COLS
        sheet = Image.new('RGBA', (PW * COLS, PH * rows), (0, 0, 0, 0))
        for i, (p, b) in enumerate(chunk):
            try:
                im = official(p['id'], (PW, PH)) if b == 'off' else Image.open(io.BytesIO(b)).convert('RGBA').resize((PW, PH), Image.LANCZOS)
            except Exception:
                im = None
            if im is None:
                continue
            sheet.paste(im, ((i % COLS) * PW, (i // COLS) * PH))
            index['p'][p['id']] = [s // PER, i]
        sheet.save(f'dist/assets/p{s // PER}.webp', 'WEBP', quality=74, method=6)
    LW, LC = 64, 12
    rows = (len(clubs) + LC - 1) // LC
    sheet = Image.new('RGBA', (LW * LC, LW * rows), (0, 0, 0, 0))
    for i, (c, b) in enumerate(zip(clubs, logos)):
        if not b:
            continue
        im = Image.open(io.BytesIO(b)).convert('RGBA')
        im.thumbnail((LW, LW), Image.LANCZOS)
        sheet.paste(im, ((i % LC) * LW + (LW - im.width) // 2, (i // LC) * LW + (LW - im.height) // 2), im)
        index['l'][c['id']] = i
    sheet.save('dist/assets/logos.webp', 'WEBP', quality=85, method=6)
    index['sheets'] = (len(ok) + PER - 1) // PER
    json.dump(index, open('data/sprites.json', 'w'), separators=(',', ':'))
    print('sprites', len(ok), 'players,', index['sheets'], 'sheets', file=sys.stderr)


if __name__ == '__main__':
    main()
