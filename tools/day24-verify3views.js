/* Day 24 回归②：quiz.js 是三视图共用零件，长按改动必须三页都验证（不测空态）
   study：直接有词；review：先 Store.addWrong 造错题；daily：先 Store.markLearned 造已学词。
   每页都用真实坐标稳按 0.7s，看 #qPeek 是否显示释义。 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const DBG = 9373;
const SRV = 8103;
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
    "--headless=new", "--remote-debugging-port=" + DBG, "--user-data-dir=" + path.join(OUT, "_edge_profile"),
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

  await send("Page.navigate", { url: "http://127.0.0.1:" + SRV + "/index.html#/study" });
  for (let i = 0; i < 60; i++) {
    const ok = await ev(`!!(document.querySelector('#qWord')&&window.Store)`);
    if (ok) break; await sleep(500);
  }

  const goto = async (hash) => {
    await ev(`location.hash='${hash}'`);
    for (let i = 0; i < 30; i++) {
      const ok = await ev(`!!document.querySelector('#qWord')`);
      if (ok) break; await sleep(400);
    }
    await sleep(500); // router 有 400ms 转圈，等不够会读到上一页
  };
  const pressAndPeek = async () => {
    const c = JSON.parse(await ev(`(function(){var r=document.querySelector('#qWord').getBoundingClientRect();return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)});})()`));
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: c.x, y: c.y, button: "left" });
    await sleep(700);
    const t = await ev(`document.querySelector('#qPeek').textContent`);
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: c.x, y: c.y, button: "left" });
    return t;
  };
  const shot = async (name) => {
    const s = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(OUT, name), Buffer.from(s.result.data, "base64"));
  };

  // ---- ① study（新词学习）----
  let t = await pressAndPeek();
  console.log("[study 新词学习] #qPeek =", JSON.stringify(t), "→", t.indexOf("＝") >= 0 ? "✅" : "❌");

  // ---- ② review（错题复习）：先造错题再进 ----
  await ev(`Store.addWrong('manage'); Store.addWrong('active');`);
  await goto("#/review");
  t = await pressAndPeek();
  console.log("[review 错题复习] #qPeek =", JSON.stringify(t), "→", t.indexOf("＝") >= 0 ? "✅" : "❌");
  await shot("修复后-回归-错题复习.png");

  // ---- ③ daily（每日复习）：先造已学词再进 ----
  await ev(`Store.markLearned('manage'); Store.markLearned('active');`);
  await goto("#/daily");
  t = await pressAndPeek();
  console.log("[daily 每日复习] #qPeek =", JSON.stringify(t), "→", t.indexOf("＝") >= 0 ? "✅" : "❌");
  await shot("修复后-回归-每日复习.png");

  try { ws.close(); } catch (e) {}
  try { edge.kill(); } catch (e) {}
  try { server.close(); } catch (e) {}
  console.log("三视图回归结束。");
  process.exit(0);
})().catch(e => { console.error("出错了：" + e.message); process.exit(1); });
