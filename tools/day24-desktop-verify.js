/* Day 24 补验：桌面端（新版 pointer 事件）长按是否真的触发
   复用 day24-repro.js 的连接模板（固定调试端口 + 全局 WebSocket）
   两个场景：
   1 桌面鼠标按住不动 0.7s        → 预期：触发（代码层证据）
   2 桌面按住期间合成 mouseleave  → 新版应免疫（旧版会取消） */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const DBG = 9391;
const SRV = 8121;
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
    "--headless=new", "--remote-debugging-port=" + DBG,
    "--user-data-dir=" + path.join(require("os").tmpdir(), "_d24dv_" + Date.now()),
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
  const center = async () => JSON.parse(await ev(`(function(){var w=document.querySelector('#qWord');var r=w.getBoundingClientRect();return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)});})()`));
  const peekText = () => ev(`document.querySelector('#qPeek').textContent`);

  // 场景1：桌面稳按不动
  await openStudy();
  let c = await center();
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: c.x, y: c.y, button: "left" });
  await sleep(700);
  const s1 = await peekText();
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: c.x, y: c.y, button: "left" });
  console.log("[场景1 桌面稳按不动] #qPeek =", JSON.stringify(s1), "→", s1.indexOf("＝") >= 0 ? "✅触发" : "❌没触发");

  // 场景2：桌面按住 + 合成 mouseleave（旧版会取消，新版应免疫）
  await openStudy();
  c = await center();
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: c.x, y: c.y, button: "left" });
  await sleep(150);
  await ev(`document.querySelector('#qWord').dispatchEvent(new MouseEvent('mouseleave',{bubbles:false}));`);
  await sleep(600);
  const s2 = await peekText();
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: c.x, y: c.y, button: "left" });
  console.log("[场景2 桌面按住+移出] #qPeek =", JSON.stringify(s2), "→", s2.indexOf("＝") >= 0 ? "✅新版免疫(仍触发)" : "❌仍被取消");

  const shot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(OUT, "桌面验证-新版触发.png"), Buffer.from(shot.result.data, "base64"));
  console.log("截图存：day24-review/桌面验证-新版触发.png");

  try { ws.close(); } catch (e) {}
  try { edge.kill(); } catch (e) {}
  try { server.close(); } catch (e) {}
  console.log("结束。");
  process.exit(0);
})().catch(e => { console.error("出错了：" + e.message); process.exit(1); });
