-- ============================================================
-- Day 16 板块③：种子数据（往两张空表里塞几条假数据，专门用来验"能存能查"）
-- 为什么这么写：老师要求种子脚本"可重复执行"——同一份跑第二遍不能报错，
--               所以开头必须先删（按日期删掉这批种子要塞的那几天）再插。
-- 注意（照老师原话）：seed 只用在开发阶段；第 20 天上线之后不许再执行，
--               否则会把这些日期的真实记录一起清掉。上线后改数据一律用增量 SQL。
-- 今天不做：不写任何接口、不改前端页面。
-- ============================================================

-- 第 1 步：先删掉这批种子要塞的天数（只删 10-04～10-08，别的天一个不动）
DELETE FROM checkins WHERE plan_day_id IN (SELECT id FROM plan_days WHERE date BETWEEN '2026-10-04' AND '2026-10-08');
DELETE FROM plan_days      WHERE date BETWEEN '2026-10-04' AND '2026-10-08';

-- 第 2 步：建（用 IF NOT EXISTS，幂等；表已经建好的话不会重建、不会丢东西，Day 16 板块② 已建）
CREATE TABLE IF NOT EXISTS plan_days (
  id           BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date         DATE        NOT NULL,
  target_new   INTEGER     NOT NULL DEFAULT 20,
  start_index  INTEGER     NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS checkins (
  id           BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  plan_day_id  BIGINT          NOT NULL REFERENCES plan_days (id) ON DELETE CASCADE,
  word         TEXT            NOT NULL,
  pos          TEXT,
  correct_count INTEGER        NOT NULL DEFAULT 0,
  wrong_count   INTEGER        NOT NULL DEFAULT 0,
  status       TEXT            NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'mastered')),
  mode         TEXT            NOT NULL DEFAULT 'new'      CHECK (mode IN ('new', 'wrong', 'daily')),
  created_at   TIMESTAMPTZ     NOT NULL DEFAULT now()
);

-- 第 3 步：插入 5 天计划（每行＝你的一天）
INSERT INTO plan_days (date, target_new, start_index) VALUES
  ('2026-10-04', 20, 0),
  ('2026-10-05', 20, 20),
  ('2026-10-06', 20, 40),
  ('2026-10-07', 15, 60),
  ('2026-10-08', 20, 75);

-- 第 4 步：插入 6 条学习记录（plan_day_id 用子查询指回上面那 5 天 —— 这就是外键那根线）
INSERT INTO checkins (plan_day_id, word, pos, correct_count, wrong_count, status, mode)
SELECT (SELECT id FROM plan_days WHERE date = '2026-10-04'), 'abandon', 'v',   1, 0, 'mastered', 'new'    UNION ALL
SELECT (SELECT id FROM plan_days WHERE date = '2026-10-04'), 'benefit', 'n',   2, 1, 'mastered', 'new'    UNION ALL
SELECT (SELECT id FROM plan_days WHERE date = '2026-10-05'), 'capable', 'adj', 1, 0, 'mastered', 'new'    UNION ALL
SELECT (SELECT id FROM plan_days WHERE date = '2026-10-05'), 'delay',   'v',   0, 2, 'pending',  'wrong'  UNION ALL
SELECT (SELECT id FROM plan_days WHERE date = '2026-10-06'), 'efficient','adj',3, 0, 'mastered', 'daily'  UNION ALL
SELECT (SELECT id FROM plan_days WHERE date = '2026-10-07'), 'visible', 'adj', 1, 0, 'pending',  'daily';

-- 验证（Day 16 板块④ 用的两句 select，各应看到 ≥5 行）：
--   SELECT * FROM plan_days ORDER BY date;
--   SELECT * FROM checkins ORDER BY id;
