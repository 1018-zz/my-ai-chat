-- 每日健康摘要 + 手机状态（小米手环 → Health Connect + 手机系统 → 极简安卓桥 → /api/health/sync）
-- 隐私优先级高于位置数据：仅 service_role 可读写，anon 不可读（不加公开读策略）。
-- 2026-08-24 扩展：合二为一，把 LoverConnect 那些字段（电量/屏幕时间/App时间线/天气）也收进来，
--          共用一条上报通道 + 一张表 + get_health 工具。
-- 运行：Supabase 后台 → SQL Editor 粘贴执行（可重复执行，ALTER 用 IF NOT EXISTS）。

create table if not exists public.health_data (
  id             uuid primary key default gen_random_uuid(),
  user_id        int  not null default 1,
  date           date not null,
  sleep_minutes  int,
  sleep_deep_min int,
  sleep_light_min int,
  sleep_rem_min  int,
  sleep_start    timestamptz,
  sleep_end      timestamptz,
  steps          int,
  resting_hr     int,
  avg_hr         int,
  synced_at      timestamptz not null default now(),
  unique (user_id, date)
);

-- 2026-08-24 扩展字段（手机状态，原 LoverConnect）
alter table public.health_data add column if not exists battery_level int;
alter table public.health_data add column if not exists battery_charging boolean;
alter table public.health_data add column if not exists screen_minutes int;
alter table public.health_data add column if not exists top_apps jsonb;
alter table public.health_data add column if not exists current_weather jsonb;

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
