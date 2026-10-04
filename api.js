/* ============================================================
   ① 今天解决什么问题：页面要的数据改成从云端真表里取，不再只念自己
      手机里那个本子（Day 17 板块①：第一批读取接口）
   ② 为什么这么选：这条云没有「自己起名字的窗口」（Day 15 查实的），
      只能老老实实从那两张表里取。所以把「取」这件事收到本文件一个
      口子里，回话只有一种长相：成了 ok:true + 数据，砸了 ok:false + 人话。
   ③ 今天不做啥：不写（Day 18 才做）；不改表结构；不接页面（Day 20 才换真实数据）。
   ============================================================ */

(function (global) {
  "use strict";

  /* 这两行是开通云之后系统发的两样东西，全程只能从这里拿，不能自己瞎填 */
  var CFG = {
    endpoint: "https://cet4-word-helper.app.workbuddy.host",
    publishableKey: "wbpk_O12WtR6v99Wu8kmCZRjKgH_sg9Rb6ux7sTaa09hgVS0BCVep93u20G3"
  };

  var DEFAULT_LIMIT = 20;   // 一次默认给几条
  var MAX_LIMIT = 100;      // 一次最多给几条（再多容易把手机卡住）

  var client = null;

  function getClient() {
    if (client) return client;
    if (typeof global.WorkBuddyCloud === "undefined") return null;
    client = global.WorkBuddyCloud.createWorkBuddyCloud(CFG);
    return client;
  }

  /* 今天几号（表里的 date 是纯日期，长这样的 2026-10-04） */
  function todayStr() {
    var d = new Date();
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return d.getFullYear() + "-" + (m < 10 ? "0" + m : m) + "-" + (day < 10 ? "0" + day : day);
  }

  /* 成功的统一长相：数据一律装在 data 里 */
  function ok(data) {
    return { ok: true, data: data };
  }

  /* 出错的统一长相：error 是代号，msg 是人话（清单要求：回中文，不回英文堆栈） */
  function fail(code, msg) {
    return { ok: false, error: code, msg: msg };
  }

  /* 云端回的英文原话 → 人话。认代号，认不出就把云端原话原样带出来，不编 */
  function readCloudErr(err) {
    var code = (err && err.code) || "";
    var raw = (err && (err.message || err.details || err.hint)) || "云端没说为啥";
    var low = (code + " " + raw).toLowerCase();

    if (code === "42P01" || code === "DATABASE_PGRST205" || code === "DATABASE_PGRST202" ||
        code === "PGRST205" || code === "PGRST202" ||
        low.indexOf("does not exist") >= 0 || low.indexOf("schema cache") >= 0) {
      return fail("server", "云里查不到这张表（多半是表还没建）");
    }
    if (code === "42501") return fail("server", "这张表不给你看（权限没配好）");
    if (code === "23505") return fail("conflict", "同一天记了两条，撞上了");
    if (code === "22P02" || code === "42883") return fail("bad_request", "传的东西类型不对：" + raw);
    return fail("server", raw);
  }

  var Api = {

    /* 给验证脚本用的小后门：把云端回的英文原话翻成人话。页面自己不调它 */
    _readCloudErr: readCloudErr,

    /* 接口一：取「今天的计划」—— 读 plan_days 那张表
       回的是 {ok:true, data:{date, target_new, start_index, words:[...]}}
       今天还没建计划时，回 {ok:true, data:{empty:true, msg:"今天还没开始…"}}（不是报错） */
    getPlanToday: function (cb) {
      var c = getClient();
      if (!c) { cb(fail("server", "云的小工具没加载出来")); return; }

      var q = null;
      try {
        q = c.database.from("plan_days").select("*").eq("date", todayStr()).maybeSingle();
      } catch (e0) {
        cb(fail("server", "问云的话没发出去"));
        return;
      }
      if (!q || typeof q.then !== "function") { cb(fail("server", "云的小工具没接上")); return; }

      q.then(function (out) {
        var err = out && out.error;
        if (err) { cb(readCloudErr(err)); return; }

        var row = out && out.data;
        if (!row) {
          cb(ok({ empty: true, msg: "今天还没开始，先建个计划" }));
          return;
        }

        /* 这一批词先在本地词库里照 start_index 数出来。
           词库本来就在手机里（words.js），不算天地造数据；
           Day 20 才换成真接口给词卡。改这句话就能换掉。 */
        var words = [];
        if (typeof WORDS !== "undefined" && WORDS.length) {
          var from = Number(row.start_index) || 0;
          var n = Number(row.target_new) || 0;
          for (var i = 0; i < n && from + i < WORDS.length; i++) {
            var w = WORDS[from + i];
            words.push({
              word: w.word,
              pos: w.pos,
              meaning: w.meaning,
              phonetic: w.phonetic
            });
          }
        }

        cb(ok({
          date: row.date,
          target_new: row.target_new,
          start_index: row.start_index,
          words: words
        }));
      })["catch"](function (e) {
        cb(fail("server", "问云的时候断气了（多半是断网）"));
      });
    },

    /* 接口二：取「学习记录」—— 读 checkins 那张表，能带三个条件：
       哪一天 date / 从第几条开始 offset / 要几条 limit（默认 20，最多 100）
       回的是 {ok:true, data:{total, items:[...]}}；一条没有也是 ok:true（不是报错） */
    getRecords: function (opt, cb) {
      opt = opt || {};

      var date = opt.date || "";
      var offset = parseInt(opt.offset, 10);
      if (isNaN(offset) || offset < 0) offset = 0;
      var limit = parseInt(opt.limit, 10);
      if (isNaN(limit) || limit <= 0) limit = DEFAULT_LIMIT;
      if (limit > MAX_LIMIT) { cb(fail("bad_request", "limit 不能大于 " + MAX_LIMIT)); return; }

      var c = getClient();
      if (!c) { cb(fail("server", "云的小工具没加载出来")); return; }

      /* 拼查询：参数全是当值交给云那边，不往里塞拼起来的字（= 清单要的参数化） */
      function build() {
        var b = c.database
          .from("checkins")
          .select("*", { count: "exact" })
          .order("created_at", { ascending: false });
        if (date) {
          /* 记录表里没有「哪天」这一列，只有答的那一刻的时间，
             所以按那天 0 点到 23:59 这一段来圈 */
          b = b.gte("created_at", date + "T00:00:00+08:00")
               .lte("created_at", date + "T23:59:59+08:00");
        }
        return b.range(offset, offset + limit - 1);
      }

      var q = null;
      try {
        q = build();
      } catch (e0) {
        cb(fail("server", "问云的话没发出去"));
        return;
      }
      if (!q || typeof q.then !== "function") { cb(fail("server", "云的小工具没接上")); return; }

      q.then(function (out) {
        var err = out && out.error;
        if (err) { cb(readCloudErr(err)); return; }

        var rows = (out && out.data) || [];
        var total = (out && typeof out.count === "number") ? out.count : rows.length;

        cb(ok({
          total: total,
          offset: offset,
          limit: limit,
          items: rows
        }));
      })["catch"](function (e) {
        cb(fail("server", "问云的时候断气了（多半是断网）"));
      });
    }
  };

  global.Api = Api;
})(window);
