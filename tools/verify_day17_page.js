/* 板块② 验证：真开 api.html 这一页，真点按钮，看页面上打出来的是不是云回的真数据。
   不测我编的东西，测用户眼前这一屏。 */
const { JSDOM } = require("jsdom");

const PAGE = "http://127.0.0.1:8010/api.html";

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const dom = await JSDOM.fromURL(PAGE, {
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true
  });
  const w = dom.window;
  w.fetch = (...a) => fetch(...a);          // jsdom 里补一个真网络
  // 那个网上小工具这次实测要 17 秒才下完，等短了会误报"没加载"（我自己脚本的锅，不是 CDN 的问题）
  await sleep(22000);

  const doc = w.document;
  const hasSdk = typeof w.WorkBuddyCloud !== "undefined";
  const hasApi = typeof w.Api !== "undefined";
  console.log("云的小工具加载出来没：", hasSdk ? "有" : "没有（CDN 没拉下来）");
  console.log("取数口子 Api 装好没：", hasApi ? "有" : "没有（api.js 没挂上）");
  if (!hasSdk || !hasApi) { console.log("页面上这两个都没有，先修这个再往下测"); w.close(); return; }

  console.log("页面版本号显示：", doc.getElementById("verFoot").textContent);

  async function clickAndRead(label, id, waitMs) {
    const btn = doc.getElementById(id);
    if (!btn) { console.log(label, "按钮没找到"); return; }
    btn.click();
    await sleep(waitMs || 3500);
    const title = doc.getElementById("outTitle").textContent;
    let txt = doc.getElementById("outJson").textContent;
    if (txt.length > 420) txt = txt.slice(0, 420) + " …（后面还有 " + (doc.getElementById("outJson").textContent.length - 420) + " 字）";
    console.log("\n───── " + label + " ─────");
    console.log("标题行：", title);
    console.log("页面打印出的原话：", txt);
  }

  await clickAndRead("按钮1 取「今日计划」", "btnPlan");
  await clickAndRead("按钮2 取「学习记录」（默认 limit=20）", "btnRec");
  await clickAndRead("按钮4 故意看错误 limit=999", "btnErr");

  /* 带参数：limit=2，页面上有输入框 */
  doc.getElementById("inLimit").value = "2";
  await clickAndRead("按钮3 再取一次（limit 改成 2）", "btnAgain");

  w.close();
})();
