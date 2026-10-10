/* Day 23 探针 v2：在真实页面里触发「接口地址连不上」，把 Api 回调拿到的
   原始 error 对象完整 JSON 打出来，看清云工具到底返回啥形状（定修复用）。
   跑法：node tools/probe_neterr2.js  */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const DBG = 9371;
const SRV = 8087;
const TMP = path.join(ROOT, "_tmp_probe2");
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
  ["api.html", "words.js", "planDaysRepository.js", "checkinsRepository.js", "style.css", "cloud.js"].forEach(f =>
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

  await send("Page.navigate", { url: "http://127.0.0.1:" + SRV + "/api.html?r=" + Date.now() });
  for (let i = 0; i < 60; i++) {
    const s = await ev(`String(typeof window.Api)`);
    if (s === "object") { console.log("Api 加载好（" + (i + 1) + " 次）"); break; }
    await sleep(1000);
  }
  await sleep(1500);

  // 触发网络错：接口地址是 127.0.0.1:1（连不上），直接复现 repository 的调用拿到原始 out.error
  console.log("触发网络错（endpoint=127.0.0.1:1）…");
  await ev(`(new Promise(function(res){
    try {
      window.__probe = 'pending';
      var c = WorkBuddyCloud.createWorkBuddyCloud({endpoint:'https://127.0.0.1:1', publishableKey:'wbpk_probe'});
      var q = c.database.from('checkins').select('*').order('created_at',{ascending:false}).range(0,19);
      var done=false;
      var snap=function(out,tag){
        if(done)return; done=true;
        var e = (out&&out.error)?out.error:null;
        window.__probe = tag
          + ' | out_keys=' + JSON.stringify(Object.keys(out||{}))
          + ' | err_keys=' + (e?JSON.stringify(Object.keys(e)):'null')
          + ' | err.code=' + (e&&e.code)
          + ' | err.message=' + (e&&e.message)
          + ' | err.name=' + (e&&e.name)
          + ' | err.str=' + (e?String(e).slice(0,120):'null');
        res('DONE');
      };
      q.then(function(out){ snap(out,'THEN'); })["catch"](function(e){ snap({error:e},'CATCH'); });
      setTimeout(function(){ if(!done){done=true; window.__probe='TIMEOUT'; res('TIMEOUT');} }, 15000);
    } catch(e){ window.__probe = 'THROW:'+e.message; res('THROW'); }
  }))`);
  // 等结果回来
  for (let i = 0; i < 20; i++) {
    const s = await ev(`String(window.__probe)`);
    if (s && s !== "pending") { console.log("原始回调结果：\n" + s); break; }
    await sleep(1000);
  }

  ws.close(); edge.kill();
  try { server.close(); } catch (e) {}
  fs.rmSync(TMP, { recursive: true, force: true });
  process.exit(0);
})().catch(e => { console.error("出错了：" + e.message); process.exit(1); });
