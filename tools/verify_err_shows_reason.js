// 今日问题：手机上出红框只写「请检查网络」，真凶被吞掉，怎么查都查不出来。
// 方案：造两种真会炸的情况（视图不存在 / render 抛异常），看红条下那行小字有没有把原因说出来。
// 今日边界：只看红条文案与可见性，不测渲染像素。
/* eslint-disable no-console */
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

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

  const readErr = () => {
    const box = doc.getElementById("errorBox");
    const d = doc.getElementById("errDetail");
    return {
      红条显示: box && !box.hidden,
      小字: d ? d.textContent : "(没有 errDetail 这个盒子)"
    };
  };

  // 先存住真身，后面三个场景要用它还原
  const realStudyView = win.StudyView;

  console.log("=== 场景1：视图不存在（假装 study.js 没加载）===");
  delete win.StudyView;
  win.location.hash = "#/study";
  await sleep(700);
  console.log("  " + JSON.stringify(readErr(), null, 0));

  console.log("\n=== 场景2：render 抛异常（模拟手机上报的错）===");
  win.location.hash = "#/";
  await sleep(700);
  const boomView = { render: function () { throw new Error("boom: 手机浏览器不支持 xxx"); } };
  win.StudyView = boomView;
  win.location.hash = "#/study";
  await sleep(700);
  console.log("  " + JSON.stringify(readErr(), null, 0));

  console.log("\n=== 场景3：好好的学习页（还原真 StudyView 后，不该出红条）===");
  win.StudyView = realStudyView;
  win.location.hash = "#/";
  await sleep(700);
  win.location.hash = "#/study";
  await sleep(700);
  console.log("  红条显示 = " + readErr().红条显示 + "（应为 false）");
  console.log("  小字     = " + readErr().小字 + "（应为空）");
  const opts = doc.querySelectorAll("#qOptions .option-btn");
  console.log("  四个选项 = " + (Array.from(opts).map((b) => b.textContent.replace(/\s+/g, " ").trim()).join(" ; ") || "(没有)"));

  console.log("\n=== jsdom 报错 ===");
  console.log(errs.length ? errs.join("\n") : "无");
  win.close();
})().catch((e) => {
  console.error("验证脚本自己挂了：", e);
  process.exit(1);
});
