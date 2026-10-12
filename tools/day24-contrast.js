// Day 24 补充对照实验：复现「真机点一下/划过 vs 按住半秒」三种操作的结果差异
// 目的：小甘录屏显示 peek 不触发，怀疑是"点一下/划过"而不是"按住半秒"。
// 本脚本在无头 Edge 里对 #qWord 做三种真实操作，看 #qPeek 各自的反应。
const fs = require("fs");
const path = require("path");
const http = require("http");

const ROOT = "E:/work Buddy运行/微信/vibe-coding";
const OUT = path.join(ROOT, "day24-review");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT_HTTP = 8935, PORT_CDP = 9233;
const PROF = path.join(require("os").tmpdir(), "_edge_profile_day24c");

function httpGet(url) {
  return new Promise(function (res, rej) {
    http.get(url, function (r) {
      var b = ""; r.on("data", c => b += c); r.on("end", () => res(b));
    }).on("error", rej);
  });
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  // 1. 起静态服务器
  const server = http.createServer(function (req, res) {
    var p = req.url.split("?")[0];
    if (p === "/") p = "/index.html";
    var f = path.join(ROOT, p);
    fs.readFile(f, function (err, data) {
      if (err) { console.log("  [404]", req.url); res.writeHead(404); res.end("no"); return; }
      var ext = path.extname(f);
      var mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" }[ext] || "application/octet-stream";
      res.writeHead(200, { "Content-Type": mime });
      res.end(data);
    });
  }).listen(PORT_HTTP);
  await sleep(300);

  // 2. 起无头 Edge + CDP
  const { spawn } = require("child_process");
  fs.rmSync(PROF, { recursive: true, force: true });
  const edge = spawn(EDGE, [
    "--headless=new",
    "--remote-debugging-port=" + PORT_CDP,
    "--user-data-dir=" + PROF,
    "--window-size=420,900",
    "--no-first-run",
    "about:blank"
  ]);
  await sleep(1800);

  var target = null;
  for (var i = 0; i < 20; i++) {
    try {
      var list = JSON.parse(await httpGet("http://127.0.0.1:" + PORT_CDP + "/json/list"));
      target = list.find(t => t.type === "page");
      if (target) break;
    } catch (e) {}
    await sleep(300);
  }
  if (!target) { console.log("没连上 CDP"); process.exit(1); }

  const WebSocket = global.WebSocket;
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  const waiters = new Map();
  var id = 0;
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && waiters.has(m.id)) { waiters.get(m.id)(m); waiters.delete(m.id); } };
  const send = (method, params) => new Promise(res => { const mid = ++id; waiters.set(mid, m => res(m)); ws.send(JSON.stringify({ id: mid, method, params: params || {} })); });
  await new Promise(r => ws.onopen = r);
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Page.navigate", { url: "http://127.0.0.1:" + PORT_HTTP + "/index.html#/study" });
  await sleep(1600);

  async function ev(expr) {
    var r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) console.log("  [eval异常]", JSON.stringify(r.exceptionDetails).slice(0, 200));
    return r.result && r.result.result ? r.result.result.value : undefined;
  }
  // 页面加载诊断
  console.log("诊断: url =", await ev("location.href"));
  console.log("诊断: qWord存在 =", await ev("!!document.getElementById('qWord')"));
  console.log("诊断: body前100字 =", JSON.stringify(await ev("document.body ? document.body.innerText.slice(0,100) : 'NO BODY'")));
  async function center() {
    return await ev("(function(){var r=document.getElementById('qWord').getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};})()");
  }
  async function peekText() {
    return await ev("document.getElementById('qPeek').textContent");
  }

  console.log("=== 对照实验开始（三场景同一页面、同一位置 #qWord 中心）===");

  // ---- 场景 D：点一下就松手（120ms）——复现"点击不触发" ----
  var c = await center();
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: c.x, y: c.y, button: "left" });
  await sleep(120);
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: c.x, y: c.y, button: "left" });
  await sleep(900);
  var d = await peekText();
  console.log("[D 点一下(120ms)] #qPeek =", JSON.stringify(d), "→", d.indexOf("＝") >= 0 ? "显示了(意外!)" : "没显示(符合预期:点击不触发)");

  // ---- 场景 E：鼠标悬停 800ms 不按 ----
  c = await center();
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: c.x, y: c.y });
  await sleep(800);
  var e2 = await peekText();
  console.log("[E 悬停800ms不按] #qPeek =", JSON.stringify(e2), "→", e2.indexOf("＝") >= 0 ? "显示了(意外!)" : "没显示(符合预期:不按不触发)");

  // ---- 场景 F：按住 800ms 不动（对照组，应触发）----
  c = await center();
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: c.x, y: c.y, button: "left" });
  await sleep(800);
  var f2 = await peekText();
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: c.x, y: c.y, button: "left" });
  console.log("[F 按住800ms不动] #qPeek =", JSON.stringify(f2), "→", f2.indexOf("＝") >= 0 ? "显示了(代码没坏)" : "没显示(有问题!)");

  var shot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(OUT, "对照实验-三种操作.png"), Buffer.from(shot.result.data, "base64"));
  console.log("截图存：day24-review/对照实验-三种操作.png");

  ws.close(); edge.kill(); server.close();
  process.exit(0);
}
main().catch(function (e) { console.error("ERR:", e.message); process.exit(1); });
