-- 语言模型「今日额度」账本（CloudBase PG）
-- ------------------------------------------------------------
-- 背景：Luna 对话默认用 DeepSeek-V4.1-Flash（不限），其余 6 款为会员专属，
-- 且都按上游真实 token 计费。运营口径是「每个用户每天 ¥1 的语言模型预算」，
-- 超过后会员模型锁到次日 0 点——没有一个按天的花费账本就没法执行这条规则。
--
-- 设计：
--   owner_id + day 做主键 → 一人一天一行，读写都只碰一行；
--   cost_micro 用「微元」整数存（1 元 = 1,000,000），避免浮点累加漂移；
--   day 按 Asia/Shanghai 取日，和用户看到的「今天」一致（不是 UTC 跨天）。
--
-- 与 lunasol_credit_logs 的区别：那张表记的是「积分」（产品内货币），
-- 这张表记的是「钱」（厂商账单口径），两者不能混用。
CREATE TABLE IF NOT EXISTS public.lunasol_chat_spend (
  owner_id    text        NOT NULL,
  day         date        NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Shanghai')::date),
  cost_micro  bigint      NOT NULL DEFAULT 0,
  calls       integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, day),
  CONSTRAINT lunasol_chat_spend_cost_chk  CHECK (cost_micro >= 0),
  CONSTRAINT lunasol_chat_spend_calls_chk CHECK (calls >= 0)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lunasol_chat_spend TO authenticated;

ALTER TABLE public.lunasol_chat_spend ENABLE ROW LEVEL SECURITY;

CREATE POLICY lunasol_chat_spend_select_owner ON public.lunasol_chat_spend
  FOR SELECT TO authenticated USING (owner_id = auth.uid());

CREATE POLICY lunasol_chat_spend_insert_owner ON public.lunasol_chat_spend
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());

CREATE POLICY lunasol_chat_spend_update_owner ON public.lunasol_chat_spend
  FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- 原子累加：并发（多标签页 / 连续快速发送）时不能读-改-写，否则会丢记一次花费，
-- 额度就会比实际花得慢，长期下来平台替用户垫钱。
-- SECURITY DEFINER + 显式校验 auth.uid()，保证只能给自己的账本加钱。
CREATE OR REPLACE FUNCTION public.lunasol_add_chat_spend(p_uid text, p_cost_micro bigint)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cost  bigint := GREATEST(COALESCE(p_cost_micro, 0), 0);
  v_total bigint;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_uid THEN
    RETURN -1;
  END IF;

  INSERT INTO public.lunasol_chat_spend (owner_id, day, cost_micro, calls)
  VALUES (p_uid, (now() AT TIME ZONE 'Asia/Shanghai')::date, v_cost, 1)
  ON CONFLICT (owner_id, day) DO UPDATE
    SET cost_micro = public.lunasol_chat_spend.cost_micro + EXCLUDED.cost_micro,
        calls      = public.lunasol_chat_spend.calls + 1,
        updated_at = now()
  RETURNING cost_micro INTO v_total;

  RETURN v_total;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.lunasol_add_chat_spend(text, bigint) TO authenticated;
