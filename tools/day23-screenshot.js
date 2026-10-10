/* Day 23 收尾：三类错误实测截图（真触发，不拿假页面糊弄）· v2
   v1 教训：云工具走长连接，CDP 离线模式拦不住 → 网络/接口错改用「接口地址改成连不上的」触发。
   分两轮（同一浏览器会话，中间换临时目录里的文件再重载页面）：
   第1轮  错误1（用户输入错：哪天填 abc，前端第一关拦，不联网）
          错误3（服务端错：表名故意写错，云端真回 42P01）
   第2轮  错误2（网络/接口错：endpoint 换成 127.0.0.1:1 连不上，请求真发不出 → network 类中文）
   临时副本用完即删，零污染真代码。跑法：node tools/day23-screenshot.js */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const DBG = 9362;
const SRV = 8099;
const TMP = path.join(ROOT, "_tmp_day23");
const OUT = path.join(ROOT, "day23-review");
const REAL_ENDPOINT = 'endpoint: "https://cet4-word-helper.app.workbuddy.host"';

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* 基础文件复制（不含两个要动的） */
function copyBase() {
  ["api.html", "words.js", "planDaysRepository.js", "style.css"].forEach(f =>
    fs.copyFileSync(path.join(ROOT, f), path.join(TMP, f)));
}
/* api.js：badEndpoint=true 时把接口地址换成连不上的（网络错触发器） */
function writeApiJs(badEndpoint) {
  let s = fs.readFileSync(path.join(ROOT, "api.js"), "utf8");
  if (badEndpoint) s = s.replace(REAL_ENDPOINT, 'endpoint: "https://127.0.0.1:1"');
  fs.writeFileSync(path.join(TMP, "api.js"), s);
}
/* checkinsRepository.js：badTable=true 时表名改成不存在的（服务端错触发器） */
function writeRepo(badTable) {
  let c = fs.readFileSync(path.join(ROOT, "checkinsRepository.js"), "utf8");
  if (badTable) c = c.replace(/from\("checkins"\)/g, 'from("checkins_not_exist")');
  fs.writeFileSync(path.join(TMP, "checkinsRepository.js"), c);
}

/* 极简静态服务器：no-store 防浏览器拿缓存的旧 js */
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
  copyBase(); writeApiJs(false); writeRepo(true);      // 第1轮：正常地址 + 错表名
  const server = await startServer();
  console.log("静态服务器起来了：http://127.0.0.1:" + SRV);

  const edge = spawn(EDGE, [
    "--headless=new", "--remote-debugging-port=" + DBG, "--user-data-dir=" + path.join(TMP, "_edge_profile"),
    "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--window-size=860,1500", "about:blank"
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

  const stamp = (txt) => ev(`(function(){var d=document.getElementById('__stamp'); if(!d){d=document.createElement('div');d.id='__stamp';d.style.cssText='position:fixed;top:0;left:0;right:0;background:#000;color:#ff0;font:13px monospace;padding:5px 8px;z-index:99999';document.body.appendChild(d);} d.textContent='` + txt + `';})();`);
  const shot = async (name) => {
    const s = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(OUT, name), Buffer.from(s.result.data, "base64"));
    console.log("截好：" + name);
  };
  const openPage = async () => {
    await send("Page.navigate", { url: "http://127.0.0.1:" + SRV + "/api.html?r=" + Date.now() });
    for (let i = 0; i < 60; i++) {
      const s = await ev(`String(typeof window.WorkBuddyCloud)`);
      if (s === "function") { console.log("云小工具加载好（探了 " + (i + 1) + " 次）"); break; }
      await sleep(1000);
    }
    await sleep(1500);
  };

  /* ======== 第1轮：错误1 + 错误3 ======== */
  await openPage();

  /* ① 用户输入错：哪天填 abc，点记一笔（前端第一关直接拦，不联网） */
  await stamp("① 用户输入错：哪天填了 abc");
  await ev(`document.getElementById('inPid').value='abc'; document.getElementById('btnPost').click();`);
  await sleep(1800);
  await shot("错误1-用户输入错.png");

  /* ③ 服务端错：表名是错的，点取学习记录，云端真回 42P01 */
  await stamp("③ 服务端错：表名被故意写错");
  await ev(`document.getElementById('btnRec').click();`);
  await sleep(5000);
  await shot("错误3-服务端错.png");

  /* ======== 第2轮：错误2（换配置重载）======== */
  writeApiJs(true); writeRepo(false);                  // endpoint 连不上 + 表名恢复正常
  console.log("配置已换成「接口地址连不上」，重载页面…");
  await openPage();

  await stamp("② 网络/接口错：接口地址改成连不上的");
  await ev(`document.getElementById('btnRec').click();`);
  await sleep(6000);
  await shot("错误2-网络接口错.png");

  /* 眼见为实：把三张图的黑框提示各抓一行字出来，当场打给眼睛看 */
  const tip = await ev(`(function(){var j=document.getElementById('outJson'); return j?String(j.textContent).slice(0,160):"";})()`);
  console.log("错误2 黑框前 160 字：\n  " + String(tip).replace(/\n/g, "\n  "));

  ws.close(); edge.kill();
  try { server.close(); } catch (e) {}
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log("临时目录已清，三张图存到 day23-review/");
  process.exit(0);
})().catch(e => { console.error("出错了：" + e.message); process.exit(1); });
