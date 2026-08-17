-- 会话软删（回收站）
-- 给 conversations 表加 deleted_at：删除只在表里打标记，不真删行，
-- 消息一行不动，因此不影响按时间周期的记忆压缩（压缩读 messages 表全局聚合）。
-- 真正要清空（连同消息从数据库移除）才走 purge。

alter table if exists public.conversations
  add column if not exists deleted_at timestamptz;

-- 索引：回收站按时间倒序扫未清空项
create index if not exists conversations_deleted_at_idx
  on public.conversations (deleted_at);

-- 服务端用 service_role 访问，不启用 RLS（与现有表一致）
