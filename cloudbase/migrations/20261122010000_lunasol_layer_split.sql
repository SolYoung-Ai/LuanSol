-- ============================================================
-- 阶段三：AI 拆图任务计费 + 图层素材持久化
-- ------------------------------------------------------------
-- 设计要点：
--   · 扣费只认 cloud function 转发的用户 access token（auth.uid），
--     浏览器不能传任意 uid / 任意 cost 来扣别人的分；
--   · 同一 (owner_id, job_key) 只扣一次，重复点击/重试返回原结果；
--   · 失败/取消由云函数调用 refund，把 base 额度与奖励积分原路退回；
--   · 拆图图层不进项目 JSON：每张 PNG 单独一行，项目里只留 assetId/短链。
-- ============================================================

-- 1) 任务表：幂等键 + 预扣记录 + 退款依据
CREATE TABLE IF NOT EXISTS public.lunasol_ai_jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      text NOT NULL,
  job_key       text NOT NULL,
  kind          text NOT NULL DEFAULT 'layer_split',
  cost          integer NOT NULL CHECK (cost > 0),
  status        text NOT NULL DEFAULT 'charged'
                CHECK (status IN ('charged', 'refunded', 'failed')),
  from_base     integer NOT NULL DEFAULT 0,
  from_bonus    integer NOT NULL DEFAULT 0,
  balance_after integer,
  provider      text,
  model         text,
  meta          jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, job_key)
);

CREATE INDEX IF NOT EXISTS lunasol_ai_jobs_owner_idx
  ON public.lunasol_ai_jobs (owner_id, created_at DESC);

GRANT SELECT ON public.lunasol_ai_jobs TO authenticated;
ALTER TABLE public.lunasol_ai_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Jobs visible to owner" ON public.lunasol_ai_jobs
  FOR SELECT TO authenticated USING (owner_id = auth.uid());

-- 2) 资产表：一张 PNG 一行，不把几十张 base64 塞进项目 payload
CREATE TABLE IF NOT EXISTS public.lunasol_assets (
  id          text PRIMARY KEY,
  owner_id    text NOT NULL,
  project_id  text,
  name        text NOT NULL DEFAULT '图层',
  mime        text NOT NULL DEFAULT 'image/png',
  width       integer,
  height      integer,
  bytes       integer,
  source      text NOT NULL DEFAULT 'seedream-5.5-layer-split',
  layer_name  text,
  data_url    text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lunasol_assets_owner_idx
  ON public.lunasol_assets (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS lunasol_assets_project_idx
  ON public.lunasol_assets (project_id);

GRANT SELECT, INSERT ON public.lunasol_assets TO authenticated;
ALTER TABLE public.lunasol_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Assets visible to owner" ON public.lunasol_assets
  FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Assets insert by owner" ON public.lunasol_assets
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());

-- 3) 原子预扣：只认 auth.uid()，同一 job 幂等
CREATE OR REPLACE FUNCTION public.lunasol_ai_job_charge(
  p_job text,
  p_kind text,
  p_cost integer,
  p_provider text DEFAULT '',
  p_model text DEFAULT '',
  p_meta jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid        text := auth.uid();
  v_job        text := btrim(coalesce(p_job, ''));
  v_kind       text := coalesce(nullif(btrim(coalesce(p_kind, '')), ''), 'layer_split');
  v_cost       integer := GREATEST(1, LEAST(100000, coalesce(p_cost, 0)));
  v_total      integer;
  v_used       integer;
  v_bonus      integer;
  v_base_left  integer;
  v_from_base  integer;
  v_need       integer;
  v_from_bonus integer;
  v_balance    integer;
  v_id         uuid;
  v_status     text;
  v_stored     integer;
  v_stored_bal integer;
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
    SELECT status, cost, balance_after
      INTO v_status, v_stored, v_stored_bal
      FROM public.lunasol_ai_jobs
     WHERE owner_id = v_uid AND job_key = v_job;
    IF v_status = 'charged' THEN
      RETURN jsonb_build_object('ok', true, 'replay', true, 'cost', v_stored, 'balance', coalesce(v_stored_bal, 0));
    END IF;
    RETURN jsonb_build_object('ok', false, 'code', 'job_' || coalesce(v_status, 'unknown'), 'message', '这个任务已结束，请重新发起');
  END IF;

  SELECT quota_total, quota_used, COALESCE(bonus_credits, 0)
    INTO v_total, v_used, v_bonus
    FROM public.lunasol_subscriptions
   WHERE id = v_uid AND owner_id = v_uid
   FOR UPDATE;

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
    RETURN jsonb_build_object(
      'ok', false, 'code', 'insufficient', 'cost', v_cost,
      'balance', v_base_left + v_bonus,
      'message', '积分不足：本次需要 ' || v_cost || '，当前 ' || (v_base_left + v_bonus)
    );
  END IF;

  UPDATE public.lunasol_subscriptions
     SET quota_used = v_used + v_from_base,
         bonus_credits = v_bonus - v_from_bonus,
         updated_at = now()
   WHERE id = v_uid AND owner_id = v_uid;

  v_balance := GREATEST(0, v_total - (v_used + v_from_base)) + (v_bonus - v_from_bonus);

  UPDATE public.lunasol_ai_jobs
     SET from_base = v_from_base, from_bonus = v_from_bonus,
         balance_after = v_balance, updated_at = now()
   WHERE id = v_id;

  INSERT INTO public.lunasol_credit_logs (owner_id, change_type, amount, balance_after, reason, task_type)
  VALUES (v_uid, 'consume', -v_cost, v_balance,
          CASE WHEN v_kind = 'layer_split' THEN 'Seedream 5.5 图层拆分' ELSE 'Seedream 5.5 生成' END,
          v_kind);

  RETURN jsonb_build_object('ok', true, 'replay', false, 'cost', v_cost, 'balance', v_balance);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.lunasol_ai_job_charge(text, text, integer, text, text, jsonb) TO authenticated;

-- 4) 退款：失败 / 用户取消 / 服务端异常，原路退回且只退一次
CREATE OR REPLACE FUNCTION public.lunasol_ai_job_refund(
  p_job text,
  p_reason text DEFAULT 'AI 任务失败'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid     text := auth.uid();
  v_job     text := btrim(coalesce(p_job, ''));
  v_status  text;
  v_base    integer;
  v_bonus   integer;
  v_total   integer;
  v_used    integer;
  v_bonus_c integer;
  v_balance integer;
BEGIN
  IF v_uid IS NULL OR v_uid = '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'unauthenticated');
  END IF;

  SELECT status, from_base, from_bonus INTO v_status, v_base, v_bonus
    FROM public.lunasol_ai_jobs
   WHERE owner_id = v_uid AND job_key = v_job
   FOR UPDATE;

  IF v_status IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'no_job', 'message', '找不到任务');
  END IF;
  IF v_status <> 'charged' THEN
    SELECT quota_total, quota_used, COALESCE(bonus_credits, 0)
      INTO v_total, v_used, v_bonus_c
      FROM public.lunasol_subscriptions WHERE id = v_uid;
    RETURN jsonb_build_object('ok', true, 'replay', true,
      'balance', GREATEST(0, v_total - v_used) + v_bonus_c);
  END IF;

  UPDATE public.lunasol_subscriptions
     SET quota_used = GREATEST(0, quota_used - v_base),
         bonus_credits = COALESCE(bonus_credits, 0) + v_bonus,
         updated_at = now()
   WHERE id = v_uid AND owner_id = v_uid;

  UPDATE public.lunasol_ai_jobs
     SET status = 'refunded', updated_at = now()
   WHERE owner_id = v_uid AND job_key = v_job;

  SELECT GREATEST(0, quota_total - quota_used) + COALESCE(bonus_credits, 0)
    INTO v_balance FROM public.lunasol_subscriptions WHERE id = v_uid;

  INSERT INTO public.lunasol_credit_logs (owner_id, change_type, amount, balance_after, reason, task_type)
  VALUES (v_uid, 'refund', v_base + v_bonus, v_balance,
          left(coalesce(nullif(p_reason, ''), 'AI 任务失败'), 80), 'refund');

  RETURN jsonb_build_object('ok', true, 'replay', false, 'refunded', v_base + v_bonus, 'balance', v_balance);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.lunasol_ai_job_refund(text, text) TO authenticated;

