-- ============================================================
-- Day 16 板块①：数据模型（两张表的长相，写死在这一份里）
-- 为什么这么建：字段全部从 api-contract.md 第二节推过来，一个都没另造；
--               今天老师定的规矩——不做登录、不建用户表，所以表里没有「用户编号」那列。
-- 今天不做：不建索引以外的东西、不写任何接口、不改前端页面。
-- ============================================================


-- ------------------------------------------------------------
-- 表一：plan_days 每日计划
-- 一行 = 你的一天。说"这天打算干啥"。
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plan_days (
  id           BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- date 用 DATE（不是文字）：日期才能排序、才能算间隔、才能加唯一约束
  date         DATE        NOT NULL,
  -- target_new 用 INTEGER（整数）：学几个新词永远是整数，不用小数
  target_new   INTEGER     NOT NULL DEFAULT 20,
  -- start_index 用 INTEGER：从词库第几号开始（库里 1229 个词，从 0 数起），记成数字才能加减推进
  start_index  INTEGER     NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 唯一约束：同一天只能有一条计划（这就是老师说的"唯一约束只加在业务字段上"）
CREATE UNIQUE INDEX IF NOT EXISTS plan_days_date_uq ON plan_days (date);

COMMENT ON TABLE  plan_days                  IS '每日计划：一天一行，记这天打算学几个新词、从词库第几号开始';
COMMENT ON COLUMN plan_days.date             IS '哪天（2026-10-04）';
COMMENT ON COLUMN plan_days.target_new       IS '这天打算学几个新词（你提的"每天 20 个"就改这一个数）';
COMMENT ON COLUMN plan_days.start_index      IS '从词库第几号开始（0 起数，库里 1229 词）';


-- ------------------------------------------------------------
-- 表二：checkins 学习记录
-- 一行 = 某天学的某个词。说"实际干了啥"。
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS checkins (
  id          BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- 外键：指向 plan_days 的 id —— 这就是两张表连起来的那根线
  plan_day_id BIGINT          NOT NULL REFERENCES plan_days (id) ON DELETE CASCADE,
  word        TEXT            NOT NULL,
  -- pos 用 TEXT：存 n / v / adj / adv / prep / conj / pron 这些小字符串
  pos         TEXT,
  correct_count INTEGER       NOT NULL DEFAULT 0,
  wrong_count   INTEGER       NOT NULL DEFAULT 0,
  -- 用 TEXT + CHECK 而不是存 0/1：状态要能一眼读成中文那样_pending / mastered
  status      TEXT            NOT NULL DEFAULT 'pending'  CHECK (status IN ('pending', 'mastered')),
  mode        TEXT            NOT NULL DEFAULT 'new'      CHECK (mode IN ('new', 'wrong', 'daily')),
  -- 软删除标记（Day 22 余力加练）：0 = 正常，1 = 已进回收站。不真删，删错了能找回
  is_deleted  INTEGER         NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ     NOT NULL DEFAULT now()
);

-- 唯一约束：同一天同一个词只能有一条记录（同天重复答，是累加次数，不是再插一行）
CREATE UNIQUE INDEX IF NOT EXISTS checkins_day_word_uq ON checkins (plan_day_id, word);

COMMENT ON TABLE  checkins                  IS '学习记录：一天一个词一行，记答对几次、答错几次、算不算掌握';
COMMENT ON COLUMN checkins.plan_day_id      IS '外键：指向 plan_days.id，表示这条记录属于哪天';
COMMENT ON COLUMN checkins.word             IS '学的哪个词';
COMMENT ON COLUMN checkins.pos              IS '词性，一律小写词典体：n / v / adj / adv / prep / conj / pron';
COMMENT ON COLUMN checkins.correct_count    IS '这个词累计答对几次';
COMMENT ON COLUMN checkins.wrong_count      IS '这个词累计答错几次';
COMMENT ON COLUMN checkins.status           IS 'pending 待复习 / mastered 已掌握';
COMMENT ON COLUMN checkins.mode             IS '这个记录从哪来：new 新词 / wrong 错题 / daily 每日';
COMMENT ON COLUMN checkins.is_deleted       IS '软删除标记：0 正常 / 1 已进回收站（不真删，删错了能找回）';
