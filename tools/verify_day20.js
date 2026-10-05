/* Day 20 验证：真开「公网」api.html，确认①云通②无跨域红字③请求走公网地址④真数据。
   可重复用：node tools/verify_day20.js <页面URL> <标签>
   例：node tools/verify_day20.js https://cet4-word-helper.app.workbuddy.host/api.html pre
       node tools/verify_day20.js https://cet4-word-helper.app.workbuddy.host/api.html post
   起手照搬已验证的 shot_day19.js（--user-data-dir + /json/list + CDP WebSocket）。 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 9360;
const PAGE = process.argv[2] || "https://cet4-word-helper.app.workbuddy.host/api.html";
const TAG = process.argv[3] || "day20";
const PROFILE = path.join(ROOT, "day20-review/_edge_tmp_profile");
const SHOT = path.join(ROOT, "day20-review/" + TAG + "-公网首页.png");
const NETLOG = path.join(ROOT, "day20-review/" + TAG + "-网络请求.txt");

fs.mkdirSync(path.join(ROOT, "day20-review"), { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const argStr = a => (a && a.value !== undefined) ? String(a.value) : (a && a.description ? a.description : "");

(async () => {
  const edge = spawn(EDGE, [
    "--headless=new", "--remote-debugging-port=" + PORT, "--user-data-dir=" + PROFILE,
    "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--window-size=820,1500",
    "about:blank"
  ], { stdio: "ignore" });

  let targets = null;
  for (let i = 0; i < 40; i++) {
    try { targets = await (await fetch("http://127.0.0.1:" + PORT + "/json/list")).json(); break; }
    catch (e) { await sleep(500); }
  }
  const page = targets.find(t => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const waiters = new Map(); const events = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && waiters.has(m.id)) { waiters.get(m.id)(m); waiters.delete(m.id); }
    else if (m.method) { events.push(m); }
  };
  const send = (method, params) => new Promise(res => { const mid = ++id; waiters.set(mid, m => res(m)); ws.send(JSON.stringify({ id: mid, method: method, params: params || {} })); });
  const ev = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  await new Promise(r => ws.onopen = r);
  await send("Page.enable", {});
  await send("Runtime.enable", {});
  await send("Network.enable", {});

  /* 真开公网页 */
  await send("Page.navigate", { url: PAGE });
  await sleep(4000);
  for (let i = 0; i < 40; i++) {
    const s = await ev(`(function(){ return String(typeof window.WorkBuddyCloud); })()`);
    if (s === "function") { console.log("云小工具加载好（探 " + (i + 1) + " 次）"); break; }
    await sleep(800);
  }
  /* 显式点两个读按钮，确保真去云里取（不点 POST，不污染云） */
  await ev(`document.getElementById("btnPlan").click(); return "ok";`);
  await sleep(1200);
  await ev(`document.getElementById("btnRec").click(); return "ok";`);
  await sleep(3000);

  /* 读页面上的真东西 */
  const outJson = await ev(`(function(){ var j=document.getElementById("outJson"); return j?String(j.textContent):""; })()`) || "";
  const outTitle = await ev(`(function(){ var j=document.getElementById("outTitle"); return j?String(j.textContent):""; })()`) || "";
  const ver = await ev(`(function(){ return String(window.VER||(document.getElementById("verFoot")&&document.getElementById("verFoot").textContent)||"?"); })()`) || "?";
  const health = await ev(`(function(){ var j=document.getElementById("healthTxt"); return j?String(j.textContent):"(无健康块)"; })()`) || "(无健康块)";
  const lastUpd = await ev(`(function(){ var j=document.getElementById("lastUpd"); return j?String(j.textContent):"(无更新时间块)"; })()`) || "(无更新时间块)";

  /* 网络请求：只挑跟云有关的，确认走的是公网还是 localhost */
  const reqs = events.filter(m => m.method === "Network.requestWillBeSent").map(m => m.params && m.params.request ? m.params.request.url : "");
  const cloudReqs = reqs.filter(u => /workbuddy|\.cloud|rest\//.test(u));
  const localhostReqs = cloudReqs.filter(u => /localhost|127\.0\.0\.1/.test(u));
  fs.writeFileSync(NETLOG, "全部云相关请求地址：\n" + cloudReqs.join("\n") + "\n\n其中 localhost/127.0.0.1 的：\n" + (localhostReqs.join("\n") || "（无）") + "\n");

  /* 控制台/异常：找跨域红字 */
  const errs = [];
  events.filter(m => m.method === "Runtime.consoleAPICalled" && m.params && m.params.type === "error")
    .forEach(m => m.params.args.forEach(a => errs.push(argStr(a))));
  events.filter(m => m.method === "Runtime.exceptionThrown")
    .forEach(m => { const d = m.params && m.params.exceptionDetails; errs.push((d && (d.text + " " + (d.exception && d.exception.description || ""))) || "exception"); });
  const corsHits = errs.filter(e => /cors|access-control|blocked by/i.test(e));

  /* 截图：顶部叠加地址栏 + 版本 + 健康 + 更新时间 */
  await ev(`(function(){
    var d=document.createElement('div');
    d.style.cssText='position:fixed;top:0;left:0;right:0;background:#1a1a1a;color:#0f0;font:12px monospace;padding:4px 8px;z-index:99999;white-space:pre-wrap';
    d.textContent='地址栏: '+location.href+'\\n版本 '+('$ver')+'\\n健康: '+('$health')+'\\n更新: '+('$lastUpd');
    document.body.appendChild(d);
  })();`);
  await sleep(400);
  const s = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(SHOT, Buffer.from(s.result.data, "base64"));

  /* 结论 */
  const okReal = /"ok"\s*:\s*true/.test(outJson);
  console.log("==== Day 20 验证 [" + TAG + "] ====");
  console.log("页面地址栏: " + PAGE);
  console.log("版本: " + ver);
  console.log("取到真数据(outJson 含 ok:true): " + okReal);
  console.log("outTitle: " + outTitle.slice(0, 60));
  console.log("健康块: " + health);
  console.log("更新时间块: " + lastUpd);
  console.log("云请求条数: " + cloudReqs.length + "；其中 localhost: " + localhostReqs.length);
  console.log("跨域红字命中的条数: " + corsHits.length);
  if (corsHits.length) console.log("跨域红字样本:\n  " + corsHits.slice(0, 3).join("\n  "));
  console.log("黑框前 160 字:\n  " + outJson.slice(0, 160).replace(/\n/g, "\n  "));
  console.log("截图: " + SHOT);

  ws.close(); edge.kill();
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}
  process.exit(0);
})().catch(e => { console.error("出错了：" + e.message); process.exit(1); });
