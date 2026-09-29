/* ============================================================
   components.js —— 可复用 UI 组件（纯 DOM，无依赖）
   用法：<script src="components.js"></script> 后用 window.UI.xxx
   目的：把「卡片 / 列表行」做成函数，任何页面都能调用，
        不用每页重复写同样的 HTML 字符串。
   ============================================================ */
(function (global) {
  // 小工具：建一个元素（标签、类名、innerHTML）
  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  // 统计卡片：传数字 + 标签，返回一张卡片节点
  // 例：UI.statCard(5, "今日新学")
  function statCard(num, label) {
    const card = el("div", "stat-card");
    card.appendChild(el("div", "stat-num", String(num)));
    card.appendChild(el("div", "stat-label", label));
    return card;
  }

  // 词行：最近学习列表里的一行（idx 为序号，从 1 开始）
  // 例：UI.wordRow("abandon", "放弃", "已掌握", 1)
  function wordRow(en, zh, status, idx) {
    const row = el("div", "word-row");
    const ok = status === "已掌握";
    row.innerHTML =
      '<div class="word-idx"></div>' +
      '<div class="word-main"><div class="word-en"></div><div class="word-zh"></div></div>' +
      '<div class="word-status ' + (ok ? "status-ok" : "status-wait") + '"></div>';
    row.querySelector(".word-idx").textContent = (idx != null) ? idx : "";
    row.querySelector(".word-en").textContent = en;
    row.querySelector(".word-zh").textContent = zh;
    row.querySelector(".word-status").textContent = status;
    return row;
  }

  // 通用列表渲染器：把数组 items 用 itemRenderer 变成节点，塞进 container
  // 例：UI.renderList(box, words, w => UI.wordRow(w.en, w.zh, w.status))
  function renderList(container, items, itemRenderer) {
    container.innerHTML = "";
    items.forEach((it, i) => container.appendChild(itemRenderer(it, i)));
  }

  // 通用卡片容器：带可选标题
  // 例：UI.card("最近学习的词", listNode)
  function card(title, bodyNode) {
    const c = el("div", "card");
    if (title) c.appendChild(el("div", "section-title", title));
    if (bodyNode) c.appendChild(bodyNode);
    return c;
  }

  // 对外暴露
  global.UI = { el: el, statCard: statCard, wordRow: wordRow, renderList: renderList, card: card };
})(window);
