-- LunaSol 用户对话云同步表（CloudBase PG / 国内站）
-- 每个用户只能读写自己的对话：RLS 用 auth.uid()（text）比对 owner_id varchar(64)。
-- payload 存完整对话（消息、思考过程、生图档位），换设备/浏览器登录后完整可见。
CREATE TABLE IF NOT EXISTS public.lunasol_chat_conversations (
  id          text PRIMARY KEY,
  owner_id    varchar(64) NOT NULL,
  title       text NOT NULL DEFAULT '',
  payload     jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lunasol_chat_conversations TO authenticated;

ALTER TABLE public.lunasol_chat_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY lunasol_chat_select_owner ON public.lunasol_chat_conversations
  FOR SELECT TO authenticated USING (owner_id = auth.uid());

CREATE POLICY lunasol_chat_insert_owner ON public.lunasol_chat_conversations
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());

CREATE POLICY lunasol_chat_update_owner ON public.lunasol_chat_conversations
  FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE POLICY lunasol_chat_delete_owner ON public.lunasol_chat_conversations
  FOR DELETE TO authenticated USING (owner_id = auth.uid());

CREATE INDEX IF NOT EXISTS lunasol_chat_owner_updated_idx
  ON public.lunasol_chat_conversations (owner_id, updated_at DESC);
