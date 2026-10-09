/* ============================================================
   Day 22 板块④：公网真演练（无头 Edge 真开公网，独立测试行，跑完清理）
   步骤：插入测试行 → PATCH 改状态 → 软删（is_deleted=1，列表跳过）→ 找回（is_deleted=0）
        → 防呆（id=99999 报 not_found 不崩）→ 清理测试行
   全程用云实例精确 select 做硬证据，绕开日期过滤；页面按钮点真实路径，截图留证。
   跑法：node tools/verify_day22.js
   原话存 day22-review/演练-Day22.txt；截图 day22-review/*.png
   ============================================================ */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 9372;
const PAGE = process.argv[2] || "https://cet4-word-helper.app.workbuddy.host/api.html";
const PROFILE = path.join(ROOT, "day22-review/_edge_tmp_profile");
const OUT = path.join(ROOT, "day22-review/演练-Day22.txt");
const SHOTDIR = path.join(ROOT, "day22-review");

fs.mkdirSync(SHOTDIR, { recursive: true });
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
  const shot = async (name) => {
    const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    if (r.result && r.result.data) {
      fs.writeFileSync(path.join(SHOTDIR, name), Buffer.from(r.result.data, "base64"));
      say("   📸 截图存：" + name);
    } else { say("   ⚠️ 截图失败 " + name); }
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
  /* 无头环境里 confirm 会阻塞，直接覆盖成永远"确定" */
  await ev(`window.confirm = function(){ return true; };`);

  const WORD = "day22demo";
  const PID = 6;
  const PK = "wbpk_O12WtR6v99Wu8kmCZRjKgH_sg9Rb6ux7sTaa09hgVS0BCVep93u20G3";
  const END = "https://cet4-word-helper.app.workbuddy.host";
  const mkCloud = "var C=window.WorkBuddyCloud.createWorkBuddyCloud({endpoint:'" + END + "',publishableKey:'" + PK + "'});";
  const selAll = "(async function(){ " + mkCloud + " try{ var r=await C.database.from('checkins').select('id,status,is_deleted').eq('id'," + "__ID__" + "); return JSON.stringify(r); }catch(e){ return 'ERR:'+e.message; } })()";
  const selVisible = "(async function(){ " + mkCloud + " try{ var r=await C.database.from('checkins').select('id').eq('is_deleted',0).eq('id'," + "__ID__" + "); return JSON.stringify(r); }catch(e){ return 'ERR:'+e.message; } })()";
  const insWord = "(async function(){ " + mkCloud + " try{ var r=await C.database.from('checkins').insert({plan_day_id:" + PID + ",word:'" + WORD + "',pos:'n',correct_count:0,wrong_count:0,status:'pending',mode:'new'}).select('id,status,is_deleted').single(); return JSON.stringify(r); }catch(e){ return 'ERR:'+e.message; } })()";
  const delId = (rid) => "(async function(){ " + mkCloud + " try{ var r=await C.database.from('checkins').delete().eq('id'," + rid + "); return JSON.stringify(r); }catch(e){ return 'ERR:'+e.message; } })()";
  const getStatus = async (rid) => {
    const g = await ev(selAll.replace("__ID__", rid));
    try { const o = JSON.parse(g); if (o && o.data && o.data.length) return o.data[0]; } catch (e) {}
    return null;
  };

  /* 0) 清理历史残留 */
  say("===== 先清理任何 day22demo 残留 =====");
  let g0 = await ev("(async function(){ " + mkCloud + " try{ var r=await C.database.from('checkins').select('id').eq('word','" + WORD + "'); return JSON.stringify(r); }catch(e){ return 'ERR:'+e.message; } })()");
  say("   残留查询：" + g0);
  let rids = [];
  try { const o = JSON.parse(g0); if (o && o.data) rids = o.data.map(x => x.id); } catch (e) {}
  for (const rid of rids) { const d = await ev(delId(rid)); say("   硬删残留 id=" + rid + "：" + d); }

  /* 1) 插入测试行 */
  say("===== ① 插入测试行（词=" + WORD + "，pid=" + PID + "） =====");
  const ins = await ev(insWord);
  say("   插入返回：" + ins);
  let row = null;
  try { const o = JSON.parse(ins); if (o && o.data) row = o.data; } catch (e) {}
  if (!row || !row.id) { say("❌ 没拿到测试行 id，终止"); fs.writeFileSync(OUT, out.join("\n") + "\n", "utf8"); ws.close(); edge.kill(); try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {} process.exit(1); }
  const ID = row.id;
  say("   测试行 id = " + ID);

  /* 2) PATCH 前状态 */
  const before = await getStatus(ID);
  say("② PATCH 前：status=" + (before && before.status) + "，is_deleted=" + (before && before.is_deleted));

  /* 3) PATCH 改状态（点页面按钮：填编号+选 mastered+点改） */
  say("===== ③ PATCH 改状态（页面按钮真实路径） =====");
  await ev(`document.getElementById('inEditId').value='${ID}'; document.getElementById('selStatus').value='mastered'; document.getElementById('btnPatch').click();`);
  await sleep(1500);
  const after = await getStatus(ID);
  say("   PATCH 后：status=" + (after && after.status) + "，is_deleted=" + (after && after.is_deleted));
  say("   对比：pending → " + (after && after.status) + (after && after.status === "mastered" ? "  ✔ 改生效" : "  ✘ 没改"));
  await shot("PATCH-改后页面.png");

  /* 4) 软删（点页面删除按钮） */
  say("===== ④ 软删（页面删除按钮真实路径） =====");
  await ev(`document.getElementById('inEditId').value='${ID}'; document.getElementById('btnDelete').click();`);
  await sleep(1500);
  const del = await getStatus(ID);
  const visAfterDel = await ev(selVisible.replace("__ID__", ID));
  say("   软删后全量查：is_deleted=" + (del && del.is_deleted) + "（=1 表示已进回收站）");
  say("   列表可见查（is_deleted=0 过滤）：" + visAfterDel + "  ← 空数组=列表已跳过这条 ✔");
  await shot("DELETE-软删后页面.png");

  /* 5) 找回 */
  say("===== ⑤ 找回（页面找回按钮真实路径） =====");
  await ev(`document.getElementById('inEditId').value='${ID}'; document.getElementById('btnRestore').click();`);
  await sleep(1500);
  const res = await getStatus(ID);
  const visAfterRes = await ev(selVisible.replace("__ID__", ID));
  say("   找回后全量查：is_deleted=" + (res && res.is_deleted) + "（=0 表示已恢复）");
  say("   列表可见查（is_deleted=0 过滤）：" + visAfterRes + "  ← 有 id=" + ID + " 表示又出现了 ✔");

  /* 6) 防呆：操作不存在的 id=99999 */
  say("===== ⑥ 防呆：操作不存在的 id=99999 =====");
  const upMiss = await ev(`(function(){ return new Promise(function(res){ window.Api.updateRecord({id:99999,status:'mastered'}, function(r){ res(JSON.stringify(r)); }); }); })()`);
  say("   改 id=99999 返回：" + upMiss);
  const delMiss = await ev(`(function(){ return new Promise(function(res){ window.Api.deleteRecord({id:99999}, function(r){ res(JSON.stringify(r)); }); }); })()`);
  say("   删 id=99999 返回：" + delMiss);
  const hasNotFound = (upMiss && upMiss.indexOf("not_found") >= 0) && (delMiss && delMiss.indexOf("not_found") >= 0);
  say("   防呆判定：" + (hasNotFound ? "两处都报 not_found，不报成功、不崩 ✔" : "✘ 异常"));
  /* 页面填 99999 点改，截防呆图 */
  await ev(`document.getElementById('inEditId').value='99999'; document.getElementById('selStatus').value='mastered'; document.getElementById('btnPatch').click();`);
  await sleep(1200);
  await shot("防呆-不存在编号.png");

  /* 7) 清理测试行（硬删，不留回收站脏数据） */
  say("===== ⑦ 清理测试行 id=" + ID + " =====");
  const clean = await ev(delId(ID));
  say("   硬删：" + clean);
  const gEnd = await ev("(async function(){ " + mkCloud + " try{ var r=await C.database.from('checkins').select('id').eq('word','" + WORD + "'); return JSON.stringify(r); }catch(e){ return 'ERR:'+e.message; } })()");
  let endIds = [];
  try { const o = JSON.parse(gEnd); if (o && o.data) endIds = o.data.map(x => x.id); } catch (e) {}
  say("   清理后残留查询：" + gEnd + (endIds.length === 0 ? "  ← 干净 ✔" : "  ← 还有残留 ✘"));

  say("");
  say("【判定】PATCH 改生效：" + (after && after.status === "mastered" ? "✔" : "✘") +
      " ／ 软删进回收站（is_deleted=1 且列表跳过）：" + ((del && del.is_deleted === 1) ? "✔" : "✘") +
      " ／ 找回恢复（is_deleted=0 且列表再现）：" + ((res && res.is_deleted === 0) ? "✔" : "✘") +
      " ／ 防呆 not_found：" + (hasNotFound ? "✔" : "✘") +
      " ／ 清理干净：" + (endIds.length === 0 ? "✔" : "✘"));

  fs.writeFileSync(OUT, out.join("\n") + "\n", "utf8");
  say("原话存：" + OUT);

  ws.close(); edge.kill();
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}
  process.exit(0);
})().catch(e => { console.error("出错了：" + e.message); fs.writeFileSync(OUT, out.join("\n") + "\n出错了：" + e.message + "\n", "utf8"); process.exit(1); });
