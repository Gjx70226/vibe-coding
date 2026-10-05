# 每日一问 · Day 19

**问：拆完之后，「查数据库」这段代码从哪移到了哪？**

**答：从 `api.js`（接口文件，管接单的）搬到了两个新文件——`planDaysRepository.js`（管「今天学几个」那本子的查询）和 `checkinsRepository.js`（管「学习记录」那本子的查询和写入）。搬完接口里只剩一行调用，再搜 from、select、insert、update 这些查库的字眼，一个都搜不到了——0 次，这个数是回归脚本自动数的，不是我嘴说的。**

> 我的判断是参考，不是查证事实；0 次可以自己复跑 `tools/verify_day19_regression.js` 验证。

---

## 改了什么 / 加了什么

**改了什么：**
- `api.js` —— 文件头换成 Day 19 说明；三处查库/写库（查今天计划 / 查学习记录 / 记一笔的查重·加次数·新开行）全换成调 repository 的一行；**回话形状一个字没变**
- `index.html` / `api.html` —— 两个新文件要在 `api.js` 之前先装（顺序反了会报错）；版本号 `2026-10-05b` → `2026-10-05c`
- `components.js` —— 版本号
- `api-contract.md` —— 第十节记 Day 19 状态 + 分层示意图（文字版）

**加了什么：**
- `planDaysRepository.js` —— 数据访问层：只管 plan_days 的查询（`getToday`）
- `checkinsRepository.js` —— 数据访问层：只管 checkins 的查询和写入（`list` / `getByDayWord` / `bumpCounts` / `insertRec`）
- `tools/verify_day19_regression.js` —— 回归验证（假云 15 项 + 自动搜关键字数次数）
- `tools/shot_day19.js` —— 截图脚本
- `day19-review/板块③-文件结构.png`、`板块③-接口正常返回.png` —— 两张截图

## 今天怎么验的（能亲眼看的）

1. **分层到位**：脚本自动搜 `api.js` 里的 from / select / insert / update → **命中 0 次**；两个 repository 文件里全命中。
2. **行为不变**：三个接口 + 校验 + 防重复回归 **15 项全过**；线上真点「取今日计划」，黑框返回 `ok:true` + 20 个词（problem、method…），跟重构前一个形状。
3. **两张截图**在 `day19-review/`：一张文件结构（两个新文件 + 变薄的 api.js），一张线上页（地址栏 + 真云返回 + 页底版本 2026-10-05c）。

## 今天没做的（照实写）

- ❌ 改接口路径 / 字段名 —— 清单明令契约不许动，**一个字没动**
- ❌ 新功能 —— 只许搬家不许添家具，**一行没加**
- ❌ `favorites` 收藏表 —— 还没建，继续顺延
- 余力加练「画分层示意图放进项目文档」—— ✅ 画了，文字版放在 `api-contract.md` 第十节里（页面 → 接口层 → 数据访问层 → 云，四层），另外截了一张结构图在 `day19-review/`
