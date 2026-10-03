// daily.js —— 每日复习视图（backlog ②：从学过的词里每天挑一批循环刷，仿百词斩）
// ===== 今日问题：学过的词越来越多，光靠错题本不够，每天该复习哪些？ =====
// 答：每天从「已学过的词」里挑还没在今天复习过的，错题多的排前面，最多 20 个（DAILY_SIZE 在 store.js）。
// 理由两条：① 错题本只看答错的，学过的熟词没人管；每日复习把整条已学曲线都顾上；
//           ② 今天复习过的记在 cet4_daily，跨天自动换新一批，不会连着三天刷同一批。
// ===== 今日边界（不做）：不做遗忘曲线算法（只按"错过次数"粗排）、不做强制打卡 =====
(function () {
  window.DailyView = {
    render: function (container) {
      container.innerHTML =
        '<header class="hero">' +
          '<h1>每日复习 <span class="heart">🎯</span></h1>' +
          '<p class="subtitle">从学过的词里每天挑一批，学过的才会出现在这儿</p>' +
        '</header>' +
        '<div id="dailyWrap"></div>' +
        '<section class="result-card" id="dailyResult" style="display:none"></section>';

      var wrapEl = document.getElementById("dailyWrap");
      var resultEl = document.getElementById("dailyResult");

      function showResult(records) {
        var right = 0;
        records.forEach(function (r) { if (r.correct) right++; });
        resultEl.innerHTML =
          "<h2>今日复习完成 🎉</h2>" +
          "<p>今天复习了 " + records.length + " 个词，答对 " + right + " 个<br>" +
          "明天会再换一批新的词（错过多的优先）</p>" +
          "<div class='result-btns'>" +
            "<button class='next-btn' id='againBtn'>再刷几个</button>" +
            "<a class='next-btn ghost' href='#/'>完成，回首页</a>" +
          "</div>";
        UI.revealResult(resultEl, wrapEl);   // 结果页顶上来 + 滚回顶部，不用往下滑
        document.getElementById("againBtn").onclick = function () { start(); };
      }

      function start() {
        var words = Store.dailyWords();
        if (!words.length) {
          UI.revealResult(resultEl, wrapEl);   // 空态也顶上来，别让人在半截页面里找
          var learned = Store.getLearned().length;
          resultEl.innerHTML =
            "<h2>" + (learned ? "今日复习都刷完啦 🎉" : "还没有已学的词") + "</h2>" +
            "<p>" + (learned
              ? "今天挑的 " + Store.DAILY_SIZE + " 个词都过了一遍，明天再来换新一批。"
              : "先去「新词学习」背几个词，学过的词才会出现在这儿。") + "</p>" +
            "<div class='result-btns'>" +
              "<a class='next-btn ghost' href='#/study'>去新词学习 📚</a>" +
              "<a class='next-btn ghost' href='#/'>回首页</a>" +
            "</div>";
          return;
        }
        resultEl.style.display = "none";
        wrapEl.style.display = "";
        Quiz.mount(wrapEl, {
          mode: "daily",
          kind: "zh2en",
          words: words,
          pool: WORDS,
          onFinish: function (records) {
            Store.markDaily(words);   // 这批算今天复习过了
            showResult(records);
          }
        });
      }

      start();
    }
  };
})();
