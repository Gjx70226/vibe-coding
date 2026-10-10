// quiz.js —— 答题卡公共零件（学习 / 错题复习 / 每日复习 三个视图共用）
// ===== 今日问题：三处答题流程几乎一模一样，重复写三遍合适吗？ =====
// 答：不合适，抽成 Quiz.mount(container, opts) 一个零件。
// 理由三条：① 改一次三处全生效（backlog ⑦ 的"错 3 次才给答案"、第 8 条的"英文=中文"对照、
//           逐词答对/答错统计、长按 peek 都在这一处实现）；② 三个视图只管"出哪些词 + 结果页写啥"；
//           ③ 以后要加「无障碍模式」的播报，也只改这一个文件。
// ===== 今日边界（不做）：不做计时/倒计时、不做 Spaced Repetition 算法、不做结果页（结果页各视图自己写）=====
(function () {
  // 长按多久算"看一眼"（毫秒）
  var PEEK_MS = 500;

  // ---------- 提示音（答对一声、答错一声，2026-10-03 小甘要的）----------
  // 做法：不打包任何音频文件，直接让浏览器"现场算"一段声音（Web Audio）。
  // 好处：0 体积、不联网、不加文件；坏处：不能换 mp3（想换就得改成 <audio>）。
  // 浏览器规矩：不许一进页面就出声，必须先被点过一下才让播 —— 见下面的 unlock()。
  var audioCtx = null;
  var unlocked = false;
  var soundOn = true;   // 由 Store.getSound() 初始化后再覆盖

  function ctx() {
    try {
      if (!audioCtx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        audioCtx = new AC();
      }
      return audioCtx;
    } catch (e) { return null; }
  }
  // 第一次"真的点了屏幕"之后再允许出声
  function unlock() {
    if (unlocked) return;
    var c = ctx();
    if (!c) return;
    if (c.state === "suspended" && c.resume) { try { c.resume(); } catch (e) {} }
    unlocked = true;
  }
  // 一个音：freq 频率、from 第几秒响、dur 响多久、type 波形、vol 音量
  function tone(freq, from, dur, type, vol) {
    var c = ctx();
    if (!c) return;
    var osc = c.createOscillator();
    var gain = c.createGain();
    osc.type = type || "sine";            // sine 圆润、triangle 略钝、square 电子感
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, c.currentTime + from);
    gain.gain.linearRampToValueAtTime(vol, c.currentTime + from + 0.012);  // 别"啪"地炸开
    gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + from + dur);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(c.currentTime + from);
    osc.stop(c.currentTime + from + dur + 0.02);
  }
  // 答对：柔长的「叮·咚」——正弦波、往上两声、尾巴拖着，听着"对了、舒服"
  function beepRight() {
    var c = ctx(); if (!c || !soundOn) return;
    tone(880.00, 0.00, 0.14, "sine", 0.30);       // A5 第一声「叮」
    tone(1318.5, 0.07, 0.34, "sine", 0.30);       // E6 第二声「咚」——往上 + 拖长
    tone(2637.0, 0.07, 0.16, "sine", 0.06);       // 叠一层高音让它清脆
  }
  // 答错：干硬的「哔·哔」——方波（电子感、发刺）、往下两声、短促截断，听着"错了、别选"
  function beepWrong() {
    var c = ctx(); if (!c || !soundOn) return;
    tone(466.16, 0.00, 0.10, "square", 0.20);     // Bb4 第一声
    tone(392.00, 0.11, 0.11, "square", 0.20);     // G4 第二声——往下掉一下
  }
  // 一句话记住怎么换：答对＝正弦／柔长／往上；答错＝方波／干硬／往下。
  // 两个音在「音色」上就差得远（一个圆润一个刺耳），所以不用凑频率也能一耳朵分开。
  // 想换口味：改频率（越大越高）、改 wave 里的 "sine"/"square"（圆润／电子感）。

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

  // 小甘 2026-10-03 定的（百词斩式）：选错的那一项不光变红，得当场把「另一半意思」摊开——
  // 你点的是中文义项（en2zh），就给你那个英文词（加上音标和中文）；
  // 你点的是英文单词（zh2en），就给你它的中文意思。看了这个才知道自己错在哪个词上。
  function revealOf(chosen, kind) {
    var s = document.createElement("span");
    s.className = "opt-reveal";
    if (kind === "zh2en") {
      var e = wordMap[chosen];
      s.textContent = e ? ("（意思是：" + e.meaning + "）") : "";
    } else {
      var en = (chosen && chosen.word) || "";
      var e2 = wordMap[en];
      s.textContent = en ? ("（" + en + (e2 ? (" " + (e2.phonetic || "") + " " + e2.meaning) : "") + "）") : "";
    }
    return s;
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
          '<button class="sound-btn" id="qSound" type="button" aria-label="答题提示音">🔊</button>' +
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
    var soundBtn = container.querySelector("#qSound");
    var detailEl = container.querySelector("#qDetail");

    soundOn = !!Store.getSound();          // 读存档决定这一局出不出声
    unlocked = false;

    function paintSound() {
      if (soundBtn) soundBtn.textContent = soundOn ? "🔊" : "🔇";
      soundBtn.setAttribute("aria-label", soundOn ? "关闭答题提示音" : "打开答题提示音");
    }
    if (soundBtn) {
      soundBtn.onclick = function () {
        soundOn = !soundOn;
        Store.setSound(soundOn);
        paintSound();
        if (soundOn) { unlock(); beepRight(); }   // 点开的时候先响一声，让人知道有这个音
      };
    }
    paintSound();

    // 浏览器规矩：先被真点一下（点页面任意处 / 按任意键），之后才允许出声
    document.addEventListener("pointerdown", unlock, { once: true });
    document.addEventListener("keydown", unlock, { once: true });

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
      function start(e) {
        /* 按住题干不是要选文字：把系统默认行为（选中文字/长按菜单）当场按下去。
           pointer 事件默认非 passive，preventDefault 真的拦得住 ——
           旧写法 touchstart:{passive:true} 是"只听不拦"，系统想弹菜单照样弹。 */
        if (e && e.cancelable) e.preventDefault();
        clearTimeout(timer);
        timer = setTimeout(showPeek, PEEK_MS);
      }
      function stop() { clearTimeout(timer); }
      /* 只认「按下」和「真正松手/系统取消」。旧写法把 touchmove、mouseleave、scroll
         也绑成"立即取消"——真实手指按下必微抖（touchmove）、鼠标按住稍一滑出题干
         （mouseleave），计时器就被清掉，长按永远出不来。这就是手机必失败、
         电脑上"有时候按了没反应"的根因（Day 24 修的就是它）。 */
      wordEl.addEventListener("pointerdown", start);
      wordEl.addEventListener("pointerup", stop);
      wordEl.addEventListener("pointercancel", stop);
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

      // 小甘 2026-10-03 定的：**选错一次就给答案**，不再憋到 3 次（原来的"重试 3 次"作废）
      var btns = optionsEl.querySelectorAll(".option-btn");
      if (btns[btnIndex]) {
        btns[btnIndex].disabled = true;
        btns[btnIndex].classList.add("wrong-tried");
        btns[btnIndex].appendChild(revealOf(chosen, kind));   // 变红的同时，这一行自己摊开另一半意思
      }
      finish(false, target, stat);
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
      // 小甘 2026-10-03：那句「正确答案在上面」是废话（方向还会指错），删了，靠颜色自己看
      feedbackEl.textContent = isCorrect ? "✓ 答对了" : "✗ 答错了";
      feedbackEl.className = "feedback " + (isCorrect ? "ok" : "no");

      beepRight();   // 答对：叮咚一声
      // 答错：低嘟一声 —— 延后一点，等"正确答案在上面"这句先画出来再响，不糊在一起
      if (!isCorrect) setTimeout(beepWrong, 60);

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

  window.Quiz = {
    mount: mount,
    // 给页面试听/调试用：直接出一声，不用真去答题
    preview: function (kind) { unlock(); if (kind === "wrong") beepWrong(); else beepRight(); },
    soundOn: function () { return soundOn; }
  };
})();
