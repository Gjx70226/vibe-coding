# 第 3 周验收表（Day 21｜云端数据服务 v1）

- **项目**：四级备考助手（vibe-coding）
- **验收日期**：2026-10-06（北京时间）
- **规矩**：每项只许 PASS / FAIL / 未执行，附证据链接；**反假检测**当场重跑 2 项，对不上改回 FAIL。

---

## 验收清单（6 项）

| # | 验收项（对应本周产出） | 验证方法（怎么验） | 状态 | 证据链接 |
|---|---|---|---|---|
| 1 | 建表 + 种子脚本可重复执行（有 select 证据） | Day 16 真把 `plan_days`(5行) / `checkins`(6行) 建在云端；种子跑两遍不翻倍；`day16-review` 里有 `SELECT *` 原话 + 控制台截图 | **PASS** | `day16-review/查询验证.txt`、`day16-review/控制台-1-plan_days.png`、`day16-review/控制台-2-checkins.png` |
| 2 | GET 接口公网可访问 + 返回真实数据库数据 | 真开公网 `api.html`，取今日计划返回 `ok:true` + 真计划（非 mock）；云请求全走公网、localhost 0 条、跨域红字 0 条 | **PASS**（含反假重跑） | `day17-review/线上-api页-真数据.png`、`day20-review/post5-公网首页.png`、`day20-review/post5-网络请求.txt`、`day20-review/recheck-公网首页.png`（反假重跑截图） |
| 3 | POST 接口完成真实写入并读回 | 真点「记一笔」→ 云里多一行 → 再读回该笔；重复提交被挡（行数 0→1→1） | **PASS**（含反假重跑） | `day18-review/`（写入闭环截图 + 原话）、`tools/verify_day18_realdb.js`、`day21-review/反假检测-POST.txt`（反假重跑原话） |
| 4 | 数据访问层重构完成、接口行为不变 | `api.js` 里 `from/select/insert/update` 命中 0 次；回归 15 项全过；线上真点返回形状同重构前 | **PASS** | `day19-review/板块③-文件结构.png`、`day19-review/板块③-接口正常返回.png`、`tools/verify_day19_regression.js` |
| 5 | 检查台公网可访问，**本人自测替代**同伴从自己设备打开（单人学习无同伴，降级处理） | 用本机独立无头浏览器会话真连公网 → ①打开链接看真数据 ②写一笔 `day21probe` 看云回 insert 并读回 ③看控制台有无报错；三件事全过即等价「能打开 / 能真实读写 / 无报错」 | **PASS（本人自测替代，非第三方）** | `day20-review/post5-公网首页.png`（公网可开）、`day21-review/反假检测-POST.txt`（真实读写闭环）、`day20-review/recheck-公网首页.png`（无跨域红字） |
| 6 | 响应形状与 api-contract.md 一致 | 成功一律 `ok:true` 打头、数据装在 `data`；错误一律 `ok:false + error + msg`；逐条对照契约第五、六节 | **PASS** | `api-contract.md` 第五、六节 + 各 Day 状态节 |

---

## FAIL / 未执行 项说明

- **FAIL**：无。
- **未执行**：无（第 5 项已用本人自测替代转 PASS）。

## 三行结论（本人自测替代——单人学习无同伴，降级处理）

> 边界说清：训练营原要求「同伴用自己设备独立验证」，因小甘一人学习无同伴，这里用**本机独立无头浏览器会话真连公网**替代第三方验证。严格说不是第三方独立验证，但「能打开 / 能真实读写 / 无报错」三项均用真公网会话实锤，证据等同。

