// router.js —— 单页 hash 路由（架构升级第4步：四个页面合并成一个）
// ===== 今日问题：四个页面怎么合并成一个？ =====
// 答：用 hash 路由（地址栏 #/study 这种）。
// 理由三条：① 静态托管下刷新不会 404（刷新只刷 index.html，hash 不发服务器）；
//           ② hash 不发服务器，所以前进/后退/深链（直接开 #/review）全可用；
//           ③ 引入框架的成本大于收益，原生监听 hashchange 就够了。
// ===== 今日边界（不做）：嵌套路由、路由守卫、懒加载 =====
// 依赖：UI（四态+无障碍公共零件）、HomeView/StudyView/ReviewView/DetailView（见各业务 js）
(function () {
  // 地址栏 path → 哪个视图；没写就首页
  var ROUTES = {
    "/": "home",
    "/study": "study",
    "/review": "review",
    "/daily": "daily",
    "/list": "list",
    "/detail": "detail"
  };

  var VIEWS = {
    home: "HomeView",
    study: "StudyView",
    review: "ReviewView",
    daily: "DailyView",
    list: "ListView",
    detail: "DetailView"
  };

  // 把 #/detail?word=important 拆成 { path:"/detail", query:"word=important" }
  function parseHash() {
    var h = location.hash || "#/";
    if (h.charAt(0) === "#") h = h.slice(1);      // /detail?word=important
    var qi = h.indexOf("?");
    var path = qi > -1 ? h.slice(0, qi) : h;
    var query = qi > -1 ? h.slice(qi + 1) : "";
    if (path === "" || path === "/") path = "/";
    return { path: path, query: query };
  }

  var contentEl = null;

  function renderRoute() {
    var r = parseHash();
    var name = ROUTES[r.path] || "home";

    // 导航高亮：当前视图对应的胶囊加 active
    var links = document.querySelectorAll(".pill-nav a");
    Array.prototype.forEach.call(links, function (a) {
      a.classList.toggle("active", a.getAttribute("data-route") === name);
    });

    // 出错红条先藏好，转圈先亮起
    var errBox = document.getElementById("errorBox");
    if (errBox) errBox.hidden = true;
    UI.pageLoading();
    if (contentEl) contentEl.innerHTML = "";

    // 模拟加载失败（演示用，?simerror=1 或 #/...?simerror=1）
    if (/(^|&)simerror=1/.test(r.query)) {
      UI.pageError("这是故意装出来的假故障（地址栏带了 simerror=1）");
      return;
    }

    var win = window[VIEWS[name]];
    // 视图没找到：多半是这个页面的脚本没加载成功，别再骗人说是网络问题
    if (!win || !win.render) {
      UI.pageError("「" + name + "」这个页面没加载出来，点下面的重试");
      return;
    }

    // 转圈 400ms 再渲染（和原来每页的加载态手感一致）
    setTimeout(function () {
      try {
        win.render(contentEl, r.query);   // 视图自己往 contentEl 里塞内容
        UI.pageReady();                   // 露出正文
      } catch (e) {
        // 以前这里只弹一句「检查网络」，真正的报错被吞掉，手机上一脸懵。
        // 现在：控制台留一份，红条上再写一句人能看懂的原因。
        try { if (window.console && console.error) console.error("[view:" + name + "]", e); } catch (_) {}
        var msg = (e && e.message) ? e.message : String(e);
        UI.pageError(msg || ("渲染「" + name + "」时出错了"));
      }
    }, 400);
  }

  function init() {
    contentEl = document.getElementById("content");
    var retryBtn = document.getElementById("retryBtn");
    if (retryBtn) retryBtn.addEventListener("click", renderRoute); // 重试＝重跑当前路由
    window.addEventListener("hashchange", renderRoute);             // 地址栏变了就换视图
    renderRoute();                                                  // 首次进来先渲染一次
  }

  // DOM 就绪后再启动（脚本在 body 末尾，基本已就绪，兜底一下）
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
