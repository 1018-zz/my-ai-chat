-- 每日健康摘要（小米手环 → Health Connect → 极简安卓桥 → /api/health/sync）
-- 隐私优先级高于位置数据：仅 service_role 可读写，anon 不可读（不加公开读策略）。
-- 运行：Supabase 后台 → SQL Editor 粘贴执行。

create table if not exists public.health_data (
  id             uuid primary key default gen_random_uuid(),
  user_id        int  not null default 1,            -- 单机单用户，固定 1（与 user_location 同思路）
  date           date not null,                      -- 「起床日」归属：跨午夜的睡眠归醒来那天
  sleep_minutes  int,                                -- 总睡眠分钟
  sleep_deep_min int,                                -- 深睡分钟
  sleep_light_min int,                               -- 浅睡分钟
  sleep_rem_min  int,                                -- REM 分钟
  sleep_start    timestamptz,                        -- 入睡时刻（本机时区存 UTC）
  sleep_end      timestamptz,                        -- 醒来时刻
  steps          int,                                -- 当日步数
  resting_hr     int,                                -- 静息心率
  avg_hr         int,                                -- 平均心率
  synced_at      timestamptz not null default now(),
  unique (user_id, date)
);

-- 按日期取最新
create index if not exists health_data_user_date_idx on public.health_data (user_id, date desc);

-- RLS 开启：无 anon 策略 → 匿名不可读写；functions 用 service_role 调用天然绕过 RLS。
alter table public.health_data enable row level security;

-- 显式声明 service_role 可读写（意图清晰；即便绕过 RLS 也写上）
drop policy if exists "health_data service role" on public.health_data;
create policy "health_data service role" on public.health_data
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
