/* ============================================================
   Day 18 板块① 验证脚本
   验什么：① 缺字段 / 超长 / 瞎填 → 是不是回的中文人话
           ② 同一条请求几秒内原样再来一遍 → 挡不挡（手滑防重复）
           ③ 云里那行已经存在 vs 不存在 → 走的是「加次数」还是「新开一行」
   【老实说清楚】这里的「云」是假的（一个不会真发网络的替身），
   它证不了「云里真多了一行」——那一条是板块③ 真库验证才验的。
   这套脚本只证：判断走哪条路、人话报错，这两样没骗人。
   ============================================================ */

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.resolve(__dirname, "..");
const apiText = fs.readFileSync(path.join(ROOT, "api.js"), "utf8");

/* 假云：记下它「本来会去干啥」，然后马上回话给 js 那头 */
function makeCloud(ctx, found) {
  function thenable(reply) {
    const t = { then: function (cb) { cb(reply); return t; } };
    t["catch"] = function () { return t; };
    return t;
  }
  function replyInsert() {
    const row = Object.assign({ id: 90210, correct_count: 0, wrong_count: 0 }, ctx.insertRow || {});
    ctx.log.push("  insert 回：id=" + row.id);
    return { data: row };
  }
  function builder() {
    const api = {
      select: function () { return api; },
      eq: function () { return api; },
      update: function (d) { ctx.log.push("  update 次数 → 对" + d.correct_count + " 错" + d.wrong_count); return api; },
      insert: function (d) { ctx.log.push("  insert 一行 → 哪天" + d.plan_day_id + " 词" + d.word + " 对" + d.correct_count + " 错" + d.wrong_count + " mode=" + d.mode); return api; },
      maybeSingle: function () {
        return thenable(found ? { data: found } : { data: null });
      },
      single: function () { return thenable(replyInsert()); }
    };
    return api;
  }
  return { database: { from: function () { return builder(); } } };
}

/* 跑一次（或连着跑几次，用来看手滑连点） */
function runOnce(found, opts, insertRow) {
  const ctx = { log: [] };
  if (insertRow) ctx.insertRow = insertRow;
  const dom = new JSDOM("", { runScripts: "outside-only" });
  const w = dom.window;
  w.WorkBuddyCloud = { createWorkBuddyCloud: function () { return makeCloud(ctx, found); } };
  w.eval(apiText);

  const results = [];
  opts.forEach(function (o) {
    let got = null;
    w.Api.addRecord(o, function (r) { got = r; });
    results.push(got);
  });
  return { results: results, log: ctx.log };
}

const out = [];
function say(s) { out.push(s); console.log(s); }

const word101 = "a".repeat(101);

/* ---------- 第一关：缺字段 / 超长 / 瞎填，是不是回人话 ---------- */
say("【第一关：输入不对时，云那头还没被碰到，先看你回的是不是人话】");

const case1 = runOnce(null, [
  { plan_day_id: 6, word: "", is_correct: true },                 // 漏掉哪个词
  { plan_day_id: "", word: "important", is_correct: true },        // 漏掉哪天
  { plan_day_id: 6, word: word101, is_correct: true },             // 词超长
  { plan_day_id: 6, word: "important", is_correct: "可能对" },      // 对错瞎填
  { plan_day_id: 6, word: "important", is_correct: true, mode: "乱填" } // 来源瞎填
]);
case1.results.forEach(function (r, i) {
  const tips = ["漏掉『哪个词』", "漏掉『哪天』", "词超长", "对错瞎填", "来源瞎填"];
  say("  第 " + (i + 1) + " 种（" + tips[i] + "）→ " +
    (r.ok ? "【不成，居然放过了】" : "ok:" + r.ok + " / " + r.error + " / " + r.msg));
});

/* ---------- 第二关：云里没有那行 → 该新开一行 ---------- */
say("");
say("【第二关：云里还没这个词的记录 → 应该新开一行（insert）】");
const case2 = runOnce(null, [{ plan_day_id: 6, word: "important", is_correct: true, pos: "adj", mode: "new" }]);
say("  回话：" + JSON.stringify(case2.results[0]));
case2.log.forEach(function (l) { say("  " + l); });

/* ---------- 第三关：云里已经有那行 → 该在原来那行加次数，不新开行 ---------- */
say("");
say("【第三关：云里已经有这个词的记录了（对2 错1）→ 应该加次数，不新开行】");
const case3 = runOnce({ id: 7, correct_count: 2, wrong_count: 1 },
  [{ plan_day_id: 6, word: "important", is_correct: true, pos: "adj", mode: "new" }]);
say("  回话：" + JSON.stringify(case3.results[0]));
say("  云那边收到的命令：");
case3.log.forEach(function (l) { say("  " + l); });
say("  行数有没有新开一行？" + (case3.log.join("|").indexOf("insert") >= 0 ? "【不好，它去插新行了】" : "没有，只改了原来那行的次数"));

/* ---------- 第四关：手滑连点两下 ---------- */
say("");
say("【第四关：同一条一模一样的请求，连着发两遍（手滑多点了一下）】");
const dup = [{ plan_day_id: 6, word: "important", is_correct: true, mode: "new" },
             { plan_day_id: 6, word: "important", is_correct: true, mode: "new" }];
const case4 = runOnce(null, dup);
say("  第一次：" + JSON.stringify(case4.results[0]));
say("  第二次：" + JSON.stringify(case4.results[1]));
say("  第二次是不是被挡了？" + (case4.results[1] && case4.results[1].error === "conflict" ? "是，error=conflict，云根本没收到第二次" : "【不好，第二次也发出去了】"));

/* ---------- 收尾 ---------- */
const dir = path.join(ROOT, "day18-review");
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "板块①-验证原话.txt"), out.join("\n") + "\n", "utf8");
say("");
say("原话存下来了：day18-review/板块①-验证原话.txt");

/* 顺手看一眼 api.html 这一页没被我改坏：原来的读按钮还在不在、新加的三个按钮在不在。
   注意：这步是本地文件、没连云，证不了云里的事 */
say("");
say("【api.html 这一页：按钮和输入框都在不在（本地文件，没连云）】");
JSDOM.fromFile(path.join(ROOT, "api.html"), { runScripts: "dangerously" }).then(function (dom) {
  const doc = dom.window.document;
  ["btnPlan", "btnRec", "btnAgain", "btnErr", "btnPost", "btnDup", "btnMiss", "btnLog", "logBox",
   "inPid", "inWord", "inPos", "selRight", "selMode"].forEach(function (id) {
    say("  " + id + "：" + (doc.getElementById(id) ? "在" : "【没了，坏了】"));
  });
  dom.window.close();
});
