/* Day 23 探测：接口地址连不上时，云工具到底回什么形状？（定 network 归类用）
   跑法：node tools/probe_neterr.js  */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const DBG = 9363;
const SRV = 8098;
const TMP = path.join(ROOT, "_tmp_day23probe");
const REAL_ENDPOINT = 'endpoint: "https://cet4-word-helper.app.workbuddy.host"';

const sleep = ms => new Promise(r => setTimeout(r, ms));

const MIME = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css" };
function startServer() {
  const s = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p === "/") p = "/api.html";
    const fp = path.join(TMP, p);
    if (!fp.startsWith(TMP) || !fs.existsSync(fp)) { res.writeHead(404); res.end("nf"); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(fp)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(fs.readFileSync(fp));
  });
  return new Promise(r => s.listen(SRV, r));
}

(async () => {
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });
  ["api.html", "words.js", "planDaysRepository.js", "checkinsRepository.js", "style.css"].forEach(f =>
    fs.copyFileSync(path.join(ROOT, f), path.join(TMP, f)));
  let api = fs.readFileSync(path.join(ROOT, "api.js"), "utf8").replace(REAL_ENDPOINT, 'endpoint: "https://127.0.0.1:1"');
  fs.writeFileSync(path.join(TMP, "api.js"), api);
  const server = await startServer();

  const edge = spawn(EDGE, [
    "--headless=new", "--remote-debugging-port=" + DBG, "--user-data-dir=" + path.join(TMP, "_p"),
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
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (waiters.has(m.id)) { waiters.get(m.id)(m); waiters.delete(m.id); } };
  const send = (method, params) => new Promise(res => { const mid = ++id; waiters.set(mid, m => res(m)); ws.send(JSON.stringify({ id: mid, method, params: params || {} })); });
  const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); return r.result && r.result.result ? r.result.result.value : undefined; };
  await new Promise(r => ws.onopen = r);

  await send("Page.navigate", { url: "http://127.0.0.1:" + SRV + "/api.html" });
  for (let i = 0; i < 60; i++) {
    const s = await ev(`String(typeof window.WorkBuddyCloud)`);
    if (s === "function") break;
    await sleep(1000);
  }
  await sleep(1000);

  const EXPR = `(new Promise(function(res){
    try {
      var c = WorkBuddyCloud.createWorkBuddyCloud({endpoint:'https://127.0.0.1:1', publishableKey:'wbpk_probe'});
      var q = c.database.from('checkins').select('*');
      if (!q || typeof q.then !== 'function') { res('NO_THEN:' + JSON.stringify(q)); return; }
      var done = false;
      q.then(function(out){ if(!done){done=true; try{res('THEN:' + JSON.stringify(out));}catch(e){res('THEN_STR:' + String(out));} }); })["catch"](function(e){ if(!done){done=true; res('CATCH:' + JSON.stringify({message: e&&e.message, code: e&&e.code, name: e&&e.name, str: String(e)}));} });
      setTimeout(function(){ if(!done){done=true; res('TIMEOUT_25S');} }, 25000);
    } catch(e) { res('THROW:' + e.message); }
  }))`;

  console.log("探测中（最长 25 秒）…");
  const out = await ev(EXPR);
  console.log("===== 探测结果 =====");
  console.log(out);

  ws.close(); edge.kill();
  try { server.close(); } catch (e) {}
  fs.rmSync(TMP, { recursive: true, force: true });
  process.exit(0);
})().catch(e => { console.error("出错了：" + e.message); process.exit(1); });
