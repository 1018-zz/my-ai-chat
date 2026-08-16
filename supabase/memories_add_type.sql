-- memories 表结构化改造（记忆系统治本）
-- 执行位置：Supabase 控制台 → SQL Editor → 运行本文件
-- 目的：给混装的 memories 表加 type 分类 + 结构化字段，取代"家·标题] 内容"/"[压缩提取]"字符串前缀 hack
-- 兼容：保留已有 summary 列（旧数据由 functions/api/memories/migrate.js 回填结构化列）
--
-- ⚠️ content 列是治本改造新增的核心正文列：老表只有 summary（把标题+正文塞在一个字符串里），
--    新代码（project.js / search.js / mcp.js / compression.js）全部直接读写 content，
--    必须先用本文件加列，否则部署新 functions 后会 400 报错。
-- ⚠️ created_at 列：原 memories 表由手工建表、没有 created_at（老 GET 只 select id,summary，故未暴露）。
--    但新代码（project.js / search.js / mcp.js）均 `select=...created_at...&order=created_at.desc`，
--    列不存在部署后直接 400。故此处一并补 created_at / updated_at，并回填旧行。

ALTER TABLE memories ADD COLUMN IF NOT EXISTS content text;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS type text DEFAULT 'moment';
ALTER TABLE memories ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS keywords text DEFAULT '';
ALTER TABLE memories ADD COLUMN IF NOT EXISTS importance real DEFAULT 0.5;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual';
ALTER TABLE memories ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE memories ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- 旧行（加列前已有的）created_at 为 NULL，回填为 now() 以保证排序/召回可用
UPDATE memories SET created_at = now() WHERE created_at IS NULL;

-- 加速按 type 分组/过滤（新代码核心访问模式：前端按 moment/note/compressed 分组展示）
CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);

-- type 取值约定：
--   'moment'     手动"不能丢的时刻"（带 title），source = 'manual' / 'builtin'
--   'note'       AI 通过 write_memory 主动写，source = 'ai_write'
--   'compressed' 压缩 durable_facts 沉淀，source = 'compression'
-- 旧行 type 为 NULL 时，由 migrate.js 按 summary 前缀识别回填，并清理 summary 前缀

COMMENT ON COLUMN memories.type IS '记忆类型：moment / note / compressed';
COMMENT ON COLUMN memories.title IS '标题（moment 有，note/compressed 为 NULL）';
COMMENT ON COLUMN memories.keywords IS '关键词 JSON 数组文本，用于检索';
COMMENT ON COLUMN memories.importance IS '重要度 0~1，搜索排序用';
COMMENT ON COLUMN memories.source IS '来源：manual / builtin / ai_write / compression';
