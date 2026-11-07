-- 修复 lunasol_consume_quota：旧版本只累加 quota_used，且被 LEAST(quota_total,...) 封顶，
-- 完全不处理 bonus_credits。结果是：当用户基础额度用完、只剩签到/兑换得到的奖励积分时，
-- 一次高额（如 Pro 生图 15 分）调用只会把 quota_used 顶到 quota_total，奖励积分一分不扣，
-- 用户可以用奖励积分无限白嫖。
--
-- 新逻辑：先扣基础额度（quota_total - quota_used），不够的部分再扣 bonus_credits，
-- 行级加 FOR UPDATE 锁避免并发互相覆盖；返回扣减后的「总剩余」，与前端
-- (quota_total - quota_used) + bonus_credits 的口径一致，作为积分明细的 balance_after。
CREATE OR REPLACE FUNCTION public.lunasol_consume_quota(p_uid text, p_n integer DEFAULT 1)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_total      integer;
  v_used       integer;
  v_bonus      integer;
  v_base_left  integer;
  v_from_base  integer;
  v_need       integer;
  v_from_bonus integer;
  v_remaining  integer;
BEGIN
  SELECT quota_total, quota_used, COALESCE(bonus_credits, 0)
    INTO v_total, v_used, v_bonus
    FROM public.lunasol_subscriptions
   WHERE id = p_uid AND owner_id = auth.uid()
   FOR UPDATE;

  IF v_total IS NULL THEN
    RETURN -1;   -- 没有可读行（未登录 / 不是本人 / 订阅行不存在）
  END IF;

  v_base_left := GREATEST(0, v_total - v_used);
  v_from_base := LEAST(v_base_left, GREATEST(p_n, 0));
  v_need      := GREATEST(p_n, 0) - v_from_base;
  v_from_bonus := LEAST(v_bonus, v_need);

  UPDATE public.lunasol_subscriptions
     SET quota_used    = v_used + v_from_base,
         bonus_credits = v_bonus - v_from_bonus,
         updated_at    = now()
   WHERE id = p_uid AND owner_id = auth.uid();

  v_remaining := GREATEST(0, v_total - (v_used + v_from_base))
               + (v_bonus - v_from_bonus);
  RETURN v_remaining;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.lunasol_consume_quota(text, integer) TO authenticated;
