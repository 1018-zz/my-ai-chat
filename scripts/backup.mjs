// scripts/backup.mjs
// 小家数据备份：把 Supabase 里的家当（记忆/日记/纸条/对话/旅行…）全量拉下来，
// 打成一份带时间戳的 JSON，落到本地 backups/ 目录，并自动保留最近 N 份。
//
// 设计（对齐现有脚本风格）：
// - 零依赖：纯 Node 内置模块（Node ≥18，全局 fetch）
// - 不修改 functions/、package.json
// - 密钥从环境变量 SUPABASE_SECRET_KEY 读取（也可放本地 .env，但请勿提交）
// - 分页：主键为 id 的表按 id 倒序翻页拉全量；无 id 的表（小表）直接拉满
// - 用法：
//     node scripts/backup.mjs             # 全量备份到 backups/
//     node scripts/backup.mjs --dry       # 只预览每张表的条数，不落盘
//     node scripts/backup.mjs --keep 30   # 保留最近 30 份（默认 14）
//     node scripts/backup.mjs --tables memories,diaries   # 只备份指定表
//
// 建议挂在 VPS cron 上（例：每天凌晨 3 点）：
//   0 3 * * * cd /opt/xiaojia && /usr/bin/node scripts/backup.mjs >> backups/backup.log 2>&1
// 可选：备份文件 rsync 到本地/对象存储，见 README.backup.md。

import { readFileSync, writeFileSync, readdirSync, unlinkSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vktbawcubmdmkqzadmto.supabase.co/rest/v1'
const BACKUP_DIR = path.resolve(process.env.BACKUP_DIR || 'backups')
const DEFAULT_KEEP = 14

// 要备份的表。pageable=true 表示主键为 id、按 id 倒序翻页（数据可能超过单页上限）；
// pageable=false 的表都很小，直接拉 limit=1000 全量。
const TABLES = [
  { name: 'memories', pageable: true },                // 记忆库（最重要）
  { name: 'diaries', pageable: true },                 // 日记
  { name: 'note_content', pageable: true },            // 便利贴纸条
  { name: 'self_insights', pageable: true },           // 自我认知
  { name: 'moments', pageable: true },                 // 时刻
  { name: 'travel', pageable: true },                  // 旅行明信片
  { name: 'project_events', pageable: true },          // 家园事件
  { name: 'conversations', pageable: true },           // 对话列表
  { name: 'messages', pageable: true },                // 消息（全量）
  { name: 'daily_checkin', pageable: true },           // 打卡（功能已毙，数据仍留档）
  { name: 'compression_summaries', pageable: true },   // 压缩摘要
  { name: 'compression_batches', pageable: false },    // 压缩批次
  { name: 'compression_batch_inputs', pageable: false },
  { name: 'compression_batch_outputs', pageable: false },
  { name: 'summary_anchors', pageable: false },        // 摘要锚点（主键 conversation_id）
  { name: 'conversation_summaries', pageable: false }, // 对话摘要（主键 conversation_id）
]

// ---- 小工具：读 .env（与 push-summary.mjs 同款） ----
function loadEnv(file = '.env') {
  const out = {}
  try {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/)
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch { /* ignore */ }
  return out
}

// ---- 解析参数 ----
const args = process.argv.slice(2)
const DRY = args.includes('--dry')
const keepIdx = args.indexOf('--keep')
const KEEP = keepIdx >= 0 ? Math.max(1, parseInt(args[keepIdx + 1], 10) || DEFAULT_KEEP) : DEFAULT_KEEP
const tablesIdx = args.indexOf('--tables')
const onlyTables = tablesIdx >= 0 ? new Set(args[tablesIdx + 1].split(',').map(s => s.trim()).filter(Boolean)) : null

const envFromFile = loadEnv()
const KEY = process.env.SUPABASE_SECRET_KEY || envFromFile.SUPABASE_SECRET_KEY

if (!KEY && !DRY) {
  console.error('缺少 SUPABASE_SECRET_KEY：请通过环境变量或本地 .env 提供（不要提交到仓库）。')
  process.exit(1)
}

const headers = {
  'apikey': KEY,
  'Authorization': `Bearer ${KEY}`,
  'Content-Type': 'application/json',
}

// ---- 拉取一张表（按 id 倒序翻页，直到取完） ----
async function fetchTable(table) {
  const rows = []
  let cursor = null
  for (let page = 0; page < 200; page++) {
    let url = `${SUPABASE_URL}/${table}?select=*&order=id.desc&limit=1000`
    if (cursor) url += `&id=lt.${cursor}`
    const res = await fetch(url, { headers })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`${table} [${res.status}]: ${body.slice(0, 200)}`)
    }
    const pageRows = await res.json()
    if (!Array.isArray(pageRows)) throw new Error(`${table}: 响应不是数组`)
    rows.push(...pageRows)
    if (pageRows.length < 1000) break
    cursor = pageRows[pageRows.length - 1].id
  }
  return rows
}

// ---- 拉取一张小表（直接拉满） ----
async function fetchSmallTable(table) {
  const res = await fetch(`${SUPABASE_URL}/${table}?select=*&limit=1000`, { headers })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`${table} [${res.status}]: ${body.slice(0, 200)}`)
  }
  const rows = await res.json()
  return Array.isArray(rows) ? rows : []
}

// ---- 主流程 ----
const targets = TABLES.filter(t => !onlyTables || onlyTables.has(t.name))

if (DRY) {
  console.log('=== 备份预览（--dry，未联网） ===')
  for (const t of targets) console.log(`  · ${t.name}  （${t.pageable ? 'id 分页' : '直拉'}）`)
  console.log(`  将输出到 ${BACKUP_DIR}/，保留最近 ${KEEP} 份`)
  process.exit(0)
}

const stamp = new Date(Date.now() + 8 * 3600 * 1000).toISOString().replace(/[:.]/g, '-').slice(0, 19)
const backup = {
  backup_at: new Date().toISOString(),
  backup_at_bj: new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 19),
  source: SUPABASE_URL.replace(/^https?:\/\//, '').replace(/\/rest\/v1$/, ''),
  tables: {},
}

for (const t of targets) {
  try {
    const rows = t.pageable ? await fetchTable(t.name) : await fetchSmallTable(t.name)
    backup.tables[t.name] = { count: rows.length, rows }
    console.log(`  ✓ ${t.name}: ${rows.length} 条`)
  } catch (e) {
    // 单表失败不阻断整体：把错误记进清单，继续备份其他表
    backup.tables[t.name] = { count: 0, rows: [], error: e.message }
    console.error(`  ✗ ${t.name}: ${e.message}`)
  }
}

// 落盘
mkdirSync(BACKUP_DIR, { recursive: true })
const file = path.join(BACKUP_DIR, `backup-${stamp}.json`)
writeFileSync(file, JSON.stringify(backup, null, 2))
console.log(`\n已写入 ${file}`)

// 清理：保留最近 KEEP 份
const files = readdirSync(BACKUP_DIR)
  .filter(f => /^backup-.*\.json$/.test(f))
  .sort() // 文件名带时间戳，字典序即时间序
const stale = files.slice(0, Math.max(0, files.length - KEEP))
for (const f of stale) {
  unlinkSync(path.join(BACKUP_DIR, f))
  console.log(`  清理旧备份 ${f}`)
}
console.log(`完成：当前保留 ${files.length - stale.length} 份备份（上限 ${KEEP} 份）`)
