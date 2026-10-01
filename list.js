// list.js —— 词表统计视图（backlog ⑥：翻全部词表，看每个词累计答对 / 答错几次）
// ===== 今日问题：学了这么久，到底哪些词真记住了、哪些还在错？ =====
// 答：做一个能搜、能筛选的全词表：每个词后面挂它累计的答对次数 / 答错次数（数据来自 store.js 的 cet4_counts）。
// 理由两条：① 数据底座是 backlog ① 的逐词统计，这页就是它的"可视化出口"；
//           ② 每次答完题都能在首页或这页回头看，才有"我真记住了"的反馈。
// ===== 今日边界（不做）：不做分页（一次全渲染 1229 行，够快）、不做导出、不做编辑词库 =====
(function () {
  window.ListView = {
    render: function (container) {
      container.innerHTML =
        '<header class="hero">' +
          '<h1>词表统计 <span class="heart">📊</span></h1>' +
          '<p class="subtitle">全部词表 + 每个词你累计答对几次、答错几次</p>' +
        '</header>' +
        '<section class="card">' +
          '<div class="list-head"><span class="section-title">全部词表</span>' +
          '<span class="count-badge" id="listCount"></span></div>' +
          '<div class="filter-tabs" id="listFilter">' +
            '<button class="filter-tab active" data-filter="all" type="button">全部</button>' +
            '<button class="filter-tab" data-filter="wrong" type="button">只看出错过</button>' +
            '<button class="filter-tab" data-filter="ok" type="button">只看出答对过</button>' +
          '</div>' +
          '<div class="search-box"><input type="text" id="listSearch" class="search-input" placeholder="搜英文或中文释义…" aria-label="搜索词表"></div>' +
          '<div id="listBox" class="word-list"></div>' +
        '</section>';

      var boxEl = document.getElementById("listBox");
      var countEl = document.getElementById("listCount");
      var searchEl = document.getElementById("listSearch");
      var filterEl = document.getElementById("listFilter");
      var filter = "all";

      function render() {
        var q = (searchEl.value || "").trim().toLowerCase();
        var rows = "";
        var total = 0;
        WORDS.forEach(function (w, i) {
          var c = Store.getCount(w.word);
          if (filter === "wrong" && c.wrong === 0) return;
          if (filter === "ok" && c.correct === 0) return;
          if (q && (w.word.toLowerCase().indexOf(q) === -1 && w.meaning.indexOf(q) === -1)) return;
          total++;
          rows += '<div class="word-row list-row">' +
            '<span class="word-idx">' + (i + 1) + "</span>" +
            '<span class="word-main"><span class="word-en">' + w.word + "</span>" +
            '<span class="word-zh">' + w.meaning + "</span></span>" +
            '<span class="list-counts">' +
              '<span class="cnt-ok">对 ' + c.correct + "</span>" +
              '<span class="cnt-no">错 ' + c.wrong + "</span>" +
            "</span>" +
            '<a class="word-detail" href="#/detail?word=' + encodeURIComponent(w.word) + '">详情</a>' +
            "</div>";
        });
        countEl.textContent = total + " / " + WORDS.length + " 个";
        boxEl.innerHTML = rows || '<div class="empty-box">没有找到相关单词</div>';
      }

      searchEl.addEventListener("input", render);
      filterEl.addEventListener("click", function (e) {
        var btn = e.target.closest(".filter-tab");
        if (!btn) return;
        filter = btn.getAttribute("data-filter");
        Array.prototype.forEach.call(filterEl.querySelectorAll(".filter-tab"), function (b) {
          b.classList.toggle("active", b === btn);
        });
        render();
      });

      render();
    }
  };
})();
