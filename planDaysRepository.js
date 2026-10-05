/* ============================================================
   数据访问层（Day 19 板块②）：plan_days 这张表的所有查询，全收在这里。
   接口文件 api.js 只调 PlanDaysRepository.getToday，不再自己写 from/select。
   回调形态和云那边一模一样：cb({error, data}) —— 有 error 就是出事，data 是那一行。
   今天只搬家，不加功能、不改字段（契约不许动）。
   ============================================================ */
(function (global) {
  "use strict";

  /* 取「今天这一行」计划（date 是纯日期，如 2026-10-04） */
  function getToday(client, today, cb) {
    var q = null;
    try {
      q = client.database.from("plan_days").select("*").eq("date", today).maybeSingle();
    } catch (e0) {
      cb({ error: { message: "问云的话没发出去" } });
      return;
    }
    if (!q || typeof q.then !== "function") {
      cb({ error: { message: "云的小工具没接上" } });
      return;
    }
    q.then(function (out) {
      cb(out || {});
    })["catch"](function () {
      cb({ error: { message: "问云的时候断气了（多半是断网）" } });
    });
  }

  global.PlanDaysRepository = { getToday: getToday };
})(window);