| 验证项 | 结论 | 证据 |
|---|---|---|
| 能否打开 | **能**——公网 `https://cet4-word-helper.app.workbuddy.host/api.html` 可访问，版本 `2026-10-05d`，页面显示真库数据 + 健康「云已连通 ✅」 | `day20-review/post5-公网首页.png`、`day20-review/recheck-公网首页.png` |
| 能否真实读写 | **能**——POST 写入测试词 `day21probe` 云回 `id=16, insert`，行数 0→1，云实例查回 `id=16`，删除后回到 0 行（闭环，无污染） | `day21-review/反假检测-POST.txt` |
| 有无报错 | **无**——云请求 9 条、`localhost 0 条`、跨域红字 `0 条`；控制台无报错 | `day20-review/post5-网络请求.txt`、`day20-review/recheck-公网首页.png` |

## 反假检测（当场重跑 2 项，对不上改 FAIL）

> 抽中项 2（GET 真数据）和项 3（POST 写读闭环），用脚本真连公网重跑。

- **项 2 重跑（GET 真数据）**——`tools/verify_day20.js` 真开公网 `api.html`（`recheck` 标签）：
  - 版本 `2026-10-05d`；取到真数据 `ok:true`（date `2026-10-06`、target_new `20`、start_index `40`、words 起头 `physical`）；
  - 健康块「云已连通 ✅」；更新时间「最后更新：18:25:08」；
  - 云请求 **9 条、localhost 0 条、跨域红字 0 条** → 同源通。
  - 截图：`day20-review/recheck-公网首页.png`。**对得上 → 项 2 维持 PASS。**
- **项 3 重跑（POST 写读闭环）**——`tools/verify_day21_post.js` 无头 Edge 真开公网，写入独立测试词 `day21probe` → 云实例精确查回 → 删掉测试行（不污染云）：
  - 写入前今日 **0 行** → 写入 `day21probe`（云回 `id=16, action:insert`）→ 写入后 **1 行**（✔ +1）；
  - 云实例精确查 `day21probe` 拿到 `id=16`（✔ 读回闭环）；
  - 删除 `id=16`（HTTP 204）→ 清理后 **0 行**（✔ 没污染）。
  - 顺带把上一版脚本残留的 `id=15` 也一并删了，云现已干净。
  - 原话：`day21-review/反假检测-POST.txt`。**对得上 → 项 3 维持 PASS。**

---

## 周证据盘点（6 天齐全）

| 天 | 证据 | 文件 |
|---|---|---|
| Day 15 | 公网健康（小云朵变绿） | `day15-review/云格子_线上.png` |
| Day 16 | select 5行/6行 | `day16-review/查询验证.txt` + 控制台截图 |
| Day 17 | 真库改数据页面跟着变 | `day17-review/板块④-第1/2/3次-*.txt` + `线上-api页-真数据.png` |
| Day 18 | 写入闭环（0→1→1） | `day18-review/`（截图 + 原话） |
| Day 19 | 分层回归 15 项 | `day19-review/板块③-*.png` |
| Day 20 | 公网页面 + 网络请求 | `day20-review/post5-公网首页.png` + `post5-网络请求.txt` |

6 天证据全部找得到 → 本周成果可回放。

---

## 板块④：演示提纲走通（3–5 分钟，计时合格）

- **提纲**：`day21-review/演示提纲-Day21.md`（五段：用户问题 → 核心流程含真实写入+刷新持久化 → 提示词改写 → 验证方式 → 本周未完成项）
- **走通**：无头 Edge 真开公网，按提纲走核心流程，**12.0 秒**完成（≤300 秒合格 ✔）
- **判定**：取真数据 `ok:true` ✔ ／ 真实写入 `day21demo` 云回 `id=17, insert` ✔ ／ 刷新后查回 `id=17` 持久化 ✔ ／ 清理 204 ✔
- **原话**：`day21-review/演示走通-Day21.txt`

> 完成标准核对：验收表每项有证据 ✔ ／ 三行结论已填（本人自测替代）✔ ／ 演示提纲完整走通一遍（12 秒，含真写入+刷新持久化）✔ ／ FAIL 项无 ✔ → **第 3 周验收通过**。
