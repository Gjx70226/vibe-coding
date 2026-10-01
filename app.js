// app.js —— 首页视图（单页 hash 路由下的 home 视图）
// ===== 今日问题：首页在单页里该长啥样？ =====
// 答：一个 render(container) 函数，router 调它把内容塞进 #content。
// 理由：① 数据仍只问 Store（不碰浏览器存储）；② 导航高亮归 router，本文件不管；
//       ③ 不再自己 setTimeout 启动，交给 router 统一管四态。
// 今日边界：不做路由、不做其他视图、不做存储（都归别处）
(function () {
  // 首页 HTML 模板（原来 index.html 里那段，搬进视图由 router 渲染）
  var HOME_HTML =
    '<header class="hero">' +
      '<h1>四级备考助手 <span class="heart">❤️</span></h1>' +
      '<p class="subtitle">记单词 · 自测 · 巩固生词</p>' +
      '<span class="badge-online">1926 人正在学习</span>' +
    '</header>' +
    '<section class="stat-grid">' +
      '<div class="stat-card"><div class="stat-num" id="stat-today">0</div><div class="stat-label">今日新学</div></div>' +
      '<div class="stat-card"><div class="stat-num" id="stat-review">0</div><div class="stat-label">待复习错题</div></div>' +
      '<div class="stat-card"><div class="stat-num" id="stat-total">0</div><div class="stat-label">累计学习单词</div></div>' +
      '<div class="stat-card"><div class="stat-num" id="stat-acc">0%</div><div class="stat-label">答题正确率</div></div>' +
    '</section>' +
    '<section class="entry-grid">' +
      '<a class="entry-card entry-blue" href="#/study">' +
        '<div class="entry-icon">📚</div><div class="entry-title">新词学习</div>' +
        '<div class="entry-desc">选择题背词，答错自动进错题本</div><div class="entry-btn">开始学习 →</div>' +
      '</a>' +
      '<a class="entry-card entry-red" href="#/review">' +
        '<div class="entry-icon">🔁</div><div class="entry-title">错题复习</div>' +
        '<div class="entry-desc">重做待复习错题，答对即移除</div><div class="entry-btn">去复习 →</div>' +
      '</a>' +
    '</section>' +
    '<div class="empty-box" id="homeEmpty" hidden>📚 还没有学习记录，点击下方「新词学习」开始背单词吧</div>';

  // 把 Store 里的四个数字画到卡片上（内部函数，页面测试也可单独调）
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

  // 全新用户（啥都没学）时给个引导
  function maybeHomeEmpty() {
    var el = document.getElementById("homeEmpty");
    if (!el) return;
    var forceEmpty = new URLSearchParams(location.search).get("simempty") === "1";
    var s = Store.summary();
    var isEmpty = forceEmpty || (s.todayNew === 0 && s.pending === 0 && s.totalLearned === 0);
    el.hidden = !isEmpty;
  }

  // 给路由用的首页视图
  window.HomeView = {
    render: function (container) {
      container.innerHTML = HOME_HTML;
      renderSummary();
      maybeHomeEmpty();
      UI.initA11y("首页");   // 无障碍：焦点落正文 + 读屏念「已进入：首页」
    }
  };

  // 挂在全局方便 F12 控制台测试；数据接口请用 Store
  window.CET4 = {
    renderSummary: renderSummary,
    summary: Store.summary
  };
})();
