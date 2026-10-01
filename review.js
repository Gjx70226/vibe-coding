// review.js —— 错题复习视图（单页 hash 路由下的 review 视图）
// 原来是个独立页面，现在改成 ReviewView.render(container)，由 router 调。
// 只从错题本（status=pending）抽词；看到中文释义、选出正确英文。
// 想改一轮最多复习几个错题，改下面的 REVIEW_SIZE 即可。
(function () {
  var REVIEW_SIZE = 10; // 一轮最多几个错题（不足则用全部）

  // 建「英文 → 整条词」查找表
  var wordMap = {};
  WORDS.forEach(function (w) { wordMap[w.word] = w; });

  // 随机打乱数组
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // 当前待复习错题（status=pending）的英文词列表
  function pendingWords() {
    return Store.getWrong()
      .filter(function (w) { return w.status === "pending"; })
      .map(function (w) { return w.word; });
  }

  // 4 个英文选项：正确词 + 3 个干扰英文词
  function buildOptions(targetWord) {
    var opts = [targetWord];
    while (opts.length < 4) {
      var r = WORDS[Math.floor(Math.random() * WORDS.length)].word;
      if (opts.indexOf(r) === -1) opts.push(r);
    }
    return shuffle(opts);
  }

  // 词性小徽章
  function posBadge(w) {
    var p = wordMap[w] && wordMap[w].pos;
    if (!p) return "";
    return '<span class="pos-tag ' + p + '">' + p + ".</span>";
  }

  // 给路由用的复习视图
  window.ReviewView = {
    render: function (container) {
      // 视图模板（原来 review.html 那段：清单卡 + 答题卡），router 塞进 #content
      container.innerHTML =
        '<header class="hero">' +
          '<h1>错题复习 <span class="heart">🔁</span></h1>' +
          '<p class="subtitle">看中文释义，选出正确英文单词；答对即移出待复习</p>' +
        '</header>' +
        '<section class="card word-list-card" id="wrongListCard">' +
          '<div class="list-head"><span class="section-title">错题清单</span>' +
          '<span class="count-badge" id="wrongCount"></span></div>' +
          '<div class="search-box"><input type="text" id="searchInput" class="search-input" placeholder="搜英文或中文释义…" aria-label="搜索错题"></div>' +
          '<div id="wrongList" class="wrong-list"></div>' +
          '<div id="wrongEmpty" class="empty-box" style="display:none;"></div>' +
        '</section>' +
        '<section class="quiz-card" id="quiz">' +
          '<div class="progress" id="progress"></div>' +
          '<div class="word-head">' +
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
        '<section class="result-card" id="result" style="display:none"></section>';

      // —— 以下逻辑和原 review.js 一致，元素从 container 里取 ——
      var quizEl = document.getElementById("quiz");
      var resultEl = document.getElementById("result");
      var progressEl = document.getElementById("progress");
      var wordEl = document.getElementById("word");
      var phoneticEl = document.getElementById("phonetic");
      var optionsEl = document.getElementById("options");
      var feedbackEl = document.getElementById("feedback");
      var nextBtn = document.getElementById("nextBtn");
      var favBtn = document.getElementById("favBtn");
      var searchInput = document.getElementById("searchInput");
      var wrongListEl = document.getElementById("wrongList");
      var wrongEmptyEl = document.getElementById("wrongEmpty");
      var wrongCountEl = document.getElementById("wrongCount");

      var queue = [];
      var idx = 0;
      var masteredThisRound = 0;
      var answered = false;

      // 收藏/取消收藏
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

      // 空状态：没有待复习错题
      function showEmpty() {
        quizEl.style.display = "none";
        resultEl.style.display = "block";
        resultEl.innerHTML =
          "<h2>🎉 错题都复习完啦</h2>" +
          "<p>当前没有待复习的错题。<br>去「新词学习」多积累一些吧。</p>" +
          "<a class='next-btn' href='#/' style='text-decoration:none;display:inline-block;margin-top:18px'>返回首页</a>";
      }

      // 渲染当前这一题（题干=中文释义）
      function render() {
        answered = false;
        var word = queue[idx];
        var t = wordMap[word];
        progressEl.textContent = "第 " + (idx + 1) + " / " + queue.length + " 个错题";
        wordEl.textContent = t.meaning;
        phoneticEl.textContent = "";
        favBtn.classList.toggle("faved", Store.isFavorite(word));
        favBtn.setAttribute("aria-label", (Store.isFavorite(word) ? "取消收藏 " : "收藏 ") + word);
        favBtn.onclick = function () { toggleFav(word); };
        feedbackEl.textContent = "";
        feedbackEl.className = "feedback";
        nextBtn.style.display = "none";
        optionsEl.innerHTML = "";

        var opts = buildOptions(word);
        opts.forEach(function (w) {
          var b = document.createElement("button");
          b.className = "option-btn";
          b.innerHTML = posBadge(w) + w;
          b.onclick = function () { choose(w, word, opts); };
          optionsEl.appendChild(b);
        });
      }

      // 点选后判题
      function choose(chosen, targetWord, opts) {
        if (answered) return;
        answered = true;

        var correct = chosen === targetWord;
        if (correct) masteredThisRound++;

        var buttons = optionsEl.querySelectorAll(".option-btn");
        buttons.forEach(function (b, i) {
          b.disabled = true;
          if (opts[i] === targetWord) b.classList.add("right");
          else if (b.textContent === chosen) b.classList.add("wrong");
        });

        var t = wordMap[targetWord];
        feedbackEl.textContent = correct
          ? "✓ 答对了，已移出待复习"
          : "✗ 正确答案：" + targetWord + "（" + t.meaning + "）";
        feedbackEl.className = "feedback " + (correct ? "ok" : "no");

        Store.recordWrongReview(targetWord, correct); // 答对→标记掌握；答错→保留

        nextBtn.textContent = (idx < queue.length - 1) ? "下一词 →" : "查看结果 →";
        nextBtn.style.display = "inline-block";
      }

      nextBtn.onclick = function () {
        if (idx < queue.length - 1) { idx++; render(); }
        else { showResult(); }
      };

      // 一轮结束
      function showResult() {
        updateWrongList();
        quizEl.style.display = "none";
        resultEl.style.display = "block";
        var remain = pendingWords().length;
        resultEl.innerHTML =
          "<h2>本轮复习完成 🔁</h2>" +
          "<p>本轮回看 " + queue.length + " 个错题，重新掌握 " + masteredThisRound + " 个<br>" +
          "还剩 " + remain + " 个待复习错题</p>" +
          "<button class='next-btn' id='againBtn'>再来一组</button>";
        document.getElementById("againBtn").onclick = function () { start(); };
      }

      // 开始新一轮
      function start() {
        queue = pendingWords();
        if (queue.length === 0) { showEmpty(); return; }
        if (queue.length > REVIEW_SIZE) queue = shuffle(queue).slice(0, REVIEW_SIZE);
        idx = 0;
        masteredThisRound = 0;
        quizEl.style.display = "block";
        resultEl.style.display = "none";
        render();
      }

      // ===== 错题清单 + 关键词搜索（Day 12） =====
      function buildWrongRows() {
        return Store.getWrong().map(function (w) {
          var t = wordMap[w.word];
          return { word: w.word, meaning: t ? t.meaning : "", status: w.status };
        });
      }

      // 渲染单行（详情链接改 #/detail?word=，单页内跳转不刷新）
      function renderWrongRow(r) {
        var row = document.createElement("div");
        row.className = "wrong-row";
        var isMastered = r.status === "mastered";
        row.innerHTML =
          '<span class="word-en">' + r.word + "</span>" +
          '<span class="word-zh">' + r.meaning + "</span>" +
          '<a class="word-detail" href="#/detail?word=' + encodeURIComponent(r.word) + '">详情</a>' +
          '<span class="word-status ' + (isMastered ? "status-ok" : "status-wait") + '">' +
          (isMastered ? "已掌握" : "待复习") + "</span>";
        return row;
      }

      function updateWrongList() {
        var rows = buildWrongRows();
        var q = (searchInput.value || "").trim().toLowerCase();
        wrongCountEl.textContent = rows.length + " 个";

        if (rows.length === 0) {
          wrongListEl.innerHTML = "";
          wrongEmptyEl.style.display = "block";
          wrongEmptyEl.textContent = "还没有错题记录，去「新词学习」背几个词吧";
          return;
        }

        var filtered = rows.filter(function (r) {
          if (!q) return true;
          return r.word.toLowerCase().indexOf(q) !== -1 ||
                 r.meaning.toLowerCase().indexOf(q) !== -1;
        });

        if (filtered.length === 0) {
          wrongListEl.innerHTML = "";
          wrongEmptyEl.style.display = "block";
          wrongEmptyEl.textContent = "没有找到相关内容";
          return;
        }

        wrongEmptyEl.style.display = "none";
        wrongListEl.innerHTML = "";
        filtered.forEach(function (r) { wrongListEl.appendChild(renderWrongRow(r)); });
      }

      searchInput.addEventListener("input", updateWrongList);

      start();
      updateWrongList();

      // 无障碍：焦点落正文 + 读屏念「已进入：错题复习：待复习 N 个 / 暂无错题」
      var n = wrongCountEl ? (parseInt(wrongCountEl.textContent, 10) || 0) : 0;
      UI.initA11y("错题复习", n > 0 ? "待复习 " + n + " 个" : "暂无错题");
    }
  };
})();
