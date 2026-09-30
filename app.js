// app.js —— 首页：导航高亮 + 四个数字渲染 + 加载/空/出错三态
// ===== 今日问题：app.js 现在该管什么？ =====
// 答：只管"首页怎么显示"。数据读写全部收进 store.js，本文件不碰浏览器存储。
// 理由三条：① 首页只关心"把四个数字画出来"，不该知道数据存在哪；
//           ② 存数据的地方只有一个（store.js），以后换云端只改那一个文件；
//           ③ 页面层喊功能名（Store.summary()）喊惯了，就再也不会各写一份存储逻辑。
// ===== 今日边界（不做）：不做数据存储（归 store.js）、不做词库逻辑（归 words.js）
// 依赖：Store（数据，见 store.js）、UI（转圈/空/出错公共零件，见 components.js）

// ===== 1. 导航高亮：根据当前页面给对应导航项加 active =====
(function () {
  var path = window.location.pathname;
  var page = "index";
  if (path.indexOf("study.html") !== -1) page = "study";
  else if (path.indexOf("review.html") !== -1) page = "review";

  var links = document.querySelectorAll(".pill-nav a");
  Array.prototype.forEach.call(links, function (el) {
    if (el.getAttribute("data-page") === page) el.classList.add("active");
  });
})();

// ===== 2. 首页渲染：把 Store 里的四个数字画到卡片上 =====
function renderSummary() {
  var s = Store.summary();
  var data = {
    "stat-today": s.todayNew,
    "stat-review": s.pending,
    "stat-total": s.totalLearned,
    "stat-acc": s.accuracy + "%"
  };
  Object.keys(data).forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.textContent = data[id];
  });
}

// 全新用户（啥都没学）时给个引导，而不是干巴巴四个 0
function maybeHomeEmpty() {
  var el = document.getElementById("homeEmpty");
  if (!el) return;
  var forceEmpty = new URLSearchParams(location.search).get("simempty") === "1";
  var s = Store.summary();
  var isEmpty = forceEmpty || (s.todayNew === 0 && s.pending === 0 && s.totalLearned === 0);
  el.hidden = !isEmpty;
}

// 挂在全局方便 F12 控制台测试；数据接口请用 Store，这里只放渲染
window.CET4 = {
  renderSummary: renderSummary,
  summary: Store.summary
};

// ===== 3. 四态流程：正常 / 出错 =====
function runNormal() {
  UI.pageReady();
  renderSummary();
  maybeHomeEmpty();
}

// 重试按钮：隐藏红条，重新走正常流程（演示用，忽略模拟错误）
var retryBtn = document.getElementById("retryBtn");
if (retryBtn) retryBtn.addEventListener("click", function () {
  var e = document.getElementById("errorBox");
  if (e) e.hidden = true;
  runNormal();
});

setTimeout(function () {
  var simError = new URLSearchParams(location.search).get("simerror") === "1";
  if (simError) UI.pageError();
  else runNormal();
}, 400);
