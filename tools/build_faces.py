#!/usr/bin/env python3
"""유스·자동 생성 선수용 가상 얼굴 (AI 생성, 실존 인물 아님).

출처: Hugging Face 데이터셋 balgot/stylegan3-annotated (StyleGAN3로 생성한 FFHQ 정렬 얼굴)
data/faces.json 에 고른 이미지 이름(general: 일반, asian: 동아시아)을 적어 두고 실행한다.

선수 프로필 사진처럼 만든다:
  - rembg 로 배경을 지우고 연회색 스튜디오 배경을 깐다
  - 얼굴 분할 모델(jonathandinu/face-parsing)로 원래 옷을 지운다
  - 어깨와 크루넥 칼라를 그려 넣는데, 유니폼 자리는 반투명(음영만)으로 남겨
    게임에서 배경색(소속팀 c1)이 비쳐 팀 유니폼 색이 되게 한다

  pip install rembg onnxruntime transformers torch
  python3 tools/build_faces.py <원본 이미지 폴더>
  → dist/photos/f/{번호}.webp (240×312 RGBA, 앱용), dist/assets/faces.webp (스프라이트, 웹용), data/faces_meta.json
"""
import json, math, os, sys
import numpy as np
import torch
from PIL import Image, ImageDraw, ImageFilter
from rembg import remove, new_session
from transformers import SegformerImageProcessor, SegformerForSemanticSegmentation

SEG = new_session('u2net_human_seg')
PROC = SegformerImageProcessor.from_pretrained('jonathandinu/face-parsing')
PARSE = SegformerForSemanticSegmentation.from_pretrained('jonathandinu/face-parsing').eval()
CLOTH, BG, HAT, NECK = 18, 0, 14, 17

W, H = 1100, 1430   # 원본(1024) 좌표계의 캔버스, 240:312 비율
OX, OY = 38, 20     # 캔버스 안 원본 위치
NY = OY + 950       # 칼라 위치: FFHQ 정렬에서 턱 끝이 y≈800


def backdrop():
    """트랜스퍼마크트 프로필 사진 같은 연회색 스튜디오 배경."""
    t = np.linspace(0, 1, H)[:, None, None]
    top, bot = np.array([232, 235, 240]), np.array([196, 201, 210])
    return np.repeat(top + (bot - top) * t, W, axis=1)


def shirt_masks(cx):
    """어깨선 + 크루넥 칼라. (셔츠 마스크, 칼라 테두리 마스크)"""
    S = 2
    body = Image.new('L', (W * S, H * S), 0)
    d = ImageDraw.Draw(body)
    pts = []
    for i in range(41):  # 목에서 바깥으로 완만히 내려가는 어깨
        t = i / 40
        pts.append((600 * t, NY + 40 + 150 * t ** 1.6 - 20 * math.sin(t * math.pi)))
    poly = [(cx - x, y) for x, y in pts][::-1] + [(cx + x, y) for x, y in pts] + [(W + 50, H + 50), (-50, H + 50)]
    d.polygon([(x * S, y * S) for x, y in poly], fill=255)
    inner = [(cx - 120) * S, (NY - 70) * S, (cx + 120) * S, (NY + 95) * S]
    d.ellipse(inner, fill=0)
    trim = Image.new('L', (W * S, H * S), 0)
    d2 = ImageDraw.Draw(trim)
    d2.ellipse([(cx - 135) * S, (NY - 82) * S, (cx + 135) * S, (NY + 112) * S], fill=255)
    d2.ellipse(inner, fill=0)
    body = np.array(body.resize((W, H), Image.LANCZOS)) / 255.0
    trim = np.array(trim.resize((W, H), Image.LANCZOS)) / 255.0
    return body, np.minimum(trim, body)


