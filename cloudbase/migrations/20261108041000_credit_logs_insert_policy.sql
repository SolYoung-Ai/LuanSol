-- 修复 lunasol_credit_logs 无法写入积分明细：该表 RLS 强制开启，却只有一条 SELECT 策略，
-- 没有 INSERT 策略。authenticated 用户虽然有表级 INSERT GRANT，但行级安全在缺少匹配
-- 策略时默认拒绝，导致 recordUsage 里的 writeLog 每次都被拦（错误被静默 catch），
-- 用户在积分明细页看不到任何消耗记录。
--
-- 补上一条 INSERT 策略：只允许写入 owner_id = auth.uid() 的本人记录。
DROP POLICY IF EXISTS "Users can insert own credit logs" ON public.lunasol_credit_logs;
CREATE POLICY "Users can insert own credit logs" ON public.lunasol_credit_logs
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id);
