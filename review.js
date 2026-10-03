// review.js —— 错题复习视图（单页 hash 路由下的 review 视图）
// 答题走公共零件 Quiz（mode="wrong"：题目中文、选英文）；
// 错题清单自己管：搜索 + 三类筛选（全部 / 待复习 / 已掌握）+ 每个词错过几次（backlog ①）。
(function () {
  // 给路由用的复习视图
  window.ReviewView = {
    render: function (container) {
      container.innerHTML =
        '<header class="hero">' +
          '<h1>错题复习 <span class="heart">🔁</span></h1>' +
          '<p class="subtitle">看中文释义，选出正确英文单词；答对后这个词仍留在错题本里</p>' +
        '</header>' +
        '<section class="card word-list-card" id="wrongListCard">' +
          '<div class="list-head"><span class="section-title">错题清单</span>' +
          '<span class="count-badge" id="wrongCount"></span></div>' +
          '<div class="filter-tabs" id="wrongFilter">' +
            '<button class="filter-tab active" data-filter="all" type="button">全部</button>' +
            '<button class="filter-tab" data-filter="pending" type="button">待复习</button>' +
            '<button class="filter-tab" data-filter="mastered" type="button">已掌握</button>' +
          '</div>' +
          '<div class="search-box"><input type="text" id="searchInput" class="search-input" placeholder="搜英文或中文释义…" aria-label="搜索错题"></div>' +
          '<div id="wrongList" class="wrong-list"></div>' +
          '<div id="wrongEmpty" class="empty-box" style="display:none;"></div>' +
        '</section>' +
        '<div id="reviewWrap"></div>' +
        '<section class="result-card" id="reviewResult" style="display:none"></section>';

      var wrapEl = document.getElementById("reviewWrap");
      var resultEl = document.getElementById("reviewResult");
      var emptyEl = document.getElementById("reviewEmpty") || document.getElementById("wrongEmpty");
      var listEl = document.getElementById("wrongList");
      var countEl = document.getElementById("wrongCount");
      var searchEl = document.getElementById("searchInput");
      var filterEl = document.getElementById("wrongFilter");
      var currentFilter = "all";

      // ---------- 错题清单 ----------
      var wordMap = {};
      WORDS.forEach(function (w) { wordMap[w.word] = w; });

      function buildRows() {
        return Store.getWrong().map(function (w) {
          var t = wordMap[w.word];
          return {
            word: w.word,
            meaning: t ? t.meaning : "",
            status: w.status,
            wrong: w.wrong || 0
          };
        });
      }

      function renderRow(r) {
        var row = document.createElement("div");
        row.className = "wrong-row";
        var mastered = r.status === "mastered";
        row.innerHTML =
          '<span class="word-en">' + r.word + "</span>" +
          '<span class="word-zh">' + r.meaning + "</span>" +
          '<span class="wrong-times' + (r.wrong > 0 ? " hot" : "") + '">错过 ' + r.wrong + " 次</span>" +
          '<a class="word-detail" href="#/detail?word=' + encodeURIComponent(r.word) + '">详情</a>' +
          '<span class="word-status ' + (mastered ? "status-ok" : "status-wait") + '">' +
          (mastered ? "已掌握" : "待复习") + "</span>";
        return row;
      }

      function updateWrongList() {
        var rows = buildRows();
        if (currentFilter === "pending") rows = rows.filter(function (r) { return r.status === "pending"; });
        if (currentFilter === "mastered") rows = rows.filter(function (r) { return r.status === "mastered"; });

        var q = (searchEl.value || "").trim().toLowerCase();
        countEl.textContent = rows.length + " 个";

        if (rows.length === 0) {
          listEl.innerHTML = "";
          emptyEl.style.display = "block";
          emptyEl.textContent = "没有找到相关内容";
          return;
        }
        emptyEl.style.display = "none";
        var html = "";
        rows.forEach(function (r) { html += renderRow(r).outerHTML; });
        listEl.innerHTML = html;
      }

      searchEl.addEventListener("input", updateWrongList);
      filterEl.addEventListener("click", function (e) {
        var btn = e.target.closest(".filter-tab");
        if (!btn) return;
        currentFilter = btn.getAttribute("data-filter");
        Array.prototype.forEach.call(filterEl.querySelectorAll(".filter-tab"), function (b) {
          b.classList.toggle("active", b === btn);
        });
        updateWrongList();
      });

      // ---------- 结果页 ----------
      function showResult(records) {
        updateWrongList();
        var right = 0;
        records.forEach(function (r) { if (r.correct) right++; });
        var remain = Store.pendingCount();
        resultEl.innerHTML =
          "<h2>本轮复习完成 🔁</h2>" +
          "<p>本轮回看 " + records.length + " 个错题，答对 " + right + " 个<br>" +
          "还剩 " + remain + " 个待复习错题（答对的词留在错题本里，只是标成已掌握）</p>" +
          "<div class='result-btns'>" +
            "<button class='next-btn' id='againBtn'>再来一组</button>" +
            "<a class='next-btn ghost' href='#/'>完成，回首页</a>" +
          "</div>";
        UI.revealResult(resultEl, wrapEl);   // 结果页顶上来 + 滚回顶部，不用往下滑
        document.getElementById("againBtn").onclick = function () { start(); };
      }

      // ---------- 开始新一轮 ----------
      function start() {
        var words = Store.pendingWords();
        if (!words.length) {
          UI.revealResult(resultEl, wrapEl);   // 空态也顶上来，别让人在半截页面里找
          resultEl.innerHTML =
            "<h2>🎉 错题都复习完啦</h2>" +
            "<p>当前没有待复习的错题。<br>去「新词学习」多积累一些吧。</p>" +
            "<div class='result-btns'><a class='next-btn ghost' href='#/'>完成，回首页</a>" +
            "<a class='next-btn ghost' href='#/daily'>去每日复习 🎯</a></div>";
          return;
        }
        if (words.length > 10) {
          for (var i = words.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var t = words[i]; words[i] = words[j]; words[j] = t;
          }
          words = words.slice(0, 10);
        }
        resultEl.style.display = "none";
        wrapEl.style.display = "";
        Quiz.mount(wrapEl, {
          mode: "wrong",
          kind: "zh2en",
          words: words,
          pool: WORDS,
          onAnswer: function () { updateWrongList(); },  // 一答完就刷新清单错过次数
          onFinish: showResult
        });
      }

      start();
      updateWrongList();
    }
  };
})();
