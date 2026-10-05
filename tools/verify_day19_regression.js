/* Day 19 板块③ 回归：重构后三个接口行为不变 + 分层到位。
   假云，不联网；跑完打印 PASS/FAIL，把原话存 day19-review/板块③-回归原话.txt */
const fs = require("fs");
const { JSDOM } = require("jsdom");

const dom = new JSDOM("", { runScripts: "outside-only", url: "https://cet4-word-helper.app.workbuddy.host/" });
const w = dom.window;

/* 假云：根据 _action 决定返回；addRecord 用 addExisting 区分「已存在→update / 不存在→insert」 */
let ctx = { addExisting: false };
function makeFakeCloud() {
  const api = { _action: null, _table: null, _op: null };
  const chain = {};
  api.database = chain;
  chain.from = function (t) { api._table = t; return chain; };
  chain.select = function () { api._action = "select"; return chain; };
  chain.update = function () { api._op = "update"; return chain; };
  chain.insert = function () { api._op = "insert"; return chain; };
  chain.eq = function () { return chain; };
  chain.gte = function () { return chain; };
  chain.lte = function () { return chain; };
  chain.order = function () { return chain; };
  chain.range = function () { api._terminal = "range"; return fin(); };
  chain.maybeSingle = function () { api._terminal = "maybeSingle"; return fin(); };
  chain.single = function () { api._terminal = "single"; return fin(); };
  function fin() {
    let reply;
    if (api._op === "update") reply = { data: { id: 7, correct_count: 3, wrong_count: 1 } };
    else if (api._op === "insert") reply = { data: { id:99, correct_count: 1, wrong_count: 0 } };
    else if (api._action === "select" && api._table === "plan_days") reply = { data: { date: "2026-10-05", start_index: 0, target_new: 3 } };
    else if (api._action === "select" && api._table === "checkins") {
      if (api._terminal === "range") reply = { data: [{ id: 1, word: "a" }], count: 1 };
      else if (api._terminal === "maybeSingle") reply = ctx.addExisting ? { data: { id: 7, correct_count: 2, wrong_count: 1 } } : { data: null };
      else reply = { data: null };
    }
    else reply = { data: null };
    api._action = null; api._table = null; api._terminal = null; api._op = null;
    const t = { then(cb) { try { cb(reply); } catch (e) { console.log("回调里抛错:", e && e.stack); } return t; } };
    t["catch"] = function () { return t; };
    return t;
  }
  return { database: api.database };
}
w.WorkBuddyCloud = { createWorkBuddyCloud: function () { return makeFakeCloud(); } };
w.WORDS = [
  { word: "apple", pos: "n", meaning: "苹果", phonetic: "/ˈæpl/" },
  { word: "book", pos: "n", meaning: "书", phonetic: "/bʊk/" },
  { word: "cat", pos: "n", meaning: "猫", phonetic: "/kæt/" }
];

w.eval(fs.readFileSync("planDaysRepository.js", "utf8"));
w.eval(fs.readFileSync("checkinsRepository.js", "utf8"));
w.eval(fs.readFileSync("api.js", "utf8"));

const out = [];
const say = (s) => { out.push(s); console.log(s); };
let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; say("  PASS  " + name + (detail ? "  → " + detail : "")); }
  else { fail++; say("  FAIL  " + name + (detail ? "  → " + detail : "")); }
}

say("== 行为回归 ==");
/* 1. 取今日计划 */
w.Api.getPlanToday(function (r) {
  check("取今日计划 ok", r && r.ok === true);
  check("  词数按 target_new 数出 3 个", r && r.data && r.data.words && r.data.words.length === 3, r && r.data && r.data.words && r.data.words.length);
});
/* 2. 取学习记录 */
w.Api.getRecords({ limit: 50 }, function (r) {
  check("取学习记录 ok", r && r.ok === true);
  check("  总数/条数对得上", r && r.data && r.data.total === 1 && r.data.items.length === 1);
});
/* 3. limit 超上限当场挡 */
w.Api.getRecords({ limit: 101 }, function (r) {
  check("limit>100 被拒", r && r.ok === false && r.error === "bad_request");
  check("  提示中文", r && /limit 不能大于 100/.test(r.msg));
});
/* 4. 记一笔（不存在→insert） */
ctx.addExisting = false;
w.Api.addRecord({ plan_day_id: 6, word: "important", is_correct: true }, function (r) {
  check("记一笔 新开一行", r && r.ok === true && r.data && r.data.action === "insert", r && r.data && r.data.action);
  check("  正确次数=1", r && r.data && r.data.correct === 1);
});
/* 5. 记一笔（已存在→update）：换一个词，避免被手滑 3 秒窗挡住 */
ctx.addExisting = true;
w.Api.addRecord({ plan_day_id: 6, word: "important2", is_correct: true }, function (r) {
  check("同词已存在→加次数", r && r.ok === true && r.data && r.data.action === "update", r && r.data && r.data.action);
  check("  正确次数=3（原2+1）", r && r.data && r.data.correct === 3, r && r.data && r.data.correct);
});
/* 6. 缺 word 被拒 */
w.Api.addRecord({ plan_day_id: 6, is_correct: true }, function (r) {
  check("缺 word 被拒", r && r.ok === false && r.error === "bad_request");
  check("  提示中文", r && /少了 word/.test(r.msg));
});
/* 7. 手滑连点（同参 0 间隔） */
w.Api.addRecord({ plan_day_id: 6, word: "dup", is_correct: true }, function () {});
w.Api.addRecord({ plan_day_id: 6, word: "dup", is_correct: true }, function (r) {
  check("手滑连点被挡", r && r.ok === false && r.error === "conflict", r && r.error);
});

say("");
say("== 分层到位（接口文件里不许有 SQL，repository 里全有） ==");
const apiTxt = fs.readFileSync("api.js", "utf8");
const repoTxt = fs.readFileSync("checkinsRepository.js", "utf8") + fs.readFileSync("planDaysRepository.js", "utf8");
const sqlKw = /database\.from|\.select\(|\.insert\(|\.update\(|\.eq\(|\.order\(|\.range\(|\.gte\(|\.lte\(/;
const apiHits = (apiTxt.match(sqlKw) || []).length;
const repoHits = (repoTxt.match(sqlKw) || []).length;
check("api.js 里 SQL 关键字命中 0", apiHits === 0, "命中 " + apiHits);
check("repository 里 SQL 关键字全在", repoHits > 0, "命中 " + repoHits);

say("");
say("结果：" + pass + " 过 / " + fail + " 失败");
fs.mkdirSync("day19-review", { recursive: true });
fs.writeFileSync("day19-review/板块③-回归原话.txt", out.join("\n"), "utf8");
process.exit(fail === 0 ? 0 : 1);
