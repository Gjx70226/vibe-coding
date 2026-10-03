// 验证：答完一组点「查看结果」后，结果页是不是自动顶到眼前（不用往下滑）
// 做法：真开页面、真点十个选项、真点「查看结果」，然后看三件事——
//   ① 答题卡片有没有被收起来
//   ② 结果页有没有露出来
//   ③ 页面有没有自动滚回顶部
// 注意：jsdom 不实现 window.scrollTo，所以这里把它换成记录器（真实浏览器里就是真的滚动）。
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

// 和走查一个路子：本地文件页 + 内存版本地存储（jsdom 对 file:// 页禁真存储）
const URL_IN = path.resolve(__dirname, "..", "index.html");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

const vc = new VirtualConsole();
const jsErrors = [];
vc.on("jsdomError", (e) => jsErrors.push(String(e.message || e)));
vc.on("error", (m) => jsErrors.push(String(m)));

function ok(cond, msg) {
  console.log((cond ? "  ✅ " : "  ❌ ") + msg);
  return !!cond;
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
  await sleep(600);

  // 把 scrollTo 换成记录器（真实浏览器里是真滚，jsdom 没这能力）
  win.__scrolls = [];
  win.scrollTo = function (a, b) {
    win.__scrolls.push(typeof a === "object" && a !== null ? a.top : b);
  };

  // 先从词表页把「英文 → 中文」抄一份（词表页本来就把全库列出来了，不用去翻内部变量）
  win.location.hash = "#/list";
  await sleep(900);
  const map = {};
  Array.prototype.forEach.call(doc.querySelectorAll("#listBox .word-row"), function (row) {
    const en = row.querySelector(".word-en");
    const zh = row.querySelector(".word-zh");
    if (en && zh) map[(en.textContent || "").trim()] = (zh.textContent || "").trim();
  });
  console.log("词表抄到 " + Object.keys(map).length + " 个词（用来点中正确选项）");

  win.location.hash = "#/study";
  await sleep(1200);

  console.log("=== 场景：新词学习答完 10 个词，点「查看结果」 ===");

  const wrapEl = doc.getElementById("studyWrap");
  const resultEl = doc.getElementById("studyResult");
  if (!wrapEl || !resultEl) { console.log("  ❌ 页面结构不对（ studyWrap / studyResult 找不到）"); return; }

  let steps = 0;
  let reachedResult = false;

  while (steps++ < 120) {
    // 结果页已经顶上来 → 收工
    if (wrapEl.style.display === "none" && resultEl.style.display === "block") { reachedResult = true; break; }

    // 注意：只从当前这张卡片里找元素（万一页面上留着上一张卡片的残留盒子，
    // 用 doc.getElementById 会摸到旧的那份，就会"明明有正确选项却点不中"）
    const nextBtn = wrapEl.querySelector("#qNext");
    if (nextBtn && nextBtn.style.display !== "none") {
      if (/查看结果/.test(nextBtn.textContent || "")) {
        nextBtn.click();                      // ← 就是用户点的那一下
        await sleep(120);
        continue;
      }
      nextBtn.click();                        // 下一词
      await sleep(60);
      continue;
    }

    // 还没定局：按题干英文找到正确中文选项，点它
    const word = (wrapEl.querySelector("#qWord") || {}).textContent || "";
    const meaning = map[word];          // 词表抄回来的是「英文 -> 中文」一串文本
    if (!meaning) { console.log("  ❌ 认不出题干：" + word); break; }
    const btns = wrapEl.querySelectorAll("#qOptions .option-btn");
    let clicked = false;
    for (let i = 0; i < btns.length; i++) {
      const txt = btns[i].textContent || "";
      if (txt.indexOf(meaning) >= 0) { btns[i].click(); clicked = true; break; }
    }
    if (!clicked) {
      console.log("  ❌ 题干「" + word + "」在词表里吗？" + Object.prototype.hasOwnProperty.call(map, word) +
        " ｜ 词表里的意思是「" + (Object.prototype.hasOwnProperty.call(map, word) ? map[word] : "(词表里没有这个词)") + "」");
      console.log("     当前四个选项：" + Array.prototype.map.call(btns, function (b) { return b.textContent; }).join(" ｜ "));
      break;
    }
    await sleep(60);
  }

  ok(reachedResult, "点了「查看结果」后进入结果页（答题卡片收起 + 结果页露出）");
  ok(!wrapEl || wrapEl.style.display === "none", "答题卡片被收起来（结果页顶到最上面，不用往下滑）");
  ok(resultEl.style.display === "block", "结果页已显示");
  const scrolled = (win.__scrolls || []).length > 0;
  ok(scrolled, "页面自动滚回顶部（scrollTo 被调用：" + JSON.stringify(win.__scrolls) + "）");
  const hasBtns = resultEl.querySelectorAll(".result-btns .next-btn").length;
  ok(hasBtns >= 2, "结果页上还有「再来一组 / 完成回首页」两个按钮（找到 " + hasBtns + " 个）");

  // 再点「再来一组」，应该能把卡片放回来
  const again = doc.getElementById("againBtn");
  if (again) {
    again.click();
    await sleep(300);
    ok(wrapEl.style.display !== "none", "点「再来一组」后答题卡片又回来了");
  }

  console.log("\n=== 脚本报错 ===");
  console.log(jsErrors.length ? jsErrors.join("\n") : "无");
  dom.window.close();
})();
