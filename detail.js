// detail.js —— 单词详情页逻辑（Day 13 板块三步骤5）
// 打开方式：detail.html?word=abandon
// 自己控制四态（加载中/成功/空/出错），不依赖 app.js，保持本文件独立可读
// 收藏状态、学习状态直接读 app.js 用的同一个 localStorage key，保证数据一致

(function () {
  var loading = document.getElementById("loading");
  var content = document.getElementById("content");
  var errorBox = document.getElementById("errorBox");

  // 显示内容、隐藏转圈
  function hideLoading() {
    if (loading) loading.hidden = true;
    if (content) content.hidden = false;
  }
  // 出错：隐藏转圈和内容，显示红条
  function showError() {
    if (loading) loading.hidden = true;
    if (content) content.hidden = true;
    if (errorBox) errorBox.hidden = false;
  }

  // 读收藏（与 app.js 用同一个 key：cet4_favorites）
  function isFavorite(word) {
    try {
      return (JSON.parse(localStorage.getItem("cet4_favorites")) || []).indexOf(word) !== -1;
    } catch (e) { return false; }
  }
  // 读是否学过（与 app.js 用同一个 key：cet4_learned）
  function isLearned(word) {
    try {
      return (JSON.parse(localStorage.getItem("cet4_learned")) || []).indexOf(word) !== -1;
    } catch (e) { return false; }
  }

  var params = new URLSearchParams(location.search);
  var word = params.get("word") || "";
  var simError = params.get("simerror") === "1";

  // 在词库里按英文精确查找（忽略大小写），并记录它在词库中的排名
  function findWord(w) {
    for (var i = 0; i < WORDS.length; i++) {
      if (WORDS[i].word.toLowerCase() === w.toLowerCase()) {
        return { data: WORDS[i], rank: i + 1 };
      }
    }
    return null;
  }

  var POS_TEXT = { V: "动词", N: "名词", A: "形容词", ADV: "副词" };

  // 正常渲染：把词的所有信息填进页面
  function render() {
    var found = findWord(word);
    if (!found) { showEmpty(); return; }

    var t = found.data;
    document.getElementById("dWord").textContent = t.word;
    document.getElementById("dPhonetic").textContent = t.phonetic || "";

    var posEl = document.getElementById("dPos");
    if (t.pos) {
      posEl.innerHTML = '<span class="pos-tag ' + t.pos + '">' + t.pos + "</span> " + (POS_TEXT[t.pos] || "");
    } else {
      posEl.innerHTML = '<span class="muted">词性未标注</span>';
    }

    document.getElementById("dMeaning").textContent = t.meaning;
    document.getElementById("dFav").textContent = isFavorite(t.word) ? "★ 已收藏" : "☆ 未收藏";
    document.getElementById("dRank").textContent = "#" + found.rank + " / 共 " + WORDS.length + " 词";
    document.getElementById("dLearned").textContent = isLearned(t.word) ? "已学习" : "还没学过";
    // 答对/答错：依赖 backlog①（逐词统计，尚未实现），暂时固定显示
    document.getElementById("dStat").textContent = "暂未统计";
  }

  // 空状态：查不到这个词时（四态之"空"），不用模拟开关，真实查不到即触发
  function showEmpty() {
    if (loading) loading.hidden = true;
    if (content) content.hidden = false;
    if (errorBox) errorBox.hidden = true;
    content.innerHTML =
      '<a class="back-link" href="review.html">← 返回</a>' +
      '<div class="empty-box" style="padding:40px 20px;">没有找到「' +
      (word || "空") +
      '」这个词<br>请检查单词拼写，或从列表重新点入</div>';
  }

  // 重试按钮：隐藏红条，重新渲染
  var retryBtn = document.getElementById("retryBtn");
  if (retryBtn) retryBtn.addEventListener("click", function () {
    if (errorBox) errorBox.hidden = true;
    hideLoading();
    render();
  });

  // 返回：有来源页就回退，否则兜底跳复习页
  var backLink = document.getElementById("backLink");
  if (backLink) backLink.addEventListener("click", function (e) {
    if (history.length > 1) { e.preventDefault(); history.back(); }
    else { location.href = "review.html"; }
  });

  // 入口：先转圈 400ms，再按状态分流
  setTimeout(function () {
    if (simError) showError();
    else { hideLoading(); render(); }
  }, 400);
})();
