/* 用真 Edge（无头）打开线上接口查看页，真点「取学习记录」，
   把「云里今天那一行记录」截下来 —— 图中这段字就是表里那几列原样回来的。
   跑法：node tools/shot_day18_rows.js
   存 day18-review/板块③-表里新增那一行.png
   ============================================================ */

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 9335;
const PAGE = "https://cet4-word-helper.app.workbuddy.host/api.html";
const SHOT = path.join(ROOT, "day18-review/板块③-表里新增那一行.png");
const PROFILE = path.join(ROOT, "day18-review/_edge_tmp_profile3");

const sleep = ms => new Promise(r => setTimeout(r, ms));
const say = t => console.log(t);

(async () => {
  fs.rmSync(PROFILE, { recursive: true, force: true });
  const edge = spawn(EDGE, [
    "--headless=new", "--remote-debugging-port=" + PORT, "--user-data-dir=" + PROFILE,
    "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--hide-scrollbars",
    "--window-size=900,1300", "about:blank"
  ], { stdio: "ignore" });

  let targets = null;
  for (let i = 0; i < 30; i++) {
    try { targets = await (await fetch("http://127.0.0.1:" + PORT + "/json/list")).json(); break; }
    catch (e) { await sleep(500); }
  }
  const page = targets.find(t => t.type === "page");

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const waiters = new Map();
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (waiters.has(m.id)) { waiters.get(m.id)(m); waiters.delete(m.id); } };
  const send = (m, p) => new Promise(res => { const mid = ++id; waiters.set(mid, x => res(x)); ws.send(JSON.stringify({ id: mid, method: m, params: p || {} })); });
  const ev = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  await new Promise(r => ws.onopen = r);
  await send("Page.navigate", { url: PAGE });
  await sleep(9000);
  say("线上页面打开好了");

  await ev('document.getElementById("btnRec").click()');
  say("点了「取学习记录」");
  await sleep(6000);

  const title = await ev('document.getElementById("outTitle").textContent');
  const json = await ev('document.getElementById("outJson").textContent');
  say("这一屏写着：「" + title + "」");
  say("云回的原话：" + json);

  const r = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(SHOT, Buffer.from(r.result.data, "base64"));
  say("截图存好了：" + SHOT);

  ws.close(); edge.kill();
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}
  process.exit(0);
})().catch(e => { console.error("出错了：" + e.message); process.exit(1); });
