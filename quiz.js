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

  // ---------- 念单词（2026-10-11 小甘要的：跳到新词真念出来）----------
  // 做法：浏览器自带语音合成（speechSynthesis），0 文件、不联网、不接后端。
  // 声音开关 soundOn 一并管它；同样要先被点过屏幕才出声（浏览器规矩）。
  var synth = window.speechSynthesis || null;
  // 嗓音列表是异步加载的，先取一次，onvoiceschanged 时再刷新
  var voices = [];
  function loadVoices() { try { voices = (synth && synth.getVoices()) || []; } catch (e) { voices = []; } }
  if (synth) {
    loadVoices();
    if (typeof synth.onvoiceschanged !== "undefined") synth.onvoiceschanged = loadVoices;
  }
  // 按语种精确挑嗓音：英文强制 en-US（小甘要美式，不能让浏览器挑成英式）
  function pickVoice(lang) {
    if (!voices.length) return null;
    var pref = (lang || "en-US").replace("_", "-").toLowerCase();
    var same = voices.filter(function (v) { return (v.lang || "").replace("_", "-").toLowerCase() === pref; });
    if (same.length) return same[0];
    var base = pref.split("-")[0];                     // 退一步：同语种里挑一个（en / zh）
    var baseMatch = voices.filter(function (v) { return (v.lang || "").toLowerCase().indexOf(base) === 0; });
    return baseMatch.length ? baseMatch[0] : null;
  }
  function speak(text, lang) {
    if (!synth || !soundOn || !text) return;
    try {
      synth.cancel();                                  // 先把上一句没念完的掐掉，免得叠着念
      var u = new SpeechSynthesisUtterance(String(text));
      u.lang = lang || "en-US";
      var v = pickVoice(lang);
      if (v) u.voice = v;                              // 指定嗓音，强制美式/对应中文嗓音
      u.rate = 0.95;                                   // 稍微慢一点，听得清
      synth.speak(u);
    } catch (e) {}
  }

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
        if (soundOn) {                            // 点开的时候先响一声 + 念当前词，让人知道有这个音
          unlock(); beepRight();
          if (current) speak(kind === "en2zh" ? current.word : current.meaning, kind === "en2zh" ? "en-US" : "zh-CN");
        }
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

    // ---------- 长按 peek（backlog ③，2026-10-11 扩展：题干+四个选项都能长按）----------
    // 通用：给任意词弹「英文 ＝ 中文 + 掌握状态」。题干用 showPeek()，选项用 peekWord(选项词)。
    function peekHTML(w, showMeaning) {
      var c = Store.getCount(w.word);
      var mastered = c.correct > 0;
      // showMeaning=true 才显示「＝中文意思」。中文模式（zh2en）里题目本身就是中文，
      // 长按再复述一遍中文纯属多余 —— 小甘 2026-10-11 要的：中文模式长按只给英文+音标+掌握状态。
      return "<b>" + w.word + "</b> " + (w.phonetic || "") +
        (showMeaning ? ('<span class="peek-arrow">＝</span>' + w.meaning) : "") +
        '<span class="peek-status ' + (mastered ? "ok" : "wait") + '">' +
        (mastered ? "已掌握" : "未掌握") + (c.wrong ? " · 错过 " + c.wrong + " 次" : "") +
        "</span>";
    }
    function peekWord(w, showMeaning) {
      if (!w || !w.word) return;
      peekEl.classList.add("open");
      peekEl.innerHTML = peekHTML(w, showMeaning);
    }
    function showPeek() { peekWord(current, kind === "en2zh"); }
    function hidePeek() {
      peekEl.classList.remove("open");
      peekEl.textContent = "长按题干，看另一半意思";
    }
    // 长按通用绑定：给任意元素绑「按住满 500ms 弹该词释义」，双通道（桌面 pointer + 手机 touch 兜底）。
    // el._longFired 用来区分「长按」和「点一下」——长按松手后不触发元素的 click（避免误选选项）。
    // inPlace=true（百词斩式，2026-10-11d）：释义就地展开在按的那个元素自己格子里（选项卡片自己
    // 变高显示英文+音标+中文），松手恢复原样——不往题干下面那个固定框里塞。
    // inPlace=false（题干）：释义显示在题干正下方的 peek 框，那本来就是题干的"自己位置"。
    function bindLongPress(el, getWord, inPlace) {
      var timer = null;
      el._longFired = false;
      function show() {
        var w = getWord();
        if (!w || !w.word) return;
        el._longFired = true;   // 标记：刚长按过，松手那次点击由业务 onclick 拦掉
        if (inPlace) {
          if (!el._origHTML) el._origHTML = el.innerHTML;   // 先记住原样，松手好恢复
          el.classList.add("peeking");
          el.innerHTML = peekHTML(w, kind === "en2zh");   // 中文模式不显示「＝中文」
        } else {
          peekWord(w, kind === "en2zh");   // 题干长按下走固定框：英文模式照样显示「＝中文」
        }
      }
      function restore() {
        if (inPlace && el._origHTML) {
          el.innerHTML = el._origHTML;
          el.classList.remove("peeking");
        }
      }
      function start() {
        el._longFired = false;
        clearTimeout(timer);
        timer = setTimeout(show, PEEK_MS);
      }
      function stop(e) {
        clearTimeout(timer);
        restore();
        hidePeek();
        // 长按成立时，松手拦掉误触的 click（真机 touchend.cancelable 为 true 时有效）；
        // 即便没拦住，选项自身 onclick 里的 `if (el._longFired) return` 也会兜底，绝不误选。
        // 注意：这里【不】清 el._longFired，交给 onclick 消费后清除，否则兜底失效
        //（Day 27 真机/无头暴露的误选根因正是 stop 提前清掉了它）。
        if (el._longFired && e && e.cancelable) e.preventDefault();
      }
      /* 桌面 / 触控笔：pointer 事件。按住处别让浏览器选中文字（桌面 preventDefault 不杀 click，电脑正常）。 */
      el.addEventListener("pointerdown", function (e) {
        if (e && e.cancelable) e.preventDefault();
        start();
      });
      el.addEventListener("pointerup", stop);
      /* 手机兜底：touch 事件（安卓 WebView 对 pointer 支持不稳，touch 一定稳）。
         旧实现：touchstart 里同步 preventDefault —— 这句会让浏览器不再把轻点合成 click，
         手机就点不了选项/下一词（正是 Day 27 真机暴露的致命卡点）。
         新实现：touchstart 只计时、不拦；长按触发后才在 touchend 拦 click 防误触；
         系统长按菜单统一由下方 contextmenu 拦截，绝不伤轻点。 */
      el.addEventListener("touchstart", function () { start(); }, { passive: true });
      el.addEventListener("touchend", stop);
      el.addEventListener("touchcancel", stop);
      /* 桌面右键 + 移动端长按系统菜单，统一在这拦，不影响轻点 click */
      el.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    }
    bindLongPress(wordEl, function () { return current; });   // 题干长按看释义
    peekEl.addEventListener("click", hidePeek);

    // ---------- 渲染一题 ----------
    function render() {
      locked = false;
      tries = 0;
      hidePeek();
      var w = queue[idx];
      var t = (typeof w === "object") ? w : (wordMap[w] || { word: w, meaning: "", phonetic: "" });
      current = t;

      // 跳到新词：念出来（en2zh 念英文单词，zh2en 念中文释义）
      if (kind === "en2zh") speak(t.word, "en-US");
      else speak(t.meaning, "zh-CN");

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
        b.onclick = function () {
          if (b._longFired) { b._longFired = false; return; }   // 刚长按过，松手不触发"选这个"
          choose(o, t, i);
        };
        // 长按选项（百词斩式就地展开）：推出这一项对应的完整词（英文+音标+中文）显示在按钮自己格子里。zh2en 下选项是字符串，要去词库反查。
        bindLongPress(b, function () {
          return (kind === "zh2en") ? (wordMap[o] || { word: o, meaning: "", phonetic: "" }) : o;
        }, true);
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
