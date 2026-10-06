/* ============================================================
   Day 21 反假检测：POST 写读闭环（无头 Edge 真开公网，独立测试词，跑完清理）
   用云实例 select/delete 做读回与清理，绕开 Api.getRecords 的日期过滤不确定性。
   跑法：node tools/verify_day21_post.js
   原话存 day21-review/反假检测-POST.txt
   ============================================================ */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 9371;
const PAGE = process.argv[2] || "https://cet4-word-helper.app.workbuddy.host/api.html";
const PROFILE = path.join(ROOT, "day21-review/_edge_tmp_profile");
const OUT = path.join(ROOT, "day21-review/反假检测-POST.txt");

fs.mkdirSync(path.join(ROOT, "day21-review"), { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let out = [];
function say(t) { console.log(t); out.push(t); }

(async () => {
  const edge = spawn(EDGE, [
    "--headless=new", "--remote-debugging-port=" + PORT, "--user-data-dir=" + PROFILE,
    "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--window-size=820,1500",
    "about:blank"
  ], { stdio: "ignore" });

  let targets = null;
  for (let i = 0; i < 40; i++) {
    try { targets = await (await fetch("http://127.0.0.1:" + PORT + "/json/list")).json(); break; }
    catch (e) { await sleep(500); }
  }
  const page = targets.find(t => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const waiters = new Map();
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && waiters.has(m.id)) { waiters.get(m.id)(m); waiters.delete(m.id); }
  };
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

  await send("Page.navigate", { url: PAGE });
  await sleep(4000);
  for (let i = 0; i < 40; i++) {
    const s = await ev(`(function(){ return String(typeof window.Api); })()`);
    if (s === "object") { say("Api 加载好（探 " + (i + 1) + " 次）"); break; }
    await sleep(800);
  }

  const WORD = "day21probe";
  const PID = 6;

  /* 用云实例做 select/delete（绕过 Api.getRecords 日期过滤） */
  const PK = "wbpk_O12WtR6v99Wu8kmCZRjKgH_sg9Rb6ux7sTaa09hgVS0BCVep93u20G3";
  const END = "https://cet4-word-helper.app.workbuddy.host";
  const mkCloud = "var C=window.WorkBuddyCloud.createWorkBuddyCloud({endpoint:'" + END + "',publishableKey:'" + PK + "'});";

  const selWord = (extra) => "(async function(){ " + mkCloud + " try{ var r=await C.database.from('checkins').select('id,word,plan_day_id,correct_count,wrong_count').eq('word','" + WORD + "').eq('plan_day_id'," + PID + ")" + (extra || "") + "; return JSON.stringify(r); }catch(e){ return 'ERR:'+e.message; } })()";
  const delId = (rid) => "(async function(){ " + mkCloud + " try{ var r=await C.database.from('checkins').delete().eq('id'," + rid + "); return JSON.stringify(r); }catch(e){ return 'ERR:'+e.message; } })()";

  /* 0) 清理历史残留 */
  say("===== 先清理任何 day21probe 残留 =====");
  let got = await ev(selWord());
  say("   残留查询：" + got);
  let ids = [];
  try { const o = JSON.parse(got); if (o && o.data) ids = o.data.map(x => x.id); } catch (e) {}
  for (const rid of ids) { const d = await ev(delId(rid)); say("   删 id=" + rid + "：" + d); }

  /* 1) 写入前数行（用 Api 的 total，已证可用） */
  const n0 = await ev(`(function(){ return new Promise(function(res){ window.Api.getRecords({date:'${(new Date().getFullYear()+'-'+String(new Date().getMonth()+1).padStart(2,'0')+'-'+String(new Date().getDate()).padStart(2,'0'))}',limit:1}, function(r){ res(r.ok?r.data.total:('ERR:'+JSON.stringify(r))); }); }); })()`);
  say("① 写入前今日行数 = " + n0);

  /* 2) 写入 */
  const p1 = await ev(`(function(){ return new Promise(function(res){ window.Api.addRecord({plan_day_id:${PID},word:'${WORD}',pos:'n',is_correct:true,mode:'new'}, function(r){ res(r); }); }); })()`);
  say("② 正常写入（词=" + WORD + "）：" + JSON.stringify(p1));

  /* 3) 写入后数行 */
  const n1 = await ev(`(function(){ return new Promise(function(res){ window.Api.getRecords({date:'${(new Date().getFullYear()+'-'+String(new Date().getMonth()+1).padStart(2,'0')+'-'+String(new Date().getDate()).padStart(2,'0'))}',limit:1}, function(r){ res(r.ok?r.data.total:('ERR:'+JSON.stringify(r))); }); }); })()`);
  say("③ 写入后行数 = " + n1 + (n1 === n0 + 1 ? "  ← +1 行 ✔" : "  ← 异常"));

  /* 4) 读回闭环：云实例精确查 word */
  let g2 = await ev(selWord());
  say("④ 云实例查「" + WORD + "」：" + g2);
  let found = null;
  try { const o = JSON.parse(g2); if (o && o.data && o.data.length) found = o.data[0]; } catch (e) {}

  /* 5) 清理测试行 */
  if (found && found.id) {
    const d = await ev(delId(found.id));
    say("⑤ 删除 id=" + found.id + "：" + d);
  } else {
    say("⑤ 没拿到 id，用 word 再查一遍删：" + (await ev(selWord())));
  }

  await sleep(800);
  const n2 = await ev(`(function(){ return new Promise(function(res){ window.Api.getRecords({date:'${(new Date().getFullYear()+'-'+String(new Date().getMonth()+1).padStart(2,'0')+'-'+String(new Date().getDate()).padStart(2,'0'))}',limit:1}, function(r){ res(r.ok?r.data.total:('ERR:'+JSON.stringify(r))); }); }); })()`);
  say("⑥ 清理后行数 = " + n2 + (n2 === n0 ? "  ← 回到写入前 ✔（没污染）" : "  ← 未完全清理（" + (n2 - n0) + " 行残留）"));

  say("");
  say("【判定】写入+1：" + (n1 === n0 + 1 ? "对得上 ✔" : "对不上 ✘") +
      " ／ 读回闭环：" + (found ? "对得上 ✔" : "对不上 ✘") +
      " ／ 清理：" + (n2 === n0 ? "干净 ✔" : "残留 ✘"));

  fs.writeFileSync(OUT, out.join("\n") + "\n", "utf8");
  say("原话存：" + OUT);

  ws.close(); edge.kill();
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}
  process.exit(0);
})().catch(e => { console.error("出错了：" + e.message); fs.writeFileSync(OUT, out.join("\n") + "\n出错了：" + e.message + "\n", "utf8"); process.exit(1); });
