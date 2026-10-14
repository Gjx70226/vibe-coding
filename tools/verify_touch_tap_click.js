/* 验证（Day 27 修复回归）：手机真触摸序列 —— 轻点必须能触发 click 去答题，
   长按仍出释义、松手不误选。用 CDP dispatchTouchEvent + 触摸模拟，
   复现"touchstart preventDefault 会掐死轻点 click"这类真机才有的雷。
   关键：开启 Emulation.setTouchEmulationEnabled，让 Chromium 走真实 touch→mouse→click 合成。 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const DBG = 9391;
const SRV = 8121;
const OUT = path.join(ROOT, "day27-review");

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
    "--headless=new", "--remote-debugging-port=" + DBG, "--user-data-dir=" + path.join(OUT, "_edge_profile_tap"),
    "--no-first-run", "--no-default-browser-check", "--disable-gpu", "about:blank"
  ], { stdio: "ignore" });

  let targets = null;
  for (let i = 0; i < 40; i++) {
    try { targets = await (await fetch("http://127.0.0.1:" + DBG + "/json/list")).json(); break; }
    catch (e) { await sleep(500); }
  }
  const page = targets.find(t => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const waiters = new Map();
  const onMsg = m => { const j = JSON.parse(m.data); if (j.id && waiters.has(j.id)) { waiters.get(j.id)(j); waiters.delete(j.id); } };
  ws.onmessage = onMsg;
  const send = (method, params) => new Promise(res => { const mid = ++id; waiters.set(mid, m => res(m)); ws.send(JSON.stringify({ id: mid, method, params: params || {} })); });
  const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); return r.result && r.result.result ? r.result.result.value : undefined; };
  await new Promise(r => ws.onopen = r);
  await send("Runtime.enable", {});

  // 开启手机视口 + 触摸模拟（关键：让 Chromium 走真实 touch→click 合成）
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 3, mobile: true, fitWindow: false });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });

  let errors = [];
  ws.onmessage = (orig => ev2 => { const m = JSON.parse(ev2.data); if (m.id && waiters.has(m.id)) { waiters.get(m.id)(m); waiters.delete(m.id); } if (m.method === "Runtime.consoleAPICalled" && m.params && m.params.type === "error") errors.push(m.params.args.map(a => a.value || a.description).join(" ")); if (m.method === "Runtime.exceptionThrown") errors.push("EXC:" + (m.params.exceptionDetails && m.params.exceptionDetails.text)); })(ws.onmessage);

  const openStudy = async () => {
    await send("Page.enable", {});
    await send("Page.navigate", { url: "about:blank" });   // 先空白页强制卸载旧文档，避免两次测试互相污染
    await sleep(300);
    await send("Page.navigate", { url: "http://127.0.0.1:" + SRV + "/index.html#/study" });
    for (let i = 0; i < 60; i++) {
      const ok = await ev(`(function(){var w=document.querySelector('#qWord');var o=document.querySelector('#qOptions .option-btn');return !!(w&&o&&window.Store);})()`);
      if (ok) break; await sleep(500);
    }
    await sleep(400);
  };
  const centerOf = async (sel) => JSON.parse(await ev(`(function(){var w=document.querySelector(${sel});var r=w.getBoundingClientRect();return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)});})()`));

  const TAP = async (c) => {
    await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: c.x, y: c.y, id: 0 }] });
    await sleep(150);
    await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await sleep(400);
  };
  const HOLD = async (c) => {
    await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: c.x, y: c.y, id: 0 }] });
    await sleep(620); // > PEEK_MS(500)
  };
  const RELEASE = async (c) => {
    await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await sleep(250);
  };

  // ---- ① 轻点第一选项 → 必须触发答题（选项禁用 / 下一词出现 / 反馈出） ----
  await openStudy();
  let oc = await centerOf("'#qOptions .option-btn'");
  await TAP(oc);
  const tap = await ev(`(function(){
    var opts=[].slice.call(document.querySelectorAll('#qOptions .option-btn'));
    var anyDisabled = opts.some(function(o){return o.disabled;});
    var next = document.querySelector('#qNext');
    var fb = document.querySelector('#qFeedback');
    var hasFeedback = !!(fb && fb.textContent && fb.textContent.trim().length>0);
    return { anyDisabled: anyDisabled, nextVisible: !!(next && next.offsetParent), hasFeedback: hasFeedback };
  })()`);
  console.log("[① 轻点答题] 选项被选中禁用=", tap.anyDisabled, "下一词出现=", tap.nextVisible, "反馈出现=", tap.hasFeedback,
    "→", (tap.anyDisabled || tap.nextVisible || tap.hasFeedback) ? "✅轻点能触发click（修复生效）" : "❌轻点无反应（仍被掐死）");

  // ---- ② 长按第一选项 → 出释义(就地peeking)，松手收起且不误选 ----
  await openStudy();
  let oc2 = await centerOf("'#qOptions .option-btn'");
  await HOLD(oc2);
  const longShown = await ev(`(function(){var b=document.querySelector('#qOptions .option-btn');return {peeking:b.classList.contains('peeking')};})()`);
  await RELEASE(oc2);
  const longGone = await ev(`(function(){
    var b=document.querySelector('#qOptions .option-btn');
    var opts=[].slice.call(document.querySelectorAll('#qOptions .option-btn'));
    return { peeking:b.classList.contains('peeking'), anyDisabled: opts.some(function(o){return o.disabled;}) };
  })()`);
  console.log("[② 长按释义] 按住出 peeking=", longShown.peeking,
    "| 松手收起=", !longGone.peeking, "未误选=", !longGone.anyDisabled,
    "→", (longShown.peeking && !longGone.peeking && !longGone.anyDisabled) ? "✅长按仍生效/松手没误选" : "❌长按异常");

  console.log("[控制台报错]", errors.length ? errors : "无");

  try { ws.close(); } catch (e) {}
  try { edge.kill(); } catch (e) {}
  try { server.close(); } catch (e) {}
  console.log("验证结束。");
  process.exit(0);
})().catch(e => { console.error("出错了：" + e.message); process.exit(1); });
