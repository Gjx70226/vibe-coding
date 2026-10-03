// 今日问题：小甘手机上三页出红框，红框只能靠"当场截图"才能定位，太门槛。
//           现在红框原因会**自己留档**（写进本地存储），回首页画成一行黄字。
//           验证：故意让某个视图炸 → 红框小字有原因 → 回首页黄字能看到 → 点「知道了」清掉。
// 今日边界：只验「留档 + 首页显示 + 清掉」这三步，不验别的。
/* eslint-disable no-console */
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const URL_IN = path.resolve(__dirname, "..", "index.html");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad = (function () {
  return function (win) {
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
  };
})();

function box(doc) {
  const err = doc.getElementById("errorBox");
  const detail = doc.getElementById("errDetail");
  const le = doc.getElementById("lastErr");
  return {
    红框: !!(err && err.hidden === false),
    红框小字: detail ? detail.textContent.trim() : "(无)",
    首页黄字: !!(le && le.hidden === false),
    黄字内容: le ? (le.textContent || "").replace(/\s+/g, " ").trim() : "(无)",
    存储里: (function () { try { return win_store_get(); } catch (e) { return "(读不到)"; } })()
  };
}
let win_store_get = () => "(未取到)";

(async () => {
  const vc = new VirtualConsole();
  vc.on("jsdomError", () => {});
  const dom = await JSDOM.fromFile(URL_IN, {
    runScripts: "dangerously", resources: "usable", pretendToBeVisual: true,
    virtualConsole: vc, beforeParse: pad
  });
  const win = dom.window, doc = win.document;
  win_store_get = () => { try { return String(win.localStorage.getItem("cet4_lasterr")); } catch (e) { return "(读不到)"; } };
  await new Promise((r) => win.addEventListener("load", r));
  await sleep(400);

  const realStudy = win.StudyView;

  console.log("=== 1. 先去一个正常页（不该留档）===");
  win.location.hash = "#/study";
  await sleep(800);
  let b = box(doc);
  console.log("  红框=" + b.红框 + " ｜ 存储里的留档=" + (b.存储里 === "null" ? "没有" : b.存储里));

  console.log("\n=== 2. 假装 study 这一页炸了（render 抛错）===");
  win.StudyView = { render: function () { throw new Error("boom: 手机浏览器不支持 xxx"); } };
  win.location.hash = "#/";
  await sleep(700);
  win.location.hash = "#/study";
  await sleep(800);
  b = box(doc);
  console.log("  红框=" + b.红框 + " ｜ 红框小字=「" + b.红框小字 + "」");
  console.log("  存储里的留档=" + b.存储里);

  console.log("\n=== 3. 回首页，黄字该出现 ===");
  win.StudyView = realStudy;                 // 还原，免得影响后面
  win.location.hash = "#/";
  await sleep(800);
  b = box(doc);
  console.log("  首页黄字=" + b.首页黄字 + " ｜ 内容=「" + b.黄字内容 + "」");

  console.log("\n=== 4. 点「知道了，清掉这条」===");
  const btn = doc.getElementById("lastErrOk");
  if (btn) btn.click();
  await sleep(150);
  b = box(doc);
  console.log("  首页黄字=" + b.首页黄字 + "（应为 false）｜ 存储里的留档=" + (b.存储里 === "null" ? "已清掉" : b.存储里));

  const ok = [b.红框, b.首页黄字].length === 2;
  console.log("\n=== 结论 ===");
  console.log(ok ? "四步都对：炸了会留档、首页看得见、点一下清掉" : "有一步不对，别信上面的结论");
  win.close();
})().catch((e) => { console.error("验证脚本挂了：", e); process.exit(1); });
