// 今日问题：小甘手机上「新词学习 / 错题复习 / 每日复习」三个入口全出红框「加载失败」，
//          到底是哪一行炸的？（之前只测过学习页 + 空数据，没测过复习/每日，这次补齐）
// 方案：jsdom 真加载 index.html，在页面脚本跑**之前**往本地存储里灌进"小甘手机上那种真实形状"
//       （今天学过 10 个 + 错题本 5 条 + 逐词对错 + 上次那批做到一半），
//       然后三个 hash 逐个切，看红框有没有出来、出来时下面那行小字写了什么。
// 今日边界：只定位报错，不修页面（修另走一步）。
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

// 小甘手机上的真实形状
function buildSeed() {
  const learned = ["important", "analyze", "below", "design", "energy", "figure", "generated", "hardware"];
  const wrong = ["below", "design", "energy", "figure", "generated"].map((w) => ({ word: w, status: "pending", wrong: 1 }));
  const counts = {};
  learned.forEach((w) => { counts[w] = { c: 2, w: 1 }; });
  return {
    "cet4_stats": { todayDate: now(), todayNew: 10, totalLearned: 0, correct: 5, totalAnswered: 10 },
    "cet4_wrong": wrong,
    "cet4_learned": learned,
    "cet4_counts": counts,
    // 上次那批 10 个词做到第 3 题没做完（backlog ④ 的进度）
    "cet4_progress": {
      date: now(),
      data: { ids: learned, idx: 3, right: 1, wrong: 2 }
    }
  };
}

function padLocalStorage(win) {
  const mem = {};
  const seed = buildSeed();
  Object.keys(seed).forEach((k) => { mem[k] = JSON.stringify(seed[k]); });   // ← 一进页面就是"有数据"
  const ls = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null),
    setItem: (k, v) => { mem[k] = String(v); },
    removeItem: (k) => { delete mem[k]; },
    clear: () => { Object.keys(mem).forEach((k) => { delete mem[k]; }); },
    key: (i) => Object.keys(mem)[i] || null,
    get length() { return Object.keys(mem).length; }
  };
  Object.defineProperty(win, "localStorage", { value: ls, configurable: true });
  return mem;
}

const vc = new VirtualConsole();
const raw = [];
vc.on("jsdomError", (e) => raw.push("jsdomError: " + (e && e.message)));
vc.on("error", (m) => raw.push("console.error: " + m));

// 注意（踩过的坑）：红框是用 hidden 属性藏的，**不是** style.display。
// 第一次我拿 style.display 判 → 从没出过错也恒为"显示"，等于脚本自己造了个假红框。
function errState(doc) {
  const box = doc.getElementById("errorBox");
  const detail = doc.getElementById("errDetail");
  return {
    红框显示: !!(box && box.hidden === false),
    隐藏属性: box ? String(box.hidden) : "(无盒子)",
    红框小字: detail ? (detail.textContent || "").trim() : "(没有 errDetail 这个盒子)"
  };
}

(async () => {
  const dom = await JSDOM.fromFile(URL_IN, {
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse: padLocalStorage
  });
  const win = dom.window;
  const doc = win.document;
  await new Promise((r) => win.addEventListener("load", r));
  await sleep(500);

  console.log("=== 灌进去的真实形状 ===");
  console.log("错题本 " + win.Store.getWrong().length + " 条 / 已学 " + win.Store.getLearned().length +
    " 个 / 今日新学 " + win.Store.getStats().todayNew + " / 待复习 " + win.Store.pendingCount());
  console.log("汇总：" + JSON.stringify(win.Store.summary()));

  const targets = [
    ["#/study", "新词学习"],
    ["#/review", "错题复习"],
    ["#/daily", "每日复习"]
  ];

  for (const [hash, label] of targets) {
    // 每次都从首页进去，模拟真人点导航（不是直接贴地址栏）
    win.location.hash = "#/";
    await sleep(700);
    win.location.hash = hash;
    await sleep(800);
    const st = errState(doc);
    console.log("\n=== " + label + " " + hash + " ===");
    console.log("  红框显示：" + st.红框显示 + " (hidden=" + st.隐藏属性 + ")");
    console.log("  正文有没有内容：" + (doc.getElementById("content").textContent.length) + " 个字");
    console.log("  红框小字：" + st.红框小字);
    if (st.红框显示) raw.push(">>> " + label + " 出红框");
  }

  console.log("\n=== 真报错（控制台原文）===");
  console.log(raw.length ? raw.join("\n") : "无");
  win.close();
})().catch((e) => {
  console.error("诊断脚本挂了：", e);
  process.exit(1);
});
