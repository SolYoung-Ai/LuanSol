-- LunaSol 积分包购买（Creem 一次性付款）
-- ------------------------------------------------------------
-- 与会员订阅分开处理的原因：
--   1) 积分包是 onetime 付款，没有 subscription_id，也没有 period_end；
--   2) 积分落在 lunasol_subscriptions.bonus_credits（与签到 / 兑换码同一账户口径），
--      不占会员的 quota_total；
--   3) 幂等不能只看 event_id：同一个订单可能先后推来多个事件，
--      只按 event_id 去重会重复加积分。所以额外按「同一 order_id」再拦一次。
--
-- 为什么不新增 kind='credits'：那要改 CHECK 约束，属于删约束操作，
-- 一旦中途失败会留下既没有旧约束也没有新约束的表。这里复用
-- kind='grant' / 'revoke'，用非空的 credits 列区分「这是积分包订单」。
-- ============================================================

-- 记录本次购买加了多少积分（退款记负数），便于对账
ALTER TABLE public.lunasol_payments ADD COLUMN IF NOT EXISTS credits integer;

-- 积分包订单的重复投递拦截（同一笔 Creem 订单只入账一次）
CREATE UNIQUE INDEX IF NOT EXISTS lunasol_payments_credits_order_idx
  ON public.lunasol_payments (provider, order_id)
  WHERE credits IS NOT NULL AND credits > 0 AND order_id IS NOT NULL;

-- 积分入账 / 退款回收
CREATE OR REPLACE FUNCTION public.lunasol_credits_apply(
  p_secret   text,
  p_owner_id text,
  p_event_id text,
  p_credits  integer,
  p_amount   integer,
  p_currency text,
  p_order_id text,
  p_raw      jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_hash    text;
  v_expect  text;
  v_delta   integer;
  v_balance integer;
BEGIN
  IF coalesce(p_secret, '') = '' OR coalesce(p_owner_id, '') = '' OR coalesce(p_credits, 0) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'message', 'missing params');
  END IF;

  v_hash := encode(sha256(convert_to(p_secret, 'UTF8')), 'hex');
  SELECT secret_sha256 INTO v_expect FROM public.lunasol_pay_secrets WHERE name = 'creem';
  IF v_expect IS NULL OR v_hash <> v_expect THEN
    RETURN jsonb_build_object('ok', false, 'message', 'invalid secret');
  END IF;

  -- 正数=入账，负数=退款回收
  v_delta := p_credits;

  -- 幂等 1：同一个事件重复投递
  IF coalesce(p_event_id, '') <> '' AND EXISTS (
    SELECT 1 FROM public.lunasol_payments WHERE event_id = p_event_id
  ) THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true);
  END IF;

  -- 幂等 2：同一笔订单的不同事件，只入账一次（退款不受此限）
  IF v_delta > 0 AND coalesce(p_order_id, '') <> '' AND EXISTS (
    SELECT 1 FROM public.lunasol_payments
     WHERE provider = 'creem' AND order_id = p_order_id AND credits > 0
  ) THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true);
  END IF;

  INSERT INTO public.lunasol_payments
    (owner_id, provider, event_id, kind, status, amount, currency, order_id, credits, raw)
  VALUES
    (p_owner_id, 'creem', nullif(p_event_id, ''), CASE WHEN v_delta < 0 THEN 'revoke' ELSE 'grant' END,
     CASE WHEN v_delta < 0 THEN 'refunded' ELSE 'paid' END,
     p_amount, p_currency, nullif(p_order_id, ''), v_delta, p_raw)
  ON CONFLICT DO NOTHING;

  -- 积分行可能还不存在（用户没签到过 / 首次进入没建行），这里一并补建
  INSERT INTO public.lunasol_subscriptions
    (id, owner_id, plan, status, quota_total, quota_used, bonus_credits, updated_at)
  VALUES
    (p_owner_id, p_owner_id, 'free', 'none', 2, 0, GREATEST(v_delta, 0), now())
  ON CONFLICT (id) DO UPDATE SET
    bonus_credits = GREATEST(0, coalesce(public.lunasol_subscriptions.bonus_credits, 0) + v_delta),
    updated_at    = now();

  -- 余额口径与前端一致：(quota_total - quota_used) + bonus_credits
  SELECT GREATEST(0, quota_total - quota_used) + GREATEST(0, coalesce(bonus_credits, 0))
    INTO v_balance
    FROM public.lunasol_subscriptions
   WHERE id = p_owner_id;

  INSERT INTO public.lunasol_credit_logs
    (owner_id, change_type, amount, balance_after, reason, task_type, created_at)
  VALUES
    (p_owner_id,
     CASE WHEN v_delta < 0 THEN 'refund' ELSE 'recharge' END,
     abs(v_delta),
     coalesce(v_balance, 0),
     CASE WHEN v_delta < 0 THEN '积分包退款' ELSE '积分包购买（Creem）' END,
     'recharge',
     now());

  RETURN jsonb_build_object('ok', true, 'credits', v_delta, 'balance', v_balance);
END;
$$;

GRANT EXECUTE ON FUNCTION public.lunasol_credits_apply(text, text, text, integer, integer, text, text, jsonb) TO PUBLIC;
