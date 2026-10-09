/* ============================================================
   数据访问层（Day 19 板块②）：plan_days 这张表的所有查询，全收在这里。
   接口文件 api.js 只调 PlanDaysRepository.getToday，不再自己写 from/select。
   回调形态和云那边一模一样：cb({error, data}) —— 有 error 就是出事，data 是那一行。
   Day 19 只搬家，不加功能、不改字段（契约不许动）。
   Day 23 改了啥：问云没成的分支统一归「网络/接口错」，回中文「数据暂时拿不到，请稍后再试」，
     原始报错只进控制台，不甩给用户（三类错误模型见 api.js 的 readCloudErr）。
   ============================================================ */
(function (global) {
  "use strict";

  function netErr() {
    return { error: { code: "network", message: "数据暂时拿不到，请稍后再试" } };
  }
  function logErr(tag, e) {
    if (global.console && global.console.error) global.console.error("[云] " + tag, e || "");
  }

  /* 取「今天这一行」计划（date 是纯日期，如 2026-10-04） */
  function getToday(client, today, cb) {
    var q = null;
    try {
      q = client.database.from("plan_days").select("*").eq("date", today).maybeSingle();
    } catch (e0) {
      logErr("取计划·请求没发出去", e0);
      cb(netErr());
      return;
    }
    if (!q || typeof q.then !== "function") {
      logErr("取计划·云小工具没接上");
      cb(netErr());
      return;
    }
    q.then(function (out) {
      cb(out || {});
    })["catch"](function (e) {
      logErr("取计划·网络或接口错", e);
      cb(netErr());
    });
  }

  global.PlanDaysRepository = { getToday: getToday };
})(window);
