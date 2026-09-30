// tools/verify_day11.js —— 验证收藏功能的"重复幂等"与"失败路径"
// 用 vm 加载真实 app.js（不依赖浏览器），mock localStorage/document/window
const fs = require('fs');
const vm = require('vm');
const path = require('path');

function makeSandbox() {
  let store = {};
  const localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  const document = { getElementById: () => null, querySelectorAll: () => [] };
  const sandbox = {
    localStorage,
    document,
    console,
    setTimeout,
    clearTimeout,
    window: { location: { pathname: '/study.html' } },
  };
  return { sandbox, localStorage };
}

const code = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').toString();

let pass = true;
function check(name, cond) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name);
  if (!cond) pass = false;
}

// ---- 正常 + 重复路径：幂等，不重复添加 ----
const c1 = makeSandbox();
vm.createContext(c1.sandbox);
vm.runInContext(code, c1.sandbox);
const CET4 = c1.sandbox.window.CET4;

CET4.toggleFavorite('apple');  // 收藏
CET4.toggleFavorite('apple');  // 取消
CET4.toggleFavorite('apple');  // 再收藏
check('正常/重复：toggle 三次后只保留 1 个（幂等）', CET4.getFavorites().length === 1 && CET4.getFavorites()[0] === 'apple');

CET4.toggleFavorite('banana');
check('再加一个词后共 2 个', CET4.getFavorites().length === 2);
CET4.toggleFavorite('banana'); // 取消
check('取消 banana 后剩 1 个', CET4.getFavorites().length === 1 && CET4.getFavorites()[0] === 'apple');
check('isFavorite 状态正确', CET4.isFavorite('apple') === true && CET4.isFavorite('banana') === false);

// ---- 失败路径：localStorage.setItem 抛异常 ----
const c2 = makeSandbox();
vm.createContext(c2.sandbox);
vm.runInContext(code, c2.sandbox);
const CET4b = c2.sandbox.window.CET4;
c2.localStorage.setItem = function () { throw new Error('quota exceeded'); }; // 模拟写失败
let threw = false;
try { CET4b.toggleFavorite('pear'); } catch (e) { threw = true; }
check('失败：setItem 抛异常时 toggle 上抛（触发失败 toast）', threw);
check('失败：收藏列表不变（图标不改，保持原状）', CET4b.getFavorites().length === 0);

console.log(pass ? '\nALL PASS ✅' : '\nSOME FAIL ❌');
process.exit(pass ? 0 : 1);
