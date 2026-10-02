// 今日问题：一个没见过这站的人，照着导航从头走到尾，会卡在哪？
// 方案：jsdom 真加载 index.html（跟浏览器一样按脚本顺序跑），逐个 hash 切视图，
//       只输出"当前真能看见的字"（隐藏盒子里的不算），再真点几下看反馈。
//       等待加长到 700ms（router 有 400ms 转圈，等不够会读到上一页＝假卡点）。
// 今日边界：只查功能/文案/流程卡点，不渲染像素（视觉部分另走截图）。
/* eslint-disable no-console */
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

// 用 file:// 加载 + 自己垫一个内存版"本地存储"。
// 原因：jsdom 对本地文件页（opaque origin）直接禁掉存储，不垫的话 Store 读写全抛错，
// 会把"点了没反应"测成假故障。真浏览器双击打开时存储是好的（已单独验证过）。
const URL_IN = path.resolve(__dirname, "..", "index.html");

function padLocalStorage(win) {
  const mem = {};
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

// 只看眼前看得见的字：hidden / display:none 的元素不算
function visibleText(el) {
  if (!el) return "(没有这个盒子)";
  let out = [];
  (function walk(node) {
    if (node.nodeType !== 1) return;
    const st = node.getAttribute("style") || "";
    if (node.hidden || node.getAttribute("hidden") !== null) return;
    if (/display\s*:\s*none/.test(st)) return;
    if (node.id === "loading" || node.id === "errorBox") return; // 转圈/红条单列
    if (node.children.length === 0) {
      const t = (node.textContent || "").replace(/\s+/g, " ").trim();
      if (t) out.push(t);
      return;
    }
    Array.prototype.forEach.call(node.childNodes, walk);
  })(el);
  return out.join(" ｜ ");
}

(async () => {
  const dom = await JSDOM.fromFile(URL_IN, {
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse: padLocalStorage,
  });
  const win = dom.window;
  const doc = win.document;
  await new Promise((r) => win.addEventListener("load", r));
  await sleep(400);

  const content = doc.getElementById("content");
  const go = async (hash, label) => {
    win.location.hash = hash;
    await sleep(700);
    console.log("\n=== " + label + " ===");
    console.log("看得见的字：" + visibleText(content));
    const btns = Array.from(content.querySelectorAll("a[href],button")).filter(
      (b) => !b.hidden && !/display\s*:\s*none/.test(b.getAttribute("style") || "")
    );
    console.log("能点的东西：" + (btns.map((b) => (b.textContent || "").replace(/\s+/g, " ").trim() || b.getAttribute("href")).join(" / ") || "(没有)"));
  };

  await go("#/", "首页（陌生人第一眼）");
  await go("#/study", "新词学习·刚进来");

  const one = (sel) => content.querySelector(sel);
  console.log("\n-- 第一题题干：" + (one("#qWord") ? one("#qWord").textContent : "(无)"));
  console.log("-- 第一题音标：" + (one("#qPhonetic") ? one("#qPhonetic").textContent : "(无)"));
  const opts = Array.from(content.querySelectorAll("#qOptions .option-btn"));
  console.log("-- 四个选项：" + opts.map((b, i) => "第" + (i + 1) + "个=" + b.textContent.replace(/\s+/g, " ").trim()).join(" ; "));

  // 真人的第一下点击：直接点第一个选项（大概率不是答案）
  if (opts[0]) opts[0].click();
  await sleep(150);
  console.log("-- 点完第一个选项：反馈栏「" + (one("#qFeedback") ? one("#qFeedback").textContent : "") +
    "」｜统计栏「" + (one("#qStat") ? one("#qStat").textContent : "") + "」");

  // 再错两次，看三次用完会不会给答案
  const again = Array.from(content.querySelectorAll("#qOptions .option-btn")).filter((b) => !b.disabled);
  if (again[0]) again[0].click();
  await sleep(120);
  console.log("-- 第二次答错：反馈「" + (one("#qFeedback") ? one("#qFeedback").textContent : "") + "」");
  const again2 = Array.from(content.querySelectorAll("#qOptions .option-btn")).filter((b) => !b.disabled);
  if (again2[0]) again2[0].click();
  await sleep(150);
  console.log("-- 第三次仍错：反馈「" + (one("#qFeedback") ? one("#qFeedback").textContent : "") +
    "」｜英文＝中文那行「" + (one("#qPair") ? one("#qPair").textContent : "") + "」");
  console.log("-- 页面底部按钮：" + visibleText(content).slice(-120));

  // 看「下一词」按钮在不在这
  const nb = one("#qNext");
  console.log("-- 下一词按钮：" + (nb && nb.style.display !== "none" ? "在，写着「" + nb.textContent + "」" : "没出现"));

  await go("#/review", "错题复习（空）");
  await go("#/daily", "每日复习（空）");
  await go("#/list", "词表统计（空）");
  await go("#/detail?word=analyze", "单词详情");

  console.log("\n=== 脚本报错 ===");
  console.log(errs.length ? errs.join("\n") : "无");
  win.close();
})().catch((e) => {
  console.error("走查挂了：", e);
  process.exit(1);
});
