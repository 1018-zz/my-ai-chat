// functions/api/memories/migrate.js
// 一次性回填：把"家·标题] 内容" / "[压缩提取] 内容" / 裸 content 三种旧格式，
// 归一成结构化列（type/title/content/keywords/source）+ 清理 summary 前缀。
// 调用：POST /api/memories/migrate （执行）；GET /api/memories/migrate （仅预览计数，不动数据）
// 幂等：只处理仍带前缀 hack 或 title 为 NULL 的旧行；已结构化行跳过。
// 依赖：先跑 supabase/memories_add_type.sql 加列。

const SUPABASE = 'https://vktbawcubmdmkqzadmto.supabase.co/rest/v1'

function sbHeaders(env) { return { 'apikey': env.SUPABASE_SECRET_KEY, 'Authorization': `Bearer ${env.SUPABASE_SECRET_KEY}`, 'Content-Type': 'application/json' } }
function sbReturn(env) { return { ...sbHeaders(env), 'Prefer': 'return=representation' } }
function json(status, body) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }) }
function jsonErr(e) { return json(500, { error: e.message }) }

const PREFIX_MOMENT = '家·'
const PREFIX_COMPRESS = '[压缩提取]'

// 把一行旧 summary 解析成结构化字段；返回 null 表示该行无需迁移
function derive(row) {
  const s = (row.summary || '').trim()
  if (!s) return null

  if (s.startsWith(PREFIX_MOMENT)) {
    const m = s.match(/^家·(.+?)\] ([\s\S]*)$/)
    const title = m ? m[1].trim() : ''
    const content = m ? m[2].trim() : s.slice(PREFIX_MOMENT.length)
    return { type: 'moment', title, content, source: row.source || 'manual', summary: title ? `【${title}】${content}` : content }
  }
  if (s.startsWith(PREFIX_COMPRESS)) {
    const content = s.slice(PREFIX_COMPRESS.length).trim()
    return { type: 'compressed', title: null, content, source: 'compression', summary: content }
  }
  // 裸 content：旧 write_memory。title 为 NULL 才视为旧 note（新写入 title 为 '' 非空）
  if (row.title == null) {
    return { type: 'note', title: null, content: s, source: 'ai_write', summary: s }
  }
  return null
}

async function fetchAll(env) {
  const res = await fetch(`${SUPABASE}/memories?select=id,summary,title,source&order=id.asc&limit=2000`, { headers: sbHeaders(env) })
  if (!res.ok) throw new Error(`supabase [${res.status}]: ${(await res.text()).slice(0, 200)}`)
  return res.json()
}

async function applyOne(env, id, patch) {
  const res = await fetch(`${SUPABASE}/memories?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH', headers: sbReturn(env), body: JSON.stringify(patch),
  })
  if (!res.ok) throw new Error(`patch ${id} [${res.status}]: ${(await res.text()).slice(0, 150)}`)
}

export async function onRequestGet(context) {
  const { env } = context
  try {
    const rows = await fetchAll(env)
    const todo = rows.map(derive).filter(Boolean)
    const counts = { moment: 0, note: 0, compressed: 0 }
    for (const t of todo) counts[t.type]++
    return json(200, { total: rows.length, toMigrate: todo.length, counts, dry: true })
  } catch (e) { return jsonErr(e) }
}

export async function onRequestPost(context) {
  const { env } = context
  try {
    const rows = await fetchAll(env)
    const plan = rows.map(r => ({ id: r.id, patch: derive(r) })).filter(x => x.patch)
    let done = 0
    for (const { id, patch } of plan) {
      await applyOne(env, id, patch)
      done++
    }
    return json(200, { total: rows.length, migrated: done, message: done ? '回填完成' : '无需迁移（已是结构化）' })
  } catch (e) { return jsonErr(e) }
}

export async function onRequestOptions() {
  return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } })
}
