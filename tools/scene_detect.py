import imageio_ffmpeg, subprocess, re
exe = imageio_ffmpeg.get_ffmpeg_exe()
src = r"C:\Users\Ganjx\Documents\xwechat_files\wxid_4e8pebljhza322_74fa\msg\video\2026-10\a54560025a1f3a627f9c1dd87356e7c2.mp4"
r = subprocess.run([exe, "-i", src, "-vf", "select='gt(scene,0.02)',showinfo", "-f", "null", "-"],
                   capture_output=True, text=True)
times = re.findall(r"pts_time:([\d.]+)", r.stderr)
print("scene changes at seconds:", [round(float(t),1) for t in times])
