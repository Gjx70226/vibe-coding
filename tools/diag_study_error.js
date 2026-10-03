// 今日问题：小甘手机上点「新词学习」整块红框「加载失败」，但电脑上一模一样的流程却正常。
// 方案：复现他手机上的「有历史数据」状态（今天学过 10 个 / 错题本 5 条 / 上次那批没做完），
//       然后不走 router 的 try/catch（它会把异常吞成红框），直接手动调 StudyView.render 把真异常抠出来。
// 今日边界：只定位 study 一个视图，别的视图等这个文件跑通再扩。
/* eslint-disable no-console */
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const URL_IN = path.resolve(__dirname, "..", "index.html");

// 造一份"不是新手"的状态：有进度、有错题、有逐词统计
const TODAY = new Date().toISOString().slice(0, 10);
function fakeData() {
  return {
    cet4_stats: JSON.stringify({
      todayNew: 10, todayDate: TODAY, pending: 5, mastered: 2,
      totalLearned: 3, accuracy: 50, dailyDue: 0
    }),
    cet4_wrong: JSON.stringify([
      { word: "analyze", status: "pending", wrongTimes: 2 },
      { word: "initiative", status: "pending", wrongTimes: 1 },
      { word: "expect", status: "pending", wrongTimes: 3 },
      { word: "below", status: "pending", wrongTimes: 1 },
      { word: "follow", status: "mastered", wrongTimes: 2 }
    ]),
    cet4_learned: JSON.stringify(["analyze", "below", "follow"]),
    cet4_favorites: JSON.stringify([]),
    cet4_counts: JSON.stringify({
      analyze: { c: 2, w: 3 }, below: { c: 1, w: 1 }, follow: { c: 4, w: 2 }
    }),
    // 关键：上次那 10 个词只做到第 3 题，回来该"接着做"
    cet4_progress: JSON.stringify({
      words: ["analyze", "initiative", "expect", "below", "follow",
              "consider", "result", "impact", "feature", "promise"],
      idx: 3, correct: 2
    }),
    cet4_daily: JSON.stringify({ date: TODAY, ids: [] }),
    cet4_sound: "1"
  };
}

function padLocalStorage(win) {
  const mem = Object.assign({}, fakeData()); // 一上来就有数据，模拟"不是第一天用"
  const ls = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null),
    setItem: (k, v) => { mem[k] = String(v); },
    removeItem: (k) => { delete mem[k]; },
    clear: () => { Object.keys(mem).forEach((k) => { delete mem[k]; }); },
    key: (i) => Object.keys(mem)[i] || null,
    get length() { return Object.keys(mem).length; }
  };
  Object.defineProperty(win, "localStorage", { value: ls, configurable: true });
}

const errs = [];
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => errs.push("jsdomError: " + (e && e.message)));
vc.on("error", (m) => errs.push("console.error: " + m));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  await sleep(400);

  const content = doc.getElementById("content");

  // 首页在这份数据下长啥样（对小甘那张截图做个对照）
  console.log("=== 首页数字（有数据时）===");
  ["stat-today", "stat-review", "stat-total", "stat-acc"].forEach((id) => {
    const el = doc.getElementById(id);
    console.log("  " + id + " = " + (el ? el.textContent : "(不在)"));
  });

  // 关键：绕开 router 的 try/catch，直接 render，异常会冒出来
  console.log("\n=== 手动调 StudyView.render（绕开吞异常的兜底）===");
  try {
    win.StudyView.render(content);
    console.log("  没抛异常 → 渲染成功");
  } catch (e) {
    console.log("  ❌ 抛异常了！");
    console.log("  message: " + (e && e.message));
    console.log("  stack  : " + String(e && e.stack).split("\n").slice(0, 6).join("\n           "));
  }

  await sleep(200);
  const errBoxHidden = doc.getElementById("errorBox");
  console.log("\n=== 结果 ===");
  console.log("红框( errorBox )hidden = " + (errBoxHidden ? errBoxHidden.hidden : "(无这个盒子)"));
  const wrap = doc.getElementById("studyWrap");
  console.log("答区里有没有字 = " + (wrap && wrap.textContent ? wrap.textContent.replace(/\s+/g, " ").trim().slice(0, 100) : "(空)"));
  const opts = content.querySelectorAll("#qOptions .option-btn");
  console.log("四个选项 = " + (Array.from(opts).map((b) => b.textContent.replace(/\s+/g, " ").trim()).join(" ; ") || "(一个都没有)"));

  console.log("\n=== 脚本报错 ===");
  console.log(errs.length ? errs.join("\n") : "无");
  win.close();
})().catch((e) => {
  console.error("诊断脚本自己挂了：", e);
  process.exit(1);
});
