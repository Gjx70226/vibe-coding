// app.js —— 四级备考助手脚本
// 当前已含：导航高亮 + 本地存储层（cet4_stats/cet4_wrong/cet4_learned）+ 首页渲染 + 跨天清零
// 背词/复习逻辑在第③④步接入，会调用本文件暴露的 window.CET4 接口

// ===== 1. 导航高亮：根据当前页面给对应导航项加 active =====
(function () {
  var path = window.location.pathname;
  var page = "index";
  if (path.includes("study.html")) page = "study";
  else if (path.includes("review.html")) page = "review";

  var links = document.querySelectorAll(".pill-nav a");
  links.forEach(function (el) {
    if (el.getAttribute("data-page") === page) el.classList.add("active");
  });
})();

// ===== 2. 本地存储层 =====
var CET4 = (function () {
  var KEY_STATS = "cet4_stats";
  var KEY_WRONG = "cet4_wrong";
  var KEY_LEARNED = "cet4_learned";

  // 今天日期字符串 YYYY-MM-DD（用于跨天判断）
  function todayStr() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }

  function defaultStats() {
    return { todayDate: todayStr(), todayNew: 0, totalLearned: 0, correct: 0, totalAnswered: 0 };
  }

  // 读取汇总统计，并在读取时自动做跨天清零
  function getStats() {
    var s;
    try {
      s = JSON.parse(localStorage.getItem(KEY_STATS));
    } catch (e) {
      s = null;
    }
    if (!s) s = defaultStats();

    // 跨天清零：记录的日期不是今天，则今日新学归零、日期更新为今天
    if (s.todayDate !== todayStr()) {
      s.todayNew = 0;
      s.todayDate = todayStr();
      saveStats(s);
    }
    return s;
  }

  function saveStats(s) {
    localStorage.setItem(KEY_STATS, JSON.stringify(s));
  }

  function getWrong() {
    try {
      return JSON.parse(localStorage.getItem(KEY_WRONG)) || [];
    } catch (e) {
      return [];
    }
  }
  function saveWrong(arr) {
    localStorage.setItem(KEY_WRONG, JSON.stringify(arr));
  }

  function getLearned() {
    try {
      return JSON.parse(localStorage.getItem(KEY_LEARNED)) || [];
    } catch (e) {
      return [];
    }
  }
  function saveLearned(arr) {
    localStorage.setItem(KEY_LEARNED, JSON.stringify(arr));
  }

  // 待复习数量 = 错题本里 status 为 pending 的条数
  function pendingCount() {
    return getWrong().filter(function (w) { return w.status === "pending"; }).length;
  }

  // 首页四个数字
  function summary() {
    var s = getStats();
    var acc = s.totalAnswered > 0 ? Math.round((s.correct / s.totalAnswered) * 100) : 0;
    return {
      todayNew: s.todayNew,
      pending: pendingCount(),
      totalLearned: s.totalLearned,
      accuracy: acc
    };
  }

  // 把四个数字写到首页卡片（元素不存在则跳过，兼容学习/复习页）
  function renderSummary() {
    var data = {
      "stat-today": summary().todayNew,
      "stat-review": summary().pending,
      "stat-total": summary().totalLearned,
      "stat-acc": summary().accuracy + "%"
    };
    Object.keys(data).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.textContent = data[id];
    });
  }

  // ===== 写入接口（供第③④步调用） =====

  // 记录一次新词作答：每做一次 todayNew+1；对错都计入答题数；首次学的词累计+1；答错进错题本
  function recordNewWord(word, isCorrect) {
    var s = getStats();
    s.todayNew += 1;
    s.totalAnswered += 1;
    if (isCorrect) s.correct += 1;

    var learned = getLearned();
    if (learned.indexOf(word) === -1) {
      learned.push(word);
      s.totalLearned += 1;
      saveLearned(learned);
    }
    saveStats(s);

    if (!isCorrect) addWrong(word);
  }

  // 答错进错题本（已存在 pending 的不重复加）
  function addWrong(word) {
    var wrong = getWrong();
    var exists = wrong.some(function (w) { return w.word === word && w.status === "pending"; });
    if (!exists) {
      wrong.push({ word: word, status: "pending" });
      saveWrong(wrong);
    }
  }

  // 记录一次错题复习：答对则从待复习移除（status 改为 mastered）
  function recordWrongReview(word, isCorrect) {
    var s = getStats();
    s.totalAnswered += 1;
    if (isCorrect) s.correct += 1;
    saveStats(s);

    if (isCorrect) markMastered(word);
  }

  function markMastered(word) {
    var wrong = getWrong().map(function (w) {
      return w.word === word ? { word: w.word, status: "mastered" } : w;
    });
    saveWrong(wrong);
  }

  // 暴露接口
  return {
    summary: summary,
    renderSummary: renderSummary,
    recordNewWord: recordNewWord,
    recordWrongReview: recordWrongReview,
    getStats: getStats,
    getWrong: getWrong,
    getLearned: getLearned
  };
})();

// 挂到全局，方便 F12 控制台测试和后续步骤调用
window.CET4 = CET4;

// ===== 3. 首页加载即渲染四个数字 =====
CET4.renderSummary();
