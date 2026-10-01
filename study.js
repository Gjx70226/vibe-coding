// study.js —— 新词学习视图（单页 hash 路由下的 study 视图）
// 出题 + 判题的脏活交给公共零件 Quiz（重试 3 次 / 逐词统计 / 长按 peek 都在那儿），
// 这里只管三件事：出哪些词（本轮 10 个）、做到一半的进度存哪儿、结果页长啥样。
// backlog 覆盖：④ 进度保留（当天没做完，回来接着做）、⑤ 结果页加「完成」回首页
(function () {
  var SESSION_SIZE = 10; // 一轮抽几词，想改个数改这里

  // 从全库随机抽 SESSION_SIZE 个词，返回英文单词数组
  function pickSession() {
    var a = WORDS.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a.slice(0, SESSION_SIZE).map(function (w) { return w.word; });
  }

  // 给路由用的学习视图
  window.StudyView = {
    render: function (container) {
      // 答题卡 / 结果页 / 空态三个盒子：先摆空壳，Quiz 往答题盒里塞内容
      container.innerHTML =
        '<div id="studyWrap"></div>' +
        '<section class="result-card" id="studyResult" style="display:none"></section>' +
        '<div class="empty-box" id="studyEmpty" hidden>⚠️ 词库加载异常，请刷新页面重试</div>';

      var wrapEl = document.getElementById("studyWrap");
      var resultEl = document.getElementById("studyResult");
      var emptyEl = document.getElementById("studyEmpty");
      var queue = [];
      var rightCount = 0;     // 本轮已定局答对几个（结果页要用）
      var answeredIdx = -1;   // 当前答的是第几题（换题就重置计数）

      // 结果页（backlog ⑤ 带「完成，回首页」）
      function showResult(records) {
        var right = 0;
        records.forEach(function (r) { if (r.correct) right++; });
        var acc = records.length ? Math.round((right / records.length) * 100) : 0;
        var rows = records.map(function (r) {
          var c = Store.getCount(r.word);
          return '<div class="result-row">' +
            '<span class="result-word">' + r.word + "</span>" +
            '<span class="result-mark ' + (r.correct ? "ok" : "no") + '">' + (r.correct ? "✓" : "✗") + "</span>" +
            '<span class="result-stat">答对 ' + c.correct + " / 答错 " + c.wrong + "</span>" +
            "</div>";
        }).join("");
        resultEl.innerHTML =
          "<h2>本轮完成 🎉</h2>" +
          "<p>共 " + records.length + " 词，答对 " + right + " 词<br>正确率 " + acc + "%</p>" +
          '<div class="result-lines">' + rows + "</div>" +
          "<div class='result-btns'>" +
            "<button class='next-btn' id='againBtn'>再来一组</button>" +
            "<a class='next-btn ghost' href='#/'>完成，回首页</a>" +
          "</div>";
        resultEl.style.display = "block";
        Store.clearProgress();   // 做完一批，进度不再挂着
        document.getElementById("againBtn").onclick = function () { start(); };
      }

      function showStudyEmpty() {
        wrapEl.style.display = "none";
        emptyEl.hidden = false;
      }

      function start() {
        var sim = new URLSearchParams(location.search).get("simempty") === "1";
        if (sim || typeof WORDS === "undefined" || !WORDS.length) { showStudyEmpty(); return; }

        // backlog ④：优先接着上次那批做；跨天/做完了就抽新的一批
        var p = Store.loadProgress();
        var idx0 = 0;
        if (p && p.words && p.words.length) {
          queue = p.words;
          idx0 = p.idx || 0;
          if (idx0 >= queue.length || idx0 < 0) { queue = pickSession(); idx0 = 0; }
        } else {
          queue = pickSession();
          idx0 = 0;
        }
        rightCount = 0;
        answeredIdx = -1;

        resultEl.style.display = "none";
        emptyEl.hidden = true;
        wrapEl.style.display = "";

        Quiz.mount(wrapEl, {
          mode: "new",
          kind: "en2zh",
          words: queue,
          startIdx: idx0,
          pool: WORDS,
          // 每答一题（含重试）都把进度存一下：切走 / 关掉再回来还能接着做
          onAnswer: function (word, correct, tries, stat, idx) {
            if (idx !== answeredIdx) { answeredIdx = idx; rightCount = 0; }
            if (correct) rightCount++;
            Store.saveProgress({ words: queue, idx: idx, correct: rightCount });
          },
          onFinish: showResult
        });
      }

      start();
    }
  };
})();
