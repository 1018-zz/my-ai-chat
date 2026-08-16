-- memories 旧数据回填（等价 functions/api/memories/migrate.js 的 POST 逻辑）
-- 执行位置：Supabase 控制台 → SQL Editor → 运行本文件
-- 前置：必须先跑 memories_add_type.sql 加列（content/type/title/keywords/importance/source）
-- 幂等：只处理 content IS NULL 的旧行；已结构化行（content 非空）跳过，可重复跑
-- 逻辑与 migrate.js 一致：
--   家·标题] 内容   → type=moment,  title=标题, source=manual
--   [压缩提取] 内容 → type=compressed, source=compression
--   其余裸文本       → type=note, source=ai_write

-- 1) 手动"不能丢的时刻"：家·标题] 内容
UPDATE memories
SET title   = trim(substring(summary from 3 for (strpos(summary, '] ') - 3))),
    content = trim(substring(summary from strpos(summary, '] ') + 2)),
    type    = 'moment',
    source  = 'manual',
    summary = '【' || trim(substring(summary from 3 for (strpos(summary, '] ') - 3))) || '】'
                 || trim(substring(summary from strpos(summary, '] ') + 2))
WHERE content IS NULL
  AND summary LIKE '家·%'
  AND strpos(summary, '] ') > 0;

-- 2) 压缩沉淀：[压缩提取] 内容
UPDATE memories
SET content = trim(substring(summary from 7)),
    type    = 'compressed',
    source  = 'compression',
    summary = trim(substring(summary from 7))
WHERE content IS NULL
  AND summary LIKE '[压缩提取]%';

-- 3) 裸文本（AI write_memory / 旧 note）
UPDATE memories
SET content = summary,
    type    = 'note',
    source  = 'ai_write'
WHERE content IS NULL
  AND summary IS NOT NULL AND summary <> ''
  AND summary NOT LIKE '家·%'
  AND summary NOT LIKE '[压缩提取]%';

-- —— 回填后验证（单独执行）——
-- SELECT type, count(*) FROM memories GROUP BY type ORDER BY type;
-- SELECT count(*) AS still_null_content FROM memories WHERE content IS NULL;
