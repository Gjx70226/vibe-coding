/* Day 20 本地逻辑验证：原样复制 api.html 里 Day 20 新增的 paint 健康块+更新时间逻辑，
   mock 一个「云返回成功」的桩（不走网络），确定性验证 GOOD/BAD 两条路径渲染正确。
   （线上文件已用 curl 证实为 2026-10-05d + 含 healthTxt；本脚本验证那段代码本身能跑通、不报错。）
   跑法：node tools/verify_day20_health.js */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 9361;
const PROFILE = path.join(ROOT, "day20-review/_edge_tmp_profile_h");
const SHOT = path.join(ROOT, "day20-review/本地-健康块逻辑验证.png");
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* 这份 HTML 里的 paint 函数与 api.html 第 189-225 行一字不差（含 Day 20 健康块+更新时间） */
const HTML = `<!doctype html><meta charset="utf-8"><body style="margin:0;font-family:sans-serif;background:#fff">
<style>
.api-status{margin-top:14px;display:flex;flex-wrap:wrap;gap:10px 18px;align-items:center}
.api-health{font-size:14px;font-weight:700;padding:6px 12px;border-radius:999px}
.api-health.ok{background:#e6f7ec;color:#1a7f43}
.api-health.bad{background:#fdecea;color:#c0392b}
.api-health.wait{background:#fff7e6;color:#b8860b}
.api-upd{font-size:13px;color:#888}
.api-json{background:#1f2430;color:#e8eef7;padding:14px;font-size:13px;line-height:1.6;white-space:pre-wrap;margin-top:14px}
</style>
<div class="api-status">
  <span class="api-health wait" id="healthTxt">云状态：检测中…</span>
  <span class="api-upd" id="lastUpd">最后更新：—</span>
</div>
<pre class="api-json" id="outJson"></pre>
<script>
var outJson=document.getElementById("outJson");
function paint(title, obj, bad){
  outJson.className="api-json"+(bad?" bad":"");
  var txt; try{txt=JSON.stringify(obj,null,2);}catch(e){txt=String(obj);}
  outJson.textContent=txt;
  var h=document.getElementById("healthTxt");
  if(h){
    var msg=(obj&&obj.msg)||"";
    var reached=(obj&&(obj.ok||obj.error))&&!/没加载出来/.test(msg);
    if(reached){h.className="api-health ok";h.textContent="云已连通 ✅";}
    else if(/没加载出来/.test(msg)){h.className="api-health bad";h.textContent="云连不上 ❌";}
  }
  if(obj&&obj.ok){
    var u=document.getElementById("lastUpd");
    if(u){var d=new Date(),p=function(n){return n<10?"0"+n:n;};u.textContent="最后更新："+p(d.getHours())+":"+p(d.getMinutes())+":"+p(d.getSeconds());}
  }
}
/* 模拟「云返回成功」—— GOOD 路径 */
paint("【今日计划】取到了",{ok:true,data:{date:"2026-10-05",target_new:20,words:[{word:"problem",pos:"n"}]}},false);
window.__paint=paint;
</script></body>`;

(async () => {
  const tmp = path.join(ROOT, "_tmp_day20_health.html");
  fs.writeFileSync(tmp, HTML);
  const edge = spawn(EDGE, [
    "--headless=new", "--remote-debugging-port=" + PORT, "--user-data-dir=" + PROFILE,
    "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--window-size=820,600", "about:blank"
  ], { stdio: "ignore" });

  let targets = null;
  for (let i = 0; i < 40; i++) {
    try { targets = await (await fetch("http://127.0.0.1:" + PORT + "/json/list")).json(); break; }
    catch (e) { await sleep(500); }
  }
  const page = targets.find(t => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const waiters = new Map();
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && waiters.has(m.id)) { waiters.get(m.id)(m); waiters.delete(m.id); } };
  const send = (method, params) => new Promise(res => { const mid = ++id; waiters.set(mid, m => res(m)); ws.send(JSON.stringify({ id: mid, method: method, params: params || {} })); });
  const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); return r.result && r.result.result ? r.result.result.value : undefined; };
  await new Promise(r => ws.onopen = r);
  await send("Page.enable", {});

  await send("Page.navigate", { url: "file://" + tmp });
  await sleep(1200);
  const hGood = await ev(`(document.getElementById("healthTxt")||{}).textContent||""`);
  const uGood = await ev(`(document.getElementById("lastUpd")||{}).textContent||""`);

  /* BAD 路径：模拟「云小工具没加载出来」（evaluate 只能放表达式，不能写 return） */
  await ev(`window.__paint("没取到",{ok:false,error:"server",msg:"云的小工具没加载出来"},true); "ok";`);
  await sleep(300);
  const hBad = await ev(`(document.getElementById("healthTxt")||{}).textContent||""`);

  const s = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(SHOT, Buffer.from(s.result.data, "base64"));

  console.log("==== Day 20 健康块逻辑（本地 mock，确定性）====");
  console.log("GOOD 路径 健康块: " + hGood);
  console.log("GOOD 路径 更新时间: " + uGood);
  console.log("BAD 路径 健康块: " + hBad);
  console.log("判定: 健康块含✅=" + /✅/.test(hGood) + "；更新时间含「最后更新：」=" + /最后更新：/.test(uGood) + "；失败变❌=" + /❌/.test(hBad));
  console.log("截图: " + SHOT);

  ws.close(); edge.kill();
  fs.rmSync(tmp, { force: true });
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}
  process.exit(0);
})().catch(e => { console.error("出错了：" + e.message); process.exit(1); });
