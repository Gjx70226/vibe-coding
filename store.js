// store.js —— 本地存储层（全站"记东西 / 读东西"只走这一个文件）
// ===== 今日问题：数据存在哪、怎么存，才不会四个页面各翻各的？ =====
// 答：单独一个 store.js 管全部本地存储。页面层只喊功能名（Store.isFavorite("important")），
//     不碰浏览器存储本身。理由三条：
//     ① 以后换云端只改这里，页面层一行不用动（对齐徐慧站 store.js 的做法）；
//     ② 存储键名集中一处，不会再出现"某页面绕过接口自己直翻存储"（detail.js 就犯过这个错）；
//     ③ 存坏了 / 存不进去（隐私模式、配额满）只在这一个地方兜，页面不会莫名崩。
// ===== 今日边界（不做）：跨设备同步、数据导出备份、词库本身（词库归 words.js）=====
// 更新（Day 14 backlog ①⑥⑦②④②）：补三类新账
//   逐词对错统计 cet4_counts（老数据没有这字段，读不到当 0，不会丢老进度）
//   新词学习未完成进度 cet4_progress（当天有效，跨天作废）
//   每日复习记录 cet4_daily（记今天复习过哪些词，跨天自动换新一批）

var Store = (function () {
  // 键名集中在这里；别处不准再出现存储键名
  var KEYS = {
    stats: "cet4_stats",
    wrong: "cet4_wrong",
    learned: "cet4_learned",
    favorites: "cet4_favorites",
    counts: "cet4_counts",     // 逐词：{ 单词: {c:答对次数, w:答错次数} }
    progress: "cet4_progress", // 新词学习：未做完的那批词 + 当前进度
    daily: "cet4_daily"        // 每日复习：{ date, ids:[] }
  };

  // 每日复习一轮推几个（backlog ②），想改个数改这里
  var DAILY_SIZE = 20;

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

  // ---------- 错题本（backlog ①：答对也保留在错题本，只改状态；另记错过次数）----------
  function getWrong() { return getList(KEYS.wrong); }
  function saveWrong(arr) { saveList(KEYS.wrong, arr); }
  // 待复习数量 = status 为 pending 的条数（已掌握的不占待复习）
  function pendingCount() {
    return getWrong().filter(function (w) { return w.status === "pending"; }).length;
  }
  // 错题本里某个词错了几次（老数据没有该字段就当 0）
  function wrongTimes(word) {
    var item = getWrong().filter(function (w) { return w.word === word; })[0];
    if (!item) return 0;
    return item.wrong || 0;
  }
  // 答错进错题本（已存在 pending 的加一次错过，不再重复加一行）
  function addWrong(word) {
    var wrong = getWrong();
    var item = wrong.filter(function (w) { return w.word === word; })[0];
    if (item) {
      if (item.status === "pending") item.wrong = (item.wrong || 0) + 1;
      saveWrong(wrong);
      return;
    }
    wrong.push({ word: word, status: "pending", wrong: 1 });
    saveWrong(wrong);
  }
  // 答对 → 从待复习改为已掌握（词条仍留在错题本里，不清空）
  function markMastered(word) {
    var wrong = getWrong().map(function (w) {
      return w.word === word ? { word: w.word, status: "mastered", wrong: w.wrong || 0 } : w;
    });
    saveWrong(wrong);
  }
  // 错题本两类：待复习 / 已掌握（backlog ① 的"另分两类"）
  function pendingWords() {
    return getWrong()
      .filter(function (w) { return w.status === "pending"; })
      .map(function (w) { return w.word; });
  }
  function masteredWords() {
    return getWrong()
      .filter(function (w) { return w.status === "mastered"; })
      .map(function (w) { return w.word; });
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

  // ---------- 逐词对错统计（backlog ①⑥⑦ 的底座）----------
  // 形状：{ 单词: { c: 答对次数, w: 答错次数 } }，老数据（没有这个 key）读不到就当 0
  function getCounts() {
    var v = read(KEYS.counts, null);
    return (v && typeof v === "object") ? v : {};
  }
  // 某个词答对几次 / 答错几次（永远返回对象，不会 undefined）
  function getCount(word) {
    var c = getCounts()[word];
    if (!c || typeof c !== "object") return { correct: 0, wrong: 0 };
    return { correct: c.c || 0, wrong: c.w || 0 };
  }
  // 记一次作答，返回该词累计后的 { correct, wrong }
  function addCount(word, isCorrect) {
    var all = getCounts();
    var cur = all[word] || { c: 0, w: 0 };
    all[word] = {
      c: (cur.c || 0) + (isCorrect ? 1 : 0),
      w: (cur.w || 0) + (isCorrect ? 0 : 1)
    };
    write(KEYS.counts, all);
    return { correct: all[word].c, wrong: all[word].w };
  }

  // ---------- 新词学习进度（backlog ④：中途退出再进来接着做）----------
  // 存当天那批词 + 当前第几个 + 已答对几个；跨天作废，重开新一批
  function saveProgress(state) {
    write(KEYS.progress, { date: todayStr(), data: state });
  }
  function loadProgress() {
    var p = read(KEYS.progress, null);
    if (!p || p.date !== todayStr() || !p.data) return null;
    return p.data;
  }
  function clearProgress() {
    try { localStorage.removeItem(KEYS.progress); } catch (e) { /* 存不了就算了 */ }
  }

  // ---------- 每日复习（backlog ②：从学过的词每天推一批）----------
  // 今天复习过哪些词记在这里，跨天自动清空（换一批新的）
  function markDaily(words) {
    write(KEYS.daily, { date: todayStr(), ids: words.slice() });
  }
  // 今天该复习的词：学过的词里，今天还没复习过的，先错过的排前面，最多 DAILY_SIZE 个
  function dailyWords() {
    var learned = getLearned();
    if (!learned.length) return [];
    var done = (read(KEYS.daily, null) || {}).ids || [];
    done = Array.isArray(done) ? done : [];
    var todo = learned.filter(function (w) { return done.indexOf(w) === -1; });
    // 错过次数多的排前面（先复习最不熟的）
    var counts = getCounts();
    todo.sort(function (a, b) {
      var aw = (counts[a] && counts[a].w) || 0;
      var bw = (counts[b] && counts[b].w) || 0;
      return bw - aw;
    });
    return todo.slice(0, DAILY_SIZE);
  }
  // 今天还剩几个要复习（首页数字用）
  function dailyDue() { return dailyWords().length; }

  // ---------- 作答记录 ----------
  // 统一的"答一题"入口（backlog ⑦：重试也算这一题里的尝试）
  // mode  = "new" 新词学习 | "wrong" 错题复习 | "daily" 每日复习
  // isRetry = 同一题的第 2、3 次尝试（重试不再加当天新学/正确率，只累计逐词对错）
  function attempt(word, isCorrect, mode, isRetry) {
    var s = getStats();
    if (!isRetry) {
      s.totalAnswered += 1;
      if (isCorrect) s.correct += 1;
    }
    if (mode === "new" && !isRetry) s.todayNew += 1;
    saveStats(s);

    if (mode === "new") markLearned(word);

    addCount(word, isCorrect);          // 逐词：答对几次 / 答错几次，每次尝试都记
    if (mode === "new" && !isCorrect) addWrong(word);   // 第一次选错立刻进错题本（入库与重试解耦）
    if (mode === "wrong" && isCorrect) markMastered(word); // 答对只改状态，词条留在错题本

    return getCount(word);              // 返回该词累计 { correct, wrong }
  }

  // 新词作答（兼容旧调用：第三参 isRetry 可选）
  function recordNewWord(word, isCorrect, isRetry) {
    return attempt(word, isCorrect, "new", !!isRetry);
  }
  // 错题复习作答
  function recordWrongReview(word, isCorrect, isRetry) {
    return attempt(word, isCorrect, "wrong", !!isRetry);
  }
  // 每日复习作答
  function recordDaily(word, isCorrect, isRetry) {
    return attempt(word, isCorrect, "daily", !!isRetry);
  }

  // ---------- 首页四个数字 ----------
  function summary() {
    var s = getStats();
    var acc = s.totalAnswered > 0 ? Math.round((s.correct / s.totalAnswered) * 100) : 0;
    return {
      todayNew: s.todayNew,
      pending: pendingCount(),
      totalLearned: s.totalLearned,
      accuracy: acc,
      dailyDue: dailyDue(),
      mastered: masteredWords().length,
      hasProgress: !!loadProgress()
    };
  }

  return {
    // 底层
    read: read, write: write,
    // 统计
    getStats: getStats, saveStats: saveStats, summary: summary,
    // 错题本
    getWrong: getWrong, saveWrong: saveWrong, addWrong: addWrong, wrongTimes: wrongTimes,
    markMastered: markMastered, pendingCount: pendingCount,
    pendingWords: pendingWords, masteredWords: masteredWords,
    // 已学
    getLearned: getLearned, isLearned: isLearned, markLearned: markLearned,
    // 收藏
    getFavorites: getFavorites, isFavorite: isFavorite, toggleFavorite: toggleFavorite,
    // 逐词统计
    getCount: getCount, addCount: addCount, getCounts: getCounts,
    // 新词学习进度
    saveProgress: saveProgress, loadProgress: loadProgress, clearProgress: clearProgress,
    // 每日复习
    markDaily: markDaily, dailyWords: dailyWords, dailyDue: dailyDue,
    // 作答
    attempt: attempt,
    recordNewWord: recordNewWord, recordWrongReview: recordWrongReview, recordDaily: recordDaily,
    // 常量（页面要改每日复习数量时用）
    DAILY_SIZE: DAILY_SIZE
  };
})();

// 挂到全局，页面层只认 Store，不认 localStorage
window.Store = Store;
