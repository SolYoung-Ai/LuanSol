-- ============================================================
-- 2026-11-25 补丁 B：退款必须带服务端口令
-- ------------------------------------------------------------
-- 背景（安全审计 P0-3）：lunasol_ai_job_refund 只判断「任务是否 charged」，
-- 既不校验调用方身份以外的任何东西，也对 anon 开放。于是用户可以先出图、
-- 拿到图片后再直接 RPC 退款，等于免费出图，且可以反复做。
--
-- 修法：多一个 p_secret 参数，函数开头比对 sha256 与 lunasol_pay_secrets
-- 里已有的 creem 行（= 云函数环境变量 PAY_APPLY_SECRET 的哈希，与支付落库
-- 用的同一把钥匙，不需要新增环境变量）。用户手里只有自己的 access token，
-- 没有这把钥匙 → 退款接口对他彻底关闭。
--
-- 注意：这与云函数必须在同一个窗口上线。旧云函数不传 p_secret，
-- 本迁移执行后它的退款会全部返回 forbidden（任务会停在 charged）。
--
-- 可回放：重复执行安全。
-- ============================================================

begin;

-- 旧的两参数签名必须先删掉：带默认值的三参数新签名存在时，
-- 两参数调用会落到旧函数上，等于没有加固。
drop function if exists public.lunasol_ai_job_refund(text, text);

create or replace function public.lunasol_ai_job_refund(
  p_job text,
  p_reason text default 'AI 任务失败',
  p_secret text default ''
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid     text := auth.uid();
  v_job     text := btrim(coalesce(p_job, ''));
  v_hash    text;
  v_expect  text;
  v_status  text;
  v_base    integer;
  v_bonus   integer;
  v_total   integer;
  v_used    integer;
  v_bonus_c integer;
  v_balance integer;
begin
  -- 只有云函数知道这把钥匙。放在 auth.uid() 检查之前：
  -- 没有钥匙的人连「这个 job 是否存在」都不该知道。
  v_hash := encode(sha256(convert_to(coalesce(p_secret, ''), 'UTF8')), 'hex');
  select secret_sha256 into v_expect from public.lunasol_pay_secrets where name = 'creem';
  if v_expect is null or v_hash <> v_expect then
    return jsonb_build_object('ok', false, 'code', 'forbidden', 'message', '无权调用退款');
  end if;

  if v_uid is null or v_uid = '' then
    return jsonb_build_object('ok', false, 'code', 'unauthenticated');
  end if;

  select status, from_base, from_bonus into v_status, v_base, v_bonus
    from public.lunasol_ai_jobs
   where owner_id = v_uid and job_key = v_job
   for update;

  if v_status is null then
    return jsonb_build_object('ok', false, 'code', 'no_job', 'message', '找不到任务');
  end if;
  if v_status <> 'charged' then
    select quota_total, quota_used, coalesce(bonus_credits, 0)
      into v_total, v_used, v_bonus_c
      from public.lunasol_subscriptions where id = v_uid;
    return jsonb_build_object('ok', true, 'replay', true,
      'balance', greatest(0, v_total - v_used) + v_bonus_c);
  end if;

  update public.lunasol_subscriptions
     set quota_used = greatest(0, quota_used - v_base),
         bonus_credits = coalesce(bonus_credits, 0) + v_bonus,
         updated_at = now()
   where id = v_uid and owner_id = v_uid;

  update public.lunasol_ai_jobs
     set status = 'refunded', updated_at = now()
   where owner_id = v_uid and job_key = v_job;

  select greatest(0, quota_total - quota_used) + coalesce(bonus_credits, 0)
    into v_balance from public.lunasol_subscriptions where id = v_uid;

  insert into public.lunasol_credit_logs (owner_id, change_type, amount, balance_after, reason, task_type)
  values (v_uid, 'refund', v_base + v_bonus, v_balance,
          left(coalesce(nullif(p_reason, ''), 'AI 任务失败'), 80), 'refund');

  return jsonb_build_object('ok', true, 'replay', false, 'refunded', v_base + v_bonus, 'balance', v_balance);
end;
$function$;

-- 默认新建函数对 PUBLIC 开放执行权，必须显式收回；
-- authenticated 保留（云函数是带用户 token 调用的），真正的门是上面那把钥匙。
revoke all on function public.lunasol_ai_job_refund(text, text, text) from public;
revoke execute on function public.lunasol_ai_job_refund(text, text, text) from anon;
grant execute on function public.lunasol_ai_job_refund(text, text, text) to authenticated;

commit;

-- 执行后自检（应分别返回：1 个三参数版本 / anon=false / 库里有 1 行 secret）：
--   select pg_get_function_identity_arguments(oid) from pg_proc where proname='lunasol_ai_job_refund';
--   select has_function_privilege('anon','public.lunasol_ai_job_refund(text,text,text)','execute');
--   select count(*) from public.lunasol_pay_secrets;
