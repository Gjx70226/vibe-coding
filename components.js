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

  // 轻量 toast 提示：用于交互反馈（成功 / 失败 / 普通）
  function toast(msg, type) {
    var t = document.getElementById("ui-toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "ui-toast";
      t.className = "ui-toast";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.className = "ui-toast show" + (type ? " " + type : "");
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.className = "ui-toast"; }, 1600);
  }

  // ============================================================
  // 页面四态公共零件（Day 14 架构升级第 1 步：从四个页面抽出来的共用零件）
  // 约定：任何页面里放好这几个盒子就行——
  //   #loading    转圈
  //   #content    正文
  //   #errorBox   出错红条
  //   （空状态块各自 id 不同，用 pageEmpty(盒子的 id) 指出即可）
  // 用法：刚开始转圈 UI.pageLoading()；内容出来 UI.pageReady()；
  //       出错 UI.pageError()；要显示一块空提示 UI.pageEmpty("盒子id", "提示文字")
  // 好处：转圈/红条的样式和切换只在这一处，改一次四个页面全生效。
  // ============================================================

  // 内部小工具：把某个盒子藏起来（hidden=true）或露出来（hidden=false）
  function setHidden(id, hidden) {
    var b = document.getElementById(id);
    if (b) b.hidden = hidden;
  }

  // 版本号：改过代码就把这里改一下，顺手把 index.html 里所有 ?v= 一起改。
  // 作用：手机上跑的是新代码还是旧代码，看一眼就清楚，不用靠猜。
  var APP_VER = "2026-10-03b";

  // 把版本号写进站底和红框（页面一加载就写，红框再弹时也能对上）
  function writeVersion() {
    var foot = document.getElementById("verFoot");
    if (foot) foot.textContent = "四级备考助手 · 版本 " + APP_VER;
    var box = document.getElementById("errVer");
    if (box) box.textContent = "版本 " + APP_VER + (box.dataset.ver === "1" ? "" : "");
  }

  // 加载中：只显示转圈，正文和红条都藏起
  function pageLoading() {
    setHidden("loading", false);
    setHidden("content", true);
    setHidden("errorBox", true);
  }

  // 内容出来：藏转圈、藏红条、露出正文（成功态和空态都走这一步）
  function pageReady() {
    setHidden("loading", true);
    setHidden("content", false);
    setHidden("errorBox", true);
  }

  // 出错：藏转圈和正文，露出红条（红条上自带「重试」按钮）
  // 传 detail 就把具体原因写在红条下面一行小字——
  //   以前只写「请检查网络」，结果没网有线都一个样，真正的报错被吞了，根本没法查。
  //   现在手机上一眼就能看见到底是哪一步炸的，截个图发回来就能定位。
  function pageError(detail) {
    setHidden("loading", true);
    setHidden("content", true);
    setHidden("errorBox", false);
    var d = document.getElementById("errDetail");
    var text = detail ? ("错误原因：" + detail) : "";
    if (d) d.textContent = text;
    // 留个档：把出错原因记进本地存储。下次回到首页就能看见「上次出错：xxx」，
    // 不用每次都去截那块红框——少一步，报错也跑不掉。
    try { if (detail) window.localStorage.setItem("cet4_lasterr", String(detail)); } catch (e) {}
    // 顺手把版本号印在红框上：截这一屏，就能看出手机跑的是哪版
    writeVersion();
  }

  // 读上次那个错（首页用来显示一行黄字；没有就返回空）
  function lastError() {
    try {
      var v = window.localStorage.getItem("cet4_lasterr");
      return v ? String(v) : "";
    } catch (e) { return ""; }
  }
  // 清掉上次那个错（用户点「知道了」时用）
  function clearLastError() {
    try { window.localStorage.removeItem("cet4_lasterr"); } catch (e) {}
  }

  // 空状态：把某一块提示显示出来
  // 传了 html 就顺便把内容塞进去；不传就只显示页面里本来就有的一块
  // 例：UI.pageEmpty("homeEmpty") 或 UI.pageEmpty("", "<div class='empty-box'>还没有记录</div>")
  function pageEmpty(boxId, html) {
    var box = boxId ? document.getElementById(boxId) : null;
    if (box && html) box.innerHTML = html;
    if (box) box.hidden = false;
  }

  // 对外暴露
  // 注：原「切页播报 / 焦点落正文」那组零件（announce、initA11y）已撤掉，
  //     全部等「无障碍模式」开关一起接（开关打开才念切页 + A/B/C/D）。
  global.UI = {
    el: el, statCard: statCard, wordRow: wordRow, renderList: renderList,
    card: card, toast: toast,
    pageLoading: pageLoading, pageReady: pageReady, pageError: pageError, pageEmpty: pageEmpty,
    lastError: lastError, clearLastError: clearLastError,
    ver: function () { writeVersion(); return APP_VER; }
  };
  // 页面一加载就把版本号写上，站底任何一屏都能看见
  if (document.getElementById("verFoot")) writeVersion();
})(window);
