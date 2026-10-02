// quiz.js —— 答题卡公共零件（学习 / 错题复习 / 每日复习 三个视图共用）
// ===== 今日问题：三处答题流程几乎一模一样，重复写三遍合适吗？ =====
// 答：不合适，抽成 Quiz.mount(container, opts) 一个零件。
// 理由三条：① 改一次三处全生效（backlog ⑦ 的"错 3 次才给答案"、第 8 条的"英文=中文"对照、
//           逐词答对/答错统计、长按 peek 都在这一处实现）；② 三个视图只管"出哪些词 + 结果页写啥"；
//           ③ 以后要加「无障碍模式」的播报，也只改这一个文件。
// ===== 今日边界（不做）：不做计时/倒计时、不做 Spaced Repetition 算法、不做结果页（结果页各视图自己写）=====
(function () {
  // 每题最多给几次机会（backlog ⑦）
  var MAX_TRY = 3;
  // 长按多久算"看一眼"（毫秒）
  var PEEK_MS = 500;

  // 英文 → 整条词 的查找表
  var wordMap = {};
  try {
    if (typeof WORDS !== "undefined") WORDS.forEach(function (w) { wordMap[w.word] = w; });
  } catch (e) { /* 词库没加载就先空着 */ }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // 词性小徽章（动词V / 名词N / 形容词A / 副词ADV）
  function posBadge(w) {
    var p = wordMap[w] && wordMap[w].pos;
    if (!p) return "";
    return '<span class="pos-tag ' + p + '">' + p + ".</span>";
  }

  // en2zh：题目是英文、选项给中文释义｜ zh2en：题目是中文、选项给英文单词
  function buildOptions(kind, target, pool) {
    var opts = [];
    if (kind === "en2zh") {
      opts.push({ meaning: target.meaning, word: target.word });
      (target.neighbors || []).forEach(function (n) {
        var w = wordMap[n];
        if (w && opts.length < 4 && !opts.some(function (o) { return o.meaning === w.meaning; })) {
          opts.push({ meaning: w.meaning, word: w.word });
        }
      });
      while (opts.length < 4) {
        var rw = pool[typeof pool[0] === "string" ? wordMap[pool[0]] : pool[0]];
        if (rw && !opts.some(function (o) { return o.meaning === rw.meaning; })) {
          opts.push({ meaning: rw.meaning, word: rw.word });
        }
      }
      return shuffle(opts);
    }
    opts.push(target.word);
    while (opts.length < 4) {
      var src = pool[Math.floor(Math.random() * pool.length)];
      var r = typeof src === "string" ? src : (src.word || "");
      if (opts.indexOf(r) === -1) opts.push(r);
    }
    return shuffle(opts);
  }

  var HTML =
    '<section class="quiz-card" id="quiz">' +
      '<div class="progress" id="qProgress"></div>' +
      '<div class="word-head has-detail">' +
        '<span class="master-pill" id="qMaster">未掌握</span>' +
        '<span class="head-right">' +
          '<a class="word-detail" id="qDetail" href="#/detail">详情</a>' +
          '<button class="fav-btn" id="qFav" type="button" aria-label="收藏单词">' +
            '<span class="star-empty">☆</span><span class="star-full">★</span>' +
          '</button>' +
        '</span>' +
      '</div>' +
      '<div class="word-display" id="qWord" title="长按看另一半意思"></div>' +
      '<div class="phonetic" id="qPhonetic"></div>' +
      '<div class="peek-tip" id="qPeek">长按题干，看另一半意思</div>' +
      '<div class="options" id="qOptions"></div>' +
      '<div class="feedback" id="qFeedback"></div>' +
      '<div class="word-pair" id="qPair"></div>' +
      '<div class="stat-line" id="qStat"></div>' +
      '<button class="next-btn" id="qNext" style="display:none"></button>' +
    '</section>';

  // 挂载答题卡
  // opts = { mode:"new"|"wrong"|"daily", kind:"en2zh"|"zh2en", words:[英文单词],
  //          pool:[词对象|英文字符串], onAnswer(word,correct,tries,stat), onFinish(records) }
  function mount(container, opts) {
    container.innerHTML = HTML;

    var kind = opts.kind || "en2zh";
    var mode = opts.mode || "new";
    var queue = (opts.words || []).slice();
    var pool = opts.pool || (typeof WORDS !== "undefined" ? WORDS : []);
    var onAnswer = opts.onAnswer || function () {};
    var onFinish = opts.onFinish || function () {};

    var quizEl = container.querySelector("#quiz");
    var progressEl = container.querySelector("#qProgress");
    var masterEl = container.querySelector("#qMaster");
    var wordEl = container.querySelector("#qWord");
    var phoneticEl = container.querySelector("#qPhonetic");
    var peekEl = container.querySelector("#qPeek");
    var optionsEl = container.querySelector("#qOptions");
    var feedbackEl = container.querySelector("#qFeedback");
    var pairEl = container.querySelector("#qPair");
    var statEl = container.querySelector("#qStat");
    var nextBtn = container.querySelector("#qNext");
    var favBtn = container.querySelector("#qFav");
    var detailEl = container.querySelector("#qDetail");

    var idx = Math.min(Math.max(opts.startIdx || 0, 0), Math.max((opts.words || []).length - 1, 0));
    var tries = 0;
    var locked = false;     // 本题是否已定局
    var rightIndex = -1;    // 正确选项在第几个按钮
    var records = [];       // 本轮每题结果
    var current = null;

    // ---------- 收藏 ----------
    function toggleFav() {
      if (!current) return;
      if (favBtn.disabled) return;
      favBtn.disabled = true;
      setTimeout(function () { favBtn.disabled = false; }, 100);
      try {
        var nowFav = Store.toggleFavorite(current.word);
        favBtn.classList.toggle("faved", nowFav);
        UI.toast(nowFav ? "⭐ 已收藏" : "已取消收藏", "ok");
      } catch (e) {
        UI.toast("收藏失败，稍后再试", "no");
      }
    }

    // ---------- 长按 peek（backlog ③）----------
    function showPeek() {
      if (!current) return;
      var c = Store.getCount(current.word);
      var mastered = c.correct > 0;
      peekEl.classList.add("open");
      peekEl.innerHTML =
        "<b>" + current.word + "</b> " + (current.phonetic || "") +
        '<span class="peek-arrow">＝</span>' + current.meaning +
        '<span class="peek-status ' + (mastered ? "ok" : "wait") + '">' +
        (mastered ? "已掌握" : "未掌握") + (c.wrong ? " · 错过 " + c.wrong + " 次" : "") +
        "</span>";
    }
    function hidePeek() {
      peekEl.classList.remove("open");
      peekEl.textContent = "长按题干，看另一半意思";
    }
    (function bindPeek() {
      var timer = null;
      function start() { clearTimeout(timer); timer = setTimeout(showPeek, PEEK_MS); }
      function stop() { clearTimeout(timer); }
      wordEl.addEventListener("mousedown", start);
      wordEl.addEventListener("touchstart", start, { passive: true });
      ["mouseup", "mouseleave", "touchend", "touchmove", "scroll"].forEach(function (ev) {
        wordEl.addEventListener(ev, stop);
      });
      wordEl.addEventListener("contextmenu", function (e) { e.preventDefault(); }); // 手机别弹系统菜单
      peekEl.addEventListener("click", hidePeek);
    })();

    // ---------- 渲染一题 ----------
    function render() {
      locked = false;
      tries = 0;
      hidePeek();
      var w = queue[idx];
      var t = (typeof w === "object") ? w : (wordMap[w] || { word: w, meaning: "", phonetic: "" });
      current = t;

      progressEl.textContent = "第 " + (idx + 1) + " / " + queue.length + " 词";
      wordEl.textContent = (kind === "en2zh") ? (t.word || "") : (t.meaning || "");
      phoneticEl.textContent = (kind === "en2zh") ? (t.phonetic || "") : "";

      // 卡片最左边的掌握状态（backlog ③）
      var c = Store.getCount(t.word);
      masterEl.textContent = c.correct > 0 ? "🔒 已掌握" : "🔓 未掌握";
      masterEl.classList.toggle("mastered", c.correct > 0);

      favBtn.classList.toggle("faved", Store.isFavorite(t.word));
      favBtn.setAttribute("aria-label", (Store.isFavorite(t.word) ? "取消收藏 " : "收藏 ") + t.word);
      favBtn.onclick = toggleFav;
      if (detailEl) detailEl.href = "#/detail?word=" + encodeURIComponent(t.word);

      feedbackEl.textContent = "";
      feedbackEl.className = "feedback";
      pairEl.textContent = "";
      statEl.textContent = "";
      nextBtn.style.display = "none";
      optionsEl.innerHTML = "";

      var opts = buildOptions(kind, t, pool);
      for (var k = 0; k < opts.length; k++) {
        var ok = (kind === "en2zh") ? (opts[k].meaning === t.meaning) : (opts[k] === t.word);
        if (ok) rightIndex = k;
      }

      opts.forEach(function (o, i) {
        var b = document.createElement("button");
        b.className = "option-btn";
        // 题干是英文（en2zh）时，选项存的是「{word,meaning}」一对；
        // 题干是中文（zh2en）时，选项存的是光秃秃的英文单词字符串。
        // 以前这里一律按对象取 o.word，所以复习/每日那两页四个按钮全是 undefined。
        var plain = (kind === "zh2en");
        b.innerHTML = posBadge(plain ? o : o.word) + (plain ? o : o.meaning);
        b.onclick = function () { choose(o, t, i); };
        optionsEl.appendChild(b);
      });
    }

    // ---------- 选中某个选项 ----------
    function choose(chosen, target, btnIndex) {
      if (locked) return;
      tries += 1;
      var correct = (kind === "en2zh") ? (chosen.meaning === target.meaning) : (chosen === target.word);
      var stat = Store.attempt(target.word, correct, mode, tries > 1);
      records.push({ word: target.word, correct: correct });

      if (correct) { finish(true, target, stat); return; }
      // 三次都错完：给详细解析（正确答案 + 英文＝中文），不再让人瞎猜（backlog ⑦）
      if (tries >= MAX_TRY) { finish(false, target, stat); return; }

      // 答错：只说"错了"，不急着给答案；还剩几次机会（backlog ⑦）
      var btns = optionsEl.querySelectorAll(".option-btn");
      if (btns[btnIndex]) { btns[btnIndex].disabled = true; btns[btnIndex].classList.add("wrong-tried"); }
      feedbackEl.textContent = "✗ 答错了，还能试 " + (MAX_TRY - tries) + " 次";
      feedbackEl.className = "feedback no retrying";   // retrying＝重试中，不给答案
      if (stat.wrong === 1) statEl.textContent = "已记入错题本，这个词你目前错过 1 次";
      onAnswer(target.word, correct, tries, stat, idx);
    }

    // ---------- 本题定局（答对，或 3 次都错完）----------
    function finish(isCorrect, target, stat) {
      locked = true;
      var btns = optionsEl.querySelectorAll(".option-btn");
      for (var i = 0; i < btns.length; i++) btns[i].disabled = true;
      if (btns[rightIndex]) btns[rightIndex].classList.add("right");   // 打勾交给 CSS ::after

      pairEl.innerHTML = "<b>" + target.word + "</b> " + (target.phonetic || "") +
        '<span class="peek-arrow">＝</span>' + target.meaning;          // backlog 第 8 条：英文 ＝ 中文
      statEl.textContent = "这个词你累计：答对 " + stat.correct + " 次 / 答错 " + stat.wrong + " 次";
      feedbackEl.textContent = isCorrect ? "✓ 答对了" : "✗ 三次都没选对，正确答案在上面";
      feedbackEl.className = "feedback " + (isCorrect ? "ok" : "no");

      onAnswer(target.word, isCorrect, tries, stat, idx);
      nextBtn.textContent = (idx < queue.length - 1) ? "下一词 →" : "查看结果 →";
      nextBtn.style.display = "inline-block";
    }

    nextBtn.onclick = function () {
      if (idx < queue.length - 1) { idx++; render(); }
      else { onFinish(records); }
    };

    render();

    return {
      el: quizEl,
      show: function () { quizEl.style.display = ""; },
      hide: function () { quizEl.style.display = "none"; },
      records: function () { return records; }
    };
  }

  window.Quiz = { mount: mount, MAX_TRY: MAX_TRY };
})();
