// store.js —— 本地存储层（全站"记东西 / 读东西"只走这一个文件）
// ===== 今日问题：数据存在哪、怎么存，才不会四个页面各翻各的？ =====
// 答：单独一个 store.js 管全部本地存储。四个页面只喊功能名（Store.isFavorite("important")），
//     不碰浏览器存储本身。理由三条：
//     ① 以后换云端只改这里，页面层一行不用动（对齐徐慧站 store.js 的做法）；
//     ② 四个 key 集中一处，不会再出现"某页面绕过接口自己直翻存储"（detail.js 就犯过这个错）；
//     ③ 存坏了 / 存不进去（隐私模式、配额满）只在这一个地方兜，页面不会莫名崩。
// ===== 今日边界（不做）：逐词对错统计 backlog①、跨设备同步、数据导出备份 =====

var Store = (function () {
  // 四个 key 集中在这里；别处不准再出现存储键名
  var KEYS = {
    stats: "cet4_stats",
    wrong: "cet4_wrong",
    learned: "cet4_learned",
    favorites: "cet4_favorites"
  };

  // ---------- 底层两个动作 ----------
  // 读：解析失败 / 不存在都给默认值，不让页面崩
  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (raw === null || raw === undefined) return fallback;
      var v = JSON.parse(raw);
      return v === null ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }
  // 写：写失败（配额满 / 隐私模式）抛给调用方兜底，不静默吞掉
  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  // 列表读写（错词 / 已学 / 收藏都是数组）
  function getList(key) {
    var v = read(key, []);
    return Array.isArray(v) ? v : [];
  }
  function saveList(key, arr) { write(key, arr); }

  // 今天日期字符串 YYYY-MM-DD（跨天判断用）
  function todayStr() {
    var d = new Date();
    var m = String(d.getMonth() + 1);
    var day = String(d.getDate());
    if (m.length < 2) m = "0" + m;
    if (day.length < 2) day = "0" + day;
    return d.getFullYear() + "-" + m + "-" + day;
  }

  // ---------- 统计 ----------
  function defaultStats() {
    return { todayDate: todayStr(), todayNew: 0, totalLearned: 0, correct: 0, totalAnswered: 0 };
  }

  // 读取汇总统计，并在读取时自动做跨天清零
  function getStats() {
    var s = read(KEYS.stats, null) || defaultStats();
    if (s.todayDate !== todayStr()) {
      s.todayNew = 0;
      s.todayDate = todayStr();
      write(KEYS.stats, s);
    }
    return s;
  }
  function saveStats(s) { write(KEYS.stats, s); }

  // ---------- 错题本 ----------
  function getWrong() { return getList(KEYS.wrong); }
  function saveWrong(arr) { saveList(KEYS.wrong, arr); }
  // 待复习数量 = 错题本里 status 为 pending 的条数
  function pendingCount() {
    return getWrong().filter(function (w) { return w.status === "pending"; }).length;
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
  // 答对 → 从待复习改为已掌握
  function markMastered(word) {
    var wrong = getWrong().map(function (w) {
      return w.word === word ? { word: w.word, status: "mastered" } : w;
    });
    saveWrong(wrong);
  }

  // ---------- 已学词 ----------
  function getLearned() { return getList(KEYS.learned); }
  function isLearned(word) { return getLearned().indexOf(word) !== -1; }
  function markLearned(word) {
    var l = getLearned();
    if (l.indexOf(word) === -1) {
      l.push(word);
      saveList(KEYS.learned, l);
    }
  }

  // ---------- 收藏 ----------
  function getFavorites() { return getList(KEYS.favorites); }
  function isFavorite(word) { return getFavorites().indexOf(word) !== -1; }
  // 切换收藏，返回新状态（true=已收藏）；写失败会抛错，由调用方兜底
  function toggleFavorite(word) {
    var f = getFavorites();
    var i = f.indexOf(word);
    var nowFav;
    if (i === -1) { f.push(word); nowFav = true; }
    else { f.splice(i, 1); nowFav = false; }
    saveList(KEYS.favorites, f);
    return nowFav;
  }

  // ---------- 作答记录 ----------
  // 新词作答：每做一次 todayNew+1；对错都计入答题数；首次学的词累计+1；答错进错题本
  function recordNewWord(word, isCorrect) {
    var s = getStats();
    var before = getLearned().length;
    s.todayNew += 1;
    s.totalAnswered += 1;
    if (isCorrect) s.correct += 1;

    markLearned(word);
    if (getLearned().length > before) s.totalLearned += 1;
    saveStats(s);

    if (!isCorrect) addWrong(word);
  }

  // 错题复习作答：计答题数，答对则移出待复习
  function recordWrongReview(word, isCorrect) {
    var s = getStats();
    s.totalAnswered += 1;
    if (isCorrect) s.correct += 1;
    saveStats(s);

    if (isCorrect) markMastered(word);
  }

  // ---------- 首页四个数字 ----------
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

  return {
    // 底层
    read: read, write: write,
    // 统计
    getStats: getStats, saveStats: saveStats, summary: summary,
    // 错题本
    getWrong: getWrong, saveWrong: saveWrong, addWrong: addWrong,
    markMastered: markMastered, pendingCount: pendingCount,
    // 已学
    getLearned: getLearned, isLearned: isLearned, markLearned: markLearned,
    // 收藏
    getFavorites: getFavorites, isFavorite: isFavorite, toggleFavorite: toggleFavorite,
    // 作答
    recordNewWord: recordNewWord, recordWrongReview: recordWrongReview
  };
})();

// 挂到全局，页面层只认 Store，不认 localStorage
window.Store = Store;
