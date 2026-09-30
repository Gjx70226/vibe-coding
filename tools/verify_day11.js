// tools/verify_day11.js —— 验证收藏功能的"重复幂等"与"失败路径"
// 用 vm 加载真实 store.js + app.js（不依赖浏览器），mock localStorage/document/window
// 说明：Day 13 之后存储层整体搬进 store.js，app.js 只管渲染，
//       所以这里改为同时加载两个文件，并直接测 Store 的收藏接口。
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
    Math,
    JSON,
    Date,
    Array,
    Object,
    String,
    window: { location: { pathname: '/study.html' } },
  };
  return { sandbox, localStorage };
}

const storeCode = fs.readFileSync(path.join(__dirname, '..', 'store.js'), 'utf8').toString();
const appCode = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').toString();

let pass = true;
function check(name, cond) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name);
  if (!cond) pass = false;
}

// ---- 正常 + 重复路径：幂等，不重复添加 ----
const c1 = makeSandbox();
vm.createContext(c1.sandbox);
vm.runInContext(storeCode, c1.sandbox);
vm.runInContext(appCode, c1.sandbox);
const Store = c1.sandbox.window.Store;

check('分层：app.js 加载后 window.CET4 仍可用（首页渲染入口）', typeof c1.sandbox.window.CET4 === 'object');
check('分层：数据接口在 Store 上，不在 CET4 上', typeof Store === 'object' && typeof Store.toggleFavorite === 'function');

Store.toggleFavorite('apple');  // 收藏
Store.toggleFavorite('apple');  // 取消
Store.toggleFavorite('apple');  // 再收藏
check('正常/重复：toggle 三次后只保留 1 个（幂等）', Store.getFavorites().length === 1 && Store.getFavorites()[0] === 'apple');

Store.toggleFavorite('banana');
check('再加一个词后共 2 个', Store.getFavorites().length === 2);
Store.toggleFavorite('banana'); // 取消
check('取消 banana 后剩 1 个', Store.getFavorites().length === 1 && Store.getFavorites()[0] === 'apple');
check('isFavorite 状态正确', Store.isFavorite('apple') === true && Store.isFavorite('banana') === false);

// ---- 失败路径：localStorage.setItem 抛异常 ----
const c2 = makeSandbox();
vm.createContext(c2.sandbox);
vm.runInContext(storeCode, c2.sandbox);
vm.runInContext(appCode, c2.sandbox);
const Store2 = c2.sandbox.window.Store;
c2.localStorage.setItem = function () { throw new Error('quota exceeded'); }; // 模拟写失败
let threw = false;
try { Store2.toggleFavorite('pear'); } catch (e) { threw = true; }
check('失败：setItem 抛异常时 toggle 上抛（触发失败 toast）', threw);
check('失败：收藏列表不变（图标不改，保持原状）', Store2.getFavorites().length === 0);

// ---- 新增：错题本 / 已学 也走同一套存储接口 ----
const c3 = makeSandbox();
vm.createContext(c3.sandbox);
vm.runInContext(storeCode, c3.sandbox);
const S3 = c3.sandbox.window.Store;
S3.recordNewWord('important', false);
check('答错 → 自动进错题本', S3.getWrong().length === 1 && S3.getWrong()[0].status === 'pending');
check('答错 → 已学列表同步加上该词', S3.isLearned('important') === true);
const s = S3.getStats();
check('答错 → 今日新学 +1、答题数 +1', s.todayNew === 1 && s.totalAnswered === 1 && s.correct === 0);
S3.recordWrongReview('important', true);
check('复习答对 → 错题标记 mastered', S3.getWrong()[0].status === 'mastered');
check('复习答对 → 待复习数归零', S3.pendingCount() === 0);
check('summary 四个数字齐全', typeof S3.summary().accuracy === 'number' && typeof S3.summary().pending === 'number');

console.log(pass ? '\nALL PASS ✅' : '\nSOME FAIL ❌');
process.exit(pass ? 0 : 1);
