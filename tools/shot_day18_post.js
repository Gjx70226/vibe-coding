/* 用真 Edge（无头）打开线上那个接口查看页，真填表、真点「记一笔」，
   把「云回的那段字」那一屏截下来 —— 证据是这台真浏览器点出来的，不是拼出来的。
   跑法：node tools/shot_day18_post.js
   跑完存 day18-review/板块③-POST成功返回.png
   ============================================================ */

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 9333;
const PAGE = "https://cet4-word-helper.app.workbuddy.host/api.html";
const SHOT = path.join(ROOT, "day18-review/板块③-POST成功返回.png");
const PROFILE = path.join(ROOT, "day18-review/_edge_tmp_profile");

const sleep = ms => new Promise(r => setTimeout(r, ms));

function say(t) { console.log(t); }

async function getJson(url) {
  for (let i = 0; i < 40; i++) {
    try { return await (await fetch(url)).json(); } catch (e) { await sleep(500); }
  }
  throw new Error("浏览器迟迟没起来：" + url);
}

(async () => {
  fs.rmSync(PROFILE, { recursive: true, force: true });
  const edge = spawn(EDGE, [
    "--headless=new", "--remote-debugging-port=" + PORT, "--user-data-dir=" + PROFILE,
    "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--hide-scrollbars",
    "--window-size=900,1500", "about:blank"
  ], { stdio: "ignore" });

  let targets;
  try { targets = await getJson("http://127.0.0.1:" + PORT + "/json/list"); }
  catch (e) { edge.kill(); throw e; }
  let page = targets.find(t => t.type === "page");
  say("浏览器起来了，页面：" + (page ? page.url : "(还没开)"));

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const waiters = new Map();
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && waiters.has(m.id)) { waiters.get(m.id)(m); waiters.delete(m.id); }
  };
  const send = (method, params) => new Promise(res => {
    const mid = ++id;
    waiters.set(mid, m => res(m));
    ws.send(JSON.stringify({ id: mid, method: method, params: params || {} }));
  });
  await new Promise(r => ws.onopen = r);

  async function ev(expr) {
    const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails) throw new Error("页面里报错：" + JSON.stringify(r.result.exceptionDetails));
    return r.result && r.result.result ? r.result.result.value : undefined;
  }
  async function shot(path) {
    const r = await send("Page.captureScreenshot", { format: "png" });
    if (!r.result || !r.result.data) throw new Error("截屏失败：" + JSON.stringify(r).slice(0, 200));
    fs.writeFileSync(path, Buffer.from(r.result.data, "base64"));
    say("截图存好了：" + path);
  }

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Page.navigate", { url: PAGE });
  say("正在打开线上那个接口查看页（真联网，不是本地假页面）…");
  await sleep(9000); // 等网上那个云的小工具下载 + 页面自己的脚本跑完

  const hasApi = await ev("typeof Window === 'undefined' ? 'x' : (typeof Api)");
  say("页面上那个「取数口子」装好没：" + hasApi);

  /* 真填表单（跟人手点是一样的：往框里写值） */
  await ev(`(function(){
    var q=function(i){return document.getElementById(i);};
    q("inPid").value="6"; q("inWord").value="important"; q("inPos").value="adj";
    q("inRight")||0; q("selRight").value="true"; q("selMode").value="new";
    return "表单填好了；页面上写的是哪一天/哪个词：" + q("inPid").value + " " + q("inWord").value;
  })()`);
  say("表单填好了：哪天=6 词=important 词性=adj 答对=true 来源=new");

  /* 真点「记一笔」 */
  const clicked = await ev(`(function(){
    var b=document.getElementById("btnPost"); if(!b) return "找不到按钮";
    b.click(); return "点到了：「" + b.textContent + "」";
  })()`);
  say("点了按钮 → " + clicked);

  await sleep(6000); // 等云回话

  const title = await ev('document.getElementById("outTitle").textContent');
  const json = await ev('document.getElementById("outJson").textContent');
  const foot = await ev('document.getElementById("verFoot").textContent');
  say("这一屏上写着：「" + title + "」");
  say("云回的原话：" + json);
  say("页底版本号：" + foot);

  await shot(SHOT);
  say("（这张图是这台无头 Edge 打开公网那个页面、真填表真点按钮截的）");

  ws.close(); edge.kill();
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}
  process.exit(0);
})().catch(e => { console.error("出错了：" + e.message); process.exit(1); });
