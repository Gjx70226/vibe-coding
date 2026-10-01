// detail.js —— 单词详情视图（单页 hash 路由下的 detail 视图）
// 打开方式：地址栏 #/detail?word=important（router 把 query 传给 render）
// 自己控制渲染，收藏/是否已学只问 Store，不碰浏览器存储。
(function () {
  var POS_TEXT = { V: "动词", N: "名词", A: "形容词", ADV: "副词" };

  // 在词库里按英文精确查找（忽略大小写），并记录排名
  function findWord(w) {
    for (var i = 0; i < WORDS.length; i++) {
      if (WORDS[i].word.toLowerCase() === w.toLowerCase()) {
        return { data: WORDS[i], rank: i + 1 };
      }
    }
    return null;
  }

  window.DetailView = {
    render: function (container, query) {
      // 从 hash 的 query 里拿 word（router 传进来的是 "word=important" 这种）
      var m = (query || "").match(/(?:^|&)word=([^&]+)/);
      var word = m ? decodeURIComponent(m[1]) : "";
      var simError = /(?:^|&)simerror=1/.test(query || "");

      // 视图模板（原来 detail.html 那段），返回链接改成 #/review（单页内跳，不刷新）
      container.innerHTML =
        '<a class="back-link" href="#/review" id="backLink">← 返回</a>' +
        '<section class="card detail-card">' +
          '<div class="detail-word" id="dWord"></div>' +
          '<div class="phonetic" id="dPhonetic"></div>' +
          '<div class="detail-pos" id="dPos"></div>' +
          '<div class="detail-meaning" id="dMeaning"></div>' +
          '<div class="detail-meta">' +
            '<div class="meta-row"><span class="meta-key">收藏状态</span><span class="meta-val" id="dFav"></span></div>' +
            '<div class="meta-row"><span class="meta-key">核心排名</span><span class="meta-val" id="dRank"></span></div>' +
            '<div class="meta-row"><span class="meta-key">学习状态</span><span class="meta-val" id="dLearned"></span></div>' +
            '<div class="meta-row"><span class="meta-key">答对 / 答错</span><span class="meta-val" id="dStat">暂未统计</span></div>' +
          '</div>' +
        '</section>';

      if (simError) { UI.pageError(); return; }

      var found = findWord(word);
      if (!found) {
        // 空状态：查不到这个词
        container.innerHTML =
          '<a class="back-link" href="#/review">← 返回</a>' +
          '<div class="empty-box" style="padding:40px 20px;">没有找到「' +
          (word || "空") +
          '」这个词<br>请检查单词拼写，或从列表重新点入</div>';
        return;
      }

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
      document.getElementById("dFav").textContent = Store.isFavorite(t.word) ? "★ 已收藏" : "☆ 未收藏";
      document.getElementById("dRank").textContent = "#" + found.rank + " / 共 " + WORDS.length + " 词";
      document.getElementById("dLearned").textContent = Store.isLearned(t.word) ? "已学习" : "还没学过";
    }
  };
})();
