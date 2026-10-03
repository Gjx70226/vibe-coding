# -*- coding: utf-8 -*-
"""
生成答题提示音的「示例音频」，存档给小甘肉眼听效果用。
做法：按 quiz.js 里 Web Audio 的写法（同样的波形 + 同样的包络）离线算一遍，存成 wav。
注意：这文件只是「示例存档」，网站本身不加载它，网站是浏览器现场算声音（0 体积）。
"""
import wave
import math
import os

SR = 44100

RIGHT = [(659.25, 0.00, 0.11, "triangle", 0.30),
         (987.77, 0.09, 0.11, "triangle", 0.30),
         (1318.5, 0.18, 0.36, "triangle", 0.32),
         (2637.0, 0.18, 0.22, "sine", 0.07)]
WRONG = [(233.08, 0.00, 0.17, "triangle", 0.34),
         (220.00, 0.00, 0.17, "triangle", 0.15),
         (174.61, 0.15, 0.46, "triangle", 0.34),
         (164.81, 0.15, 0.46, "triangle", 0.15)]


def wave_sample(kind, freq, t):
    if kind == "sine":
        return math.sin(2 * math.pi * freq * t)
    return (2.0 / math.pi) * math.asin(math.sin(2 * math.pi * freq * t))


def envelope(t, vol, dur):
    if t < 0:
        return 0.0
    a = 0.015
    if t < a:
        return vol * (t / a) if a > 0 else vol
    if dur <= a:
        return 0.0
    return vol * ((0.0001 / vol) ** ((t - a) / (dur - a)))


def render(notes, seconds):
    n = int(SR * seconds)
    buf = [0.0] * n
    for freq, at, dur, kind, vol in notes:
        start = int(at * SR)
        length = int(dur * SR)
        for i in range(length):
            idx = start + i
            if idx >= n:
                break
            t = i / float(SR)
            buf[idx] += wave_sample(kind, freq, t) * envelope(t, vol, dur)
    return [max(-1.0, min(1.0, v)) for v in buf]


def to_wav(path, samples):
    with wave.open(path, "w") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(SR)
        frames = bytearray()
        for v in samples:
            s = int(max(-1.0, min(1.0, v)) * 32000)
            frames += struct_pack(s)
        f.writeframes(bytes(frames))


def struct_pack(s):
    import struct
    return struct.pack("<h", s)


out_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                       "day14-review")

right = render(RIGHT, 0.70)
wrong = render(WRONG, 0.75)
# 连听：答对 → 停一下 → 答错，方便对比
gap = [0.0] * int(0.30 * SR)
both = right + gap + wrong

to_wav(os.path.join(out_dir, "音-答对.wav"), right)
to_wav(os.path.join(out_dir, "音-答错.wav"), wrong)
to_wav(os.path.join(out_dir, "音-示例连听.wav"), both)
print("done ->", out_dir)
