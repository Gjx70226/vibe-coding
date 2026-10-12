/* 验证两件事（2026-10-11）：
   ① 长按 peek：桌面稳按 0.7s，#qPeek 应出现「＝...」释义（新代码去掉了 pointercancel 误杀）
   ② 念单词：注入假 speechSynthesis，render 跳到新词时应调用 speak，且念的是当前词
   同时抓控制台报错。 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const DBG = 9381;
const SRV = 8111;
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
    "--headless=new", "--remote-debugging-port=" + DBG, "--user-data-dir=" + path.join(OUT, "_edge_profile_tts"),
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

  // 抓控制台报错
  let errors = [];
  ws.onmessage = (orig => ev2 => { const m = JSON.parse(ev2.data); if (m.id && waiters.has(m.id)) { waiters.get(m.id)(m); waiters.delete(m.id); } if (m.method === "Runtime.consoleAPICalled" && m.params && m.params.type === "error") errors.push(m.params.args.map(a => a.value || a.description).join(" ")); if (m.method === "Runtime.exceptionThrown") errors.push("EXC:" + (m.params.exceptionDetails && m.params.exceptionDetails.text)); })(ws.onmessage);

  // 注入假语音引擎（document-start，先于 quiz.js 执行，让 quiz.js 捕获到 mock）
  await send("Page.enable", {});
  await send("Page.addScriptToEvaluateOnNewDocument", { source:
    "Object.defineProperty(window,'speechSynthesis',{configurable:true,get:function(){return {cancel:function(){},speak:function(u){window.__speakCalls=(window.__speakCalls||0)+1;window.__lastSpoken=u&&u.text;}};}});" +
    "Object.defineProperty(window,'SpeechSynthesisUtterance',{configurable:true,value:function(t){this.text=t;}});"
  });

  const openStudy = async () => {
    await send("Page.navigate", { url: "http://127.0.0.1:" + SRV + "/index.html#/study" });
    for (let i = 0; i < 60; i++) {
      const ok = await ev(`(function(){var w=document.querySelector('#qWord');var p=document.querySelector('#qPeek');return !!(w&&p&&window.Store);})()`);
      if (ok) break; await sleep(500);
    }
    await sleep(400);
  };
  const center = async () => JSON.parse(await ev(`(function(){var w=document.querySelector('#qWord');var r=w.getBoundingClientRect();return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)});})()`));
  const peekText = () => ev(`document.querySelector('#qPeek').textContent`);
  const qWordText = () => ev(`document.querySelector('#qWord').textContent`);

  // ---- ① 长按 ----
  await openStudy();
  let c = await center();
  const before = await qWordText();
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: c.x, y: c.y, button: "left" });
  await sleep(700);
  const mid = await peekText();
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: c.x, y: c.y, button: "left" });
  console.log("[① 长按] 题干词 =", JSON.stringify(before), "| 长按中 #qPeek =", JSON.stringify(mid), "→", mid.indexOf("＝") >= 0 ? "✅触发释义" : "❌没触发");

  // ---- ② 念单词：render 时已调用 speak ----
  const calls = await ev(`window.__speakCalls`);
  const last = await ev(`window.__lastSpoken`);
  console.log("[② 念单词] speak 被调用次数 =", calls, "| 最后念的文本 =", JSON.stringify(last),
    "| 与当前题干一致 =", (last === before) ? "✅" : "⚠️(不一致)");

  console.log("[控制台报错]", errors.length ? errors : "无");

  try { ws.close(); } catch (e) {}
  try { edge.kill(); } catch (e) {}
  try { server.close(); } catch (e) {}
  console.log("验证结束。");
  process.exit(0);
})().catch(e => { console.error("出错了：" + e.message); process.exit(1); });
