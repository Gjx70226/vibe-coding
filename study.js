// study.js —— 新词学习视图（单页 hash 路由下的 study 视图）
// 原来是个独立页面，现在改成 StudyView.render(container)，由 router 调。
// 只管"出题 + 判题 + 交互"，记账交给 Store，四态/播报交给 router + UI。
// 想改一轮做几词，改下面的 SESSION_SIZE 即可。
(function () {
  var SESSION_SIZE = 10; // 一轮抽几词

  // 建一个「英文 → 整条词」的查找表，方便拿干扰词的释义
  var wordMap = {};
  WORDS.forEach(function (w) { wordMap[w.word] = w; });

  // 随机打乱数组（不改动原数组）
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function meaningOf(word) {
    return wordMap[word] ? wordMap[word].meaning : null;
  }

  // 从全库随机抽 SESSION_SIZE 个词作为本轮
  function pickSession() {
    return shuffle(WORDS).slice(0, SESSION_SIZE);
  }

  // 生成 4 个选项：正确释义 + 3 个干扰词释义，不够再用库里随机补
  function buildOptions(target) {
    var opts = [{ meaning: target.meaning, word: target.word }];
    target.neighbors.forEach(function (n) {
      var w = wordMap[n];
      if (w && !opts.some(function (o) { return o.meaning === w.meaning; })) {
        opts.push({ meaning: w.meaning, word: w.word });
      }
    });
    while (opts.length < 4) {
      var rw = WORDS[Math.floor(Math.random() * WORDS.length)];
      if (!opts.some(function (o) { return o.meaning === rw.meaning; })) {
        opts.push({ meaning: rw.meaning, word: rw.word });
      }
    }
    return shuffle(opts);
  }

  // 词性小徽章（动词V/名词N/形容词A/副词ADV），词库未识别则不显示
  function posBadge(word) {
    var p = wordMap[word] && wordMap[word].pos;
    if (!p) return "";
    return '<span class="pos-tag ' + p + '">' + p + ".</span>";
  }

  // 给路由用的学习视图
  window.StudyView = {
    render: function (container) {
      // 视图模板（原来 study.html 里那段答题卡片），由 router 塞进 #content
      container.innerHTML =
        '<section class="quiz-card" id="quiz">' +
          '<div class="progress" id="progress"></div>' +
          '<div class="word-head has-detail">' +
            '<a class="word-detail" id="detailLink" href="#/detail">详情</a>' +
            '<button class="fav-btn" id="favBtn" type="button" aria-label="收藏单词">' +
              '<span class="star-empty">☆</span><span class="star-full">★</span>' +
            '</button>' +
          '</div>' +
          '<div class="word-display" id="word"></div>' +
          '<div class="phonetic" id="phonetic"></div>' +
          '<div class="options" id="options"></div>' +
          '<div class="feedback" id="feedback"></div>' +
          '<button class="next-btn" id="nextBtn" style="display:none"></button>' +
        '</section>' +
        '<div class="empty-box" id="studyEmpty" hidden>⚠️ 词库加载异常，请刷新页面重试</div>' +
        '<section class="result-card" id="result" style="display:none"></section>';

      // —— 以下逻辑和原 study.js 一致，只是元素从 container 里取，不再顶层抓取 ——
      var quizEl = document.getElementById("quiz");
      var resultEl = document.getElementById("result");
      var progressEl = document.getElementById("progress");
      var wordEl = document.getElementById("word");
      var phoneticEl = document.getElementById("phonetic");
      var optionsEl = document.getElementById("options");
      var feedbackEl = document.getElementById("feedback");
      var nextBtn = document.getElementById("nextBtn");
      var favBtn = document.getElementById("favBtn");

      var queue = [];      // 本轮要做的词
      var idx = 0;         // 当前第几个（从 0 数）
      var correctCount = 0;
      var answered = false; // 本题是否已作答

      // 收藏/取消收藏（防连点 + 成功/失败反馈）
      function toggleFav(word) {
        if (favBtn.disabled) return;
        favBtn.disabled = true;
        setTimeout(function () { favBtn.disabled = false; }, 100);
        try {
          var nowFav = Store.toggleFavorite(word);
          favBtn.classList.toggle("faved", nowFav);
          UI.toast(nowFav ? "⭐ 已收藏" : "已取消收藏", "ok");
        } catch (e) {
          UI.toast("收藏失败，稍后再试", "no");
        }
      }

      // 渲染当前这一题
      function render() {
        answered = false;
        var t = queue[idx];
        progressEl.textContent = "第 " + (idx + 1) + " / " + queue.length + " 词";
        wordEl.textContent = t.word;
        phoneticEl.textContent = t.phonetic || "";
        favBtn.classList.toggle("faved", Store.isFavorite(t.word));
        favBtn.setAttribute("aria-label", (Store.isFavorite(t.word) ? "取消收藏 " : "收藏 ") + t.word);
        favBtn.onclick = function () { toggleFav(t.word); };
        // 详情链接指向当前这个词（单页下跳 #/detail?word=xxx，不刷新）
        var dl = document.getElementById("detailLink");
        if (dl) dl.href = "#/detail?word=" + encodeURIComponent(t.word);
        feedbackEl.textContent = "";
        feedbackEl.className = "feedback";
        nextBtn.style.display = "none";
        optionsEl.innerHTML = "";

        var opts = buildOptions(t);
        opts.forEach(function (o) {
          var b = document.createElement("button");
          b.className = "option-btn";
          b.innerHTML = posBadge(o.word) + o.meaning;
          b.onclick = function () { choose(o, t, opts); };
          optionsEl.appendChild(b);
        });
      }

      // 点选后判题
      function choose(chosen, target, opts) {
        if (answered) return;
        answered = true;

        var correct = chosen.meaning === target.meaning;
        if (correct) correctCount++;

        var buttons = optionsEl.querySelectorAll(".option-btn");
        buttons.forEach(function (b, i) {
          b.disabled = true;
          if (opts[i].meaning === target.meaning) b.classList.add("right");
          else if (opts[i].meaning === chosen.meaning) b.classList.add("wrong");
        });

        feedbackEl.textContent = correct ? "✓ 答对了" : "✗ 正确答案：" + target.meaning;
        feedbackEl.className = "feedback " + (correct ? "ok" : "no");

        Store.recordNewWord(target.word, correct); // 记入账本，答错自动进错题本

        nextBtn.textContent = (idx < queue.length - 1) ? "下一词 →" : "查看结果 →";
        nextBtn.style.display = "inline-block";
      }

      nextBtn.onclick = function () {
        if (idx < queue.length - 1) { idx++; render(); }
        else { showResult(); }
      };

      // 一轮结束
      function showResult() {
        quizEl.style.display = "none";
        resultEl.style.display = "block";
        var acc = Math.round((correctCount / queue.length) * 100);
        resultEl.innerHTML =
          "<h2>本轮完成 🎉</h2>" +
          "<p>共 " + queue.length + " 词，答对 " + correctCount + " 词<br>正确率 " + acc + "%</p>" +
          "<button class='next-btn' id='againBtn'>再来一组</button>";
        document.getElementById("againBtn").onclick = function () {
          resultEl.style.display = "none";
          quizEl.style.display = "block";
          start();
        };
      }

      // 空状态：词库未加载/异常时显示提示，避免白屏
      function showStudyEmpty() {
        if (quizEl) quizEl.style.display = "none";
        var el = document.getElementById("studyEmpty");
        if (el) el.hidden = false;
      }

      // 开始新一轮
      function start() {
        var sim = new URLSearchParams(location.search).get("simempty") === "1";
        if (sim || typeof WORDS === "undefined" || WORDS.length === 0) { showStudyEmpty(); return; }
        queue = pickSession();
        idx = 0;
        correctCount = 0;
        render();
      }

      start();

      // 无障碍：焦点落正文 + 读屏念「已进入：新词学习：第 1 题：xxx」（render 之后才拿得到第一个词）
      var first = document.getElementById("word");
      UI.initA11y("新词学习", first && first.textContent ? "第 1 题：" + first.textContent : "");
    }
  };
})();
