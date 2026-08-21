-- 位置感知状态（GPS 心跳 + 高德逆地理/天气/POI，参考 AionsHome location.py 设计）
-- 单行 id=1（与 user_location 同思路）。仅 service_role 可读写，anon 不可读。
-- 运行：Supabase 后台 → SQL Editor 粘贴执行。

create table if not exists public.location_status (
  id                int primary key default 1,     -- 单机单用户，固定 1
  state             text,                          -- unknown / at_home / outside
  lng               double precision,              -- 最近一次心跳坐标（GCJ-02）
  lat               double precision,
  accuracy          double precision default 0,    -- 定位精度（米）
  address           text,                          -- 逆地理编码结构化地址
  adcode            text,                          -- 城市编码（高德天气用）
  city              text,                          -- 城市（拼音/英文，供 user_location 兜底）
  city_cn           text,                          -- 中文城市名
  weather           jsonb,                         -- { live: {...}, forecast: [...] }
  nearby_pois       jsonb,                         -- { "餐饮美食": [...], ... }
  distance_from_home double precision,             -- 离家距离（米）
  updated_at        timestamptz,                   -- 上次心跳
  state_changed_at  timestamptz,                   -- 上次状态变化
  last_api_lng      double precision,              -- 上次全量 API 参照点（三级研判用）
  last_api_lat      double precision,
  last_weather_at   timestamptz,                   -- 天气缓存过期判定
  home_lng          double precision,              -- 家的坐标（GCJ-02，set_home 写入）
  home_lat          double precision,
  home_threshold    int default 500,               -- 离家阈值（米）
  quiet_hours_enabled boolean default false,       -- 静默时段开关
  quiet_start       text default '00:00',
  quiet_end         text default '08:00'
);

-- RLS 开启：无 anon 策略 → 匿名不可读写；functions 用 service_role 调用天然绕过 RLS。
alter table public.location_status enable row level security;

drop policy if exists "location_status service role" on public.location_status;
create policy "location_status service role" on public.location_status
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
