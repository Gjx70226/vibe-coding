/* 在 jsdom 里装一份和线上一模一样的云端小工具，跑一遍控制台那段话，
   看它能不能真把两张表的行读出来（不登录、不写任何东西） */
const { JSDOM } = require("jsdom");
/* 云端小工具每次都从网上现拿（跟 index.html 第 57 行引的是同一个地址），
   不往仓库里存拷贝——所以这里用完就扔，不留临时文件。 */
const SDK_URL = "https://cdn.jsdelivr.net/npm/@tencent-ai/workbuddy-cloud-sdk@dev/lib/index.global.js";

const CODE = `(async () => {
  const c = WorkBuddyCloud.createWorkBuddyCloud({
    endpoint: "https://cet4-word-helper.app.workbuddy.host",
    publishableKey: "wbpk_O12WtR6v99Wu8kmCZRjKgH_sg9Rb6ux7sTaa09hgVS0BCVep93u20G3"
  });
  const a = await c.database.from("plan_days").select("*");
  const b = await c.database.from("checkins").select("*");
  return {
    planN: a && a.data ? a.data.length : "读不到",
    checkinN: b && b.data ? b.data.length : "读不到",
    plan2: a && a.data ? JSON.stringify(a.data.slice(0, 2)) : "",
    checkin2: b && b.data ? JSON.stringify(b.data.slice(0, 2)) : ""
  };
})()`;

(async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { runScripts: "dangerously", url: "https://cet4-word-helper.app.workbuddy.host/index.html" });
  const w = dom.window;
  w.fetch = (...a) => fetch(...a);
  const sdkText = await (await fetch(SDK_URL)).text();
  w.eval(sdkText);
  const has = typeof w.WorkBuddyCloud !== "undefined" && typeof w.WorkBuddyCloud.createWorkBuddyCloud === "function";
  console.log("小工具装好了没：", has ? "装好了（跟线上页面用的是同一个包）" : "没装上");
  if (!has) { w.close(); return; }
  try {
    const o = await w.eval(CODE);
    console.log("plan_days 查到行数 =", o.planN);
    console.log("checkins  查到行数 =", o.checkinN);
    console.log("plan_days 前两行 =", o.plan2);
    console.log("checkins  前两行 =", o.checkin2);
  } catch (e) { console.log("跑这段报错：", e && e.message); }
  w.close();
})();
