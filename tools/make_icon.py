"""앱 아이콘: 보라→하늘색 그라데이션 바탕 + 흰 축구공.
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
    # 축구공: 흰 원 + 가운데 오각형 + 테두리에 걸친 오각형 5개 + 이음선
    cx = cy = S / 2
    R = S * 0.225
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse([cx - R, cy - R, cx + R, cy + R], fill=(255, 255, 255, 255))
    pat = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    pd = ImageDraw.Draw(pat)
    rp = R * 0.34
    inner = pent(cx, cy, rp, 0)
    pd.polygon(inner, fill=(*INK, 255))
    lw = int(R * 0.06)
    for k in range(5):
        ang = k * 2 * math.pi / 5
        vx, vy = inner[k]
        ex, ey = cx + R * 0.97 * math.sin(ang), cy - R * 0.97 * math.cos(ang)
        pd.line([(vx, vy), (ex, ey)], fill=(*INK, 255), width=lw)
        pd.polygon(pent(ex, ey, rp * 0.9, ang + math.pi), fill=(*INK, 255))
        # 바깥 오각형끼리 잇는 테두리 쪽 선
        a2 = ang + math.pi / 5
        mx, my = cx + R * 0.80 * math.sin(a2), cy - R * 0.80 * math.cos(a2)
        for sgn in (-1, 1):
            a3 = a2 + sgn * math.pi / 5
            pd.line([(mx, my), (cx + R * 0.86 * math.sin(a3), cy - R * 0.86 * math.cos(a3))], fill=(*INK, 255), width=lw)
        pd.line([(mx, my), (cx + R * 1.05 * math.sin(a2), cy - R * 1.05 * math.cos(a2))], fill=(*INK, 255), width=lw)
    # 공 밖으로 나간 무늬는 잘라냄
    mask = Image.new('L', (S, S), 0)
    ImageDraw.Draw(mask).ellipse([cx - R, cy - R, cx + R, cy + R], fill=255)
    pat.putalpha(ImageChops.multiply(pat.getchannel('A'), mask))
    img = Image.alpha_composite(img, pat)
    # 은은한 그림자
    sh = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(sh).ellipse([cx - R, cy - R + S * 0.02, cx + R, cy + R + S * 0.02], fill=(20, 10, 80, 70))
    from PIL import ImageFilter
    sh = sh.filter(ImageFilter.GaussianBlur(S * 0.015))
    return Image.alpha_composite(sh, img)


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
