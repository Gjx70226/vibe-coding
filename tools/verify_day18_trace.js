    const t = { then: function (cb) { try { cb(reply); } catch (e) { console.log("  [假云] 回调里抛错：", e && e.stack); } return t; } };/* ============================================================
   Day 18 余力加练（A 方案：留痕）验证脚本
   验什么：每次去问云（取计划 / 取记录 / 记一笔），自己这儿有没有自动留一行；
           成了留「成」、砸了留「砸 + 哪错了」，且最多只留 50 条。
   【老实说清楚】这里的「云」是不会真发网络的替身；留痕发生在页面自己的浏览器里，
   所以这脚本只证「留痕这件事真的在跑、字是人话」，证不了云那头。
   ============================================================ */

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.resolve(__dirname, "..");
const apiText = fs.readFileSync(path.join(ROOT, "api.js"), "utf8");

const out = [];
function say(s) { out.push(s); console.log(s); }

/* 假云：回了什么由 who 决定（noPlan / rec / recErr / insert / update） */
function makeCloud(who) {
  function thenable(reply) {
    const t = { then: function (cb) { try { cb(reply); } catch (e) { console.log("  [假云] 回调里抛错：", e && e.stack); } return t; } };
    t["catch"] = function () { return t; };
    return t;
  }
  function builder() {
    const api = {
      /* insert / update 之后那句 select 得回一个「能等结果」的东西，
         否则代码里那道 typeof q.then 会当成「话没发出去」——那是假云的锅，不是 api.js 的 */
      _pending: false,
      select: function () {
        if (!api._pending) return api;
        /* 新开一行是 insert(...).select(...).single() 这么串下来的，
           所以这一步得给一个「点 single 也还是它」的东西 */
        api._pending = false;
        const t = thenable({ data: { id: 90210, correct_count: 1, wrong_count: 0 } });
        t.single = function () { return t; };
        return t;
      },
      eq: function () { return api; },
      gte: function () { return api; },
      lte: function () { return api; },
      order: function () { return api; },
      range: function () { return api; },
      insert: function () { api._pending = true; console.log("  [假云] insert 被调用"); return api; },
      maybeSingle: function () {
        console.log("  [假云] maybeSingle 被调用（这次回：谁=" + who + "）");
        return thenable({ data: null });
      },
      update: function () { api._pending = true; return api; },
      maybeSingle: function () {
        if (who === "found") return thenable({ data: { id: 7, correct_count: 2, wrong_count: 1 } });
        return thenable({ data: null });
      },
      single: function () { return thenable({ data: { id: 90210, correct_count: 1, wrong_count: 0 } }); }
    };
    return api;
  }
  return {
    database: {
      from: function () { return builder(); },
      /* 取计划那句带 count，给个总数 */
      _count: 0
    }
  };
}

/* fake 掉 getPlanToday 里对 count 的依赖：让 select 那句把 count 带上 */
function makeCloudWithCount(who) {
  function thenable(reply) {
    const t = { then: function (cb) { try { cb(reply); } catch (e) { console.log("  [假云] 回调里抛错：", e && e.stack); } return t; } };
    t["catch"] = function () { return t; };
    return t;
  }
  const api = {
    _c: 0,
    select: function (cols, opt) {
      if (opt && opt.count) this._wantCount = true;
      return this;
    },
    eq: function () { return this; },
    maybeSingle: function () {
      if (who === "noplan") return thenable({ data: null });
      if (who === "bad") return thenable({ error: { code: "42P01", message: 'relation "plan_days" does not exist' } });
      return thenable({
        data: { date: "2026-10-05", target_new: 20, start_index: 0 },
        count: this._wantCount ? 3 : undefined
      });
    },
    order: function () { return this; },
    gte: function () { return this; },
    lte: function () { return this; },
    limit: function () { return this; },
    range: function () {
      return thenable({
        data: [
          { id: 13, word: "important", correct_count: 1, wrong_count: 0 },
          { id: 12, word: "ability" }
        ],
        count: this._wantCount ? 42 : undefined
      });
    }
  };
  return { database: { from: function () { return api; } } };
}

function run(who, jobs) {
  const dom = new JSDOM("", { runScripts: "outside-only" });
  const w = dom.window;
  /* 记一笔要用那套「能 insert / update」的假云；取数用另一套（带 count 的）。
     这两套一开始我写反了，害得 insert 那步当场炸——那是脚本的锅，不是 api.js 的 */
  w.WorkBuddyCloud = {
    createWorkBuddyCloud: function () {
      return (who === "insert" || who === "found") ? makeCloud(who) : makeCloudWithCount(who);
    }
  };
  w.eval(apiText);
  jobs.forEach(function (j) {
    const cb = j[1];
    if (j[0] === "plan") w.Api.getPlanToday(cb);
    else if (j[0] === "rec") w.Api.getRecords(j[2] || {}, cb);
    else if (j[0] === "post") w.Api.addRecord(j[2], cb);
  });
  return w.Api.log();
}

say("【第一关：记一笔成的时候，留的那一行长啥样】");
let log = run("insert", [["post", function () {}, {
  plan_day_id: 6, word: "important", is_correct: true, pos: "adj", mode: "new"
}]]);
log.forEach(function (l) { say("  " + l); });

say("");
say("【第二关：手滑连点第二下被当场挡住，也该留一行「砸」】");
log = run("insert", [
  ["post", function () {}, { plan_day_id: 6, word: "important", is_correct: true, mode: "new" }],
  ["post", function () {}, { plan_day_id: 6, word: "important", is_correct: true, mode: "new" }]
]);
log.forEach(function (l) { say("  " + l); });

say("");
say("【第三关：故意问错（limit=999）→ 留「砸」，得看清是哪错了】");
log = run("rec", [["rec", function () {}, { limit: 999 }]]);
log.forEach(function (l) { say("  " + l); });

say("");
say("【第四关：取记录成的时候，留的那一行（带上云里一共 N 条）】");
log = run("rec", [["rec", function () {}, {}]]);
log.forEach(function (l) { say("  " + l); });

say("");
say("【第五关：取计划砸的时候（云里那张表不存在）→ 留「砸」+ 人话】");
log = run("bad", [["plan", function () {}]]);
log.forEach(function (l) { say("  " + l); });

say("");
say("【第六关：留痕最多留几条（灌 60 条假的，看还剩几条）】");
{
  const dom = new JSDOM("", { runScripts: "outside-only" });
  const w = dom.window;
  w.__apiLog = [];
  w.WorkBuddyCloud = { createWorkBuddyCloud: function () { return makeCloudWithCount("rec"); } };
  w.eval(apiText);
  for (let i = 0; i < 60; i++) {
    w.Api.getRecords({}, function () {});
  }
  const n = w.Api.log().length;
  say("  灌了 60 次，现在留着 " + n + " 条 —— " + (n === 50 ? "对，最多只留 50 条（LOG_MAX 掐的）" : "【不对，条数没掐住】"));
  say("  最老那一条还留着吗？" + (w.Api.log()[0].indexOf("第 1 次") >= 0 ? "留着（该删的没删）" : "最老那条已经掉了，只留最近 50 条"));
}

/* 收尾存档 */
const dir = path.join(ROOT, "day18-review");
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "余力加练-留痕-验证原话.txt"), out.join("\n") + "\n", "utf8");
say("");
say("原话存下来了：day18-review/余力加练-留痕-验证原话.txt");
