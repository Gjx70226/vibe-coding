// study.js —— 新词学习页答题逻辑
// 本页只管"出题 + 判题 + 交互"，记账交给 window.CET4（步骤②已做好）
// 想改一轮做几词，改下面的 SESSION_SIZE 即可。

(function () {
  var SESSION_SIZE = 10; // 一轮抽几词

  // 建一个「英文 → 整条词」的查找表，方便拿干扰词的释义
  var wordMap = {};
  WORDS.forEach(function (w) { wordMap[w.word] = w; });

  // 运行时变量
  var queue = [];      // 本轮要做的词
  var idx = 0;         // 当前第几个（从 0 数）
  var correctCount = 0;
  var answered = false; // 本题是否已作答

  // 页面元素
  var quizEl = document.getElementById("quiz");
  var resultEl = document.getElementById("result");
  var progressEl = document.getElementById("progress");
  var wordEl = document.getElementById("word");
  var phoneticEl = document.getElementById("phonetic");
  var optionsEl = document.getElementById("options");
  var feedbackEl = document.getElementById("feedback");
  var nextBtn = document.getElementById("nextBtn");
  var favBtn = document.getElementById("favBtn");

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
  // 返回对象数组：{ meaning 中文释义, word 英文词 }，便于显示词性
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

  // 收藏/取消收藏（Day 11）：防连点 + 成功/失败反馈
  function toggleFav(word) {
    if (favBtn.disabled) return;
    favBtn.disabled = true;                 // 防连点：禁用 100ms
    setTimeout(function () { favBtn.disabled = false; }, 100);
    try {
      var nowFav = Store.toggleFavorite(word);
      favBtn.classList.toggle("faved", nowFav);
      UI.toast(nowFav ? "⭐ 已收藏" : "已取消收藏", "ok");
    } catch (e) {
      UI.toast("收藏失败，稍后再试", "no");  // 失败不改图标，保持原状
    }
  }

  // 渲染当前这一题
  function render() {
    answered = false;
    var t = queue[idx];
    progressEl.textContent = "第 " + (idx + 1) + " / " + queue.length + " 词";
    wordEl.textContent = t.word;
    phoneticEl.textContent = t.phonetic || "";
    // 收藏按钮：反映当前词的收藏状态，点击切换
    favBtn.classList.toggle("faved", Store.isFavorite(t.word));
    favBtn.setAttribute("aria-label", (Store.isFavorite(t.word) ? "取消收藏 " : "收藏 ") + t.word);
    favBtn.onclick = function () { toggleFav(t.word); };
    // 详情链接指向当前这个词（点一下跳到 detail.html?word=xxx）
    var dl = document.getElementById("detailLink");
    if (dl) dl.href = "detail.html?word=" + encodeURIComponent(t.word);
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

    // 把四个按钮都标出来：对的绿色，选错的红色
    var buttons = optionsEl.querySelectorAll(".option-btn");
    buttons.forEach(function (b, i) {
      b.disabled = true;
      if (opts[i].meaning === target.meaning) b.classList.add("right");
      else if (opts[i].meaning === chosen.meaning) b.classList.add("wrong");
    });

    feedbackEl.textContent = correct ? "✓ 答对了" : "✗ 正确答案：" + target.meaning;
    feedbackEl.className = "feedback " + (correct ? "ok" : "no");

    // 记入账本（步骤②）：答错会自动进错题本
    Store.recordNewWord(target.word, correct);

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
    // 注意：words.js 用 const 声明 WORDS，不会挂到 window，所以检查 typeof 而非 window.WORDS
    if (sim || typeof WORDS === "undefined" || WORDS.length === 0) { showStudyEmpty(); return; }
    queue = pickSession();
    idx = 0;
    correctCount = 0;
    render();
  }

  // 转圈 / 正文 / 出错红条的切换改用公共零件 UI.pageLoading / UI.pageReady / UI.pageError
  // 重试：隐藏红条，重新渲染答题（演示用，忽略模拟错误）
  var retryBtn = document.getElementById("retryBtn");
  if (retryBtn) retryBtn.addEventListener("click", function () {
    var e = document.getElementById("errorBox");
  if (e) e.hidden = true;
  UI.pageReady();
  start();
});

  setTimeout(function () {
    var simError = new URLSearchParams(location.search).get("simerror") === "1";
    if (simError) { UI.pageError(); return; }
    UI.pageReady();
    start();
  }, 400);
})();
