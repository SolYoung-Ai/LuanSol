-- LunaSol 订阅 / 额度表（CloudBase PG / 国内站）
-- ------------------------------------------------------------
-- 与 lunasol_projects 同一套隔离方式：每行 owner_id 必须等于 auth.uid()，
-- 越权读写会被数据库直接拒绝（RLS），前端拿不到别人的订阅与用量。
--
-- 字段约定（与 src/cloud/subscription.tsx 一一对应）：
--   plan          free | pro_monthly
--   status        none | active
--   quota_total   本周期总额度：免费 2 次 / 会员 600 次
--   quota_used    本周期已用量（每次 AI 建议调用 +1）
--   period_start  本周期开始（会员开通时间）
--   period_end    本周期结束（会员到期时间）
--   activated_by  开通来源：activation-code（支付上线前）/ payment（支付上线后）
--
-- 主键直接用用户 uid：新用户首次进入时按 free 额度插入一行即可，
-- 不需要额外的「订阅记录」表，也避免 id 与 owner_id 不一致。
CREATE TABLE IF NOT EXISTS public.lunasol_subscriptions (
  id            text PRIMARY KEY,
  owner_id      varchar(64) NOT NULL,
  plan          text NOT NULL DEFAULT 'free',
  status        text NOT NULL DEFAULT 'none',
  quota_total   integer NOT NULL DEFAULT 2,
  quota_used    integer NOT NULL DEFAULT 0,
  period_start  timestamptz,
  period_end    timestamptz,
  activated_by  text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lunasol_subscriptions_plan_chk   CHECK (plan   IN ('free', 'pro_monthly')),
  CONSTRAINT lunasol_subscriptions_status_chk CHECK (status IN ('none', 'active')),
  CONSTRAINT lunasol_subscriptions_quota_chk  CHECK (quota_total >= 0 AND quota_used >= 0)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lunasol_subscriptions TO authenticated;

ALTER TABLE public.lunasol_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY lunasol_subscriptions_select_owner ON public.lunasol_subscriptions
  FOR SELECT TO authenticated USING (owner_id = auth.uid());

CREATE POLICY lunasol_subscriptions_insert_owner ON public.lunasol_subscriptions
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());

CREATE POLICY lunasol_subscriptions_update_owner ON public.lunasol_subscriptions
  FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE POLICY lunasol_subscriptions_delete_owner ON public.lunasol_subscriptions
  FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- 按到期时间扫描续费/过期任务时用
CREATE INDEX IF NOT EXISTS lunasol_subscriptions_period_end_idx
  ON public.lunasol_subscriptions (period_end DESC);

-- 原子消耗额度：前端「读-改-写」在并发调用下会互相覆盖计数，
-- 这里把自增放进数据库一次完成，并让 RLS 继续生效（函数默认 SECURITY INVOKER，
-- 只有 owner_id = auth.uid() 的行才可能被更新）。
CREATE OR REPLACE FUNCTION public.lunasol_consume_quota(p_uid text, p_n integer DEFAULT 1)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_used integer;
BEGIN
  UPDATE public.lunasol_subscriptions
     SET quota_used = LEAST(quota_total, quota_used + GREATEST(p_n, 0)),
         updated_at = now()
   WHERE id = p_uid AND owner_id = auth.uid()
  RETURNING quota_used INTO v_used;

  IF v_used IS NULL THEN
    RETURN -1;   -- 没有可更新的行（未登录 / 不是本人 / 记录不存在）
  END IF;
  RETURN v_used;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lunasol_consume_quota(text, integer) TO authenticated;
