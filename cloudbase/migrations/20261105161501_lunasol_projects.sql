-- LunaSol 用户项目云同步表（CloudBase PG / 国内站）
-- 每个用户只能读写自己的行：RLS 用 auth.uid()（text）比对 owner_id varchar(64)。
CREATE TABLE IF NOT EXISTS public.lunasol_projects (
  id          text PRIMARY KEY,
  owner_id    varchar(64) NOT NULL,
  title       text NOT NULL DEFAULT '',
  payload     jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lunasol_projects TO authenticated;

ALTER TABLE public.lunasol_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY lunasol_projects_select_owner ON public.lunasol_projects
  FOR SELECT TO authenticated USING (owner_id = auth.uid());

CREATE POLICY lunasol_projects_insert_owner ON public.lunasol_projects
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());

CREATE POLICY lunasol_projects_update_owner ON public.lunasol_projects
  FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE POLICY lunasol_projects_delete_owner ON public.lunasol_projects
  FOR DELETE TO authenticated USING (owner_id = auth.uid());

CREATE INDEX IF NOT EXISTS lunasol_projects_owner_updated_idx
  ON public.lunasol_projects (owner_id, updated_at DESC);
