/* 验证（2026-10-11d）：百词斩式长按——释义显示在"按的那个词自己格子里"
   ① 题干：鼠标按住0.7s → #qPeek 出释义(open+含＝)；松手200ms → 收起(不再open)
   ② 选项：按住0.7s → 按钮自己就地展开（class 含 peeking、内容变成 英文＝中文+状态），#qPeek 不打开（不跑到题干下面）；
      松手200ms → 按钮恢复原内容、peeking 移除；且按钮没被误选
   ③ 念单词：注入假 speechSynthesis，render 跳词应调用 speak
   抓控制台报错。 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const DBG = 9383;
const SRV = 8113;
const OUT = path.join(ROOT, "day24-review");

const sleep = ms => new Promise(r => setTimeout(r, ms));
const MIME = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css" };

function startServer() {
  const s = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p === "/") p = "/index.html";
    const fp = path.join(ROOT, p);
    if (!fp.startsWith(ROOT) || !fs.existsSync(fp)) { res.writeHead(404); res.end("nf"); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(fp)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(fs.readFileSync(fp));
  });
  return new Promise(r => s.listen(SRV, r));
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const edge = spawn(EDGE, [
    "--headless=new", "--remote-debugging-port=" + DBG, "--user-data-dir=" + path.join(OUT, "_edge_profile_lp"),
    "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--window-size=900,1500", "about:blank"
  ], { stdio: "ignore" });

  let targets = null;
  for (let i = 0; i < 40; i++) {
    try { targets = await (await fetch("http://127.0.0.1:" + DBG + "/json/list")).json(); break; }
    catch (e) { await sleep(500); }
  }
  const page = targets.find(t => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const waiters = new Map();
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && waiters.has(m.id)) { waiters.get(m.id)(m); waiters.delete(m.id); } };
  const send = (method, params) => new Promise(res => { const mid = ++id; waiters.set(mid, m => res(m)); ws.send(JSON.stringify({ id: mid, method, params: params || {} })); });
  const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); return r.result && r.result.result ? r.result.result.value : undefined; };
  await new Promise(r => ws.onopen = r);
  await send("Runtime.enable", {});

  let errors = [];
  ws.onmessage = (orig => ev2 => { const m = JSON.parse(ev2.data); if (m.id && waiters.has(m.id)) { waiters.get(m.id)(m); waiters.delete(m.id); } if (m.method === "Runtime.consoleAPICalled" && m.params && m.params.type === "error") errors.push(m.params.args.map(a => a.value || a.description).join(" ")); if (m.method === "Runtime.exceptionThrown") errors.push("EXC:" + (m.params.exceptionDetails && m.params.exceptionDetails.text)); })(ws.onmessage);

  await send("Page.enable", {});
  await send("Page.addScriptToEvaluateOnNewDocument", { source:
    "Object.defineProperty(window,'speechSynthesis',{configurable:true,get:function(){return {cancel:function(){},speak:function(u){window.__speakCalls=(window.__speakCalls||0)+1;window.__lastSpoken=u&&u.text;}};}});" +
    "Object.defineProperty(window,'SpeechSynthesisUtterance',{configurable:true,value:function(t){this.text=t;}});"
  });

  const openStudy = async () => {
    await send("Page.navigate", { url: "http://127.0.0.1:" + SRV + "/index.html#/study" });
    for (let i = 0; i < 60; i++) {
      const ok = await ev(`(function(){var w=document.querySelector('#qWord');var p=document.querySelector('#qPeek');var o=document.querySelector('#qOptions .option-btn');return !!(w&&p&&o&&window.Store);})()`);
      if (ok) break; await sleep(500);
    }
    await sleep(400);
  };
  const centerOf = async (sel) => JSON.parse(await ev(`(function(){var w=document.querySelector(${sel});var r=w.getBoundingClientRect();return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)});})()`));
  const peekState = () => ev(`(function(){var p=document.querySelector('#qPeek');return {open:p.classList.contains('open'),text:p.textContent};})()`);

  // ---- ① 题干：出 → 松手消失 ----
  await openStudy();
  let c = await centerOf("'#qWord'");
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: c.x, y: c.y, button: "left" });
  await sleep(700);
  const midShown = await peekState();
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: c.x, y: c.y, button: "left" });
  await sleep(250);
  const midGone = await peekState();
  console.log("[① 题干] 按住0.7s出释义 open=", midShown.open, "含＝=", midShown.text.indexOf("＝") >= 0,
    "| 松手后收起 open=", midGone.open, "→", (midShown.open && midShown.text.indexOf("＝") >= 0 && !midGone.open) ? "✅按住出/松手没" : "❌");

  // ---- ② 选项：就地展开（百词斩式）→ 松手恢复 + 不误选 + 不跑题干下面 ----
  await openStudy();
  const origHTML = await ev(`document.querySelector('#qOptions .option-btn').innerHTML`);
  let oc = await centerOf("'#qOptions .option-btn'");
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: oc.x, y: oc.y, button: "left" });
  await sleep(700);
  const btnShown = await ev(`(function(){var b=document.querySelector('#qOptions .option-btn');var p=document.querySelector('#qPeek');return {peeking:b.classList.contains('peeking'),html:b.innerHTML,hasEq:b.innerHTML.indexOf('＝')>=0,peekOpen:p.classList.contains('open')};})()`);
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: oc.x, y: oc.y, button: "left" });
  await sleep(250);
  const btnGone = await ev(`(function(){var b=document.querySelector('#qOptions .option-btn');return {peeking:b.classList.contains('peeking'),disabled:b.disabled};})()`);
  const restoredHTML = await ev(`document.querySelector('#qOptions .option-btn').innerHTML`);
  const optNotChosen = btnGone.disabled;
  console.log("[② 选项] 按住0.7s就地展开 peeking=", btnShown.peeking, "内容含＝=", btnShown.hasEq,
    "| 题干下固定框没开 peekOpen=", !btnShown.peekOpen,
    "| 松手后恢复 peeking=", btnGone.peeking, "内容还原=", restoredHTML === origHTML, "| 没误选(disabled)=", optNotChosen,
    "→", (btnShown.peeking && btnShown.hasEq && !btnShown.peekOpen && !btnGone.peeking && restoredHTML === origHTML && !optNotChosen) ? "✅百词斩式：选项就地展开/松手恢复/不跑题干下面/没误选" : "❌");

  // ---- ③ 念单词 ----
  const calls = await ev(`window.__speakCalls`);
  const last = await ev(`window.__lastSpoken`);
  console.log("[③ 念单词] speak 调用次数 =", calls, "| 最后念 =", JSON.stringify(last));

  console.log("[控制台报错]", errors.length ? errors : "无");

  try { ws.close(); } catch (e) {}
  try { edge.kill(); } catch (e) {}
  try { server.close(); } catch (e) {}
  console.log("验证结束。");
  process.exit(0);
})().catch(e => { console.error("出错了：" + e.message); process.exit(1); });
