// detail.js —— 单词详情页逻辑（Day 13 板块三步骤5）
// 打开方式：detail.html?word=abandon
// 自己控制四态（加载中/成功/空/出错），不依赖 app.js，保持本文件独立可读
// 收藏状态、学习状态只问 Store（数据层），本文件不碰 localStorage，保证数据一致

(function () {
  // 只用 content 这一块正文容器（其余盒子由公共零件 UI 统一管理）
  var content = document.getElementById("content");

  // 转圈 / 正文 / 出错红条的切换改用公共零件 UI.pageLoading / UI.pageReady / UI.pageError

  // 收藏 / 是否已学：只问 Store，不再自己翻浏览器存储（分层要治的最大的坑）
  function isFavorite(word) { return Store.isFavorite(word); }
  function isLearned(word) { return Store.isLearned(word); }

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
    UI.pageReady();
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
    UI.pageReady();
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
    if (simError) UI.pageError();
    else { UI.pageReady(); render(); }
  }, 400);
})();
