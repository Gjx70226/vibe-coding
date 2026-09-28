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
    return CET4.getWrong()
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

  // 渲染当前这一题（题干=中文释义）
  function render() {
    answered = false;
    var word = queue[idx];
    var t = wordMap[word];
    progressEl.textContent = "第 " + (idx + 1) + " / " + queue.length + " 个错题";
    wordEl.textContent = t.meaning;     // 题干显示中文
    phoneticEl.textContent = "";        // 复习页不提前暴露音标（避免泄底）
    feedbackEl.textContent = "";
    feedbackEl.className = "feedback";
    nextBtn.style.display = "none";
    optionsEl.innerHTML = "";

    var opts = buildOptions(word);
    opts.forEach(function (text) {
      var b = document.createElement("button");
      b.className = "option-btn";
      b.textContent = text;
      b.onclick = function () { choose(text, word, opts); };
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
    CET4.recordWrongReview(targetWord, correct);

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

  start();
})();
