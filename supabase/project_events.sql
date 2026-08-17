-- 家园事件表（Home Events）
-- 记录「小家什么时候长大了一点」，与 memories（人生事实）彻底分开。
-- 用途：git push / 手动改动后写入一条事件，breath 醒来时扫 status=pending，
--       钟泽自己决定提不提，提过一次标 seen，防复读。

create table if not exists public.project_events (
  id          bigint generated always as identity primary key,
  type        text not null default 'project_update',  -- project_update / fix / feature / deploy / manual
  title       text not null,                            -- 一句话标题，如「小家新增了日记纸张系统」
  summary     text,                                     -- 改动说明（可多行）
  source      text not null default 'manual',           -- git / manual
  status      text not null default 'pending',          -- pending（待感知）/ seen（已提及）
  created_at  timestamptz not null default now()
);

-- 索引：breath 按时间倒序扫 pending
create index if not exists project_events_status_created_idx
  on public.project_events (status, created_at desc);

-- 与现有表一致：服务端用 service_role 访问，不启用 RLS
-- （如需浏览器匿名只读，可后续加 policy）
