#!/usr/bin/env python3
"""유스·자동 생성 선수용 가상 얼굴 (AI 생성, 실존 인물 아님).

출처: Hugging Face 데이터셋 balgot/stylegan3-annotated (StyleGAN3로 생성한 얼굴)
data/faces.json 에 고른 이미지 이름(general: 일반, asian: 동아시아)을 적어 두고 실행한다.

  python3 tools/build_faces.py <원본 이미지 폴더>
  → dist/photos/f/{번호}.webp (240×312, 앱용), dist/assets/faces.webp (스프라이트, 웹용), data/faces_meta.json
"""
import json, os, sys
from PIL import Image, ImageEnhance

src = sys.argv[1]
sel = json.load(open('data/faces.json'))
names = sel['general'] + sel['asian']
os.makedirs('dist/photos/f', exist_ok=True)
os.makedirs('dist/assets', exist_ok=True)
W, H, COLS = 120, 156, 12
rows = (len(names) + COLS - 1) // COLS
sheet = Image.new('RGB', (W * COLS, H * rows), (40, 40, 60))
for k, n in enumerate(names):
    im = Image.open(os.path.join(src, n)).convert('RGB')
    im = im.crop((128, 26, 896, 1024))  # 머리와 어깨가 보이는 3:4 세로 구도 (트랜스퍼마크트 사진과 비슷하게)
    im = ImageEnhance.Contrast(im).enhance(1.04)
    im.resize((240, 312), Image.LANCZOS).save(f'dist/photos/f/{k}.webp', 'WEBP', quality=82, method=6)
    sheet.paste(im.resize((W, H), Image.LANCZOS), ((k % COLS) * W, (k // COLS) * H))
sheet.save('dist/assets/faces.webp', 'WEBP', quality=78, method=6)
ng = len(sel['general'])
meta = {'general': list(range(ng)), 'asian': list(range(ng, len(names))), 'cols': COLS, 'w': W, 'h': H, 'sheet': 'assets/faces.webp'}
json.dump(meta, open('data/faces_meta.json', 'w'), separators=(',', ':'))
print('faces', ng, 'general,', len(names) - ng, 'asian', file=sys.stderr)
