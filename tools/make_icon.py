"""앱 아이콘: 흰 바탕 + 보라→하늘색 그라데이션 K 모노그램.
적응형 아이콘(배경/전경)과 구형 런처용 아이콘을 만든다."""
import math
import os
from PIL import Image, ImageChops, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, 'android', 'res')
S = 1728  # 108dp × 16 (슈퍼샘플)
C1, C2 = (140, 110, 255), (60, 190, 255)  # 왼쪽 위 보라 → 오른쪽 아래 하늘색
INK = (52, 42, 140)


def pent(cx, cy, r, rot):
    return [(cx + r * math.sin(rot + k * 2 * math.pi / 5), cy - r * math.cos(rot + k * 2 * math.pi / 5)) for k in range(5)]


def foreground():
    # 흰 'K' 모노그램 (앱 글꼴 Poppins ExtraBold, woff2 → ttf 변환은 fonttools·brotli 필요)
    import io
    from PIL import ImageFont
    from fontTools.ttLib import TTFont
    ft = TTFont(os.path.join(ROOT, 'fonts', 'Poppins-ExtraBold.woff2'))
    ft.flavor = None
    buf = io.BytesIO(); ft.save(buf); buf.seek(0)
    font = ImageFont.truetype(buf, int(S * 0.40))
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    l, t, r, b = d.textbbox((0, 0), 'K', font=font)
    d.text(((S - (r - l)) / 2 - l, (S - (b - t)) / 2 - t), 'K', font=font, fill=(255, 255, 255, 255))
    # 글자 모양대로 그라데이션을 채움 (글자 영역 기준으로 왼쪽 위 → 오른쪽 아래)
    l, t, r, b = img.getbbox()
    g = gradient(r - l, b - t).convert('RGBA')
    out = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    out.paste(g, (l, t))
    out.putalpha(img.getchannel('A'))
    return out


def gradient(w, h):
    # 대각선 선형 그라데이션 (왼쪽 위 C1 → 오른쪽 아래 C2)
    import numpy as np
    t = (np.arange(h)[:, None] / max(1, h - 1) + np.arange(w)[None, :] / max(1, w - 1)) / 2
    arr = np.stack([C1[i] + (C2[i] - C1[i]) * t for i in range(3)], -1).astype('uint8')
    return Image.fromarray(arr, 'RGB')


def background():
    return Image.new('RGB', (S, S), (255, 255, 255))


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
