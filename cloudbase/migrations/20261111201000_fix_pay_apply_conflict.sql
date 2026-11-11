-- 修复会员回调必定失败：lunasol_pay_apply 用了 ON CONFLICT (event_id)，
-- 而 event_id 上只有**部分唯一索引**（WHERE event_id IS NOT NULL）。
-- PostgreSQL 无法用部分索引做 ON CONFLICT 的推理，直接报
--   42P10 there is no unique or exclusion constraint matching the ON CONFLICT specification
-- 结果是 Creem 每推一次会员事件都 500，用户付了钱永远不开通。
--
-- 改成显式 EXISTS 判重（与本文件同批的 lunasol_credits_apply 同一写法），
-- 不再依赖索引形态。部分索引保留，它的作用是拦住 event_id 为 NULL 的行。
-- ============================================================

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
  v_hash   text;
  v_expect text;
  v_end    timestamptz;
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
  IF coalesce(p_event_id, '') <> '' AND EXISTS (
    SELECT 1 FROM public.lunasol_payments WHERE event_id = p_event_id
  ) THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true);
  END IF;

  INSERT INTO public.lunasol_payments
    (owner_id, provider, event_id, kind, status, amount, currency, order_id, subscription_id, period_end, raw)
  VALUES
    (p_owner_id, 'creem', nullif(p_event_id, ''), p_kind,
     CASE WHEN p_status IN ('paid', 'refunded', 'canceled', 'expired', 'failed') THEN p_status
          WHEN p_kind = 'grant' THEN 'paid' ELSE 'canceled' END,
     p_amount, p_currency, p_order_id, p_subscription_id, p_period_end, p_raw);

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
    -- 退款 / 取消到期 / 过期：把有效期收回到「当下或事件给的更早时刻」。
    -- 只对有订阅行的用户生效；没有行说明本来就没开通过，不必凭空建。
    UPDATE public.lunasol_subscriptions
       SET period_end = LEAST(coalesce(period_end, now()), coalesce(p_period_end, now())),
           updated_at = now()
     WHERE id = p_owner_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'kind', p_kind, 'period_end', v_end);
END;
$$;

GRANT EXECUTE ON FUNCTION public.lunasol_pay_apply(text, text, text, text, text, timestamptz, integer, text, text, text, jsonb) TO PUBLIC;
