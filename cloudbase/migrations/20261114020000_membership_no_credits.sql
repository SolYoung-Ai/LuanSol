-- 会员不含积分包（2026-11-14）
-- 事故：会员码兑换后 quota_total=3000（截图 2964 = 3000 - 已用 36），
--       Creem 会员回调 lunasol_pay_apply 也写 600，都违背 plans.ts 的口径。
-- 口径：会员开通/续费只改 plan/status/period_*；积分只来自签到/积分码/积分包，
--       一律落 bonus_credits，绝不碰 quota_total / quota_used。

-- 1) 兑换码：会员码只顺延有效期
CREATE OR REPLACE FUNCTION public.lunasol_redeem_code(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid     text := auth.uid();
  v_code    text := upper(btrim(coalesce(p_code, '')));
  v_points  integer := 0;
  v_plan    text := 'points';
  v_months  integer := 0;
  v_days    integer := 0;
  v_end     timestamptz;
  v_balance integer;
  v_msg     text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', '请先登录再兑换');
  END IF;
  IF v_code = '' THEN
    RETURN jsonb_build_object('ok', false, 'message', '请输入兑换码');
  END IF;

  UPDATE public.lunasol_redeem_codes
     SET used = true, used_by = v_uid
   WHERE code = v_code AND used = false
  RETURNING points, COALESCE(plan, 'points'), COALESCE(months, 0), COALESCE(days, 0)
       INTO v_points, v_plan, v_months, v_days;

  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM public.lunasol_redeem_codes WHERE code = v_code) THEN
      RETURN jsonb_build_object('ok', false, 'message', '该兑换码已被使用');
    END IF;
    RETURN jsonb_build_object('ok', false, 'message', '兑换码无效，检查后重试');
  END IF;

  IF v_plan = 'pro_monthly' THEN
    IF v_days < 0 THEN v_days := 0; END IF;
    IF v_months <= 0 AND v_days <= 0 THEN v_months := 1; END IF;

    -- 新行只给所有用户都有的新注册额度 100；已有行完全不动额度字段
    INSERT INTO public.lunasol_subscriptions AS s
      (id, owner_id, plan, status, quota_total, quota_used, bonus_credits,
       period_start, period_end, activated_by)
    VALUES
      (v_uid, v_uid, 'pro_monthly', 'active', 100, 0, 0, now(),
       now() + make_interval(months => v_months, days => v_days), 'redeem-code')
    ON CONFLICT (id) DO UPDATE
      SET plan         = 'pro_monthly',
          status       = 'active',
          period_start = CASE WHEN s.period_end IS NOT NULL AND s.period_end > now()
                              THEN COALESCE(s.period_start, now()) ELSE now() END,
          period_end   = GREATEST(COALESCE(s.period_end, now()), now())
                         + make_interval(months => v_months, days => v_days),
          activated_by = 'redeem-code',
          updated_at   = now()
    RETURNING period_end INTO v_end;

    v_msg := CASE WHEN v_months > 0
                  THEN '兑换成功！会员已开通 ' || v_months || ' 个月'
                  ELSE '兑换成功！会员已开通 ' || v_days || ' 天' END;
    RETURN jsonb_build_object('ok', true, 'kind', 'membership', 'points', 0,
                              'months', v_months, 'days', v_days,
                              'period_end', v_end, 'message', v_msg);
  END IF;

  IF v_points <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'message', '兑换码额度异常，请联系管理员');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.lunasol_subscriptions WHERE id = v_uid) THEN
    INSERT INTO public.lunasol_subscriptions (id, owner_id, plan, status, quota_total, quota_used, bonus_credits)
    VALUES (v_uid, v_uid, 'free', 'none', 100, 0, 0)
    ON CONFLICT (id) DO NOTHING;
  END IF;

  UPDATE public.lunasol_subscriptions
     SET bonus_credits = COALESCE(bonus_credits, 0) + v_points,
         updated_at = now()
   WHERE id = v_uid AND owner_id = v_uid;

  SELECT GREATEST(0, quota_total - quota_used) + COALESCE(bonus_credits, 0)
    INTO v_balance
    FROM public.lunasol_subscriptions
   WHERE id = v_uid;

  INSERT INTO public.lunasol_credit_logs (owner_id, change_type, amount, balance_after, reason, task_type)
  VALUES (v_uid, 'redeem', v_points, COALESCE(v_balance, v_points),
          '兑换码 ' || v_code, 'redeem');

  RETURN jsonb_build_object('ok', true, 'kind', 'points', 'points', v_points,
                            'message', '兑换成功！+' || v_points || ' 积分');
END;
$function$;

-- 2) Creem 会员回调：同样只改有效期（幂等仍用显式 EXISTS，event_id 是部分唯一索引）
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
      (id, owner_id, plan, status, quota_total, quota_used, bonus_credits,
       period_start, period_end, activated_by, updated_at)
    VALUES
      (p_owner_id, p_owner_id, 'pro_monthly', 'active', 100, 0, 0,
       now(), v_end, 'payment', now())
    ON CONFLICT (id) DO UPDATE SET
      plan         = 'pro_monthly',
      status       = 'active',
      -- 不写 quota_total、不重置 quota_used、不动 bonus_credits
      period_start = coalesce(public.lunasol_subscriptions.period_start, now()),
      period_end   = GREATEST(coalesce(public.lunasol_subscriptions.period_end, now()), v_end),
      activated_by = 'payment',
      updated_at   = now();
  ELSE
    UPDATE public.lunasol_subscriptions
       SET period_end = LEAST(coalesce(period_end, now()), coalesce(p_period_end, now())),
           updated_at = now()
     WHERE id = p_owner_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'kind', p_kind, 'period_end', v_end);
END;
$$;

GRANT EXECUTE ON FUNCTION public.lunasol_redeem_code(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.lunasol_pay_apply(text, text, text, text, text, timestamptz, integer, text, text, text, jsonb) TO PUBLIC;