def portrait(path):
    im = Image.open(path).convert('RGB')
    alpha = np.array(remove(im, session=SEG, only_mask=True)) / 255.0
    with torch.no_grad():
        logits = PARSE(**PROC(images=im, return_tensors='pt')).logits
    lab = torch.nn.functional.interpolate(logits, size=(1024, 1024), mode='bilinear').argmax(1)[0].numpy()
    keep = ((lab != CLOTH) & (lab != BG) & (lab != HAT)).astype(np.uint8) * 255
    keep = np.array(Image.fromarray(keep).filter(ImageFilter.GaussianBlur(2))) / 255.0
    a = np.zeros((H, W))
    a[OY:OY + 1024, OX:OX + 1024] = alpha * keep
    neck = np.argwhere(lab[850:1000] == NECK)
    cx = OX + (np.median(neck[:, 1]) if len(neck) else 512)

    src = np.zeros((H, W, 3))
    src[OY:OY + 1024, OX:OX + 1024] = np.array(im)
    yy = np.arange(H)[:, None]
    xs = (np.arange(W)[None, :] - cx) / 600
    # 턱 밑 ~ 칼라 사이 목 그림자
    k = np.clip((yy - (OY + 800)) / (NY - OY - 800), 0, 1)
    src *= (1 - 0.22 * k * np.exp(-(xs / 0.4) ** 2))[..., None]
    # 원래 목이 옷에 가려 끊긴 경우를 위해 피부색으로 목을 깔아 둔다 (진짜 목이 위에 덮인다)
    skin = np.array(im)[700:900][np.isin(lab[700:900], (1, NECK))]
    tone = np.median(skin, axis=0) * 0.82 if len(skin) else np.array([180, 140, 120])
    nk = Image.new('L', (W, H), 0)
    ImageDraw.Draw(nk).rounded_rectangle([cx - 100, OY + 700, cx + 100, NY + 120], radius=60, fill=255)
    nk = np.array(nk.filter(ImageFilter.GaussianBlur(6))) / 255.0
    neck_rgb = tone * (1 - 0.25 * np.clip((yy - OY - 800) / 200, 0, 1))[..., None]
    rgb = backdrop() * (1 - nk[..., None]) + neck_rgb * nk[..., None]
    rgb = rgb * (1 - a[..., None]) + src * a[..., None]

    # 유니폼: 검은색 반투명 음영만 그리고 나머지는 투명 → 화면에서 팀 색이 비친다
    body, trim = shirt_masks(cx)
    side = np.clip((np.abs(xs) - 0.45) / 0.55, 0, 1)
    shade = 0.08 + 0.26 * side * side * (3 - 2 * side) \
        + 0.16 * np.exp(-((yy - NY - 25) / 45.0) ** 2) * np.exp(-(xs / 0.3) ** 2)
    sh_rgb = np.repeat((255 * trim)[..., None], 3, axis=2)
    sh_a = 255 * (shade * (1 - trim) + 0.55 * trim)
    rgba = np.dstack([rgb, np.full((H, W), 255.0)]) * (1 - body[..., None]) + np.dstack([sh_rgb, sh_a]) * body[..., None]
    return Image.fromarray(np.clip(rgba, 0, 255).astype(np.uint8), 'RGBA')


def main():
    src = sys.argv[1]
    sel = json.load(open('data/faces.json'))
    names = sel['general'] + sel['asian']
    os.makedirs('dist/photos/f', exist_ok=True)
    os.makedirs('dist/assets', exist_ok=True)
    w, h, cols = 120, 156, 12
    sheet = Image.new('RGBA', (w * cols, h * ((len(names) + cols - 1) // cols)), (0, 0, 0, 0))
    for k, n in enumerate(names):
        im = portrait(os.path.join(src, n))
        im.resize((240, 312), Image.LANCZOS).save(f'dist/photos/f/{k}.webp', 'WEBP', quality=84, method=6)
        sheet.paste(im.resize((w, h), Image.LANCZOS), ((k % cols) * w, (k // cols) * h))
    sheet.save('dist/assets/faces.webp', 'WEBP', quality=80, method=6)
    ng = len(sel['general'])
    meta = {'general': list(range(ng)), 'asian': list(range(ng, len(names))), 'cols': cols, 'w': w, 'h': h, 'sheet': 'assets/faces.webp'}
    json.dump(meta, open('data/faces_meta.json', 'w'), separators=(',', ':'))
    print('faces', ng, 'general,', len(names) - ng, 'asian', file=sys.stderr)


if __name__ == '__main__':
    main()
