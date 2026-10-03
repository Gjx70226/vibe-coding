// 今日问题：小甘手机上三页全红框，但我造的"正常形状数据"跑三页都不炸。
//          他手机是**用了一阵子**的真实数据，存储里某个键很可能存歪过（旧版本存进去的）。
//          如果 Store 的兜底不够，读歪数据就会在渲染中途抛错 → 红框（旧版红框只会说"检查网络"）。
// 方案：造 7 种"存歪了"的数据，每种都在页面脚本跑之前灌进本地存储，
//       然后三个 hash 逐个切，只看两件事：红框有没有出来、控制台有没有真报错。
// 今日边界：只定位，不修（修另走一步）。红框判定必须用 hidden 属性（踩过 style 判定的坑）。
/* eslint-disable no-console */
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const URL_IN = path.resolve(__dirname, "..", "index.html");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function now() {
  const d = new Date();
  const m = String(d.getMonth() + 1), day = String(d.getDate());
  return d.getFullYear() + "-" + (m.length < 2 ? "0" + m : m) + "-" + (day.length < 2 ? "0" + day : day);
}

// 正常基准数据（对照用）
const NORMAL = () => ({
  "cet4_stats": { todayDate: now(), todayNew: 10, totalLearned: 0, correct: 5, totalAnswered: 10 },
  "cet4_wrong": [{ word: "below", status: "pending", wrong: 1 }],
  "cet4_learned": ["below", "design"],
  "cet4_counts": { below: { c: 2, w: 1 } },
  "cet4_progress": { date: now(), data: { ids: ["below"], idx: 1, right: 1, wrong: 0 } }
});

// 7 种"存歪了"的形状：模拟旧版本 / 中途写坏 / 用户手动改过
const CASES = [
  ["0 基准（正常形状，应当全绿）", () => NORMAL()],
  ["1 stats 存成了字符串 \"10\"", () => { const s = NORMAL(); s["cet4_stats"] = "10"; return s; }],
  ["2 wrong 存成了对象不是数组", () => { const s = NORMAL(); s["cet4_wrong"] = { 0: { word: "below" } }; return s; }],
  ["3 counts 存成了数组 [1,2,3]", () => { const s = NORMAL(); s["cet4_counts"] = [1, 2, 3]; return s; }],
  ["4 learned 存成了字符串", () => { const s = NORMAL(); s["cet4_learned"] = "below,design"; return s; }],
  ["5 progress 存成坏 JSON（半截）", () => { const s = NORMAL(); s["cet4_progress"] = '{"date":"2026-10-03",'; return s; }],
  ["6 progress 存了但 data 是空的", () => { const s = NORMAL(); s["cet4_progress"] = { date: now(), data: "" }; return s; }],
  ["7 daily 存成了数字 5", () => { const s = NORMAL(); s["cet4_daily"] = 5; return s; }]
];

function pad(seed) {
  return function (win) {
    const mem = {};
    Object.keys(seed).forEach((k) => { mem[k] = String(seed[k]); });
    const ls = {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null),
      setItem: (k, v) => { mem[k] = String(v); },
      removeItem: (k) => { delete mem[k]; },
      clear: () => { Object.keys(mem).forEach((k) => { delete mem[k]; }); },
      key: (i) => Object.keys(mem)[i] || null,
      get length() { return Object.keys(mem).length; }
    };
    Object.defineProperty(win, "localStorage", { value: ls, configurable: true });
  };
}

const ROUTES = [["#/study", "新词学习"], ["#/review", "错题复习"], ["#/daily", "每日复习"]];

(async () => {
  for (const [label, make] of CASES) {
    const vc = new VirtualConsole();
    const errs = [];
    vc.on("jsdomError", (e) => errs.push("jsdomError: " + (e && e.message)));
    vc.on("error", (m) => errs.push("console.error: " + m));

    const dom = await JSDOM.fromFile(URL_IN, {
      runScripts: "dangerously", resources: "usable", pretendToBeVisual: true,
      virtualConsole: vc, beforeParse: pad(make())
    });
    const win = dom.window, doc = win.document;
    await new Promise((r) => win.addEventListener("load", r));
    await sleep(500);

    const bad = [];
    for (const [hash, name] of ROUTES) {
      win.location.hash = "#/";
      await sleep(600);
      win.location.hash = hash;
      await sleep(750);
      const box = doc.getElementById("errorBox");
      const detail = doc.getElementById("errDetail");
      if (box && box.hidden === false) {
        bad.push(name + "(小字:「" + (detail ? detail.textContent.trim() : "") + "」)");
      }
    }
    const line = bad.length ? "❌ 出红框：" + bad.join(" / ") : "✅ 三页都正常";
    console.log("\n" + label);
    console.log("  " + line);
    if (errs.length) console.log("  控制台真报错：" + errs.join(" ｜ "));
    win.close();
  }
})().catch((e) => { console.error("压测脚本挂了：", e); process.exit(1); });
