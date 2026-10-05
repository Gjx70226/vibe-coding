/* ============================================================
   ① 今天解决什么问题：能不能真往云里那张表写一行（Day 18 板块①：第一个写入接口），
      顺手把「余力加练」做了：每次去问云，自己这儿自动留一行字（Day 18 余力加练）
   ② 为什么这么选：重复提交用「先看有没有那行 → 有就在原行上把对/错次数 +1，
      没有才新开一行」，不靠云那条唯一约束硬挡——云那道门槛只管「能不能再插一行」，
      不管「次数该不该加」，硬挡了当天就没法再练一遍（你拍的 A 方案）。
      手滑连点另用 3 秒窗口挡（同一个词 + 同一天 + 同一对错，几秒内原样再来＝重复提交）。
   ③ 今天不做啥：不做云里那张「日志表」（要新开一张表，得你点头才动）；
      不发版（板块② 才发）；不接主站页面（Day 20 才换真实数据）；
      不做 PATCH / DELETE / 批量写（第四周）。
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
  var MAX_WORD_LEN = 100;   // 一个词最多几个字（超了当瞎填，直接拒）
  var MODES = ["new", "wrong", "daily"];  // mode 只准这三个（表里也有这道 CHECK）
  var DUP_WINDOW_MS = 3000; // 几秒内同一条原样再来＝手滑重复提交（想换长短改这个数）

  /* 手滑连点那道关要记一下「上次记的是啥」，页面自己不碰它 */
  var lastKey = "";
  var lastAt = 0;

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
    /* 23503：插的那行的「哪天」在计划表里根本不存在（外键约束没过） */
    if (code === "23503") return fail("bad_request", "填的那个「哪天」在每日计划表里没有这一行（plan_day_id 得是计划表里真存在的一行号）");
    if (code === "23505") return fail("conflict", "同一天记了两条，撞上了");
    if (code === "22P02" || code === "42883") return fail("bad_request", "传的东西类型不对：" + raw);
    return fail("server", raw);
  }

  /* ---- 余力加练（A 方案）：留痕 ----------------------------------------
     每次去问云，自己这儿自动留一行：几点、干的啥、成没成、云回了啥。
     留两处：① 浏览器控制台（电脑 F12 能看，黄字＝砸了）
            ② 一个最多留 50 条的小本子，挂在页面上（控制台输 __apiLog 也看得见，
               查看页 api.html 上有「看留痕」按钮直接打出来）
     只留自己这儿，不往云里写 —— 这网站没有自己开的服务器，写不进去。
     想换留多少条：改下面 LOG_MAX 一个数。 */
  var LOG_MAX = 50;

  function clip(s, n) {
    s = String(s).replace(/\s+/g, " ");
    return s.length > n ? s.slice(0, n) + " …" : s;
  }

  function trace(action, r) {
    if (!global.__apiLog) global.__apiLog = [];
    var d = new Date();
    var hh = d.getHours(), mm = d.getMinutes(), ss = d.getSeconds();
    var hms = (hh < 10 ? "0" + hh : hh) + ":" + (mm < 10 ? "0" + mm : mm) + ":" + (ss < 10 ? "0" + ss : ss);
    var good = !!(r && r.ok);
    var line;
    if (good) {
      var d3 = (r && r.data) || {};
      line = "成 " + hms + "  " + action +
        (d3.action ? "（新开一行）" : d3.total !== undefined ? "（一共 " + d3.total + " 条）" :
         (d3.words ? "（" + d3.words.length + " 个词）" : "")) +
        (d3.id ? "  行的号 " + d3.id : "") +
        (d3.word ? "  词 " + d3.word : "");
    } else {
      line = "砸 " + hms + "  " + action +
        "  [" + ((r && r.error) || "?") + "] " + clip((r && r.msg) || "没说出为啥", 80);
    }
    global.__apiLog.push(line);
    if (global.__apiLog.length > LOG_MAX) global.__apiLog.shift();
    if (global.console && global.console[good ? "log" : "warn"]) {
      global.console[good ? "log" : "warn"]("[云] " + line);
    }
  }

  var Api = {

    /* 给验证脚本用的小后门：把云端回的英文原话翻成人话。页面自己不调它 */
    _readCloudErr: readCloudErr,

    /* 给留痕用的：看自己留了哪几行（页面「看留痕」按钮调它，验证脚本也能调） */
    log: function () { return (global.__apiLog || []).slice(); },

    /* 接口一：取「今天的计划」—— 读 plan_days 那张表
       回的是 {ok:true, data:{date, target_new, start_index, words:[...]}}
       今天还没建计划时，回 {ok:true, data:{empty:true, msg:"今天还没开始…"}}（不是报错） */
    getPlanToday: function (cb) {
      var _cb = cb;   /* 余力加练：管它是从哪条道出去的，出门前先留一行 */
      cb = function (r) { trace("取今天的计划", r); _cb(r); };

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

      /* 余力加练：留痕的口子得开在**所有校验之前**，
         要不然「limit 超上限」这种当场挡回的错误就留不下痕了（第一天写漏了，改在这里） */
      var _cb = cb;
      cb = function (r) { trace("取学习记录" + (date ? "（" + date + "）" : ""), r); _cb(r); };

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
    },

    /* 接口三：记一笔 —— 往 checkins 那张表写一个新行（Day 18 板块①：第一个写入接口）
       要带的东西：plan_day_id（哪天，必填）、word（哪个词，必填）、is_correct（对/错，必填）、
                   pos（词性，可省）、mode（哪来的 new/wrong/daily，默认 new）
       回的还是那一种长相：成了 {ok:true, data:{id, word, correct, wrong, action}}
           action = insert（新开了一行）或 update（今天已经记过这行，在原行上加了次数）
       今天防两种「重复」：
         1) 同一天同一个词已经有行了 → 不加新行，在那行上把对/错次数 +1（A 方案，你拍的）
         2) 同一条请求几秒内原样又来一遍（手滑连点）→ 不碰云先挡回，别让云写两遍 */
    addRecord: function (opt, cb) {
      opt = opt || {};
      cb = cb || function () {};

      var _cb = cb;   /* 余力加练：出门前先留一行（含手滑连点被当场挡回的那次） */
      cb = function (r) { trace("记一笔", r); _cb(r); };

      /* ---- 第一关：看输入对不对，错了回人话（不联网，先挡住） ---- */
      var rawDay = (opt.plan_day_id === undefined || opt.plan_day_id === null) ? "" : String(opt.plan_day_id).trim();
      if (!rawDay) { cb(fail("bad_request", "少了 plan_day_id（得写清这条记的是哪一天）")); return; }
      var pid = parseInt(rawDay, 10);
      if (isNaN(pid) || pid <= 0) {
        cb(fail("bad_request", "plan_day_id 得是个数字（每日计划表里的行号），你填的是「" + rawDay + "」"));
        return;
      }

      var word = (opt.word === undefined || opt.word === null) ? "" : String(opt.word).trim();
      if (!word) { cb(fail("bad_request", "少了 word（没写记的是哪个词）")); return; }
      if (word.length > MAX_WORD_LEN) {
        cb(fail("bad_request", "word 太长了（最多 " + MAX_WORD_LEN + " 个字），你填了 " + word.length + " 个"));
        return;
      }

      var c0 = opt.is_correct;
      var isTrue = (c0 === true || c0 === 1 || String(c0) === "true");
      var isFalse = (c0 === false || c0 === 0 || String(c0) === "false");
      if (!isTrue && !isFalse) {
        cb(fail("bad_request", "is_correct 只能填 true（答对）或 false（答错），你填的是「" + String(c0) + "」"));
        return;
      }
      var addCorrect = isTrue ? 1 : 0;
      var addWrong = isTrue ? 0 : 1;

      var mode = (opt.mode === undefined || opt.mode === null || String(opt.mode).trim() === "") ? "new" : String(opt.mode).trim();
      if (MODES.indexOf(mode) < 0) {
        cb(fail("bad_request", "mode 只能是 " + MODES.join(" / ") + " 这三个之一，你填的是「" + mode + "」"));
        return;
      }
      var pos = (opt.pos === undefined || opt.pos === null || String(opt.pos).trim() === "") ? null : String(opt.pos).trim();

      /* ---- 第二关：手滑连点（同一条原样几秒内又来一遍） ---- */
      var key = pid + "|" + word + "|" + addCorrect;
      var now = Date.now();
      if (key === lastKey && (now - lastAt) < DUP_WINDOW_MS) {
        cb(fail("conflict", "这条刚记过了（" + (DUP_WINDOW_MS / 1000) + " 秒内跟上一次一模一样），别重复提交"));
        return;
      }
      lastKey = key;
      lastAt = now;

      /* ---- 第三关：去云里写 ---- */
      var c = getClient();
      if (!c) { cb(fail("server", "云的小工具没加载出来")); return; }

      var q = null;
      try {
        q = c.database.from("checkins")
          .select("id,correct_count,wrong_count")
          .eq("plan_day_id", pid)
          .eq("word", word)
          .maybeSingle();
      } catch (e0) { cb(fail("server", "问云的话没发出去")); return; }
      if (!q || typeof q.then !== "function") { cb(fail("server", "云的小工具没接上")); return; }

      q.then(function (out) {
        var err = out && out.error;
        if (err) { cb(readCloudErr(err)); return; }

        var row = out && out.data;

        if (row && row.id) {
          /* 今天这行已经记过了 —— 加次数，不新开一行（A 方案：答对就加对 1 次） */
          var nc = (Number(row.correct_count) || 0) + addCorrect;
          var nw = (Number(row.wrong_count) || 0) + addWrong;
          var q2 = null;
          try {
            q2 = c.database.from("checkins").update({ correct_count: nc, wrong_count: nw })
              .eq("id", row.id).select("id,correct_count,wrong_count").maybeSingle();
          } catch (e1) { cb(fail("server", "改次数的话没发出去")); return; }
          if (!q2 || typeof q2.then !== "function") { cb(fail("server", "云的小工具没接上")); return; }
          q2.then(function (o2) {
            var e2 = o2 && o2.error;
            if (e2) { cb(readCloudErr(e2)); return; }
            var r2 = (o2 && o2.data) || {};
            cb(ok({
              id: r2.id || row.id,
              word: word,
              correct: Number(r2.correct_count || nc),
              wrong: Number(r2.wrong_count || nw),
              action: "update"
            }));
          })["catch"](function () { cb(fail("server", "改次数的时候断气了（多半是断网）")); });
          return;
        }

        /* 今天还没记过这行 —— 新开一行 */
        var q3 = null;
        try {
          q3 = c.database.from("checkins").insert({
            plan_day_id: pid,
            word: word,
            pos: pos,
            correct_count: addCorrect,
            wrong_count: addWrong,
            status: "pending",
            mode: mode
          }).select("id,correct_count,wrong_count").single();
        } catch (e3) { cb(fail("server", "写的话没发出去")); return; }
        if (!q3 || typeof q3.then !== "function") { cb(fail("server", "云的小工具没接上")); return; }
        q3.then(function (o3) {
          var e3 = o3 && o3.error;
          if (e3) { cb(readCloudErr(e3)); return; }
          var r3 = (o3 && o3.data) || {};
          cb(ok({
            id: r3.id,
            word: word,
            correct: Number(r3.correct_count || addCorrect),
            wrong: Number(r3.wrong_count || addWrong),
            action: "insert"
          }));
        })["catch"](function () { cb(fail("server", "写的时候断气了（多半是断网）")); });
      })["catch"](function () { cb(fail("server", "问云的时候断气了（多半是断网）")); });
    }
  };

  global.Api = Api;
})(window);
