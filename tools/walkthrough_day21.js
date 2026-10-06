/* ============================================================
   Day 21 板块④：演示提纲走通计时（无头 Edge 真开公网）
   核心流程：打开链接 → 取今日计划(真数据) → 记一笔 day21demo → 刷新页面 → 取记录看到那笔还在 → 清理
   计时：从 navigate 起到「刷新后查回那笔」止；≤5 分钟核心流程走完 = 合格
   输出：day21-review/演示走通-Day21.txt
   ============================================================ */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 9372;
const PAGE = process.argv[2] || "https://cet4-word-helper.app.workbuddy.host/api.html";
const PROFILE = path.join(ROOT, "day21-review/_edge_tmp_profile_wk");
const OUT = path.join(ROOT, "day21-review/演示走通-Day21.txt");

fs.mkdirSync(path.join(ROOT, "day21-review"), { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let out = [];
function say(t) { console.log(t); out.push(t); }

const PK = "wbpk_O12WtR6v99Wu8kmCZRjKgH_sg9Rb6ux7sTaa09hgVS0BCVep93u20G3";
const END = "https://cet4-word-helper.app.workbuddy.host";
const WORD = "day21demo";
const PID = 6;
const mkCloud = "var C=window.WorkBuddyCloud.createWorkBuddyCloud({endpoint:'" + END + "',publishableKey:'" + PK + "'});";
const selWord = "(async function(){ " + mkCloud + " try{ var r=await C.database.from('checkins').select('id,word,plan_day_id').eq('word','" + WORD + "').eq('plan_day_id'," + PID + "); return JSON.stringify(r); }catch(e){ return 'ERR:'+e.message; } })()";
const delWord = "(async function(){ " + mkCloud + " try{ var r=await C.database.from('checkins').delete().eq('word','" + WORD + "').eq('plan_day_id'," + PID + "); return JSON.stringify(r); }catch(e){ return 'ERR:'+e.message; } })()";

(async () => {
  const edge = spawn(EDGE, [
    "--headless=new", "--remote-debugging-port=" + PORT, "--user-data-dir=" + PROFILE,
    "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--window-size=820,1500",
    "about:blank"
  ], { stdio: "ignore" });

  const t0 = Date.now();   // 计时起点：导航前

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
  const ev = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.result && r.result.result.value !== undefined) return r.result.result.value;
    if (r.exceptionDetails) return "EVAL异常:" + (r.exceptionDetails.text || "");
    return undefined;
  };
  await new Promise(r => ws.onopen = r);
  await send("Page.enable", {});
  await send("Runtime.enable", {});

  say("===== 步骤1：打开公网链接 =====");
  await send("Page.navigate", { url: PAGE });
  await sleep(4000);
  for (let i = 0; i < 40; i++) {
    const s = await ev(`(function(){ return String(typeof window.Api); })()`);
    if (s === "object") { say("   页面+Api 加载好（探 " + (i + 1) + " 次）"); break; }
    await sleep(800);
  }

  say("===== 步骤2：取今日计划（看是不是真库） =====");
  const plan = await ev(`(function(){ return document.getElementById('outJson').textContent.slice(0,160); })()`);
  say("   outJson 前 160 字：" + plan);
  const isReal = await ev(`(function(){ try{ var j=JSON.parse(document.getElementById('outJson').textContent); return (j&&j.ok&&j.data)?'真数据ok:true':'不是真数据'; }catch(e){ return '解析失败:'+e.message; } })()`);
  say("   判定：" + isReal);

  say("===== 步骤3：记一笔（真实写入 day21demo） =====");
  await ev(`(function(){ document.getElementById('inPid').value='${PID}'; document.getElementById('inWord').value='${WORD}'; document.getElementById('selRight').value='true'; document.getElementById('selMode').value='new'; })()`);
  const p1 = await ev(`(function(){ return new Promise(function(res){ window.Api.addRecord({plan_day_id:${PID},word:'${WORD}',pos:'n',is_correct:true,mode:'new'}, function(r){ res(JSON.stringify(r)); }); }); })()`);
  say("   写入返回：" + p1);

  say("===== 步骤4：刷新页面（模拟用户关掉重开） =====");
  await send("Page.reload", {});
  await sleep(3500);
  for (let i = 0; i < 40; i++) {
    const s = await ev(`(function(){ return String(typeof window.Api); })()`);
    if (s === "object") { say("   刷新后重载好（探 " + (i + 1) + " 次）"); break; }
    await sleep(800);
  }

  say("===== 步骤5：刷新后取记录，看那笔还在（持久化） =====");
  let g = await ev(selWord);
  say("   云实例查 day21demo：" + g);
  let found = null;
  try { const o = JSON.parse(g); if (o && o.data && o.data.length) found = o.data[0]; } catch (e) {}

  const t1 = Date.now();   // 计时终点
  const sec = ((t1 - t0) / 1000).toFixed(1);

  say("===== 步骤6：清理测试笔（不污染云） =====");
  const d = await ev(delWord);
  say("   删除 day21demo：" + d);

  say("");
  say("【计时】核心流程耗时 = " + sec + " 秒  （≤300 秒=合格：" + (sec <= 300 ? "合格 ✔" : "超时 ✘") + "）");
  say("【判定】取真数据：" + (isReal === "真数据ok:true" ? "✔" : "✘") +
      " ／ 真实写入：" + (p1 && p1.indexOf("ok") >= 0 ? "✔" : "✘") +
      " ／ 刷新后持久化：" + (found ? "✔" : "✘"));

  fs.writeFileSync(OUT, out.join("\n") + "\n", "utf8");
  say("原话存：" + OUT);

  ws.close(); edge.kill();
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}
  process.exit(0);
})().catch(e => { console.error("出错了：" + e.message); fs.writeFileSync(OUT, out.join("\n") + "\n出错了：" + e.message + "\n", "utf8"); process.exit(1); });
