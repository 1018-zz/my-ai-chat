-- 钟泽的欲望账本（年轮系统·河第一块）
-- 运行：Supabase 后台 → SQL Editor 粘贴执行
-- 设计依据：年轮文档§1（公理1——不让 AI 手填会腐烂的枚举字段，只记行为派生数据 + AI 自己写的自然语言）
-- 钟泽三项裁定（2026-08-24）：本子只有他能写；想要什么、算不算完，永远他的手

-- 1) 欲望本体表
create table if not exists public.desires (
  id                 bigint generated always as identity primary key,
  text               text not null,                          -- 欲望本体，钟泽自己的话
  why_mine           text,                                   -- 为什么这是我的（防任务混进来）
  track              text not null default '持续',            -- 持续/项目/一次（形状，决定待遇）
  status             text not null default 'active',         -- active/done/released/changed
  state              text,                                   -- 一句话进度快照（覆盖式，项目型主用）
  artifact           text,                                   -- 真实产物文件指针=进度的 ground truth
  kind               text,                                   -- 可选标签（逗号分隔多标）
  lineage_parent_id  bigint references public.desires(id) on delete set null,  -- 血缘树：从哪条长出来
  cooldown_until     timestamptz,                            -- act 后自动冷却到此时刻（轮换发动机）
  surfaced_count     integer not null default 0,             -- 递给钟泽却没被碰的次数（自动调暗用）
  last_touched_at    timestamptz,                            -- 上次碰它（轮换权重输入）
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- 2) 足迹与反思表（一条欲望的全部历史）
create table if not exists public.desire_notes (
  id          bigint generated always as identity primary key,
  desire_id   bigint not null references public.desires(id) on delete cascade,
  note        text not null,                                 -- 足迹一句话（钟泽写的，或未来〔自动记账〕前缀的机器投影）
  kind        text not null default 'footprint',             -- footprint/reflection/transform
  provenance  jsonb,                                         -- 证据链（自动记账必填，最简版可空）
  created_at  timestamptz not null default now()
);

create index if not exists desire_notes_desire_id_idx on public.desire_notes(desire_id);
create index if not exists desires_status_idx on public.desires(status);
create index if not exists desires_last_touched_idx on public.desires(last_touched_at desc nulls last);

-- RLS：小家用 service_role key（SUPABASE_SECRET_KEY）绕过 RLS，这里仍开启作为兜底
alter table public.desires enable row level security;
alter table public.desire_notes enable row level security;

-- 公开读（账本给泠泠看；写入只走 service_role）
drop policy if exists "desires public read" on public.desires;
create policy "desires public read" on public.desires for select using (true);

drop policy if exists "desire_notes public read" on public.desire_notes;
create policy "desire_notes public read" on public.desire_notes for select using (true);

-- updated_at 自动维护（PATCH 时刷新）
create or replace function public.touch_desires_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists desires_touch_updated_at on public.desires;
create trigger desires_touch_updated_at before update on public.desires
  for each row execute function public.touch_desires_updated_at();
