/* 验证（2026-10-11e）：中文模式（zh2en，复习/每日页）长按浮层应「不含 ＝中文」
   ① 题干（中文）：按住0.7s → #qPeek 出释义(open)，但内容【不含＝】，只含英文+音标+状态；松手消失
   ② 选项（英文）：按住0.7s → 按钮就地展开 peeking，内容【不含＝】，#qPeek 不打开；松手恢复、不误选
   ③ 念单词：注入假 speechSynthesis，render 跳词应调用 speak（zh2en 念中文）
   抓控制台报错。 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const DBG = 9384;
const SRV = 8114;
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
    "--headless=new", "--remote-debugging-port=" + DBG, "--user-data-dir=" + path.join(OUT, "_edge_profile_zh2en"),
    "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--window-size=900,1500", "about:blank"
  ], { stdio: "ignore" });

  let targets = null;
  for (let i = 0; i < 40; i++) {
    try { const resp = await fetch("http://127.0.0.1:" + DBG + "/json/list"); const txt = await resp.text(); targets = JSON.parse(txt); break; }
    catch (e) { await sleep(500); }
  }
  if (!targets) { console.error("拿不到 edge 调试目标，可能端口被占或 edge 没起来"); process.exit(1); }
  console.log("targets 类型:", targets.map(t => t.type).join(","));
  const page = targets.find(t => t.type === "page") || targets[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const waiters = new Map();
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && waiters.has(m.id)) { waiters.get(m.id)(m); waiters.delete(m.id); } };
  const send = (method, params) => new Promise(res => { const mid = ++id; waiters.set(mid, m => res(m)); ws.send(JSON.stringify({ id: mid, method, params: params || {} })); });
  const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); return r.result && r.result.result ? r.result.result.value : undefined; };
  await new Promise(r => ws.onopen = r);
  await send("Runtime.enable", {});

  let errors = [];
  ws.onmessage = (orig => ev2 => {
    const data = ev2 && ev2.data;
    if (typeof data !== "string") return;
    let m; try { m = JSON.parse(data); } catch (e) { return; }
    if (m.id && waiters.has(m.id)) { waiters.get(m.id)(m); waiters.delete(m.id); }
    if (m.method === "Runtime.consoleAPICalled" && m.params && m.params.type === "error") errors.push(m.params.args.map(a => a.value || a.description).join(" "));
    if (m.method === "Runtime.exceptionThrown") errors.push("EXC:" + (m.params.exceptionDetails && m.params.exceptionDetails.text));
  })(ws.onmessage);

  await send("Page.enable", {});
  await send("Page.addScriptToEvaluateOnNewDocument", { source:
    "Object.defineProperty(window,'speechSynthesis',{configurable:true,get:function(){return {cancel:function(){},speak:function(u){window.__speakCalls=(window.__speakCalls||0)+1;window.__lastSpoken=u&&u.text;}};}});" +
    "Object.defineProperty(window,'SpeechSynthesisUtterance',{configurable:true,value:function(t){this.text=t;}});"
  });

  const openDaily = async () => {
    // daily 页只挂载"已学过的词"，headless 空存档下不会出答题卡。
    // 先到 study 页把应用全局（Store / WORDS）拉起来，再 seed 一批已学词，最后进 daily。
    await send("Page.navigate", { url: "http://127.0.0.1:" + SRV + "/index.html#/study" });
    for (let i = 0; i < 60; i++) {
      const ok = await ev(`(function(){return !!window.Store;})()`);
      if (ok) break; await sleep(500);
    }
    // 注：words.js 里是 `const WORDS`，不会挂到 window，eval 里直接用裸名 WORDS 即可
    const seeded = await ev(`(function(){var n=0;for(var i=0;i<WORDS.length&&n<25;i++){try{window.Store.markLearned(WORDS[i].word);n++;}catch(e){}}return n;})()`);
    const diag = await ev(`(function(){try{return JSON.stringify({learned:window.Store.getLearned().length, daily:window.Store.dailyWords().length});}catch(e){return 'ERR:'+e.message;}})()`);
    console.log("seed 诊断：seeded=", seeded, "getLearned/dailyWords=", diag);
    await send("Page.navigate", { url: "http://127.0.0.1:" + SRV + "/index.html#/daily" });
    for (let i = 0; i < 60; i++) {
      const ok = await ev(`(function(){var w=document.querySelector('#qWord');var p=document.querySelector('#qPeek');var o=document.querySelector('#qOptions .option-btn');return !!(w&&p&&o);})()`);
      if (ok) break; await sleep(500);
    }
    await sleep(400);
    return seeded;
  };
  const centerOf = async (sel) => {
    const out = await ev(`(function(){var w=document.querySelector(${sel});if(!w)return 'NOEL';var r=w.getBoundingClientRect();return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)});})()`);
    if (typeof out !== "string" || out === "NOEL") throw new Error("找不到元素 " + sel + "（daily 页可能没渲染答题卡）");
    return JSON.parse(out);
  };
  const peekState = () => ev(`(function(){var p=document.querySelector('#qPeek');return {open:p.classList.contains('open'),text:p.textContent};})()`);

  // ---- ① 题干（中文模式）：出 → 但【不含＝】 → 松手消失 ----
  await openDaily();
  let c = await centerOf("'#qWord'");
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: c.x, y: c.y, button: "left" });
  await sleep(700);
  const midShown = await peekState();
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: c.x, y: c.y, button: "left" });
  await sleep(250);
  const midGone = await peekState();
  console.log("[① 题干/中文模式] 按住0.7s出 open=", midShown.open, "【不含＝】=", midShown.text.indexOf("＝") < 0,
    "| 松手后收起 open=", midGone.open,
    "→", (midShown.open && midShown.text.indexOf("＝") < 0 && !midGone.open) ? "✅中文模式长按只给英文+音标+状态，不复述中文" : "❌");

  // ---- ② 选项（中文模式）：就地展开且【不含＝】 → 松手恢复 + 不误选 ----
  await openDaily();
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
  console.log("[② 选项/中文模式] 按住就地展开 peeking=", btnShown.peeking, "【内容不含＝】=", !btnShown.hasEq,
    "| 题干下框没开 peekOpen=", !btnShown.peekOpen,
    "| 松手恢复 peeking=", btnGone.peeking, "内容还原=", restoredHTML === origHTML, "| 没误选=", !optNotChosen,
    "→", (btnShown.peeking && !btnShown.hasEq && !btnShown.peekOpen && !btnGone.peeking && restoredHTML === origHTML && !optNotChosen) ? "✅中文模式选项长按：就地展开英文+音标+状态，不显示中文" : "❌");

  // ---- ③ 念单词（zh2en 应念中文）----
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
