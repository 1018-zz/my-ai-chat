-- 泠泠当前所在城市（位置感知的单一数据源）
-- 用途：天气 / 状态牌 / 钟泽感知层都从这里取「她现在在哪」，
--       不再写死 Zhenyuan。她旅行/搬家时，set_location 工具或设置页更新这一行即可。
-- 运行：Supabase 后台 → SQL Editor 粘贴执行

create table if not exists public.user_location (
  id        int primary key default 1,          -- 固定单行（id=1），UPSERT 覆盖即可
  city      text not null default 'Zhenyuan',   -- wttr.in 用：拼音/英文，如 Zhenyuan / Kunming / Shanghai
  city_cn   text default '镇沅县',                -- 中文名，给前端/状态牌展示用
  updated_at timestamptz not null default now()
);

-- 初始种子：泠泠就在镇沅县
insert into public.user_location (id, city, city_cn)
values (1, 'Zhenyuan', '镇沅县')
on conflict (id) do nothing;

-- 与 travel 表一致：前端状态牌要直接读当前城市名，开启 RLS + 公开读
alter table public.user_location enable row level security;
drop policy if exists "user_location public read" on public.user_location;
create policy "user_location public read" on public.user_location
  for select using (true);
