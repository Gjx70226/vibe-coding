/* ============================================================
   板块④ 真库检测：同一份接口代码，只改云里那一行，看接口回的话变不变。
   跑法：node tools/verify_day17_realdb.js
   三段各跑一次（改前 / 改后 / 改回），输出原话存进 day17-review/。
   词库 words.js 是本地那份（1229 词），跟云没关系。
   ============================================================ */

const { JSDOM, VirtualConsole } = require("jsdom");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SDK_URL = "https://cdn.jsdelivr.net/npm/@tencent-ai/workbuddy-cloud-sdk@dev/lib/index.global.js";

function say(t) { console.log(t); }

(async () => {
  /* 从网上现拿那个云的小工具（跟线上页面用的是同一个包，不往仓库里存） */
  const sdkText = await (await fetch(SDK_URL)).text();
  say("云的小工具：从网上现拿 " + sdkText.length + " 字节（跟线上页面同一个包）");

  /* 页面指向 api.html（不是 index.html），免得页面自己的路由脚本跑起来找不到 Api */
  const vc = new VirtualConsole();
  vc.on("jsdomError", e => say("  〔页面内报错〕" + (e && e.message) + (e && e.detail ? "\n      " + String(e.detail).split("\n")[0] : "")));
  vc.on("error", m => say("  〔页面内 error〕" + m));
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    runScripts: "dangerously",
    virtualConsole: vc,
    url: "https://cet4-word-helper.app.workbuddy.host/api.html"
  });
  const w = dom.window;
  w.fetch = (...a) => fetch(...a);

  w.eval(sdkText);
  const hasSdk = typeof w.WorkBuddyCloud !== "undefined";
  say("  云的小工具：装好没：" + (hasSdk ? "装好了" : "没装上"));
  if (!hasSdk) { w.close(); return; }

  /* 词库是顶层 const 装的，只有同一个 eval 里才认得，注入时把声明方式换成挂到窗口上。
     仓库里的 words.js 一个字没动。词还是那 1229 个，没换数据 */
  const wordsText = fs.readFileSync(path.join(ROOT, "words.js"), "utf8")
    .replace("const WORDS =", "window.WORDS =");
  w.eval(wordsText);
  const wordsLen = w.eval("WORDS.length");
  say("  词库：装好了（" + wordsLen + " 个词，本地那份，跟云没关系）");

  w.eval(fs.readFileSync(path.join(ROOT, "api.js"), "utf8"));
  const hasApi = typeof w.Api !== "undefined" && typeof w.Api.getPlanToday === "function";
  say("  读接口 api.js：" + (hasApi ? "装好了" : "没装上"));
  if (!hasApi) { w.close(); return; }

  /* 用 Promise 包一下，api.js 是回调式的 */
  function callPlan() {
    return new Promise(res => w.Api.getPlanToday(r => res(r)));
  }
  function callRec() {
    return new Promise(res => w.Api.getRecords({ limit: 50 }, r => res(r)));
  }

  /* 用法：node tools/verify_day17_realdb.js 「这一轮云里是什么样」 */
  const round = process.argv[2] || "这一轮云里是什么样";
  say("\n===== " + round + " =====  （下面这段字是同一份代码跑出来的，代码一个字没动）");
  const p1 = await callPlan();
  if (!p1.ok) { say("  取今日计划没成：" + JSON.stringify(p1)); }
  else {
    say("  今日计划 → ok=" + p1.ok + " date=" + p1.data.date +
        " target_new=" + p1.data.target_new + " start_index=" + p1.data.start_index +
        " 念出来的词 count=" + (p1.data.words ? p1.data.words.length : 0));
    say("  前三个词：" + (p1.data.words || []).slice(0, 3).map(x => x.word).join(" / "));
  }
  const r1 = await callRec();
  if (!r1.ok) { say("  取记录没成：" + JSON.stringify(r1)); }
  else {
    const ab = r1.data.items.filter(x => x.word === "abandon")[0];
    say("  学习记录 → ok=" + r1.ok + " total=" + r1.data.total + " 取回 " + r1.data.items.length + " 条");
    say("  其中 abandon 这条：" + JSON.stringify(ab));
  }

  say("\n【这一轮快照】target_new=" + (p1.data ? p1.data.target_new : "?") +
      " / abandon.correct_count=" + (r1.data ? (r1.data.items.filter(x => x.word === "abandon")[0] || {}).correct_count : "?") +
      " / 念出来的词数=" + (p1.data && p1.data.words ? p1.data.words.length : "?"));

  w.close();
  process.exit(0);
})();
