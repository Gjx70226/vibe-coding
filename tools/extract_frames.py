import imageio_ffmpeg, subprocess, os
exe = imageio_ffmpeg.get_ffmpeg_exe()
src = r"C:\Users\Ganjx\Documents\xwechat_files\wxid_4e8pebljhza322_74fa\msg\video\2026-10\a54560025a1f3a627f9c1dd87356e7c2.mp4"
outdir = r"E:\work Buddy运行\微信\vibe-coding\_tmp_bczz"
os.makedirs(outdir, exist_ok=True)
out = os.path.join(outdir, "frame_%03d.png")
# 先拿视频时长
probe = subprocess.run([exe, "-i", src], capture_output=True, text=True)
print("PROBE:", probe.stderr[:500])
r = subprocess.run([exe, "-i", src, "-vf", "fps=3", out], capture_output=True, text=True)
files = sorted(os.listdir(outdir))
print("FRAMES:", len(files), files[:5], files[-3:])
