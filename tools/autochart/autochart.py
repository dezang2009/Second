"""음원 파일을 분석해서 4레인 채보 초안(JSON)을 만든다.

사용법:
    python autochart.py 음원.mp3 출력.json --title "제목" --artist "아티스트" [--beats-per-bar 3]

하는 일:
1. 박 추적: 실제 연주의 박 시각을 그대로 기록한다 (템포가 흔들리는 곡도 맞도록).
2. 마디 찾기: 화음이 바뀌는 박을 마디 첫 박으로 보고 구간마다 위치를 다시 잡는다.
3. 노트 후보: 건반/소리가 시작되는 순간(onset)을 찾아 박과 반박 격자에 붙인다.
4. 레인 배치: 새로 울린 가장 높은 음(멜로디)의 높낮이를 주변 음역에 비춰 0~3 레인으로 나눈다.
5. 롱 노트: 다음 노트까지 2박 이상 비고 소리가 이어지면 롱 노트로 만든다.
6. 동시 노트: 강하게 시작하는 마디 첫 박에 가끔 하나를 더한다.

결과는 사람이 플레이해 보고 다듬어야 하는 초안이다. 음원 파일은 저장소에 넣지 않는다.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import librosa
import numpy as np

SR = 22050
HOP = 512
LANES = 4

# 노트 선택 기준 (NORMAL 난이도의 잔잔한 곡 기준)
SNAP_WINDOW_SEC = 0.07  # 격자에서 이만큼 안에 있어야 노트로 쓴다
MIN_GAP_SEC = 0.24  # 노트 사이 최소 간격
ON_BEAT_PERCENTILE = 35  # 정박 onset은 이 백분위 이상 세기면 채택
OFF_BEAT_PERCENTILE = 70  # 반박 onset은 더 강해야 채택
LONG_MIN_BEATS = 2.0  # 이만큼 비면 롱 노트 후보
LONG_SUSTAIN_RATIO = 0.25  # 0.5초 뒤에도 처음 세기의 이 비율 이상 울리면 롱 노트
CHORD_PERCENTILE = 90  # 마디 첫 박 중 이 백분위 이상으로 강하면 동시 노트
CHORD_MIN_BARS = 4  # 동시 노트는 최소 이 마디 간격
PITCH_WINDOW_SEC = 4.0  # 레인 배치에 쓰는 주변 음역 범위


def track_beats(y: np.ndarray, oenv: np.ndarray) -> np.ndarray:
    _, frames = librosa.beat.beat_track(onset_envelope=oenv, sr=SR, hop_length=HOP, start_bpm=120)
    return librosa.frames_to_time(frames, sr=SR, hop_length=HOP)


def find_bar_starts(y: np.ndarray, beats: np.ndarray, beats_per_bar: int) -> list[int]:
    """화음 변화가 가장 큰 박 위치를 구간마다 찾아 마디 첫 박 인덱스를 돌려준다."""
    frames = librosa.time_to_frames(beats, sr=SR, hop_length=HOP)
    chroma = librosa.feature.chroma_cqt(y=y, sr=SR, hop_length=HOP)
    cb = librosa.util.sync(chroma, frames, aggregate=np.median)[:, : len(beats)]
    cb = cb / (np.linalg.norm(cb, axis=0, keepdims=True) + 1e-9)
    change = np.concatenate([[0.0], 1 - np.sum(cb[:, 1:] * cb[:, :-1], axis=0)])
    change = np.pad(change, (0, max(0, len(beats) - len(change))))[: len(beats)]

    window = 8 * beats_per_bar  # 앞뒤 8마디를 보고 위상을 정한다
    starts: list[int] = []
    i = 0
    while i < len(beats):
        lo, hi = max(0, i - window), min(len(beats), i + window)
        scores = [change[lo:hi][[(k - lo) for k in range(lo, hi) if (k - p) % beats_per_bar == 0]].mean() for p in range(beats_per_bar)]
        phase = int(np.argmax(scores))
        nxt = i + ((phase - i) % beats_per_bar)
        if starts and nxt - starts[-1] < 2:  # 위상이 바뀌어 너무 짧은 마디가 생기면 건너뛴다
            nxt += beats_per_bar
        if nxt < len(beats):
            starts.append(nxt)
        i = nxt + beats_per_bar
    return starts


def melody_pitches(y: np.ndarray, onset_times: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """각 onset에서 새로 울린 가장 높은 음(MIDI)과 0.5초 뒤 남은 세기 비율."""
    fmin = librosa.note_to_hz("C3")
    n_bins = 60  # C3 ~ B7
    cqt = np.abs(librosa.cqt(y, sr=SR, hop_length=HOP, fmin=fmin, n_bins=n_bins, bins_per_octave=12))
    frames = librosa.time_to_frames(onset_times, sr=SR, hop_length=HOP)
    later = librosa.time_to_frames(onset_times + 0.5, sr=SR, hop_length=HOP)
    pitches, sustain = [], []
    for f, lf in zip(frames, later):
        before = cqt[:, max(0, f - 3) : max(1, f - 1)].mean(axis=1)
        after = cqt[:, f + 1 : f + 4].max(axis=1)
        rise = np.maximum(0, after - before)
        if rise.max() <= 0:
            pitches.append(np.nan)
            sustain.append(0.0)
            continue
        strong = np.where(rise >= rise.max() * 0.3)[0]
        top = int(strong.max())
        pitches.append(48 + top)
        lf = min(lf, cqt.shape[1] - 1)
        sustain.append(float(cqt[top, lf] / (after[top] + 1e-9)))
    return np.array(pitches), np.array(sustain)


def build_grid(beats: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """박과 반박 시각, 그리고 각 점이 정박인지 여부."""
    mids = (beats[:-1] + beats[1:]) / 2
    grid = np.concatenate([beats, mids])
    on_beat = np.concatenate([np.ones(len(beats), bool), np.zeros(len(mids), bool)])
    order = np.argsort(grid)
    return grid[order], on_beat[order]


def assign_lanes(pitches: np.ndarray, times: np.ndarray) -> list[int]:
    lanes: list[int] = []
    for i, (p, t) in enumerate(zip(pitches, times)):
        near = pitches[(np.abs(times - t) <= PITCH_WINDOW_SEC) & ~np.isnan(pitches)]
        if np.isnan(p) or len(near) < 2 or near.max() == near.min():
            lane = lanes[-1] if lanes else 1
        else:
            rel = (p - near.min()) / (near.max() - near.min())
            lane = int(min(LANES - 1, rel * LANES))
        # 높이가 바뀌었는데 같은 레인이면 방향대로 한 칸 옮긴다 (멜로디 움직임이 손에 느껴지게)
        if lanes and lane == lanes[-1] and i > 0 and not np.isnan(p) and not np.isnan(pitches[i - 1]) and p != pitches[i - 1]:
            step = 1 if p > pitches[i - 1] else -1
            lane = min(LANES - 1, max(0, lane + step))
        # 같은 레인 연타는 빠르면 3번째부터, 느려도 4번째부터 옆 레인과 번갈아 친다
        if len(lanes) >= 2 and lanes[-1] == lanes[-2] == lane:
            fast = times[i] - times[i - 2] < 0.6
            if fast or (len(lanes) >= 3 and lanes[-3] == lane):
                lane = lane + 1 if lane < LANES - 1 else lane - 1
        lanes.append(lane)
    return lanes


def generate(path: Path, title: str, artist: str, beats_per_bar: int) -> dict:
    y, _ = librosa.load(path, sr=SR, mono=True)
    duration = len(y) / SR
    oenv = librosa.onset.onset_strength(y=y, sr=SR, hop_length=HOP)
    beats = track_beats(y, oenv)
    bar_idx = find_bar_starts(y, beats, beats_per_bar)

    onset_frames = librosa.onset.onset_detect(onset_envelope=oenv, sr=SR, hop_length=HOP)
    onset_times = librosa.frames_to_time(onset_frames, sr=SR, hop_length=HOP)
    strength = oenv[onset_frames]

    grid, grid_on_beat = build_grid(beats)
    on_th = np.percentile(strength, ON_BEAT_PERCENTILE)
    off_th = np.percentile(strength, OFF_BEAT_PERCENTILE)

    # onset을 격자에 붙이고, 격자 점 하나에는 가장 강한 onset만 남긴다
    picked: dict[int, tuple[float, float]] = {}
    for t, s in zip(onset_times, strength):
        g = int(np.argmin(np.abs(grid - t)))
        if abs(grid[g] - t) > SNAP_WINDOW_SEC:
            continue
        if s < (on_th if grid_on_beat[g] else off_th):
            continue
        if g not in picked or s > picked[g][1]:
            picked[g] = (t, s)

    keys = sorted(picked)
    times, raw_times, strengths = [], [], []
    for g in keys:
        t = float(grid[g])
        if times and t - times[-1] < MIN_GAP_SEC:
            if picked[g][1] > strengths[-1]:  # 더 강한 쪽을 남긴다
                times[-1], raw_times[-1], strengths[-1] = t, picked[g][0], picked[g][1]
            continue
        times.append(t)
        raw_times.append(picked[g][0])
        strengths.append(picked[g][1])
    times_a = np.array(times)
    pitches, sustain = melody_pitches(y, np.array(raw_times))
    lanes = assign_lanes(pitches, times_a)

    median_beat = float(np.median(np.diff(beats)))
    bar_times = beats[bar_idx]
    bar_strength_th = np.percentile(strengths, CHORD_PERCENTILE)
    notes = []
    last_chord_bar = -CHORD_MIN_BARS
    for i, (t, lane) in enumerate(zip(times_a, lanes)):
        note: dict = {"t": round(t * 1000), "lane": lane}
        gap = (times_a[i + 1] - t) if i + 1 < len(times_a) else duration - t
        if gap >= LONG_MIN_BEATS * median_beat and sustain[i] >= LONG_SUSTAIN_RATIO:
            note["len"] = round((gap - median_beat / 2) * 1000)
        notes.append(note)

        bar_no = int(np.argmin(np.abs(bar_times - t)))
        on_bar = abs(bar_times[bar_no] - t) < 0.03
        if on_bar and strengths[i] >= bar_strength_th and bar_no - last_chord_bar >= CHORD_MIN_BARS and "len" not in note:
            partner = LANES - 1 - lane if LANES - 1 - lane != lane else (lane + 2) % LANES
            notes.append({"t": note["t"], "lane": partner})
            last_chord_bar = bar_no

    notes.sort(key=lambda n: (n["t"], n["lane"]))
    bpm = 60 / median_beat
    return {
        "title": title,
        "artist": artist,
        "durationMs": round(duration * 1000),
        "bpm": round(bpm, 2),
        "beatsPerBar": beats_per_bar,
        "offsetMs": round(float(beats[bar_idx[0]]) * 1000),
        "difficulty": {"name": "NORMAL", "level": 4},
        "beats": [round(float(b) * 1000) for b in beats],
        "bars": [round(float(beats[i]) * 1000) for i in bar_idx],
        "notes": notes,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("audio", type=Path)
    ap.add_argument("out", type=Path)
    ap.add_argument("--title", required=True)
    ap.add_argument("--artist", required=True)
    ap.add_argument("--beats-per-bar", type=int, default=4)
    args = ap.parse_args()
    chart = generate(args.audio, args.title, args.artist, args.beats_per_bar)
    args.out.write_text(json.dumps(chart, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    notes = chart["notes"]
    longs = sum(1 for n in notes if "len" in n)
    print(f"{args.out}: {len(notes)} notes ({longs} long), {len(chart['beats'])} beats, {len(chart['bars'])} bars, ~{chart['bpm']} BPM")


if __name__ == "__main__":
    main()
