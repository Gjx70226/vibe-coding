// 验证小甘 2026-10-03 点的三件事（真开页面、真点错）：
//   ① 词性标签全小写（n. / v. / adj. / adv. …），词库里不再有大写的 N / V / ADV
//   ② 答错后那句「正确答案在上面」的废话没了
//   ③ 选错那一项：变红（wrong-tried）的同时，这一行自己摊开「另一半意思」（英文词 / 音标 / 中文）
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const ROOT = path.resolve(__dirname, "..");
const URL_IN = path.resolve(ROOT, "index.html");
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

// ---------- ① 词库词性全小写 ----------
console.log("=== ① 词性标签大小写 ===");
const wordsRaw = fs.readFileSync(path.resolve(ROOT, "words.js"), "utf8");
const posList = wordsRaw.match(/pos: "([^"]*)"/g) || [];
const bad = posList.filter((t) => /[A-Z]/.test(t.replace(/pos: "/, "").replace(/"/, "")));
ok(bad.length === 0, "词库里再没有大写的词性（原来 N 549 / V 210 / ADV 90，现在全小写）" +
  (bad.length ? " — 还剩：" + bad.slice(0, 5).join(" ") : ""));
const kinds = {};
posList.forEach((t) => { const k = t.replace(/pos: "/, "").replace(/"/, ""); kinds[k] = (kinds[k] || 0) + 1; });
console.log("     现在词库里： " + Object.keys(kinds).sort().map((k) => k + "×" + kinds[k]).join("  "));

(async () => {
  const dom = await JSDOM.fromFile(URL_IN, {
    runScripts: "dangerously", resources: "usable", pretendToBeVisual: true,
    virtualConsole: vc, beforeParse: padLocalStorage
  });
  const win = dom.window;
  const doc = win.document;
  await new Promise((r) => win.addEventListener("load", r));
  await sleep(700);

  // ---------- ③ 答题页选错那一屏 ----------
  console.log("=== ② 选错那一屏（新词学习第一题）===");
  win.location.hash = "#/study";
  await sleep(1100);
  const wrapEl = doc.getElementById("studyWrap") || doc.querySelector("#studyWrap");
  if (!wrapEl) { console.log("  ❌ 找不到学习页容器"); return; }

  const word = (wrapEl.querySelector("#qWord") || {}).textContent || "";
  console.log("     题干：" + word);

  // 四个选项是随机的：可能一上来就点中正确答案（那就会答对，没有"错的那一行"）。
  // 所以循环——答对了就翻下一词再点，直到真点出一个错项为上一共不超过 10 次，别死循环。
  let wrongBtn = null;
  for (let round = 0; round < 10 && !wrongBtn; round++) {
    const btns = wrapEl.querySelectorAll("#qOptions .option-btn");
    if (!btns.length) { console.log("  ❌ 四个选项没渲染出来"); return; }
    btns[0].click();
    await sleep(150);
    wrongBtn = wrapEl.querySelector("#qOptions .option-btn.wrong-tried");
    if (!wrongBtn) {
      const next = wrapEl.querySelector("#qNext");
      if (next && next.style.display !== "none") { next.click(); await sleep(120); }  // 答对了，翻下一词
      else { btns[1] && btns[1].click(); await sleep(150); }
    }
  }
  ok(!!wrongBtn, "选错那一项变红了（class wrong-tried）");

  if (wrongBtn) {
    const reveal = wrongBtn.querySelector(".opt-reveal");
    ok(!!reveal, "错的那一行里多了一块「另一半意思」的解释");
    if (reveal) {
      const txt = (reveal.textContent || "").trim();
      ok(txt.length > 0, "摊开的内容不是空的 → 「" + txt + "」");
      ok(/[A-Za-z]/.test(txt), "里面带英文（你点的是中文义项，就给你那个英文词）");
    }
  }

  const fb = wrapEl.querySelector("#qFeedback");
  const fbTxt = fb ? (fb.textContent || "") : "";
  ok(fbTxt.indexOf("在上面") === -1, "那句「正确答案在上面」已经删掉（现在反馈条是：「" + fbTxt + "」）");
  const rightBtn = wrapEl.querySelector("#qOptions .option-btn.right");
  ok(!!rightBtn, "正确那一项打勾标出来了（绿色 + ✓ 正确）");

  // ---------- ① 详情页词性小写 ----------
  console.log("=== ③ 详情页词性小标签 ===");
  // 找一个 pos 是大写-origin 的词（名词 n.）来开详情页
  // 直接从词库文本里抠一个「名词 n.」来开详情页（列表页的前几十个多半是 adj，看不出小写效果）
  const mNoun = wordsRaw.match(/word: "([^"]+)"[^\n]*?pos: "n"/);
  const mVerb = wordsRaw.match(/word: "([^"]+)"[^\n]*?pos: "v"/);
  const mAdv = wordsRaw.match(/word: "([^"]+)"[^\n]*?pos: "adv"/);
  let nounWord = mNoun ? mNoun[1] : "important";
  console.log("     名词例：" + (mNoun ? mNoun[1] : "-") +
    " ｜ 动词例：" + (mVerb ? mVerb[1] : "-") + " ｜ 副词例：" + (mAdv ? mAdv[1] : "-"));
  win.location.hash = "#/detail?word=" + encodeURIComponent(nounWord);
  await sleep(900);
  const tags = Array.prototype.slice.call(doc.querySelectorAll(".pos-tag")).filter(function (t) {
    return doc.body.contains(t);
  });
  const tagTexts = Array.prototype.map.call(tags, (t) => (t.textContent || "").trim());
  const hasUpper = tagTexts.filter((t) => /^[A-Z]{1,4}\.$/.test(t));
  console.log("     详情页（" + nounWord + "）出现的词性标签：" + (tagTexts.join(" ") || "(没有)"));
  ok(hasUpper.length === 0, "详情页不再出现大写的 N. / ADV. / V.");
  ok(tagTexts.length > 0, "详情页有词性小标签（小写词典体）");

  console.log("\n=== 页面报错 ===");
  console.log(jsErrors.length ? "  ❌ " + jsErrors.join(" ｜ ") : "  ✅ 零报错");
})();
