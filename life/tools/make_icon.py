"""앱 아이콘: 흰 바탕 + 옅은 사선 격자 + 하늘색 평면 새싹(겹치는 부분은 진하게).
리듬게임 아이콘과 같은 방식. 적응형 아이콘(배경/전경)과 구형 런처용 아이콘을 만든다.
사용: python3 tools/make_icon.py  (life/ 폴더 기준, Pillow 필요)"""
import math
import os

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, 'android', 'app', 'src', 'main', 'res')
S = 1728  # 108dp × 16 (4배 슈퍼샘플)
LIGHT, DARK = (110, 193, 247), (64, 160, 238)
DENS = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}


def poly(pts):
    m = Image.new('L', (S, S), 0)
    ImageDraw.Draw(m).polygon([(x * S, y * S) for x, y in pts], fill=255)
    return m


def bar(x1, y1, x2, y2, w):
    # 두 점을 잇는 일정한 두께의 막대 (끝은 직각)
    dx, dy = x2 - x1, y2 - y1
    L = math.hypot(dx, dy)
    nx, ny = -dy / L * w / 2, dx / L * w / 2
    return poly([(x1 + nx, y1 + ny), (x2 + nx, y2 + ny), (x2 - nx, y2 - ny), (x1 - nx, y1 - ny)])


def leaf(bx, by, tx, ty, w):
    # 밑동(b)에서 끝(t)까지 양쪽으로 부푼 잎사귀
    dx, dy = tx - bx, ty - by
    L = math.hypot(dx, dy)
    nx, ny = -dy / L, dx / L
    n = 48
    side1 = [(bx + dx * t + nx * w * math.sin(math.pi * t), by + dy * t + ny * w * math.sin(math.pi * t)) for t in (i / n for i in range(n + 1))]
    side2 = [(bx + dx * t - nx * w * math.sin(math.pi * t), by + dy * t - ny * w * math.sin(math.pi * t)) for t in (i / n for i in range(n, -1, -1))]
    return poly(side1 + side2)


def foreground():
    # 새싹: 줄기 하나와 양쪽 잎 두 장. 줄기와 잎이 겹친 곳은 진한 파랑 (가운데 약 40% 크기)
    stem_x, base, fork = 0.5, 0.70, 0.50
    shapes = [
        bar(stem_x, base, stem_x, fork - 0.03, 0.06),
        leaf(stem_x, fork + 0.06, 0.31, 0.37, 0.055),
        leaf(stem_x, fork + 0.04, 0.70, 0.30, 0.07),
    ]
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    px = img.load()
    data = [m.load() for m in shapes]
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


def legacy(bg, fg, round_):
    # 구형 런처: 가운데 72dp 영역을 둥근 사각형(또는 원)으로 잘라 넣기
    comp = Image.alpha_composite(bg.convert('RGBA'), fg)
    c = S * 18 // 108
    comp = comp.crop((c, c, S - c, S - c))
    mask = Image.new('L', comp.size, 0)
    box = [0, 0, comp.size[0] - 1, comp.size[1] - 1]
    if round_:
        ImageDraw.Draw(mask).ellipse(box, fill=255)
    else:
        ImageDraw.Draw(mask).rounded_rectangle(box, radius=comp.size[0] // 4.5, fill=255)
    comp.putalpha(mask)
    return comp


def main():
    fg, bg = foreground(), background()
    square, circle = legacy(bg, fg, False), legacy(bg, fg, True)
    for k, m in DENS.items():
        d = os.path.join(RES, f'mipmap-{k}')
        n = int(108 * m)
        fg.resize((n, n), Image.LANCZOS).save(os.path.join(d, 'ic_launcher_foreground.png'))
        bg.resize((n, n), Image.LANCZOS).save(os.path.join(d, 'ic_launcher_background.png'))
        n = int(48 * m)
        square.resize((n, n), Image.LANCZOS).save(os.path.join(d, 'ic_launcher.png'))
        circle.resize((n, n), Image.LANCZOS).save(os.path.join(d, 'ic_launcher_round.png'))
    xml = ('<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
           '    <background android:drawable="@mipmap/ic_launcher_background"/>\n'
           '    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n</adaptive-icon>\n')
    for name in ('ic_launcher.xml', 'ic_launcher_round.xml'):
        with open(os.path.join(RES, 'mipmap-anydpi-v26', name), 'w') as f:
            f.write(xml)
    # 웹 화면에서도 같은 아이콘을 쓴다
    square.resize((512, 512), Image.LANCZOS).save(os.path.join(ROOT, 'public', 'icon.png'))


if __name__ == '__main__':
    main()
