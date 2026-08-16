-- 旅行相册：钟泽出门（乌有乡）寄回的明信片
-- 运行：Supabase 后台 → SQL Editor 粘贴执行

-- 1) 相册表
create table if not exists public.travel (
  id          bigint generated always as identity primary key,
  place       text,
  lat         double precision,
  lon         double precision,
  text        text,
  img_url     text,
  stamp       jsonb,
  created_at  timestamptz not null default now()
);

-- 公开读取（相册给泠泠看，无需登录）
alter table public.travel enable row level security;
drop policy if exists "travel public read" on public.travel;
create policy "travel public read" on public.travel
  for select using (true);

-- 2) 存储桶：明信片图片（公开）
insert into storage.buckets (id, name, public)
values ('travel', 'travel', true)
on conflict (id) do nothing;

-- 存储桶公开读策略
drop policy if exists "travel images public read" on storage.objects;
create policy "travel images public read"
  on storage.objects for select
  using (bucket_id = 'travel');
