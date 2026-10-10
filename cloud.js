/* ============================================================
   ① 今天解决什么问题：把「云连没连上」这件事直接摆在页面上，
      一眼能看出「页面 → 云 → 公网」这条线通没通（Day 15 板块②）

   ② 为什么这么选：这一路云没有「能自己起名字的空窗口」（比如老师
      案例里的 /api/health 那种），做不出来。所以健康这件事改成：
      用官方小工具真去云端问一句（问「你现在认不认识这个网站」），
      回了就亮绿灯。这是这条路能给的最接近的等价物。

   ③ 今天不做啥：不建表、不写真接口。表 Day 16 才建。
   ============================================================ */

(function (global) {
  "use strict";

  // 这两行是开通云之后系统发的两样东西，全程只能从这里拿，不能自己瞎填
  var CFG = {
    endpoint: "https://cet4-word-helper.app.workbuddy.host",
    publishableKey: "wbpk_O12WtR6v99Wu8kmCZRjKgH_sg9Rb6ux7sTaa09hgVS0BCVep93u20G3"
  };

  var client = null;

  /* 原始报错只进控制台，不甩给用户看（Day 23：防裸报错） */
  function logErr(tag, e) {
    if (global.console && global.console.error) global.console.error("[云探测] " + tag, e || "");
  }

  function getClient() {
    if (client) return client;
    if (typeof global.WorkBuddyCloud === "undefined") return null;
    client = global.WorkBuddyCloud.createWorkBuddyCloud(CFG);
    return client;
  }

  var Cloud = {
    /* 去云端问一句，问完把结果给你（ok 说通没通，msg 说为啥）
       注意：不能只问「有没有登录」——没登录时那句根本不发网络，
       绿灯会是假的。所以真问的是数据库这一句，必须让网络跑一趟。 */
    ping: function (cb) {
      var c = getClient();
      if (!c) {
        cb({ ok: false, kind: "nosdk", msg: "云的小工具没加载出来" });
        return;
      }
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        cb({ ok: false, kind: "timeout", msg: "问了 8 秒没回（断网或太慢）" });
      }, 8000);

      var settle = function (res) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        cb(res);
      };

      var q = null;
      try {
        q = c.database.from("health_probe").select("id").limit(1);
      } catch (e0) {
        logErr("探测·请求没发出去", e0);
        settle({ ok: false, kind: "network", msg: "数据暂时拿不到，请稍后再试" });
        return;
      }
      if (!q || typeof q.then !== "function") {
        settle({ ok: false, kind: "nosdk", msg: "云的小工具没接上" });
        return;
      }
      q.then(function (out) {
        var err = out && out.error;
        if (err) {
          var code = err.code || "";
          // 这句"表不存在"是自己起的探测表名：能收到这句＝请求真跑到了云端数据库。
          // 云端给的是 42P01，但 PostgREST 有时只回一句话不给编号，所以按话认。
          var low = ((err.message || "") + " " + (err.details || "") + " " + code).toLowerCase();
          var tableMissing = code === "42P01" || low.indexOf("does not exist") >= 0 || low.indexOf("schema cache") >= 0;
          /* 接口连不上（断网/端点不可达）：err.code 为空、message 是浏览器原话
             （TypeError: Failed to fetch 等）——归「网络/接口错」，不当服务端 bug 吓人 */
          var netRe = /failed to fetch|typeerror|network|timeout|超时|连接|网络|enotfound|econnrefused|aborted|getaddrinfo|dns/i;
          if (netRe.test(low)) {
            settle({ ok: false, kind: "network", msg: "数据暂时拿不到，请稍后再试" });
            return;
          }
          if (tableMissing) {
            settle({ ok: true, kind: "ok", msg: "云通了（探测表还没建，Day 16 建表后就能存东西）" });
          } else if (code === "42501" || err.kind === "permission") {
            settle({ ok: true, kind: "ok", msg: "云通了（这一句被权限挡了，属正常：Day 16 建表配好就能写）" });
          } else if (code === "23505") {
            settle({ ok: true, kind: "ok", msg: "云通了" });
          } else {
            logErr("探测·云端原话", err);
            settle({ ok: false, kind: "cloud", msg: "云端回了句不认识的错，请稍后再试" });
          }
        } else {
          settle({ ok: true, kind: "ok", msg: "云通了，数据库有数据" });
        }
      })["catch"](function (e) {
        settle({ ok: false, kind: "network", msg: (e && e.message) || "问的时候断气了（多半是断网）" });
      });
    },

    /* 把结果画成页面上那一小块 */
    render: function (el) {
      if (!el) return;
      el.hidden = false;
      el.className = "cloud-box asking";
      el.innerHTML = '<span class="dot"></span><span class="c-txt">正在问云…</span>';

      Cloud.ping(function (res) {
        if (!el) return;
        el.className = "cloud-box " + (res.ok ? "on" : "off");
        // 云端原话也打出来——这样一截图就能看出它到底回了什么，不让我拿"绿灯"糊弄过去
        var txt = res.ok
          ? "☁️ " + res.msg + " · 刚才问的时间 " + new Date().toLocaleString("zh-CN") +
            " · <b>点我重问一次</b>"
          : "☁️ 云没连上：" + res.msg + " · <b>点我重问一次</b>";
        el.innerHTML = '<span class="dot"></span><span class="c-txt">' + txt + "</span>";
        el.onclick = function () { Cloud.render(el); };
      });
    }
  };

  global.Cloud = Cloud;

  /* 页面上有那块小地方就画上去（首页、答题页以下都能看见） */
  function boot() {
    var el = document.getElementById("cloudBox");
    if (el) Cloud.render(el);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window);
