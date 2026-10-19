#!/usr/bin/env python3
"""구단별 GOAL 애니메이션을 원본 영상에서 잘라 스프라이트로 만든다.

원본: @designbysergio 인스타그램 게시물(2026.2)의 여섯 번째 영상 — PL 2025/26 중계 스코어 버그의 구단별 골 연출 모음.
영상 한 화면에 구단 10개가 세로로 늘어서 있고, 앞 절반(0.6~3.7s)과 뒤 절반(6.7~9.7s)에 각각 10개 구단이 나온다.
개인 비상업 용도로만 쓴다 (저작권은 원작자와 프리미어리그에 있다).

  python3 tools/build_goal_clips.py <영상.mp4> [--esrgan RealESRGAN_x4plus_anime_6B.pth]
  → dist/assets/goal-{약칭}.webp (세로로 이어 붙인 프레임), data/goal_clips.json
원본 영상에서 점수판 한 줄이 가로 270px밖에 안 되므로, --esrgan 을 주면 Real-ESRGAN(애니메이션용)으로
프레임마다 4배 키워 선명하게 만든다 (pip install spandrel torch).
"""
import json, os, subprocess, sys, tempfile
from PIL import Image

SETS = [
    (0.66, ['ARS', 'AVL', 'BHA', 'BOU', 'BRE', 'CHE', 'CRY', 'EVE', 'FUL', 'IPS']),
    (6.73, ['LEI', 'LIV', 'MCI', 'MUN', 'NEW', 'NFO', 'SOU', 'TOT', 'WHU', 'WOL']),
]
DUR, FPS = 2.95, 24
X, W, H = 371, 270, 28          # 영상 속 스코어 바 위치 (720×900 기준)
TOP0, STEP = 143, 62.8           # 첫 줄 위쪽, 줄 간격
SCALE = 1.5
OUT_SCALE = 3  # 업스케일할 때 저장 배율


def upscaler(path):
    """Real-ESRGAN 4배 업스케일 함수 (없으면 None)"""
    if not path:
        return None
    import numpy as np, torch
    from spandrel import ModelLoader
    torch.set_num_threads(os.cpu_count() or 4)
    model = ModelLoader().load_from_file(path).model.eval()

    def up(im):
        t = torch.from_numpy(np.asarray(im, dtype=np.float32) / 255).permute(2, 0, 1)[None]
        with torch.no_grad():
            y = model(t)[0].permute(1, 2, 0).clamp(0, 1).numpy()
        return Image.fromarray((y * 255).astype(np.uint8))
    return up


def main():
    src = sys.argv[1]
    up = upscaler(sys.argv[sys.argv.index('--esrgan') + 1] if '--esrgan' in sys.argv else None)
    scale = OUT_SCALE if up else SCALE
    os.makedirs('dist/assets', exist_ok=True)
    meta = {'fps': FPS, 'w': int(W * scale), 'h': int(H * scale), 'teams': {}}
    for start, teams in SETS:
        with tempfile.TemporaryDirectory() as tmp:
            subprocess.run(['ffmpeg', '-v', 'error', '-ss', str(start), '-t', str(DUR), '-i', src, '-vf', f'fps={FPS}', f'{tmp}/%04d.png'], check=True)
            frames = sorted(os.listdir(tmp))
            for i, team in enumerate(teams):
                y = round(TOP0 + STEP * i)
                sheet = Image.new('RGB', (meta['w'], meta['h'] * len(frames)))
                for k, f in enumerate(frames):
                    im = Image.open(f'{tmp}/{f}').convert('RGB').crop((X, y, X + W, y + H))
                    if up:
                        im = up(im)
                    sheet.paste(im.resize((meta['w'], meta['h']), Image.LANCZOS), (0, k * meta['h']))
                sheet.save(f'dist/assets/goal-{team}.webp', 'WEBP', quality=84, method=6)
                print(team, file=sys.stderr, flush=True)
                meta['teams'][team] = len(frames)
    json.dump(meta, open('data/goal_clips.json', 'w'), separators=(',', ':'))
    print('goal clips', len(meta['teams']), file=sys.stderr)


if __name__ == '__main__':
    main()
