# 四级备考助手（CET-4 单词助手）

纯前端单页应用。进度存在你**浏览器里**（localStorage），**无后端、无数据库、不联网**。

线上地址：https://cet4-word-helper.app.workbuddy.host/

---

## 本地预览

在项目根目录执行：

```
python -m http.server 8010
```

然后浏览器打开 http://localhost:8010

---

## 发布前检查 Skill（verify-project）

每次**改完代码**、每次**发布前**，跑一遍自动检查，避免把坑带上线。

**怎么跑：**

```
node tools/verify-project.js
```

跑完会在 `day25-review/` 生成一份报告（`.txt` + `.html`），逐项标 `PASS / FAIL / N/A / 人工⏳`，并附证据——不会写"看起来正常"这种虚话。

**检查项（都来自本项目真实踩过的坑）：**

- **C1 版本闸门**：改过的文件的 `?v=` 必须和 `components.js` 里的 `APP_VER` 一致（防止发布后你拿到旧缓存）。
- **C2 语法闸门**：所有 `.js` 通过 `node --check`。
- **C3 公网可达 + 版本生效**：线上首页能开，且确实是刚发的那版。
- **C4 密钥扫描**：源码里不能有真密钥，`.env` 不能进库，要有 `.env.example`。
- **C5 Git 安全**：临时目录 / 日志不能误提交（Day24 脏提交带 361 个垃圾文件就是这坑）。
- **C6 关键交互回归**：用无头浏览器验长按 / 念单词，不只测空页面（"只测空态"是老坑）。
- **C7 手机真机长按**：必须拿 vivo 真机点过才算过，桌面模拟**不算**。
- **C8 / C9 / C10 健康 / 读写 / 数据库**：待接后端（WorkBuddy Cloud Service）后自动激活，现在标 `N/A`。

> 每一项"怎么算通过"、具体执行命令，详见 `.workbuddy/skills/verify-project/SKILL.md`

---

## 开发规矩（记给以后的自己）

- 改了任何 `.js` / `.css`，必须同步升 `components.js` 里的 `APP_VER` 和 `index.html` 里对应的 `?v=`。
- 手机端功能（长按等）必须**真机点过**才算验收通过，桌面模拟不能替你拍板。
- 目前**不做后端**；后端计划接 WorkBuddy Cloud Service，接上后 C8–C10 自动生效。

---

## 目录速览

- `index.html` / `style.css` / `components.js` / `quiz.js`：页面与公共零件
- `words.js`：词库（约 1229 词）
- `store.js`：数据层（localStorage 封装）
- `app/`：各页面视图（study / review / daily / list / detail）
- `tools/`：自检脚本（`verify-project.js` 等）
- `.workbuddy/skills/verify-project/`：发布前检查 Skill
