// functions/api/memories/project.js
// GET  /api/memories/project — 项目记忆列表（返回全部 type：moment/note/compressed，由前端分组）
// POST /api/memories/project — 新增项目记忆（结构化：type/title/content/keywords/importance/source）
//
// 记忆室"不能丢的时刻"：手动 moment；AI 写 note；压缩沉淀 compressed。三者同表、按 type 区分，
// 不再用"家·标题] 内容"字符串前缀 hack。旧行（未跑 migrate）在 GET 时兼容解析 summary。
// 写入容错：若新列尚未建（SQL 未跑），退回只写 summary，保证不崩。

const SUPABASE = 'https://vktbawcubmdmkqzadmto.supabase.co/rest/v1'

function sbHeaders(env) { return { 'apikey': env.SUPABASE_SECRET_KEY, 'Authorization': `Bearer ${env.SUPABASE_SECRET_KEY}`, 'Content-Type': 'application/json' } }
function sbReturn(env) { return { ...sbHeaders(env), 'Prefer': 'return=representation' } }

const PREFIX_MOMENT = '家·'
const PREFIX_COMPRESS = '[压缩提取]'

// 把一行（新结构化 or 旧 summary）归一成前端形状
function shape(row) {
  const s = row.summary || ''
  let type = row.type || 'moment'
  let title = row.title != null ? row.title : null
  let content = row.content || ''
  let source = row.source || 'manual'

  // 兼容未迁移旧行：content 为空时从 summary 解析
  if (!content) {
    if (s.startsWith(PREFIX_MOMENT)) {
      const m = s.match(/^家·(.+?)\] ([\s\S]*)$/)
      title = m ? m[1].trim() : ''
      content = m ? m[2].trim() : s.slice(PREFIX_MOMENT.length)
      type = 'moment'
    } else if (s.startsWith(PREFIX_COMPRESS)) {
      content = s.slice(PREFIX_COMPRESS.length).trim()
      type = 'compressed'
      title = null
    } else {
      content = s
      if (type === 'moment' && title == null) type = 'note'
    }
  }
  return {
    id: row.id,
    type,
    title: title || '',
    content,
    createdAt: row.created_at || null,
    importance: Number(row.importance) || 0.5,
    keywords: row.keywords || '',
    source,
  }
}

// 容错写入：先写结构化全字段；若新列缺失(400)，退回只写 summary
async function sbInsert(env, body) {
  const r = await fetch(`${SUPABASE}/memories`, { method: 'POST', headers: sbReturn(env), body: JSON.stringify(body) })
  if (r.ok) return r
  if (body.type !== undefined) {
    const r2 = await fetch(`${SUPABASE}/memories`, { method: 'POST', headers: sbReturn(env), body: JSON.stringify({ summary: body.summary }) })
    if (r2.ok) return r2
  }
  return r
}

export async function onRequestGet(context) {
  const { env } = context
  try {
    const res = await fetch(
      `${SUPABASE}/memories?select=id,summary,type,title,content,created_at,importance,keywords,source&order=created_at.desc&limit=2000`,
      { headers: sbHeaders(env) }
    )
    if (!res.ok) return json(500, { error: `supabase [${res.status}]: ${(await res.text()).slice(0, 200)}` })
    const data = await res.json()
    const rows = (Array.isArray(data) ? data : []).map(shape)
    return json(200, { memories: rows })
  } catch (e) { return json(500, { error: e.message }) }
}

export async function onRequestPost(context) {
  const { request, env } = context
  try {
    const body = await request.json()
    const title = String(body.title || '').trim()
    const content = String(body.content || '').trim()
    if (!content) return json(400, { error: 'content required' })
    const summary = title ? `【${title}】${content}` : content
    const payload = {
      summary,
      type: 'moment',
      title: title || null,
      content,
      source: 'manual',
      importance: Number(body.importance) || 0.5,
      keywords: Array.isArray(body.keywords) ? JSON.stringify(body.keywords) : (body.keywords || ''),
    }
    const res = await sbInsert(env, payload)
    if (!res.ok) return json(500, { error: `supabase [${res.status}]: ${(await res.text()).slice(0, 200)}` })
    const rows = await res.json()
    const row = Array.isArray(rows) ? rows[0] : null
    return json(200, { memory: row ? shape(row) : null })
  } catch (e) { return json(500, { error: e.message }) }
}

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
}

export async function onRequestOptions() {
  return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } })
}
