/* Day 24 板块① 复现「长按 peek 失败」——证明根因是「长按期间微小移动即被取消」
   三个场景：
   A 桌面稳按不动 0.7s        → 预期：触发（证明逻辑在）
   B 桌面按住期间鼠标移出元素 → 预期：被 mouseleave 取消（复现"电脑没反应"）
   C 手机 touchstart + 微抖    → 预期：被 touchmove 取消（复现"手机没反应"）
   修复前证据截图：场景 C（手机失败） */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const DBG = 9372;
const SRV = 8102;
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

  const openStudy = async () => {
    await send("Page.navigate", { url: "http://127.0.0.1:" + SRV + "/index.html#/study" });
    for (let i = 0; i < 60; i++) {
      const ok = await ev(`(function(){var w=document.querySelector('#qWord');var p=document.querySelector('#qPeek');return !!(w&&p&&window.Store);})()`);
      if (ok) break; await sleep(500);
    }
    await sleep(300);
  };
  const center = async () => JSON.parse(await ev(`(function(){var w=document.querySelector('#qWord');var r=w.getBoundingClientRect();return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),w:Math.round(r.width),h:Math.round(r.height)});})()`));
  const peekText = () => ev(`document.querySelector('#qPeek').textContent`);

  // ---- 场景 A：桌面稳按不动 ----
  await openStudy();
  let c = await center();
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: c.x, y: c.y, button: "left" });
  await sleep(700);
  const aMid = await peekText();
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: c.x, y: c.y, button: "left" });
  console.log("[A 桌面稳按不动] 长按中 #qPeek =", JSON.stringify(aMid), "→", aMid.indexOf("＝") >= 0 ? "✅触发" : "❌没触发");

  // ---- 场景 B：桌面按住期间鼠标移出元素（真实浏览器必派发 mouseleave）----
  // CDP 的坐标移动不会真实触发元素的 mouseleave（无命中测试离开），
  // 故用合成事件精确模拟「真实一抖/移出」= 浏览器会派发的 mouseleave。
  await openStudy();
  c = await center();
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: c.x, y: c.y, button: "left" });
  await sleep(150);
  await ev(`document.querySelector('#qWord').dispatchEvent(new MouseEvent('mouseleave',{bubbles:false}));`);
  await sleep(600);
  const bMid = await peekText();
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: c.x, y: c.y, button: "left" });
  console.log("[B 桌面按住移出元素] 长按中 #qPeek =", JSON.stringify(bMid), "→", bMid.indexOf("＝") >= 0 ? "✅触发" : "❌被取消(复现电脑没反应)");

  // ---- 场景 C：手机 touchstart + 手指微抖（真实必派发 touchmove）----
  await openStudy();
  c = await center();
  await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: c.x, y: c.y }] });
  await sleep(120);
  await ev(`document.querySelector('#qWord').dispatchEvent(new Event('touchmove',{bubbles:false}));`);
  await sleep(700);
  const cMid = await peekText();
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  console.log("[C 手机 touchstart+微抖] 长按中 #qPeek =", JSON.stringify(cMid), "→", cMid.indexOf("＝") >= 0 ? "✅触发" : "❌被取消(复现手机没反应)");
  const shot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(OUT, "修复后-长按回归.png"), Buffer.from(shot.result.data, "base64"));
  console.log("截图存：day24-review/修复后-长按回归.png");

  try { ws.close(); } catch (e) {}
  try { edge.kill(); } catch (e) {}
  try { server.close(); } catch (e) {}
  console.log("复现结束。");
  process.exit(0);
})().catch(e => { console.error("出错了：" + e.message); process.exit(1); });
