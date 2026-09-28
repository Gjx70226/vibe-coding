#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
自动推送文件到 GitHub（绕过证书吊销检查，使用 GitHub Contents API）。
效果等同网页手动上传，但一行命令搞定，不用手动拖文件。

用法（在仓库根目录执行）：
    python tools/push_to_github.py "提交信息" 文件1 [文件2 ...]

说明：
- 令牌从仓库根目录 .env 的 GITHUB_TOKEN 读取，或环境变量 GITHUB_TOKEN。
- 文件需写成相对仓库根目录的路径（如 AGENTS.md、见超哥准备.md）。
- 文件若已存在则更新（保留历史），不存在则新建。
- 全部提交到 main 分支。
"""
import sys
import os
import base64
import json
import subprocess
from urllib.parse import quote

REPO = "Gjx70226/vibe-coding"
BRANCH = "main"

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(SCRIPT_DIR)
os.chdir(REPO_ROOT)


def load_token():
    token = ""
    env_path = os.path.join(REPO_ROOT, ".env")
    if os.path.exists(env_path):
        with open(env_path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line.startswith("GITHUB_TOKEN="):
                    token = line.split("=", 1)[1].strip().strip('"')
    return token or os.environ.get("GITHUB_TOKEN", "")


def curl(api_path, method="GET", data=None):
    url = f"https://api.github.com/repos/{REPO}/contents/{quote(api_path)}"
    cmd = ["curl", "-s", "--ssl-no-revoke", "--max-time", "40",
           "-H", f"Authorization: token {TOKEN}",
           url]
    if method == "PUT":
        cmd += ["-X", "PUT", "-H", "Content-Type: application/json", "-d", "@-"]
        p = subprocess.run(cmd, input=json.dumps(data).encode("utf-8"), capture_output=True)
    else:
        p = subprocess.run(cmd, capture_output=True)
    return p.stdout.decode("utf-8", "replace")


def main():
    global TOKEN
    TOKEN = load_token()
    if not TOKEN:
        print("错误：未找到 GITHUB_TOKEN（请在 .env 写入或设置环境变量）")
        sys.exit(1)

    if len(sys.argv) < 3:
        print('用法: python tools/push_to_github.py "提交信息" 文件1 [文件2 ...]')
        sys.exit(1)

    msg = sys.argv[1]
    files = sys.argv[2:]

    ok, fail = 0, 0
    for f in files:
        if not os.path.isfile(f):
            print(f"跳过(不存在): {f}")
            fail += 1
            continue
        with open(f, "rb") as fh:
            content_b64 = base64.b64encode(fh.read()).decode("ascii")

        existing = curl(f)
        sha = None
        try:
            sha = json.loads(existing).get("sha")
        except Exception:
            sha = None

        payload = {"message": msg, "content": content_b64, "branch": BRANCH}
        if sha:
            payload["sha"] = sha

        resp = curl(f, "PUT", payload)
        try:
            rj = json.loads(resp)
            if "content" in rj:
                print(f"✅ 已上传/更新: {f}")
                ok += 1
            else:
                print(f"❌ 失败: {f} -> {rj.get('message', resp)[:200]}")
                fail += 1
        except Exception:
            print(f"❌ 失败(无法解析返回): {f} -> {resp[:200]}")
            fail += 1

    print(f"\n完成：成功 {ok} 个，失败 {fail} 个")


if __name__ == "__main__":
    main()
