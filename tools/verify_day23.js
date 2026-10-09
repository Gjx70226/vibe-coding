/* ============================================================
   Day 23｜一键验证：错误处理三类 + 安全边界
   真加载 api.js 跑 readCloudErr，再静态查仓库里不该出现的裸报错写法。
   跑法：node tools/verify_day23.js
   ============================================================ */
const fs = require("fs");
const vm = require("vm");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
let pass = 0, failc = 0;
function check(name, cond) {
  if (cond) { pass++; console.log("PASS  " + name); }
  else { failc++; console.log("FAIL  " + name); }
}
function readSafe(p) { try { return fs.readFileSync(p, "utf8"); } catch (e) { return ""; } }

/* ---------- 1) 功能验证：真加载 api.js，跑三类错误 ---------- */
const apiCode = readSafe(path.join(ROOT, "api.js"));
const sandbox = { window: {}, console };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(apiCode, sandbox);
const Api = sandbox.Api;

check("api.js 能加载且挂出 Api._readCloudErr", !!(Api && typeof Api._readCloudErr === "function"));

const net = Api._readCloudErr({ code: "network", message: "数据暂时拿不到，请稍后再试" });
check("① 网络/接口错 → error=network 且统一中文",
  net.ok === false && net.error === "network" && net.msg === "数据暂时拿不到，请稍后再试");

const srv = Api._readCloudErr({ code: "XX999", message: "Internal server error raw english" });
check("③ 服务端未知错 → error=server 且通用中文(不含英文原话)",
  srv.ok === false && srv.error === "server" &&
  /服务器开小差/.test(srv.msg) && !/Internal server error/.test(srv.msg));

const bad = Api._readCloudErr({ code: "22P02", message: "invalid input syntax for integer" });
check("② 类型错 → error=bad_request 且中文(不甩英文)",
  bad.ok === false && bad.error === "bad_request" &&
  /类型不对/.test(bad.msg) && !/invalid input syntax/.test(bad.msg));

const tbl = Api._readCloudErr({ code: "42P01" });
check("表不存在 → error=server 且中文",
  tbl.ok === false && tbl.error === "server" && /查不到这张表/.test(tbl.msg));

/* ---------- 2) 静态检查：仓库里不该再出现的裸报错写法 ---------- */
const files = ["api.js", "checkinsRepository.js", "planDaysRepository.js", "cloud.js"];
const allSrc = files.map(f => readSafe(path.join(ROOT, f))).join("\n");

check("无任何 fail(\"server\", raw) 把原话甩给用户",
  !/fail\(\s*["']server["']\s*,\s*raw\s*\)/.test(allSrc));

check("checkinsRepository 已归到 network 分类",
  /code:\s*["']network["']/.test(readSafe(path.join(ROOT, "checkinsRepository.js"))));

check("planDaysRepository 已归到 network 分类",
  /code:\s*["']network["']/.test(readSafe(path.join(ROOT, "planDaysRepository.js"))));

check("cloud.js 也不再甩 err.message 原话给用户",
  !/msg:\s*err\.message/.test(readSafe(path.join(ROOT, "cloud.js"))));

check("三类中文提示文案齐全(网络/服务端/输入)",
  /数据暂时拿不到，请稍后再试/.test(allSrc) &&
  /服务器开小差了，已记录，请稍后再试/.test(allSrc) &&
  /类型不对/.test(allSrc));

console.log("\n==== 结果：" + pass + " 通过 / " + failc + " 失败 ====");
process.exit(failc ? 1 : 0);
