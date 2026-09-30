// review.js —— 错题复习页逻辑
// 只从错题本（status=pending）抽词；看到中文释义、选出正确英文
// 答对 → 标记掌握（移出待复习）；答错 → 保留。记账交给 window.CET4（步骤②已做好）
// 想改一轮最多复习几个错题，改下面的 REVIEW_SIZE 即可。

(function () {
  var REVIEW_SIZE = 10; // 一轮最多几个错题（不足则用全部）

  // 建「英文 → 整条词」查找表
  var wordMap = {};
  WORDS.forEach(function (w) { wordMap[w.word] = w; });

  // 运行时变量
  var queue = [];          // 本轮要复习的英文词
  var idx = 0;             // 当前第几个（从 0 数）
  var masteredThisRound = 0;
  var answered = false;    // 本题是否已作答

  // 页面元素
  var quizEl = document.getElementById("quiz");
  var resultEl = document.getElementById("result");
  var progressEl = document.getElementById("progress");
  var wordEl = document.getElementById("word");       // 这里放中文释义
  var phoneticEl = document.getElementById("phonetic");
  var optionsEl = document.getElementById("options");
  var feedbackEl = document.getElementById("feedback");
  var nextBtn = document.getElementById("nextBtn");
  var favBtn = document.getElementById("favBtn");
  // Day 12：错题清单 + 搜索框元素
  var searchInput = document.getElementById("searchInput");
  var wrongListEl = document.getElementById("wrongList");
  var wrongEmptyEl = document.getElementById("wrongEmpty");
  var wrongCountEl = document.getElementById("wrongCount");

  // 随机打乱数组（不改动原数组）
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

  // 空状态：没有待复习错题
  function showEmpty() {
    quizEl.style.display = "none";
    resultEl.style.display = "block";
    resultEl.innerHTML =
      "<h2>🎉 错题都复习完啦</h2>" +
      "<p>当前没有待复习的错题。<br>去「新词学习」多积累一些吧。</p>" +
      "<a class='next-btn' href='index.html' style='text-decoration:none;display:inline-block;margin-top:18px'>返回首页</a>";
  }

  // 词性小徽章（动词V/名词N/形容词A/副词ADV），词库未识别则不显示
  function posBadge(w) {
    var p = wordMap[w] && wordMap[w].pos;
    if (!p) return "";
    return '<span class="pos-tag ' + p + '">' + p + ".</span>";
  }

  // 收藏/取消收藏（Day 11）：防连点 + 成功/失败反馈
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

  // 渲染当前这一题（题干=中文释义）
  function render() {
    answered = false;
    var word = queue[idx];
    var t = wordMap[word];
    progressEl.textContent = "第 " + (idx + 1) + " / " + queue.length + " 个错题";
    wordEl.textContent = t.meaning;     // 题干显示中文
    phoneticEl.textContent = "";        // 复习页不提前暴露音标（避免泄底）
    // 收藏按钮：针对当前英文词，反映收藏状态
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

    // 把四个按钮都标出来：对的绿色，选错的红色
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

    // 记账（步骤②）：答对 → 标记掌握（移出待复习）；答错 → 保留
    Store.recordWrongReview(targetWord, correct);

    nextBtn.textContent = (idx < queue.length - 1) ? "下一词 →" : "查看结果 →";
    nextBtn.style.display = "inline-block";
  }

  // 点「下一词 / 查看结果」
  nextBtn.onclick = function () {
    if (idx < queue.length - 1) {
      idx++;
      render();
    } else {
      showResult();
    }
  };

  // 一轮结束
  function showResult() {
    updateWrongList(); // 复习后错题本可能变化，同步刷新清单
    quizEl.style.display = "none";
    resultEl.style.display = "block";
    var remain = pendingWords().length; // 复习完这批后还剩下的待复习数
    resultEl.innerHTML =
      "<h2>本轮复习完成 🔁</h2>" +
      "<p>本轮回看 " + queue.length + " 个错题，重新掌握 " + masteredThisRound + " 个<br>" +
      "还剩 " + remain + " 个待复习错题</p>" +
      "<button class='next-btn' id='againBtn'>再来一组</button>";
    document.getElementById("againBtn").onclick = function () {
      start(); // 重新拉取待复习列表（已掌握的不会再来）
    };
  }

  // 开始新一轮（每次都重新从错题本取，已掌握的不再出现）
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

  // ===== Day 12：错题清单 + 关键词搜索（筛选交互） =====
  // 把错题本整理成「英文 + 中文 + 掌握状态」的行数据
  function buildWrongRows() {
    return Store.getWrong().map(function (w) {
      var t = wordMap[w.word];
      return { word: w.word, meaning: t ? t.meaning : "", status: w.status };
    });
  }

  // 渲染单行
  function renderWrongRow(r) {
    var row = document.createElement("div");
    row.className = "wrong-row";
    var isMastered = r.status === "mastered";
    row.innerHTML =
      '<span class="word-en">' + r.word + "</span>" +
      '<span class="word-zh">' + r.meaning + "</span>" +
      '<a class="word-detail" href="detail.html?word=' + encodeURIComponent(r.word) + '">详情</a>' +
      '<span class="word-status ' + (isMastered ? "status-ok" : "status-wait") + '">' +
      (isMastered ? "已掌握" : "待复习") + "</span>";
    return row;
  }

  // 渲染清单 + 按关键词过滤（核心筛选逻辑）
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

  // 输入框即时过滤（三种测试：有结果 / 无结果 / 清空恢复）
  searchInput.addEventListener("input", updateWrongList);

  // 转圈 / 正文 / 出错红条的切换改用公共零件 UI.pageLoading / UI.pageReady / UI.pageError
  // 重试：隐藏红条，重新渲染清单与答题（演示用，忽略模拟错误）
  var retryBtn = document.getElementById("retryBtn");
  if (retryBtn) retryBtn.addEventListener("click", function () {
    var e = document.getElementById("errorBox");
  if (e) e.hidden = true;
  UI.pageReady();
  updateWrongList();
  start();
});

  setTimeout(function () {
    var simError = new URLSearchParams(location.search).get("simerror") === "1";
    if (simError) { UI.pageError(); return; }
    UI.pageReady();
    updateWrongList();
    start();
    // 无障碍：焦点落正文 + 读屏念「已进入：错题复习」（没错题就补一句「暂无错题」）
    var n = document.getElementById("wrongCount");
    n = n ? (parseInt(n.textContent, 10) || 0) : 0;
    UI.initA11y("错题复习", n > 0 ? "待复习 " + n + " 个" : "暂无错题");
  }, 400);
})();
