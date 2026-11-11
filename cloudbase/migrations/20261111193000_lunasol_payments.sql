-- LunaSol 支付流水 + 开通函数（Creem）
-- ------------------------------------------------------------
-- 设计要点：
--  1) lunasol_payments 记录每一笔 webhook 事件，event_id 唯一索引保证
--     「同一事件重复投递」只开通一次（Creem 会重试，最多 5 次）；
--  2) 云函数用 publishable key（anon 身份）调 lunasol_pay_apply，
--     函数内部用 PAY_APPLY_SECRET 的 sha256 做二次校验——否则任何拿到
--     anon key 的人都能自己调这个函数白拿会员；secret 明文只存在云函数
--     环境变量里，库里只放哈希；
--  3) 函数是 SECURITY DEFINER，绕过 RLS 写 lunasol_subscriptions；
--  4) 会员到期不写 status='expired'：表上 status 只有 none/active，
--     过期一律用 period_end 判定（isProActive 已在用它），避免状态机打架。
-- ============================================================

CREATE TABLE IF NOT EXISTS public.lunasol_payments (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id        text NOT NULL,
  provider        text NOT NULL DEFAULT 'creem',
  event_id        text,
  kind            text NOT NULL DEFAULT 'grant',
  status          text NOT NULL DEFAULT 'paid',
  amount          integer,
  currency        text,
  order_id        text,
  subscription_id text,
  period_end      timestamptz,
  raw             jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lunasol_payments_kind_chk   CHECK (kind   IN ('grant', 'revoke')),
  CONSTRAINT lunasol_payments_status_chk CHECK (status IN ('paid', 'refunded', 'canceled', 'expired', 'failed'))
);

-- 幂等的关键：一个 Creem 事件只能落一行
CREATE UNIQUE INDEX IF NOT EXISTS lunasol_payments_event_idx
  ON public.lunasol_payments (event_id) WHERE event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS lunasol_payments_owner_idx
  ON public.lunasol_payments (owner_id, created_at DESC);

GRANT SELECT ON public.lunasol_payments TO authenticated;

ALTER TABLE public.lunasol_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY lunasol_payments_select_owner ON public.lunasol_payments
  FOR SELECT TO authenticated USING (owner_id = auth.uid());

-- 只存哈希，不存明文；开启 RLS 且不建任何策略 = anon/authenticated 全禁，
-- 只有 SECURITY DEFINER 函数（属主）能读。
CREATE TABLE IF NOT EXISTS public.lunasol_pay_secrets (
  name          text PRIMARY KEY,
  secret_sha256 text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lunasol_pay_secrets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.lunasol_pay_secrets FROM anon, authenticated;

-- 支付回调的落库入口：开通 / 回收都在一个事务里完成
CREATE OR REPLACE FUNCTION public.lunasol_pay_apply(
  p_secret          text,
  p_owner_id        text,
  p_event_id        text,
  p_status          text,
  p_kind            text,
  p_period_end      timestamptz,
  p_amount          integer,
  p_currency        text,
  p_order_id        text,
  p_subscription_id text,
  p_raw             jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_hash    text;
  v_expect  text;
  v_end     timestamptz;
BEGIN
  IF coalesce(p_secret, '') = '' OR coalesce(p_owner_id, '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'missing params');
  END IF;

  v_hash := encode(sha256(convert_to(p_secret, 'UTF8')), 'hex');
  SELECT secret_sha256 INTO v_expect FROM public.lunasol_pay_secrets WHERE name = 'creem';
  IF v_expect IS NULL OR v_hash <> v_expect THEN
    RETURN jsonb_build_object('ok', false, 'message', 'invalid secret');
  END IF;

  IF p_kind NOT IN ('grant', 'revoke') THEN
    RETURN jsonb_build_object('ok', false, 'message', 'invalid kind');
  END IF;

  -- 幂等：重复事件直接返回，不重复开通
  IF coalesce(p_event_id, '') <> '' THEN
    INSERT INTO public.lunasol_payments
      (owner_id, provider, event_id, kind, status, amount, currency, order_id, subscription_id, period_end, raw)
    VALUES
      (p_owner_id, 'creem', p_event_id, p_kind,
       CASE WHEN p_status IN ('paid','refunded','canceled','expired','failed') THEN p_status
            WHEN p_kind = 'grant' THEN 'paid' ELSE 'canceled' END,
       p_amount, p_currency, p_order_id, p_subscription_id, p_period_end, p_raw)
    ON CONFLICT (event_id) DO NOTHING;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', true, 'duplicate', true);
    END IF;
  END IF;

  IF p_kind = 'grant' THEN
    v_end := coalesce(p_period_end, now() + interval '31 days');
    INSERT INTO public.lunasol_subscriptions
      (id, owner_id, plan, status, quota_total, quota_used, period_start, period_end, activated_by, updated_at)
    VALUES
      (p_owner_id, p_owner_id, 'pro_monthly', 'active', 600, 0, now(), v_end, 'payment', now())
    ON CONFLICT (id) DO UPDATE SET
      plan         = 'pro_monthly',
      status       = 'active',
      quota_total  = GREATEST(public.lunasol_subscriptions.quota_total, 600),
      quota_used   = 0,
      period_start = coalesce(public.lunasol_subscriptions.period_start, now()),
      -- 续费只往后延，不因为一次乱序事件把有效期缩短
      period_end   = GREATEST(coalesce(public.lunasol_subscriptions.period_end, now()), v_end),
      activated_by = 'payment',
      updated_at   = now();
  ELSE
    -- 退款 / 取消到期 / 过期：把有效期收回到「当下或事件给的更早时刻」
    UPDATE public.lunasol_subscriptions
       SET period_end = LEAST(coalesce(period_end, now()), coalesce(p_period_end, now())),
           updated_at = now()
     WHERE id = p_owner_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'kind', p_kind, 'period_end', v_end);
END;
$$;

-- 默认新函数即授予 PUBLIC，这里显式写一遍便于审计
GRANT EXECUTE ON FUNCTION public.lunasol_pay_apply(text, text, text, text, text, timestamptz, integer, text, text, text, jsonb) TO PUBLIC;
