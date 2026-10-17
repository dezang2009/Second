#!/usr/bin/env python3
"""유스·자동 생성 선수용 가상 얼굴 (AI 생성, 실존 인물 아님).

출처: Hugging Face 데이터셋 balgot/stylegan3-annotated (StyleGAN3로 생성한 얼굴)
data/faces.json 에 고른 이미지 이름(general: 일반, asian: 동아시아)을 적어 두고 실행한다.
rembg 가 설치돼 있으면 배경을 지우고 선수 프로필 사진처럼 단색 스튜디오 배경을 깐다.

  python3 tools/build_faces.py <원본 이미지 폴더>
  → dist/photos/f/{번호}.webp (240×312, 앱용), dist/assets/faces.webp (스프라이트, 웹용), data/faces_meta.json
"""
import json, os, sys
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

try:
    from rembg import remove, new_session
    SESSION = new_session('u2net_human_seg')
except ImportError:
    SESSION = None
    print('rembg 없음: 원본 배경 그대로 사용', file=sys.stderr)

src = sys.argv[1]
sel = json.load(open('data/faces.json'))
names = sel['general'] + sel['asian']
os.makedirs('dist/photos/f', exist_ok=True)
os.makedirs('dist/assets', exist_ok=True)
W, H, COLS = 120, 156, 12
BOX = (118, 0, 906, 1024)  # 머리와 어깨가 보이는 세로 구도 (240:312)


def backdrop(w, h):
    """트랜스퍼마크트 프로필 사진 같은 연회색 스튜디오 배경."""
    im = Image.new('RGB', (w, h))
    d = ImageDraw.Draw(im)
    top, bot = (232, 235, 240), (196, 201, 210)
    for y in range(h):
        t = y / (h - 1)
        d.line([(0, y), (w, y)], fill=tuple(round(top[i] + (bot[i] - top[i]) * t) for i in range(3)))
    return im


def portrait(path):
    im = Image.open(path).convert('RGB')
    if SESSION:
        cut = remove(im, session=SESSION)
        mask = cut.split()[3].filter(ImageFilter.MinFilter(5)).filter(ImageFilter.GaussianBlur(2))
        bg = backdrop(*im.size)
        bg.paste(im, (0, 0), mask)
        im = bg
    im = im.crop(BOX)
    return ImageEnhance.Contrast(im).enhance(1.04)


rows = (len(names) + COLS - 1) // COLS
sheet = Image.new('RGB', (W * COLS, H * rows), (40, 40, 60))
for k, n in enumerate(names):
    im = portrait(os.path.join(src, n))
    im.resize((240, 312), Image.LANCZOS).save(f'dist/photos/f/{k}.webp', 'WEBP', quality=82, method=6)
    sheet.paste(im.resize((W, H), Image.LANCZOS), ((k % COLS) * W, (k // COLS) * H))
sheet.save('dist/assets/faces.webp', 'WEBP', quality=78, method=6)
ng = len(sel['general'])
meta = {'general': list(range(ng)), 'asian': list(range(ng, len(names))), 'cols': COLS, 'w': W, 'h': H, 'sheet': 'assets/faces.webp'}
json.dump(meta, open('data/faces_meta.json', 'w'), separators=(',', ':'))
print('faces', ng, 'general,', len(names) - ng, 'asian', file=sys.stderr)
