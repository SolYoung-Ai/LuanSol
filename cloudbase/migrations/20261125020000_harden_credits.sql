-- ============================================================
-- 2026-11-25 积分账本加固
-- ------------------------------------------------------------
-- 背景（安全审计发现）：积分余额存在 lunasol_subscriptions.bonus_credits，
-- 而这张表的 RLS 只校验 owner_id，不校验金额 → 任何登录用户都能：
--   1) 直接 insert 一行 bonus_credits = 999999，白拿积分；
--   2) 先 delete 自己的行，再 insert 一行默认免费行，把已花掉的额度清零；
--   3) 用 1 积分为某个 job_key 预占号，再拿同一个 jobId 请求生图接口，
--      服务端的 charge 命中 replay 分支直接放行 → 24 分的图只花 1 分。
--
-- 本迁移只做三件最小改动，不动业务语义：
--   A. 订阅行只能由用户自己创建「默认免费行」（额度上限 = 100、bonus 必须为 0）；
--   B. 删掉用户删除订阅行的策略（代码里没有任何地方删这张表，删掉即清零＝刷额度）；
--   C. lunasol_ai_job_charge 的 replay 分支必须校验费用一致。
--
-- 可回放：重复执行安全（drop ... if exists / create or replace）。
-- ============================================================

begin;

-- A. 用户自建订阅行：只允许默认免费行
drop policy if exists lunasol_subscriptions_insert_owner on public.lunasol_subscriptions;
create policy lunasol_subscriptions_insert_owner
  on public.lunasol_subscriptions
  for insert
  to authenticated
  with check (
    (owner_id)::text = auth.uid()
    and plan = 'free'
    and status = 'none'
    and quota_total between 0 and 100
    and quota_used = 0
    and coalesce(bonus_credits, 0) = 0
    and activated_by is null
  );

-- B. 订阅行不允许用户删除（删除即把已用额度清零，等于无限刷新手额度）
drop policy if exists lunasol_subscriptions_delete_owner on public.lunasol_subscriptions;

-- C. 计费幂等键必须与本次费用一致，堵住「先用 1 分占号，再让服务端按 replay 放行」
create or replace function public.lunasol_ai_job_charge(
  p_job text,
  p_kind text,
  p_cost integer,
  p_provider text default '',
  p_model text default '',
  p_meta jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_uid text := auth.uid();
  v_job text := btrim(coalesce(p_job, ''));
  v_kind text := coalesce(nullif(btrim(coalesce(p_kind, '')), ''), 'layer_split');
  v_cost integer := GREATEST(1, LEAST(100000, coalesce(p_cost, 0)));
  v_total integer; v_used integer; v_bonus integer; v_base_left integer;
  v_from_base integer; v_need integer; v_from_bonus integer; v_balance integer;
  v_id uuid; v_status text; v_stored integer; v_stored_bal integer;
BEGIN
  IF v_uid IS NULL OR v_uid = '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'unauthenticated', 'message', '登录状态无效');
  END IF;
  IF v_job = '' OR length(v_job) > 96 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'bad_job', 'message', '任务号不合法');
  END IF;

  INSERT INTO public.lunasol_ai_jobs (owner_id, job_key, kind, cost, status, provider, model, meta)
  VALUES (v_uid, v_job, v_kind, v_cost, 'charged', p_provider, p_model, coalesce(p_meta, '{}'::jsonb))
  ON CONFLICT (owner_id, job_key) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT status, cost, balance_after INTO v_status, v_stored, v_stored_bal
      FROM public.lunasol_ai_jobs WHERE owner_id = v_uid AND job_key = v_job;

    IF v_status = 'charged' THEN
      -- 同一个任务号只对「同一个价钱」重放；价钱对不上说明这一号被人先行占过，
      -- 直接拒绝，让客户端换一个 jobId 重新走一次正常计费。
      IF v_stored <> v_cost THEN
        RETURN jsonb_build_object('ok', false, 'code', 'job_cost_mismatch',
          'message', '任务号已被占用，请重新发起');
      END IF;
      RETURN jsonb_build_object('ok', true, 'replay', true, 'cost', v_stored, 'balance', coalesce(v_stored_bal, 0));
    END IF;

    RETURN jsonb_build_object('ok', false, 'code', 'job_' || coalesce(v_status, 'unknown'),
      'message', '这个任务已结束，请重新发起');
  END IF;

  SELECT quota_total, quota_used, COALESCE(bonus_credits, 0) INTO v_total, v_used, v_bonus
    FROM public.lunasol_subscriptions WHERE id = v_uid AND owner_id = v_uid FOR UPDATE;

  IF v_total IS NULL THEN
    UPDATE public.lunasol_ai_jobs SET status = 'failed', updated_at = now() WHERE id = v_id;
    RETURN jsonb_build_object('ok', false, 'code', 'no_account', 'message', '找不到积分账户');
  END IF;

  v_base_left := GREATEST(0, v_total - v_used);
  v_from_base := LEAST(v_base_left, v_cost);
  v_need := v_cost - v_from_base;
  v_from_bonus := LEAST(v_bonus, v_need);

  IF v_from_base + v_from_bonus < v_cost THEN
    UPDATE public.lunasol_ai_jobs SET status = 'failed', updated_at = now() WHERE id = v_id;
    RETURN jsonb_build_object('ok', false, 'code', 'insufficient', 'cost', v_cost,
      'balance', v_base_left + v_bonus,
      'message', '积分不足：本次需要 ' || v_cost || '，当前 ' || (v_base_left + v_bonus));
  END IF;

  UPDATE public.lunasol_subscriptions
     SET quota_used = v_used + v_from_base,
         bonus_credits = v_bonus - v_from_bonus,
         updated_at = now()
   WHERE id = v_uid AND owner_id = v_uid;

  v_balance := GREATEST(0, v_total - (v_used + v_from_base)) + (v_bonus - v_from_bonus);

  UPDATE public.lunasol_ai_jobs
     SET from_base = v_from_base, from_bonus = v_from_bonus, balance_after = v_balance, updated_at = now()
   WHERE id = v_id;

  INSERT INTO public.lunasol_credit_logs (owner_id, change_type, amount, balance_after, reason, task_type)
  VALUES (v_uid, 'consume', -v_cost, v_balance,
    CASE WHEN v_kind = 'layer_split' THEN 'Seedream 5.5 图层拆分' ELSE 'Seedream 5.5 生成' END, v_kind);

  RETURN jsonb_build_object('ok', true, 'replay', false, 'cost', v_cost, 'balance', v_balance);
END;
$function$;

commit;
