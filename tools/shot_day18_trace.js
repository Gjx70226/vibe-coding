/* 余力加练（留痕）的看板截图：真开线上那个页 → 点「记一笔」→ 点「看留痕」→ 截「留痕」那一屏
   跑法：node tools/shot_day18_trace.js
   注意：这一下会真往云里那张记录表写一笔（important，答对，第 6 天） */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 9336;
const PAGE = "https://cet4-word-helper.app.workbuddy.host/api.html";
const PROFILE = path.join(ROOT, "day18-review/_edge_tmp_profile3");
const SHOT = path.join(ROOT, "day18-review/余力加练-留痕.png");

const sleep = ms => new Promise(r => setTimeout(r, ms));
const say = t => console.log(t);

(async () => {
  fs.rmSync(PROFILE, { recursive: true, force: true });
  const edge = spawn(EDGE, [
    "--headless=new", "--remote-debugging-port=" + PORT, "--user-data-dir=" + PROFILE,
    "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--window-size=760,1400",
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
  await send("Page.navigate", { url: PAGE });
  await sleep(9000);

  /* 等云的小工具真的加载好再说（它是从网上现下，不到 10 秒就点按钮＝白点） */
  for (let i = 0; i < 60; i++) {
    const s = await ev(`(function(){ return String(typeof window.WorkBuddyCloud); })()`);
    if (s === "function") { say("云的小工具加载好了（探了 " + (i + 1) + " 次）"); break; }
    await sleep(1000);
  }
  say("线上那个查看页打开好了");

  /* 留痕现在有几条（CDP 里不能直接写 return，得包一层函数） */
  const logN = async (tag) => {
    const v = await ev(`(function(){ var l=Api.log()||[]; return JSON.stringify({n:l.length,last:l.slice(-1)[0]||""}); })()`);
    say("  · [" + tag + "] 留痕 " + v);
  };

  /* 填表 → 点「记一笔」→ 隔 1.2 秒点「原样再记一笔」。
     两下必须在同一次调用里点完：分开点会被来回通信的时间拖过那 3 秒窗口，
     第二下就当成「正常再记一遍」放行，看不到防重复那一行。 */
  await ev(`new Promise(function(res){
    var q=function(i){return document.getElementById(i);};
    q("inPid").value="6"; q("inWord").value="important"; q("inPos").value="adj";
    q("selRight").value="true"; q("selMode").value="new";
    document.getElementById("btnPost").click();
    setTimeout(function(){
      document.getElementById("btnDup").click();
      setTimeout(function(){ res("ok"); }, 1200);
    }, 1200);
  })`);
  await logN("点完第一下「记一笔」后");
  await sleep(3000);
  const dupState = await ev(`(function(){
    var t=document.getElementById("outTitle"), j=document.getElementById("outJson");
    return JSON.stringify({title:(t?t.textContent:""), json:(j?String(j.textContent).slice(0,220):"")});
  })()`);
  say("  · 第二下之后页面上写的是：" + dupState);
  await sleep(9000);
  say("点了「记一笔」+「原样再记一笔」（第二下该被防重复挡住）");

  await logN("点完第二下「原样再记一笔」后");

  /* 点「看留痕」，把那个框滚进画面 */
  await ev(`document.getElementById("btnLog").click(); return "ok";`);
  await sleep(1200);
  const shot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(SHOT, Buffer.from(shot.result.data, "base64"));
  say("截好了：" + SHOT);

  const txt = await ev(`(function(){
    var b=document.getElementById("logBox");
    var t=document.getElementById("logTitle");
    return (t?t.textContent:"") + "\\n" + (b?b.textContent:"（没读到留痕）");
  })()`);
  say("");
  say("留痕框里现在写着：");
  say(String(txt).split("\n").map(l => "  " + l).join("\n"));

  ws.close(); edge.kill();
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}
  process.exit(0);
})().catch(e => { console.error("出错了：" + e.message); process.exit(1); });
