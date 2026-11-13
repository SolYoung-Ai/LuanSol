-- ============================================================
-- 纯积分制（2026-11-14）
-- ------------------------------------------------------------
-- 全站不再有会员 / 订阅 / 有效期 / 续费。所有付款与兑换最终都只改 bonus_credits。
-- 兼容性重点：
--   1) 已发出的历史会员码仍然有效，但兑换时折算成积分（月卡 300/月、天卡 10/天），
--      不再写 plan / period_*，避免「老码白拿会员」；
--   2) Creem 后台可能还有未取消的旧订阅推续费事件，lunasol_pay_apply
--      必须继续能被调用且不报错，统一折算 350 积分，绝不改有效期；
--   3) 存量仍有效的会员一次性补 300 积分并写审计日志，然后把历史字段归一，
--      纯积分制下前端已完全不读 plan / status / period_*。
-- 表结构保持不动，历史数据可追溯。
-- ============================================================

-- ------------------------------------------------------------
-- 1) 兑换码：历史会员码 → 等值积分，积分码照旧
-- ------------------------------------------------------------
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
  v_balance integer;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', '请先登录再兑换');
  END IF;
  IF v_code = '' THEN
    RETURN jsonb_build_object('ok', false, 'message', '请输入兑换码');
  END IF;

  -- 原子占用：并发下同一张码只会被一个人拿到
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

  -- 历史会员码按原面值折算积分：¥28/月 ≈ 300 积分，天卡 10 积分/天。
  -- 纯积分制里没有任何权益时长，只能这样兑现，否则老用户手里的码会变成废纸。
  IF v_plan = 'pro_monthly' THEN
    v_months := GREATEST(0, v_months);
    v_days   := GREATEST(0, v_days);
    IF v_months = 0 AND v_days = 0 THEN v_months := 1; END IF;
    v_points := v_months * 300 + v_days * 10;
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
         updated_at    = now()
   WHERE id = v_uid AND owner_id = v_uid;

  SELECT GREATEST(0, quota_total - quota_used) + COALESCE(bonus_credits, 0)
    INTO v_balance
    FROM public.lunasol_subscriptions
   WHERE id = v_uid;

  INSERT INTO public.lunasol_credit_logs (owner_id, change_type, amount, balance_after, reason, task_type)
  VALUES (v_uid, 'redeem', v_points, COALESCE(v_balance, v_points), '兑换码 ' || v_code, 'redeem');

  RETURN jsonb_build_object('ok', true, 'kind', 'points', 'points', v_points,
                            'message', '兑换成功！+' || v_points || ' 积分');
END;
$function$;

