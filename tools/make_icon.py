"""앱 아이콘: 흰 바탕 + 옅은 격자무늬 + 하늘색 평면 심볼(겹치는 부분은 진하게).
적응형 아이콘(배경/전경)과 구형 런처용 아이콘을 만든다."""
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, 'android', 'res')
S = 1728  # 108dp × 16 (4배 슈퍼샘플)
LIGHT, DARK, BALL = (110, 193, 247), (64, 160, 238), (64, 160, 238)


def poly(pts):
    m = Image.new('L', (S, S), 0)
    ImageDraw.Draw(m).polygon([(x * S, y * S) for x, y in pts], fill=255)
    return m


def bar(x1, y1, x2, y2, w):
    # 두 점을 잇는 일정한 두께의 막대 (끝은 직각)
    import math
    dx, dy = x2 - x1, y2 - y1
    L = math.hypot(dx, dy)
    nx, ny = -dy / L * w / 2, dx / L * w / 2
    return poly([(x1 + nx, y1 + ny), (x2 + nx, y2 + ny), (x2 - nx, y2 - ny), (x1 - nx, y1 - ny)])


def foreground():
    # 'K' 모양: 세로 막대 + 위·아래 사선 막대, 겹친 곳은 진한 파랑 (가운데 약 37% 크기)
    w = 0.072
    x0, top, bot, mid = 0.36, 0.32, 0.68, 0.535
    bars = [
        bar(x0, top, x0, bot, w),
        bar(x0 - 0.01, mid + 0.03, 0.655, top, w),
        bar(x0 + 0.03, mid - 0.05, 0.655, bot, w),
    ]
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    px = img.load()
    data = [m.load() for m in bars]
    for y in range(S):
        for x in range(S):
            n = sum(1 for d in data if d[x, y] > 127)
            if n:
                px[x, y] = (*(DARK if n > 1 else LIGHT), 255)
    return img


def background():
    img = Image.new('RGB', (S, S), (255, 255, 255))
    d = ImageDraw.Draw(img)
    step = S // 14
    for k in range(-S, 2 * S, step):
        d.line([(k, 0), (k + S, S)], fill=(232, 238, 245), width=6)
        d.line([(k, S), (k + S, 0)], fill=(232, 238, 245), width=6)
    return img


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
