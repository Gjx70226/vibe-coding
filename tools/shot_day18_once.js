/* 精确数一遍：页面上点一下「记一笔」，云里那一行到底加几次？
   点之前查一次、点之后查一次（都走云端真表，不靠页面自己报的数）。
   跑法：node tools/shot_day18_once.js
   ============================================================ */

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 9334;
const PAGE = "https://cet4-word-helper.app.workbuddy.host/api.html";
const PROFILE = path.join(ROOT, "day18-review/_edge_tmp_profile2");

const sleep = ms => new Promise(r => setTimeout(r, ms));
const say = t => console.log(t);

(async () => {
  fs.rmSync(PROFILE, { recursive: true, force: true });
  const edge = spawn(EDGE, [
    "--headless=new", "--remote-debugging-port=" + PORT, "--user-data-dir=" + PROFILE,
    "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--window-size=900,1200",
    "about:blank"
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
  const send = (method, params) => new Promise(res => { const mid = ++id; waiters.set(mid, m => res(m)); ws.send(JSON.stringify({ id: mid, method: method, params: params || {} })); });
  const ev = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  await new Promise(r => ws.onopen = r);
  await send("Page.navigate", { url: PAGE });
  await sleep(9000);
  say("线上页面打开好了");

  /* 数这一行现在的对的次数（走云端真表，不靠页面自己报的数） */
  const cnt = () => new Promise(res => {
    const expr = `(function(){
      var c = window.__c || (window.__c = null);
      return new Promise(function(f){
        if (!window.Api) { f(-1); return; }
        window.Api.getRecords({ }, function(r){
          if (!r.ok) { f(-2); return; }
          var it = r.data.items.filter(function(x){ return x.id === 13; })[0];
          f(it ? it.correct_count : -3);
        });
      });
    })()`;
    ev(expr).then(res);
  });

  const before = await cnt();
  say("① 点之前，云里 id=13 那一行 对的次数 = " + before);

  await ev(`(function(){
    var q=function(i){return document.getElementById(i);};
    q("inPid").value="6"; q("inWord").value="important"; q("inPos").value="adj";
    q("selRight").value="true"; q("selMode").value="new";
    document.getElementById("btnPost").click();
    return "点了一下";
  })()`);
  say("② 点了一下「记一笔」（同一个词 important，答对）");
  await sleep(7000);

  const after = await cnt();
  say("③ 点之后，云里 id=13 那一行 对的次数 = " + after);
  say("");
  say("【判定】点一下，加了 " + (after - before) + " 次" +
      (after - before === 1 ? " ✔ 一次点击 = 加一次，对得上" : " ✘ 一次点击不是加一次，要查"));

  ws.close(); edge.kill();
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}
  process.exit(0);
})().catch(e => { console.error("出错了：" + e.message); process.exit(1); });
