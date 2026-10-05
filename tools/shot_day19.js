/* Day 19 板块③ 截图：结构页 + 线上 api.html 真点 GET 返回（不点 POST，不污染云）。
   起手照搬已验证的 shot_day18_trace.js（--user-data-dir + /json/list），换端口避免上次残留。
   跑法：node tools/shot_day19.js  */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 9350;
const PAGE = "https://cet4-word-helper.app.workbuddy.host/api.html";
const PROFILE = path.join(ROOT, "day19-review/_edge_tmp_profile");
const SHOT_STRUCT = path.join(ROOT, "day19-review/板块③-文件结构.png");
const SHOT_API = path.join(ROOT, "day19-review/板块③-接口正常返回.png");

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* 动态读项目根目录的 js 文件，分类画目录树 */
function buildTree() {
  const all = fs.readdirSync(ROOT).filter(f => f.endsWith(".js"));
  const repo = all.filter(f => /Repository/.test(f));
  const iface = all.filter(f => f === "api.js");
  let s = "项目结构（Day 19 数据访问层重构后）\n\n";
  s += "├── 数据访问层（新建 · 所有 查库/写库 收在这两文件）\n";
  repo.forEach(f => {
    const kind = /planDays/.test(f) ? "plan_days 的查询" : "checkins 的查询 / 写入";
    s += "│   " + f + "   ← " + kind + "\n";
  });
  s += "├── 接口层（变薄 · 只接请求/调函数/返响应，已搜不到 from·select·insert·update）\n";
  iface.forEach(f => { s += "│   " + f + "\n"; });
  s += "├── 页面与公共层\n";
  s += "│   index.html / api.html / style.css\n";
  s += "│   components.js / store.js / words.js / quiz.js\n";
  s += "│   app.js / study.js / review.js / daily.js / list.js / detail.js / router.js\n";
  s += "│   cloud.js（官方云小工具封装）\n";
  s += "└── 工具（验证脚本，不进线上）\n";
  s += "    tools/verify_day19_regression.js 等\n";
  return s;
}

(async () => {
  fs.rmSync(PROFILE, { recursive: true, force: true });
  const edge = spawn(EDGE, [
    "--headless=new", "--remote-debugging-port=" + PORT, "--user-data-dir=" + PROFILE,
    "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--window-size=820,1500",
    "about:blank"
  ], { stdio: "ignore" });

  let targets = null;
  for (let i = 0; i < 30; i++) {
    try { targets = await (await fetch("http://127.0.0.1:" + PORT + "/json/list")).json(); break; }
    catch (e) { await sleep(500); }
  }
  const page = targets.find(t => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const waiters = new Map();
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (waiters.has(m.id)) { waiters.get(m.id)(m); waiters.delete(m.id); } };
  const send = (method, params) => new Promise(res => { const mid = ++id; waiters.set(mid, m => res(m)); ws.send(JSON.stringify({ id: mid, method: method, params: params || {} })); });
  const ev = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  await new Promise(r => ws.onopen = r);

  /* ---- 1) 结构页 ---- */
  const tree = buildTree();
  fs.writeFileSync(path.join(ROOT, "_tmp_day19_structure.html"),
    `<!doctype html><meta charset="utf-8"><body style="background:#fff;margin:0;font-family:Consolas,monospace;">
     <div style="background:#0b6;color:#fff;padding:6px 10px;font-size:13px;">文件结构 · 目录：${ROOT}</div>
     <pre style="font-size:13px;line-height:1.65;padding:12px;white-space:pre;color:#222;">${tree.replace(/</g, "&lt;")}</pre></body>`);
  await send("Page.navigate", { url: "file://" + path.join(ROOT, "_tmp_day19_structure.html") });
  await sleep(900);
  const s1 = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(SHOT_STRUCT, Buffer.from(s1.result.data, "base64"));
  console.log("① 结构页截图 OK");
  fs.rmSync(path.join(ROOT, "_tmp_day19_structure.html"), { force: true });

  /* ---- 2) 线上 api.html，真点 GET 两个按钮（不点 POST，不污染云） ---- */
  await send("Page.navigate", { url: PAGE });
  await sleep(9000);
  for (let i = 0; i < 60; i++) {
    const s = await ev(`(function(){ return String(typeof window.WorkBuddyCloud); })()`);
    if (s === "function") { console.log("云的小工具加载好了（探了 " + (i + 1) + " 次）"); break; }
    await sleep(1000);
  }
  await ev(`document.getElementById("btnPlan").click(); return "ok";`);
  await sleep(1500);
  await ev(`document.getElementById("btnRec").click(); return "ok";`);
  await sleep(2500);

  /* 在图顶部叠加地址栏 + 版本 */
  await ev(`(function(){
    var d=document.createElement('div');
    d.style.cssText='position:fixed;top:0;left:0;right:0;background:#1a1a1a;color:#0f0;font:12px monospace;padding:4px 8px;z-index:99999';
    d.textContent='地址栏: '+location.href+'   ·   版本 '+(window.VER||'?');
    document.body.appendChild(d);
  })();`);
  await sleep(400);
  const s2 = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(SHOT_API, Buffer.from(s2.result.data, "base64"));
  console.log("② 接口返回截图 OK");

  const txt = await ev(`(function(){ var j=document.getElementById("outJson"); return j?String(j.textContent).slice(0,200):""; })()`);
  console.log("GET 黑框前 200 字：\n  " + String(txt).replace(/\n/g, "\n  "));

  ws.close(); edge.kill();
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}
  process.exit(0);
})().catch(e => { console.error("出错了：" + e.message); process.exit(1); });
