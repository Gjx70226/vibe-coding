/* Day 17 板块① 验证：开着本地真页面（index.html 会自己把词库、云的上
   小工具都加载好），再往里头装仓库里这份 api.js，真发一趟网络去云端
   那两张表取数。只打印眼前真能看见的字——不猜、不补。 */
const { JSDOM } = require("jsdom");
const fs = require("fs");

const PAGE = "http://127.0.0.1:8010/index.html";

(async () => {
  const dom = await JSDOM.fromURL(PAGE, {
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true,
    beforeParse(w) { w.fetch = (...a) => fetch(...a); }   // jsdom 里补一个真 fetch
  });
  const w = dom.window;
  await new Promise(r => setTimeout(r, 1500));            // 等页面把零件都装好

  const hasWords = w.eval("typeof WORDS");
  console.log("① 页面自己装好了没：");
  console.log("   词库（words.js）：", hasWords === "object" ? "装好了，" + w.eval("WORDS.length") + " 个词" : "没装上");
  console.log("   云的小工具（CDN）：", typeof w.WorkBuddyCloud !== "undefined" ? "装好了" : "没装上");

  w.eval(fs.readFileSync("api.js", "utf8"));
  const hasApi = typeof w.Api !== "undefined" && typeof w.Api.getPlanToday === "function";
  console.log("   api.js（仓库里这份）：", hasApi ? "装好了，两个读接口都在" : "没装上");
  if (!hasApi) { w.close(); return; }

  /* 第 2 项：今日计划 */
  await new Promise(r => {
    w.Api.getPlanToday(res => {
      console.log("\n② 接口一 今日计划（读 plan_days）:");
      console.log("   整段回话：", JSON.stringify(res).slice(0, 260));
      if (!res.ok) { console.log("   没取到，error =", res.error, "| msg =", res.msg); r(); return; }
      console.log("   ok 位 = true｜data 里：" +
        "date=" + res.data.date + "，target_new=" + res.data.target_new +
        "，start_index=" + res.data.start_index + "，words 给了 " + res.data.words.length + " 条");
      if (res.data.words.length) console.log("   头一条词卡：", JSON.stringify(res.data.words[0]));
      r();
    });
  });

  /* 第 3 项：学习记录，默认参数 */
  await new Promise(r => {
    w.Api.getRecords({}, res => {
      if (!res.ok) {
        console.log("\n③ 接口二（默认）：没取到，error =", res.error, "| msg =", res.msg); r(); return;
      }
      const d = res.data;
      console.log("\n③ 接口二 学习记录（默认 limit=20）:");
      console.log("   ok 位 = true｜total =", d.total, "｜实际给了", d.items.length, "条｜offset/limit =", d.offset + "/" + d.limit);
      console.log("   头一条：", JSON.stringify(d.items[0] || null));
      r();
    });
  });

  /* 第 4 项：带三个条件 */
  await new Promise(r => {
    w.Api.getRecords({ date: "2026-10-04", offset: 0, limit: 2 }, res => {
      if (!res.ok) { console.log("\n④ 带参数：没取到", res.error, res.msg); r(); return; }
      const d = res.data;
      console.log("\n④ 接口二 带 date=2026-10-04&offset=0&limit=2:");
      console.log("   total =", d.total, "｜实际给了", d.items.length, "条（<=2 就是 limit 生效了）");
      console.log("   头一条：", JSON.stringify(d.items[0] || null));
      r();
    });
  });

  /* 第 5 项：参数超范围 —— 必须回错误形状，不能白屏 */
  await new Promise(r => {
    w.Api.getRecords({ limit: 999 }, res => {
      console.log("\n⑤ 故意传 limit=999:");
      console.log("   整段回话：", JSON.stringify(res));
      r();
    });
  });

  /* 第 6 项：故意问一张瞎写的表 —— 看 api.js 会不会把英文翻成中文人话 */
  await new Promise(r => {
    const c = w.WorkBuddyCloud.createWorkBuddyCloud({
      endpoint: "https://cet4-word-helper.app.workbuddy.host",
      publishableKey: "wbpk_O12WtR6v99Wu8kmCZRjKgH_sg9Rb6ux7sTaa09hgVS0BCVep93u20G3"
    });
    c.database.from("这张表其实是瞎写的").select("*").limit(1)
      .then(out => {
        const realErr = out && out.error;
        const after = w.Api._readCloudErr(realErr);
        console.log("\n⑥ 故意问一张瞎写的表:");
        console.log("   云端原话（没经过本文件）：", JSON.stringify(realErr).slice(0, 180));
        console.log("   经过 api.js 翻成：", JSON.stringify(after));
        r();
      })
      ["catch"](e => { console.log("\n⑥ 请求直接抛了 →", e && e.message); r(); });
  });

  w.close();
})();
