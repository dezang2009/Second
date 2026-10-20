"""앱 아이콘: 보라→하늘색 그라데이션 바탕 + 흰 선 축구장.
적응형 아이콘(배경/전경)과 구형 런처용 아이콘을 만든다."""
import math
import os
from PIL import Image, ImageChops, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, 'android', 'res')
S = 1728  # 108dp × 16 (슈퍼샘플)
C1, C2 = (108, 77, 245), (20, 190, 255)  # 왼쪽 위 보라 → 오른쪽 아래 하늘색
INK = (52, 42, 140)


def pent(cx, cy, r, rot):
    return [(cx + r * math.sin(rot + k * 2 * math.pi / 5), cy - r * math.cos(rot + k * 2 * math.pi / 5)) for k in range(5)]


def foreground():
    # 흰 선으로 그린 단순한 축구장: 외곽선 + 하프라인 + 센터서클 + 양쪽 페널티 박스
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    W = (255, 255, 255, 255)
    lw = int(S * 0.022)
    cx = cy = S / 2
    hw, hh = S * 0.17, S * 0.235
    d.rounded_rectangle([cx - hw, cy - hh, cx + hw, cy + hh], radius=S * 0.03, outline=W, width=lw)
    d.line([(cx - hw, cy), (cx + hw, cy)], fill=W, width=lw)
    r = S * 0.065
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=W, width=lw)
    r2 = S * 0.016
    d.ellipse([cx - r2, cy - r2, cx + r2, cy + r2], fill=W)
    bw, bh = S * 0.075, S * 0.065
    d.rectangle([cx - bw, cy - hh, cx + bw, cy - hh + bh], outline=W, width=lw)
    d.rectangle([cx - bw, cy + hh - bh, cx + bw, cy + hh], outline=W, width=lw)
    return img


def background():
    # 대각선 선형 그라데이션
    g = Image.linear_gradient('L').resize((S, S))
    g = g.rotate(45, resample=Image.BICUBIC, expand=True)
    w = g.size[0]
    g = g.crop(((w - S) // 2, (w - S) // 2, (w - S) // 2 + S, (w - S) // 2 + S))
    a, b = Image.new('RGB', (S, S), C1), Image.new('RGB', (S, S), C2)
    return Image.composite(b, a, g)


def main():
    fg, bg = foreground(), background()
    dens = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
    for k, m in dens.items():
        n = int(108 * m)
        os.makedirs(os.path.join(RES, f'drawable-{k}'), exist_ok=True)
        fg.resize((n, n), Image.LANCZOS).save(os.path.join(RES, f'drawable-{k}', 'ic_fg.png'))
        bg.resize((n, n), Image.LANCZOS).save(os.path.join(RES, f'drawable-{k}', 'ic_bg.png'))
    os.makedirs(os.path.join(RES, 'mipmap-anydpi-v26'), exist_ok=True)
    with open(os.path.join(RES, 'mipmap-anydpi-v26', 'ic_launcher.xml'), 'w') as f:
        f.write('<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
                '    <background android:drawable="@drawable/ic_bg" />\n    <foreground android:drawable="@drawable/ic_fg" />\n</adaptive-icon>\n')
    # 구형 런처: 둥근 사각형에 잘라 넣기 (가운데 72dp 영역)
    comp = Image.alpha_composite(bg.convert('RGBA'), fg)
    c = S * 18 // 108
    comp = comp.crop((c, c, S - c, S - c))
    mask = Image.new('L', comp.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, comp.size[0] - 1, comp.size[1] - 1], radius=comp.size[0] // 4.5, fill=255)
    comp.putalpha(mask)
    comp.resize((192, 192), Image.LANCZOS).save(os.path.join(RES, 'mipmap', 'ic_launcher.png'))
    comp.resize((512, 512), Image.LANCZOS).save(os.path.join(ROOT, 'dist', 'icon-preview.png'))


if __name__ == '__main__':
    main()