-- 5) 资产写入：只允许写到自己名下；同一个 asset id 重试覆盖同一行
CREATE OR REPLACE FUNCTION public.lunasol_asset_put(
  p_id text,
  p_name text,
  p_mime text,
  p_width integer,
  p_height integer,
  p_bytes integer,
  p_source text,
  p_layer_name text,
  p_project_id text,
  p_data_url text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid text := auth.uid();
BEGIN
  IF v_uid IS NULL OR v_uid = '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'unauthenticated');
  END IF;
  IF coalesce(p_id, '') = '' OR coalesce(p_data_url, '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'bad_asset');
  END IF;

  INSERT INTO public.lunasol_assets (
    id, owner_id, project_id, name, mime, width, height, bytes, source, layer_name, data_url
  ) VALUES (
    p_id, v_uid, nullif(p_project_id, ''), coalesce(nullif(p_name, ''), '图层'),
    coalesce(nullif(p_mime, ''), 'image/png'), p_width, p_height, p_bytes,
    coalesce(nullif(p_source, ''), 'seedream-5.5-layer-split'), p_layer_name, p_data_url
  )
  ON CONFLICT (id) DO UPDATE
    SET name = EXCLUDED.name, mime = EXCLUDED.mime, width = EXCLUDED.width,
        height = EXCLUDED.height, bytes = EXCLUDED.bytes, layer_name = EXCLUDED.layer_name,
        project_id = EXCLUDED.project_id, data_url = EXCLUDED.data_url
    WHERE public.lunasol_assets.owner_id = v_uid;

  RETURN jsonb_build_object('ok', true, 'id', p_id);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.lunasol_asset_put(text, text, text, integer, integer, integer, text, text, text, text) TO authenticated;

-- 6) 资产读取：给 <image> 用的能力 URL。id 是随机 UUID，不可枚举；
--    这里不校验登录，因为浏览器 <image> 不能带自定义头。
CREATE OR REPLACE FUNCTION public.lunasol_asset_get(p_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  a public.lunasol_assets%ROWTYPE;
BEGIN
  SELECT * INTO a FROM public.lunasol_assets WHERE id = p_id LIMIT 1;
  IF a.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;
  RETURN jsonb_build_object(
    'ok', true, 'id', a.id, 'name', a.name, 'mime', a.mime,
    'width', a.width, 'height', a.height, 'bytes', a.bytes,
    'layer_name', a.layer_name, 'data_url', a.data_url, 'created_at', a.created_at
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.lunasol_asset_get(text) TO anon, authenticated;
