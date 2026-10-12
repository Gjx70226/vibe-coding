---
name: verify-project
description: 发布前检查 Skill。每次改完代码、每次发布前，一键跑一遍所有检查项，输出逐项 PASS/FAIL/N/A + 证据。检查项来自本项目真实踩过的坑，不写模糊表述。
---

# verify-project（发布前检查 Skill）

## 这是什么
把前两周积累的检查经验固化成可复用清单。**每次发布前、每次改完代码**，让 AI 跑一遍，逐项给出 `PASS / FAIL / N/A / 人工⏳` 和证据，禁止"看起来正常""基本没问题"这类虚话。

## 怎么调用
- **本会话 / 有此 Skill 的环境**：直接说「运行 verify-project」「发布前检查一下」。
- **新对话没有此 Skill 文件时（fallback）**：把本 SKILL.md 全文粘贴给 AI，再说「按这份清单逐项检查」，AI 会执行仓库里的 `tools/verify-project.js`。
- 脚本路径：`tools/verify-project.js`（node 22 直接跑，无需安装依赖）。

## 检查项（全部来自本项目真实踩坑）
每一项都写明**执行命令**和**怎么算通过**，输出必须给证据。

### C1 版本闸门（踩坑：Day24 APP_VER 漏改；本次 style.css 的 ?v= 漏升）
- 执行：脚本读 `components.js` 的 `APP_VER`；取 `git diff --name-only HEAD` 中改动的 `.js/.css`；在 `index.html` 里逐一核对这些文件的 `?v=` 是否 == `APP_VER`。
- 通过：所有改动文件的 `?v=` 都等于 `APP_VER`。
- 证据：打印 `APP_VER` + 每个改动文件及其 `?v=`。
- 失败样例：`style.css?v=20261011d` 但 `APP_VER=20261011e` → FAIL。

### C2 语法闸门（踩坑：JS 写错发布即崩）
- 执行：对仓库根所有 `.js` 跑 `node --check`。
- 通过：全部退出码 0。
- 证据：逐文件结果，报错打印文件名+错误。

### C3 公网可达 + 版本生效（踩坑："发布成功≠你拿到新版"缓存）
- 执行：`fetch` 首页返回 200；首页 HTML 含 `words.js` 第一个真实单词；`fetch components.js?v=<APP_VER>` 返回内容含 `APP_VER = "<APP_VER>"`。
- 通过：三项全真。
- 证据：状态码、命中单词、版本串。

### C4 密钥/敏感信息扫描（踩坑：Day23 密钥审计）
- 执行：对源码（排除忽略目录）`grep -rEi '(sk-[A-Za-z0-9]{10,}|api[_-]?key\s*=|secret\s*=|password\s*=|token\s*=)'`；查 `git ls-files` 不含 `.env`；根目录存在 `.env.example`。
- 通过：真实密钥命中 0 + 无 `.env` 入库 + 有 `.env.example`。
- 证据：命中行（若有）+ git 文件列表。
- **故意弄坏演示**：临时往某 `.js` 塞 `var __leak = "sk-abcd1234efgh5678";` → 重跑必须 FAIL；删掉后重跑必须 PASS。

### C5 Git 安全 / .gitignore 完整（踩坑：Day24 脏提交误带 361 个垃圾文件）
- 执行：`git status --porcelain` 不出现 `_edge_profile`、`_tmp_`、`node_modules`、`*.log`；`.gitignore` 含这些规则。
- 通过：status 干净 + 规则覆盖。
- 证据：status 输出 + .gitignore 相关行。

### C6 关键交互回归（headless）（踩坑："只测空态"——四选项 undefined、错题本一直 0 个）
- 执行：跑 `tools/verify_longpress_touch.js` 和 `tools/verify_peek_zh2en.js`，检查退出码 0、输出含「✅」、控制台零 error（脚本内 seed 已学词，顺带覆盖 localStorage 读写往返）。
- 通过：两脚本全绿。
- 证据：关键 ✅ 行 + error 行。

### C7 手机真机长按（红线，不自动 PASS）
- 说明：必须 vivo 真机确认；**未确认不得宣称通过**。
- 输出：明确标注「⏳ 人工未确认」。

### C8 健康接口 GET /api/health（待后端）
- 状态：**N/A**（待后端接入后激活）。后端接 WorkBuddy Cloud Service 后，此步改为 `curl /api/health` 期望 200 且返回 `{ok:true}`。

### C9 读写接口各调一次（待后端）
- 状态：**N/A**（目前 localStorage 读写已由 C6 覆盖；云端读写接口待后端）。

### C10 数据库可连接 / 核心表存在（待后端）
- 状态：**N/A**（待后端；接 Cloud Service 后检查核心表存在 + 一条 SELECT 成功）。

## 输出格式
逐项一行：`[PASS] C1 版本闸门 — APP_VER=20261011e，改动文件 ?v= 全部一致`
结尾给汇总 + 明确结论：
- 所有非 N/A 项 PASS 且无 FAIL → **可发布**（C7 未确认则标注风险）。
- 任一 FAIL → **不可发布**，列出失败项。

## 交付物
- `tools/verify-project.js`：自动执行 C1–C10，生成 `day25-review/report-<时间戳>.txt` 与 `.html`。
- `day25-review/`：本次跑出的报告（截图用）。
