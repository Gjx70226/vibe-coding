# 安全自查清单 · Day 23（错误处理与安全边界）

> 规则：每项写清「怎么算通过」，不许只写「已修复」。
> 配套证据：`day23-review/密钥扫描-Day23.txt`、`tools/verify_day23.js`（可跑的命令验证）。

---

## 1. 密钥不在代码里（红线）
- **做了啥**：全仓库 + 全部 Git 历史搜了 `password / secret / sk- / postgres:// / AKIA / -----BEGIN PRIVATE / ghp_ / github_pat_` 等特征词。
- **结果**：真实密钥 **0 命中**。唯一的 `wbpk_...` 是**公开钥匙**（publishable key，设计上给前端用，不算秘密）；`GITHUB_TOKEN` 由 `tools/push_to_github.py` 从 `.env`/环境变量读，真值不写死。
- **怎么算通过**：对代码树和历史各跑一遍上述特征词搜索，只命中 `wbpk_`（公开）和字段名（如 `password=`、`token=` 这类代码自身），无任何真值（无 `ghp_/AKIA/postgres://user:...`）。见 `密钥扫描-Day23.txt`。

## 2. Git 历史无密钥泄漏
- **怎么算通过**：`git log -p --all` 搜同样特征词无任何真值命中；`git log --all --oneline -- .env` 无输出（`.env` 从未提交）。见扫描证据第四节。

## 3. .env 不进 Git
- **做了啥**：`.gitignore` 已有 `.env`（Day 23 前就写了）；`.env.example` 可提交。
- **怎么算通过**：`git check-ignore .env` 原样输出 `.env`；`git check-ignore .env.example` 无输出（能提交）。已验证通过。

## 4. 仓库只留 .env.example（无真实值）
- **做了啥**：新建 `.env.example`，里面 `GITHUB_TOKEN=` 是空值，并注明怎么拿、真值别写这里。
- **怎么算通过**：打开 `.env.example` 看不到任何 `=真实令牌`；`git status` 显示它被跟踪（能 add/commit），而 `.env` 显示 `ignored`。

## 5. 三类错误都有人能看懂的提示
- **做了啥**：在 `api.js` 明确三类模型——①用户输入错(bad_request/not_found/conflict) 告诉改什么；②网络/接口错(network) 统一「数据暂时拿不到，请稍后再试」；③服务端错(server) 统一「服务器开小差了，已记录，请稍后再试」。
- **怎么算通过**：分别触发三次（见第 8 项三类错误实测），页面/控制台都看到对应中文，不是英文堆栈、不是白屏。文案三句都在代码里（`verify_day23.js` 静态检查会断言它们存在）。

## 6. 服务端错绝不暴露原始英文
- **做了啥**：`readCloudErr` 兜底分支不再 `fail("server", raw)`（旧版会把云端英文原话甩给用户），改成通用中文 + `console.error` 原话只进控制台；`22P02/42883` 类型错也去掉英文原话。
- **怎么算通过**：`grep` 全仓无 `fail("server", raw)` 写法；`verify_day23.js` 传入英文原话 `Internal server error`，断言返回文案里**不含**这句英文、且 `error=server`。

## 7. 非法输入有边界、被拦且给中文
- **做了啥**：`addRecord/updateRecord/deleteRecord` 对空值、非数字、超长、非枚举值都在联网前拦下并说清改什么（沿用 Day 18/22 校验，本次未退化）。
- **怎么算通过**：各传非法值（如 plan_day_id 填「abc」、word 留空、status 填「x」、limit 填 999）均被拦，提示明确（见第 8 项）。

## 8. 无 SQL 注入风险
- **做了啥**：所有查询走云 SDK 参数化写法（`.from().eq().select()/.insert()/.update()`），没有任何字符串拼接的 SQL。
- **怎么算通过**：`grep` 全仓无 `"SELECT`/`"INSERT` 拼接、无 `eval(`、无 `new Function(`（仅有日志字符串拼接，非 SQL）。本次扫描仅命中日志里的普通字符串相加，已人工排除。

## 9. 公开钥匙为何可以不挪进 .env（边界说明，防误改）
- **说明**：`wbpk_/wbapp_` 是 WorkBuddy 云的 **publishable key**，等同 Stripe 的 publishable key——**本来就设计成嵌在前端、谁都能看**，靠后端 RLS 权限控数据，不靠它保密。本仓库无构建步骤（纯静态 JS），运行时也读不到 `.env`，硬挪反而无效。真正要保密的是 **secret key / 数据库密码 / GITHUB_TOKEN**，这些本项目一个都没出现在代码或 Git 里。
- **怎么算通过**：代码里搜不到任何 `service_role` / `secret` 类钥匙；所有「写」操作依赖云端的行级权限（RLS），不是靠前端钥匙拦。

---

### 一键复验
```
node tools/verify_day23.js
```
输出 `PASS/FAIL` 逐项；全绿即本期安全整改到位。