-- ------------------------------------------------------------
-- 2) 会员付款回调：折算积分，绝不写有效期
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lunasol_pay_apply(
  p_secret text, p_owner_id text, p_event_id text, p_status text, p_kind text,
  p_period_end timestamp with time zone, p_amount integer, p_currency text,
  p_order_id text, p_subscription_id text, p_raw jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_hash    text;
  v_expect  text;
  v_balance integer;
  v_credits integer := 350;   -- 历史会员 $5/月折算，与积分包单价接近
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

  -- 幂等双保险：event_id 与同一 order_id 的正向发放记录都不能重复
  IF coalesce(p_event_id, '') <> '' AND EXISTS (
    SELECT 1 FROM public.lunasol_payments WHERE event_id = p_event_id
  ) THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true);
  END IF;

  IF p_kind = 'grant' AND coalesce(p_order_id, '') <> '' AND EXISTS (
    SELECT 1 FROM public.lunasol_payments
     WHERE provider = 'creem' AND order_id = p_order_id AND credits > 0
  ) THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true);
  END IF;

  -- 取消 / 过期 / 退款只留痕，不扣回积分：积分可能已被用掉，
  -- 扣回会产生负余额和一笔说不清的账，交由运营人工核对。
  IF p_kind = 'revoke' THEN
    INSERT INTO public.lunasol_payments
      (owner_id, provider, event_id, kind, status, amount, currency,
       order_id, subscription_id, period_end, credits, raw)
    VALUES
      (p_owner_id, 'creem', nullif(p_event_id, ''), 'revoke',
       CASE WHEN p_status IN ('paid', 'refunded', 'canceled', 'expired', 'failed') THEN p_status ELSE 'canceled' END,
       p_amount, p_currency, p_order_id, p_subscription_id, p_period_end, 0, p_raw);
    RETURN jsonb_build_object('ok', true, 'kind', 'revoke', 'credits', 0);
  END IF;

  INSERT INTO public.lunasol_payments
    (owner_id, provider, event_id, kind, status, amount, currency,
     order_id, subscription_id, period_end, credits, raw)
  VALUES
    (p_owner_id, 'creem', nullif(p_event_id, ''), 'grant', 'paid',
     p_amount, p_currency, p_order_id, p_subscription_id, p_period_end, v_credits, p_raw);

  INSERT INTO public.lunasol_subscriptions
    (id, owner_id, plan, status, quota_total, quota_used, bonus_credits, updated_at)
  VALUES
    (p_owner_id, p_owner_id, 'free', 'none', 100, 0, v_credits, now())
  ON CONFLICT (id) DO UPDATE SET
    bonus_credits = GREATEST(0, COALESCE(public.lunasol_subscriptions.bonus_credits, 0) + v_credits),
    updated_at    = now();

  SELECT GREATEST(0, quota_total - quota_used) + GREATEST(0, COALESCE(bonus_credits, 0))
    INTO v_balance
    FROM public.lunasol_subscriptions
   WHERE id = p_owner_id;

  INSERT INTO public.lunasol_credit_logs
    (owner_id, change_type, amount, balance_after, reason, task_type)
  VALUES
    (p_owner_id, 'recharge', v_credits, COALESCE(v_balance, 0),
     '历史会员订阅折算积分（纯积分制）', 'recharge');

  RETURN jsonb_build_object('ok', true, 'kind', 'grant', 'credits', v_credits, 'balance', v_balance);
END;
$function$;

-- ------------------------------------------------------------
-- 3) 存量会员：折算 300 积分 + 审计日志（幂等）
-- ------------------------------------------------------------
UPDATE public.lunasol_subscriptions s
   SET bonus_credits = COALESCE(s.bonus_credits, 0) + 300,
       updated_at    = now()
 WHERE s.plan = 'pro_monthly' AND s.status = 'active' AND s.period_end > now()
   AND NOT EXISTS (
     SELECT 1 FROM public.lunasol_credit_logs l
      WHERE l.owner_id = s.id
        AND l.reason = '口径切换：历史会员权益折算 300 积分（20261114030000）'
   );

INSERT INTO public.lunasol_credit_logs
  (owner_id, change_type, amount, balance_after, reason, task_type)
SELECT s.id, 'adjust', 300,
       GREATEST(0, s.quota_total - s.quota_used) + COALESCE(s.bonus_credits, 0),
       '口径切换：历史会员权益折算 300 积分（20261114030000）', 'admin'
  FROM public.lunasol_subscriptions s
 WHERE s.plan = 'pro_monthly' AND s.status = 'active' AND s.period_end > now()
   AND NOT EXISTS (
     SELECT 1 FROM public.lunasol_credit_logs l
      WHERE l.owner_id = s.id
        AND l.reason = '口径切换：历史会员权益折算 300 积分（20261114030000）'
   );

-- ------------------------------------------------------------
-- 4) 归一历史身份字段：代码已不再读取，留着只会误导后来人
-- ------------------------------------------------------------
UPDATE public.lunasol_subscriptions
   SET plan = 'free', status = 'none',
       period_start = NULL, period_end = NULL, activated_by = NULL,
       updated_at = now()
 WHERE plan <> 'free' OR status <> 'none' OR period_end IS NOT NULL OR period_start IS NOT NULL;

GRANT EXECUTE ON FUNCTION public.lunasol_redeem_code(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.lunasol_pay_apply(text, text, text, text, text, timestamp with time zone, integer, text, text, text, jsonb) TO anon, authenticated, service_role;
