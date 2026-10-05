# 每日一问 · Day 20｜云端数据检查台

**答：**
今天把检查台 `api.html` 上线公网了，页面接的是真云（`plan_days` / `checkins` 两张表的真库数据），不是 mock。
我的判断：跨域那一下在公网根本不会出现——因为把云小工具的 `endpoint` 直接填成了公网域名本身，
公网页打开时「页面域名 = 请求域名」= 同源，浏览器就不拦。
认出跨域问题的方法就一句：看 F12 Network 里那条云请求的**目标地址**和**地址栏**是不是同一个域名；
不是同一个才跨域（红字 `Access-Control-Allow-Origin`），是同一个就正常。本地 `localhost` 测才会报跨域，那不是 bug，发公网就好。

**图：**
`day20-review/post5-公网首页.png`
（公网地址栏 `https://cet4-word-helper.app.workbuddy.host/api.html` + 真数据 + 顶部「云已连通 ✅」+「最后更新：21:34:01」）

**说明：**
- 改了什么：`api.html`（加健康状态条、最后更新时间、版本号 `2026-10-05d`；入口页本就直连云无 mock，没动接口文件 `api.js` / 两个 repository）
- 加了什么：检查台公网上线 + 健康状态 + 最后更新时间（余力加练）+ 两份验证脚本（`tools/verify_day20.js` 公网真开验证、`tools/verify_day20_health.js` 健康块逻辑本地验证）
