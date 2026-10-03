// app.js —— 首页视图（单页 hash 路由下的 home 视图）
// ===== 今日问题：首页在单页里该长啥样？ =====
// 答：一个 render(container) 函数，router 调它把内容塞进 #content。
// 理由：① 数据仍只问 Store（不碰浏览器存储）；② 导航高亮归 router，本文件不管；
//       ③ 不再自己 setTimeout 启动，交给 router 统一管四态。
// 今日边界：不做路由、不做其他视图、不做存储（都归别处）
// 更新（Day 14 backlog ①②④⑥）：入口从 2 个加到 4 个（每日复习 / 词表统计），
//       并让卡片上的小字跟着真实数据走（有没有做到一半的那组、今天还有几个要复习）。
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
    '<div class="last-err" id="lastErr" hidden></div>' +
    '<section class="entry-grid">' +
      '<a class="entry-card entry-blue" href="#/study">' +
        '<div class="entry-icon">📚</div><div class="entry-title">新词学习</div>' +
        '<div class="entry-desc" id="entryStudyDesc">选择题背词，答错自动进错题本</div><div class="entry-btn">开始学习 →</div>' +
      '</a>' +
      '<a class="entry-card entry-red" href="#/review">' +
        '<div class="entry-icon">🔁</div><div class="entry-title">错题复习</div>' +
        '<div class="entry-desc" id="entryReviewDesc">重做待复习错题，答对会留在错题本里</div><div class="entry-btn">去复习 →</div>' +
      '</a>' +
      '<a class="entry-card entry-green" href="#/daily">' +
        '<div class="entry-icon">🎯</div><div class="entry-title">每日复习</div>' +
        '<div class="entry-desc" id="entryDailyDesc">从学过的词里，每天挑一批循环刷</div><div class="entry-btn">开始复习 →</div>' +
      '</a>' +
      '<a class="entry-card entry-purple" href="#/list">' +
        '<div class="entry-icon">📊</div><div class="entry-title">词表统计</div>' +
        '<div class="entry-desc" id="entryListDesc">翻全部词表，看每个词你答对几次、答错几次</div><div class="entry-btn">去看看 →</div>' +
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

    // 卡片上的小字也跟着数据走（backlog ①：有没有做到一半的那组）
    var studyDesc = document.getElementById("entryStudyDesc");
    if (studyDesc) {
      var p = Store.loadProgress();
      var done = p && typeof p.idx === "number" ? p.idx + 1 : 0;
      studyDesc.textContent = (p && done > 1)
        ? "上次做到第 " + done + " 词，接着做 →"
        : "一轮 10 词，答错自动进错题本";
    }
    var reviewDesc = document.getElementById("entryReviewDesc");
    if (reviewDesc) {
      reviewDesc.textContent = "待复习 " + s.pending + " 个 · 已掌握 " + s.mastered + " 个";
    }
    var dailyDesc = document.getElementById("entryDailyDesc");
    if (dailyDesc) {
      dailyDesc.textContent = s.totalLearned === 0
        ? "从学过的词里每天挑一批，先去背几个新词"
        : (s.dailyDue > 0
          ? "今天还有 " + s.dailyDue + " 个学过该复习"
          : "今天学过的词都复习完啦");
    }
    var listDesc = document.getElementById("entryListDesc");
    if (listDesc && typeof WORDS !== "undefined") {
      var total = WORDS.length;
      var got = 0;
      WORDS.forEach(function (w) {
        var c = Store.getCount(w.word);
        if (c.correct > 0 || c.wrong > 0) got++;
      });
      listDesc.textContent = "共 " + total + " 个词，已练过 " + got + " 个";
    }
  }

  // 上次在哪儿翻车了？红框一出现就会把原因记下来（components.js 里写的档），
  // 这里在首页画成一行黄字——不用每次都跑去截那块红框，回来就看见。
  function showLastError() {
    var el = document.getElementById("lastErr");
    if (!el) return;
    var msg = (typeof UI !== "undefined" && UI.lastError && UI.lastError()) || "";
    if (!msg) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = "<div class=\"last-err-title\">上次打开出了个错（先别急着刷新）：</div>" +
      "<div class=\"last-err-msg\">" + msg + "</div>" +
      "<button class=\"last-err-btn\" type=\"button\" id=\"lastErrOk\">知道了，清掉这条</button>";
    var btn = document.getElementById("lastErrOk");
    if (btn) {
      btn.onclick = function () {
        if (typeof UI !== "undefined" && UI.clearLastError) UI.clearLastError();
        el.hidden = true;
      };
    }
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
      showLastError();
      maybeHomeEmpty();
    }
  };

  // 挂在全局方便 F12 控制台测试；数据接口请用 Store
  window.CET4 = {
    renderSummary: renderSummary,
    summary: Store.summary
  };
})();
