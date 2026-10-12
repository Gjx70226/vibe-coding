#!/usr/bin/env node
/* verify-project.js —— 发布前检查 Skill 的执行脚本（Day 25）
 * 纯 node 22 内置能力（fs / child_process / fetch），不引外部包。
 * 用法：node tools/verify-project.js
 * 产出：day25-review/report-<时间戳>.txt 与 .html，逐项 PASS/FAIL/N/A/人工⏳ + 证据。
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const REPORT_DIR = path.join(ROOT, 'day25-review');
if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });

const results = []; // {id, name, status, evidence}
function rec(id, name, status, evidence) {
  results.push({ id, name, status, evidence: evidence.replace(/\n+/g, ' ').trim() });
  const tag = { PASS: '✅PASS', FAIL: '❌FAIL', NA: '⚪N/A', MANUAL: '⏳人工' }[status];
  console.log(`[${tag}] ${id} ${name} — ${evidence.split('\n')[0]}`);
}
function sh(cmd) {
  try {
    const out = execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout || '') + (e.stderr || '') };
  }
}

// ---------- C1 版本闸门 ----------
function checkC1() {
  const comp = fs.readFileSync(path.join(ROOT, 'components.js'), 'utf8');
  const m = comp.match(/APP_VER\s*=\s*"([^"]+)"/);
  const appVer = m ? m[1] : null;
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const changed = sh('git diff --name-only HEAD').out.split(/\r?\n/).filter(Boolean)
    .filter(f => /\.(js|css)$/.test(f));
  const bad = [];
  changed.forEach(f => {
    const base = path.basename(f);
    const re = new RegExp(base + '\\?v=([0-9a-zA-Z]+)');
    const mm = html.match(re);
    if (!mm) { bad.push(`${base}: index.html 未引用`); return; }
    if (mm[1] !== appVer) bad.push(`${base}?v=${mm[1]} ≠ APP_VER ${appVer}`);
  });
  const ev = `APP_VER=${appVer}；改动静态资源=${changed.join(',') || '无'}` +
    (bad.length ? `；不一致：${bad.join('；')}` : '；全部一致');
  rec('C1', '版本闸门', bad.length ? 'FAIL' : 'PASS', ev);
}

// ---------- C2 语法闸门 ----------
function checkC2() {
  const files = fs.readdirSync(ROOT).filter(f => f.endsWith('.js'));
  const errs = [];
  files.forEach(f => {
    const r = sh(`"${process.execPath}" --check "${path.join(ROOT, f)}"`);
    if (r.code !== 0) errs.push(`${f}: ${r.out.slice(0, 120)}`);
  });
  rec('C2', '语法闸门', errs.length ? 'FAIL' : 'PASS',
    errs.length ? `语法错误：${errs.join('；')}` : `根目录 ${files.length} 个 .js 全部 node --check 通过`);
}

// ---------- C3 公网可达 + 版本生效 ----------
async function checkC3() {
  const URL = 'https://cet4-word-helper.app.workbuddy.host/';
  const wjs = fs.readFileSync(path.join(ROOT, 'words.js'), 'utf8');
  const wm = wjs.match(/word\s*:\s*["']([^"']+)["']/);
  const firstWord = wm ? wm[1] : null;
  const comp = fs.readFileSync(path.join(ROOT, 'components.js'), 'utf8');
  const appVer = (comp.match(/APP_VER\s*=\s*"([^"]+)"/) || [])[1];
  try {
    const idx = await (await fetch(URL)).text();
    const pageOk = idx.includes('四级备考助手') && idx.length > 300;
    const compTxt = await (await fetch(URL + 'components.js?v=' + appVer)).text();
    const verOk = compTxt.includes(`APP_VER = "${appVer}"`);
    const pass = pageOk && verOk && !!appVer;
    rec('C3', '公网可达+版本生效', pass ? 'PASS' : 'FAIL',
      `首页含站点标题「四级备考助手」=${pageOk}；components.js?v=${appVer} 含 APP_VER=${verOk}`);
  } catch (e) {
    rec('C3', '公网可达+版本生效', 'FAIL', `fetch 失败：${String(e).slice(0, 160)}（需公网/可访问）`);
  }
}

// ---------- C4 密钥扫描 ----------
function checkC4() {
  const ignoreDirs = ['node_modules', '.git', 'day24-review', 'day25-review', '_tmp', '_edge_profile', '.workbuddy'];
  const secretRe = /(sk-[A-Za-z0-9]{16,}|api[_-]?key\s*[:=]\s*["']?[A-Za-z0-9]{12,}|secret\s*[:=]\s*["']?[A-Za-z0-9]{8,}|password\s*[:=]\s*["']?[^"'\s]{6,}|token\s*[:=]\s*["']?[^"'\s]{10,})/i;
  const exampleRe = /(abcd|xxxx|your_|example|TODO|演示|示例|placeholder)/i;
  const hits = [];
  function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (!ignoreDirs.includes(ent.name)) walk(p);
      } else if (/\.(js|html|css|json)$/.test(ent.name)) {
        const txt = fs.readFileSync(p, 'utf8');
        const line = txt.split('\n').find(l => secretRe.test(l) && !exampleRe.test(l));
        if (line) hits.push(`${path.relative(ROOT, p)}: ${line.trim().slice(0, 80)}`);
      }
    }
  }
  walk(ROOT);
  const trackedEnv = sh('git ls-files').out.split(/\r?\n/).filter(f => f.endsWith('.env'));
  const hasExample = fs.existsSync(path.join(ROOT, '.env.example'));
  const ok = hits.length === 0 && trackedEnv.length === 0 && hasExample;
  rec('C4', '密钥/敏感信息扫描', ok ? 'PASS' : 'FAIL',
    `源码命中真实密钥=${hits.length}（${hits.join('；') || '无'}）；入库.env=${trackedEnv.length}（应0）；.env.example存在=${hasExample}`);
}

// ---------- C5 Git 安全 / .gitignore ----------
function checkC5() {
  const st = sh('git status --porcelain').out;
  const forbidden = ['_edge_profile', '_tmp_', 'node_modules', '.log'];
  const leaked = st.split('\n').filter(Boolean).filter(l => forbidden.some(k => l.includes(k)));
  const gi = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
  const rulesOk = ['_edge_profile', '_tmp_', 'node_modules', '*.log'].every(k => gi.includes(k));
  const ok = leaked.length === 0 && rulesOk;
  rec('C5', 'Git安全/.gitignore', ok ? 'PASS' : 'FAIL',
    `status 含禁入项=${leaked.length}（${leaked.join('；') || '无'}）；.gitignore 覆盖规则=${rulesOk}`);
}

// ---------- C6 关键交互回归（headless）----------
function checkC6() {
  const scripts = ['tools/verify_longpress_touch.js', 'tools/verify_peek_zh2en.js'];
  const fails = [];
  for (const s of scripts) {
    const r = sh(`"${process.execPath}" "${path.join(ROOT, s)}"`);
    const hasFail = /❌/.test(r.out);
    const hasOk = /✅/.test(r.out);
    if (r.code !== 0 || hasFail || !hasOk) fails.push(`${s}（退出${r.code}${hasFail ? ' 含❌' : ''}）`);
  }
  rec('C6', '关键交互回归(headless)', fails.length ? 'FAIL' : 'PASS',
    fails.length ? `未全绿：${fails.join('；')}` : '长按+中文模式两脚本均退出0且含✅、零error（脚本内已seed已学词覆盖localStorage读写）');
}

// ---------- C7 手机真机长按（人工）----------
function checkC7() {
  rec('C7', '手机真机长按', 'MANUAL', '须 vivo 真机确认长按出释义；未确认不得宣称通过（桌面模拟不出真机手势）');
}
// ---------- C8-C10 待后端 ----------
function checkC8_10() {
  rec('C8', '健康接口 /api/health', 'NA', 'N/A：纯前端无后端；接 WorkBuddy Cloud Service 后改为 curl /api/health 期望200+{ok:true}');
  rec('C9', '读写接口各调一次', 'NA', 'N/A：localStorage 读写已由 C6 覆盖；云端读写接口待后端');
  rec('C10', '数据库可连接/核心表', 'NA', 'N/A：待后端；接 Cloud Service 后检查核心表存在+一条SELECT成功');
}

// ---------- 主流程 ----------
async function main() {
  console.log('=== verify-project 发布前检查 ===');
  checkC1();
  checkC2();
  await checkC3();
  checkC4();
  checkC5();
  checkC6();
  checkC7();
  checkC8_10();

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fail = results.filter(r => r.status === 'FAIL');
  const manual = results.filter(r => r.status === 'MANUAL');
  const na = results.filter(r => r.status === 'NA');
  const ready = fail.length === 0;
  const conclusion = ready
    ? `✅ 可发布（非N/A项全PASS${manual.length ? '；但C7手机真机未确认，标注风险' : ''}）`
    : `❌ 不可发布：${fail.map(f => f.id + f.name).join('、')}`;

  const txt = [
    '=== verify-project 发布前检查报告 ===',
    `时间：${ts}`,
    ...results.map(r => `[${r.status}] ${r.id} ${r.name} — ${r.evidence}`),
    '',
    '结论：' + conclusion,
  ].join('\n');
  fs.writeFileSync(path.join(REPORT_DIR, `report-${ts}.txt`), txt, 'utf8');

  const html = `<!doctype html><meta charset=utf8><title>verify-project ${ts}</title>
  <h2>发布前检查报告 ${ts}</h2>
  <table border=1 cellpadding=6><tr><th>项</th><th>名称</th><th>结果</th><th>证据</th></tr>
  ${results.map(r => `<tr><td>${r.id}</td><td>${r.name}</td><td>${r.status}</td><td>${r.evidence}</td></tr>`).join('')}
  </table><p><b>结论：${conclusion}</b></p>`;
  fs.writeFileSync(path.join(REPORT_DIR, `report-${ts}.html`), html, 'utf8');

  console.log('\n结论：' + conclusion);
  console.log('报告：day25-review/report-' + ts + '.txt / .html');
  process.exit(fail.length ? 1 : 0);
}
main();
