-- 「已删除项目」墓碑表（CloudBase PG）
-- ------------------------------------------------------------
-- 解决的真实问题：用户删掉一个草稿，刷新或换设备登录后它又回来了。
-- 原因不是删除失败，而是「删除」只发生在本地 + 一条 DELETE 请求：
--   1) DELETE 偶尔失败（网络 / 网关抖动）→ 云端行还在 → 下次同步原样拉回来；
--   2) 另一台设备本地还留着副本 → 它同步时发现「云端没有、本地有」→ 又上传回去。
-- 只要没有「这个 id 已经被人删掉过」的记录，任何一端都能把死数据复活。
--
-- 这张表就是那条记录：一行 = 某账号删掉了某个 project_id。
--   同步时：云端拉下来的项目若命中墓碑 → 不合并，并顺手清掉云端残行；
--   上传时：命中墓碑的本机项目永不上传；
--   合并后：命中墓碑的本机副本直接丢弃（其他设备也跟着消失）。
-- 墓碑永久保留：project_id 是随机生成的（proj_xxx），不会复用，
-- 所以「同一个 id 再次出现」只可能是复活，必须继续压制。
CREATE TABLE IF NOT EXISTS public.lunasol_deleted_projects (
  owner_id   text        NOT NULL,
  project_id text        NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, project_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lunasol_deleted_projects TO authenticated;

ALTER TABLE public.lunasol_deleted_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY lunasol_deleted_select_owner ON public.lunasol_deleted_projects
  FOR SELECT TO authenticated USING (owner_id = auth.uid());

CREATE POLICY lunasol_deleted_insert_owner ON public.lunasol_deleted_projects
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());

CREATE POLICY lunasol_deleted_update_owner ON public.lunasol_deleted_projects
  FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE POLICY lunasol_deleted_delete_owner ON public.lunasol_deleted_projects
  FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- 同步时按账号一次取全部墓碑，按时间倒序便于以后做「只保留最近 N 条」的清理
CREATE INDEX IF NOT EXISTS lunasol_deleted_projects_owner_idx
  ON public.lunasol_deleted_projects (owner_id, deleted_at DESC);
