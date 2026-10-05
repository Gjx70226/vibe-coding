/* ============================================================
   板块③ 真库写入验证：不造假云，真往云端那张 checkins 表写。
   跑法：node tools/verify_day18_realdb.js
   四个数字必须对得上（清单「行数核对检测」）：
     写入前 N 行 → 正常写入 N+1 行 → 隔几秒同词再记（走 update，仍是 N+1）→ 缺字段被拒（仍 N+1）
   最后再调一次读取接口，确认新写入的数据能被读出来（读写闭环）。
   原话打印出来存进 day18-review/。
   ============================================================ */

const { JSDOM, VirtualConsole } = require("jsdom");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SDK_URL = "https://cdn.jsdelivr.net/npm/@tencent-ai/workbuddy-cloud-sdk@dev/lib/index.global.js";

let out = [];
function say(t) { console.log(t); out.push(t); }

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* 今天几号（跟表里 created_at 对得上） */
function todayStr() {
  const d = new Date();
  const m = d.getMonth() + 1, day = d.getDate();
  return d.getFullYear() + "-" + (m < 10 ? "0" + m : m) + "-" + (day < 10 ? "0" + day : day);
}

(async () => {
  const sdkText = await (await fetch(SDK_URL)).text();
  say("云的小工具：从网上现拿 " + sdkText.length + " 字节（跟线上页面同一个包）");

  const vc = new VirtualConsole();
  vc.on("jsdomError", e => say("  〔页面内报错〕" + (e && e.message)));
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    runScripts: "dangerously",
    virtualConsole: vc,
    url: "https://cet4-word-helper.app.workbuddy.host/api.html"
  });
  const w = dom.window;
  w.fetch = (...a) => fetch(...a);

  w.eval(sdkText);
  if (typeof w.WorkBuddyCloud === "undefined") { say("云的小工具没装上，跳过"); w.close(); process.exit(1); }
  say("云的小工具：装好了");

  const wordsText = fs.readFileSync(path.join(ROOT, "words.js"), "utf8")
    .replace("const WORDS =", "window.WORDS =");
  w.eval(wordsText);
  say("词库：本地那份 " + w.eval("WORDS.length") + " 个词（跟云没关系）");

  w.eval(fs.readFileSync(path.join(ROOT, "api.js"), "utf8"));
  if (typeof w.Api === "undefined" || typeof w.Api.addRecord !== "function") {
    say("写入接口 api.js 没装上，跳过"); w.close(); process.exit(1);
  }
  say("写入接口 api.js（addRecord）：装好了");

  function callRec(opt) {
    return new Promise(res => w.Api.getRecords(opt || {}, r => res(r)));
  }
  function callPost(opt) {
    return new Promise(res => w.Api.addRecord(opt, r => res(r)));
  }

  const TODAY = todayStr();
  const PID = Number(process.argv[2] || 6);   // 计划表那一行（第 6 行，Day 17 用过的）
  const WORD = process.argv[3] || "important"; // 记哪个词

  async function countRows(tag) {
    const r = await callRec({ date: TODAY, limit: 1 });
    if (!r.ok) { say("  〔" + tag + "〕取行数没成：" + JSON.stringify(r)); return NaN; }
    return r.data.total;
  }

  say("");
  say("===== 今天 " + TODAY + " ／ 计划行号 plan_day_id=" + PID + " ／ 词 " + WORD + " =====");

  /* ---------- 第 0 步：写入前，先数今天有几行 ---------- */
  const n0 = await countRows("写入前");
  say("① 写入之前，云里今天（" + TODAY + "）的记录行数 = " + n0);

  /* ---------- 第 1 步：正常写入 ---------- */
  const p1 = await callPost({ plan_day_id: PID, word: WORD, pos: "adj", is_correct: true, mode: "new" });
  say("② 正常写入一条（哪天=" + PID + " 词=" + WORD + " 答对=true）");
  say("   云回的话：" + JSON.stringify(p1));

  const n1 = await countRows("写入后");
  say("③ 写完之后，行数 = " + n1 + (n1 === n0 + 1 ? "  ← 正常写入多了 1 行 ✔" : "  ← 跟写入前的 " + n0 + " 比，多 " + (n1 - n0) + " 行"));

  /* ---------- 第 2 步：手滑连点（同一条 3 秒内原样再来） ---------- */
  const p2 = await callPost({ plan_day_id: PID, word: WORD, pos: "adj", is_correct: true, mode: "new" });
  say("④ 手滑连点：上面那条原样再发一遍（几秒内）");
  say("   云回的话：" + JSON.stringify(p2));

  /* ---------- 第 3 步：隔几秒，同一个词再记一遍（A 方案该走 update 加次数） ---------- */
  say("⑤ 等 4 秒（躲开手滑那道关），同一个词再记一遍 —— 按 A 方案应该加次数、不新开行");
  await sleep(4000);
  const p3 = await callPost({ plan_day_id: PID, word: WORD, pos: "adj", is_correct: true, mode: "new" });
  say("   云回的话：" + JSON.stringify(p3));

  const n2 = await countRows("update 后");
  say("⑥ 走 update 之后，行数 = " + n2 + (n2 === n1 ? "  ← 没多开行，只是原行加了次数 ✔" : "  ← 行数变了（" + n1 + " → " + n2 + "），要留意"));

  /* ---------- 第 4 步：缺必填字段 ---------- */
  const p4 = await callPost({ plan_day_id: PID, is_correct: true, mode: "new" });
  say("⑦ 故意漏掉「哪个词」（word）再发一遍");
  say("   云回的话：" + JSON.stringify(p4));

  /* ---------- 第 5 步：读写闭环 —— 再调一次读取接口 ---------- */
  const g = await callRec({ date: TODAY, limit: 20 });
  say("⑧ 最后再调一次读取接口（GET 那两个口子今天本来就有）");
  if (!g.ok) { say("   取回没成：" + JSON.stringify(g)); }
  else {
    say("   取回 total=" + g.data.total + " 实际吐出 " + g.data.items.length + " 条");
    const mine = g.data.items.filter(x => x.word === WORD);
    say("   里面「" + WORD + "」这几条：" + JSON.stringify(mine));
    const inList = g.data.items.some(x => x.word === WORD);
    say("   读写闭环：" + (inList ? "写入的那个词出现在读出来的结果里 ✔" : "读回来的 20 条里没看见这个词（它在更早的几十条里，total=" + g.data.total + "）"));
  }

  say("");
  say("【四个数字对账】写入前 " + n0 + " → 正常写入后 " + n1 + " → 同词再记（update）后 " + n2);
  say("【判定】写入 +1：" + (n1 === n0 + 1 ? "对得上 ✔" : "对不上 ✘") +
      " ／ update 不加行：" + (n2 === n1 ? "对得上 ✔" : "对不上 ✘") +
      " ／ 缺字段被拒：" + (p4.ok === false ? "拒了 ✔ (" + p4.error + ")" : "没拒 ✘"));

  fs.mkdirSync(path.join(ROOT, "day18-review"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, "day18-review/板块③-真库验证原话.txt"), out.join("\n") + "\n", "utf8");
  say("原话存下来了：day18-review/板块③-真库验证原话.txt");

  w.close();
  process.exit(0);
})();
