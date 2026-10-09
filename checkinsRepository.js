/* ============================================================
   数据访问层（Day 19 板块②）：checkins 这张表的所有查询/写入，全收在这里。
   接口文件 api.js 只调下面这几个函数，不再自己写 from/select/insert/update。
   回调形态和云那边一模一样：cb({error, data, count})。
   今天只搬家，不加功能、不改字段（契约不许动）。
   ============================================================ */
(function (global) {
  "use strict";

  /* 取学习记录列表（带哪天 / 从第几条 / 要几条三个条件） */
  function list(client, opt, cb) {
    var date = opt.date || "";
    var offset = opt.offset || 0;
    var limit = opt.limit || 20;

    var b = client.database
      .from("checkins")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .eq("is_deleted", 0);
    if (date) {
      /* 记录表里没有「哪天」这一列，只有答的那一刻的时间，按那天 0 点到 23:59 圈 */
      b = b.gte("created_at", date + "T00:00:00+08:00")
           .lte("created_at", date + "T23:59:59+08:00");
    }

    var q = null;
    try {
      q = b.range(offset, offset + limit - 1);
    } catch (e0) {
      cb({ error: { message: "问云的话没发出去" } });
      return;
    }
    if (!q || typeof q.then !== "function") {
      cb({ error: { message: "云的小工具没接上" } });
      return;
    }
    q.then(function (out) { cb(out || {}); })["catch"](function () {
      cb({ error: { message: "问云的时候断气了（多半是断网）" } });
    });
  }

  /* 查今天这个词的记录行（用于防重复判断：有没有记过） */
  function getByDayWord(client, pid, word, cb) {
    var q = null;
    try {
      q = client.database.from("checkins")
        .select("id,correct_count,wrong_count")
        .eq("plan_day_id", pid)
        .eq("word", word)
        .maybeSingle();
    } catch (e0) {
      cb({ error: { message: "问云的话没发出去" } });
      return;
    }
    if (!q || typeof q.then !== "function") {
      cb({ error: { message: "云的小工具没接上" } });
      return;
    }
    q.then(function (out) { cb(out || {}); })["catch"](function () {
      cb({ error: { message: "问云的时候断气了（多半是断网）" } });
    });
  }

  /* 在原行上加对/错次数（A 方案：同一天同词不新开行，只加次数） */
  function bumpCounts(client, id, nc, nw, cb) {
    var q = null;
    try {
      q = client.database.from("checkins")
        .update({ correct_count: nc, wrong_count: nw })
        .eq("id", id)
        .select("id,correct_count,wrong_count")
        .maybeSingle();
    } catch (e0) {
      cb({ error: { message: "改次数的话没发出去" } });
      return;
    }
    if (!q || typeof q.then !== "function") {
      cb({ error: { message: "云的小工具没接上" } });
      return;
    }
    q.then(function (out) { cb(out || {}); })["catch"](function () {
      cb({ error: { message: "改次数的时候断气了（多半是断网）" } });
    });
  }

  /* 新开一行（今天这个词的记录第一次出现） */
  function insertRec(client, rec, cb) {
    var q = null;
    try {
      q = client.database.from("checkins")
        .insert(rec)
        .select("id,correct_count,wrong_count")
        .single();
    } catch (e0) {
      cb({ error: { message: "写的话没发出去" } });
      return;
    }
    if (!q || typeof q.then !== "function") {
      cb({ error: { message: "云的小工具没接上" } });
      return;
    }
    q.then(function (out) { cb(out || {}); })["catch"](function () {
      cb({ error: { message: "写的时候断气了（多半是断网）" } });
    });
  }

  /* 按编号取一行（PATCH / DELETE 前先确认这行在不在，不在就别瞎改瞎删） */
  function getById(client, id, cb) {
    var q = null;
    try {
      q = client.database.from("checkins")
        .select("id,plan_day_id,word,status")
        .eq("id", id)
        .maybeSingle();
    } catch (e0) {
      cb({ error: { message: "问云的话没发出去" } });
      return;
    }
    if (!q || typeof q.then !== "function") {
      cb({ error: { message: "云的小工具没接上" } });
      return;
    }
    q.then(function (out) { cb(out || {}); })["catch"](function () {
      cb({ error: { message: "问云的时候断气了（多半是断网）" } });
    });
  }

  /* 按编号改状态（PATCH：只动 status 这一列，别的锁死不让动） */
  function updateById(client, id, status, cb) {
    var q = null;
    try {
      q = client.database.from("checkins")
        .update({ status: status })
        .eq("id", id)
        .select("id,status")
        .maybeSingle();
    } catch (e0) {
      cb({ error: { message: "改的话没发出去" } });
      return;
    }
    if (!q || typeof q.then !== "function") {
      cb({ error: { message: "云的小工具没接上" } });
      return;
    }
    q.then(function (out) { cb(out || {}); })["catch"](function () {
      cb({ error: { message: "改的时候断气了（多半是断网）" } });
    });
  }

  /* 按编号软删一行（DELETE 换做法：不真删，只把 is_deleted 标成 1；列表查询加了 .eq("is_deleted",0) 会自动跳过它。删错了还能用 restoreById 找回来） */
  function deleteById(client, id, cb) {
    var q = null;
    try {
      q = client.database.from("checkins")
        .update({ is_deleted: 1 })
        .eq("id", id)
        .select("id")
        .maybeSingle();
    } catch (e0) {
      cb({ error: { message: "删的话没发出去" } });
      return;
    }
    if (!q || typeof q.then !== "function") {
      cb({ error: { message: "云的小工具没接上" } });
      return;
    }
    q.then(function (out) { cb(out || {}); })["catch"](function () {
      cb({ error: { message: "删的时候断气了（多半是断网）" } });
    });
  }

  /* 找回（恢复）一条被软删的记录：把 is_deleted 改回 0，它就又回到列表里 */
  function restoreById(client, id, cb) {
    var q = null;
    try {
      q = client.database.from("checkins")
        .update({ is_deleted: 0 })
        .eq("id", id)
        .select("id")
        .maybeSingle();
    } catch (e0) {
      cb({ error: { message: "找回的话没发出去" } });
      return;
    }
    if (!q || typeof q.then !== "function") {
      cb({ error: { message: "云的小工具没接上" } });
      return;
    }
    q.then(function (out) { cb(out || {}); })["catch"](function () {
      cb({ error: { message: "找回的时候断气了（多半是断网）" } });
    });
  }

  global.CheckinsRepository = {
    list: list,
    getByDayWord: getByDayWord,
    bumpCounts: bumpCounts,
    insertRec: insertRec,
    getById: getById,
    updateById: updateById,
    deleteById: deleteById,
    restoreById: restoreById
  };
})(window);
