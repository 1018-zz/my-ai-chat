// functions/api/memories/project.js
// GET /api/memories/project — 项目记忆列表
// POST /api/memories/project — 新增项目记忆 {title, content}
// 项目记忆以 家· 前缀存入 memories 表，与摘要记忆区分
// 注意：memories 表没有 created_at 列，查询只能 select id,summary

const SUPABASE = 'https://vktbawcubmdmkqzadmto.supabase.co/rest/v1'
const PREFIX = '家·'

function sbHeaders(env) { return { 'apikey': env.SUPABASE_SECRET_KEY, 'Authorization': `Bearer ${env.SUPABASE_SECRET_KEY}`, 'Content-Type': 'application/json' } }
function sbReturn(env) { return { ...sbHeaders(env), 'Prefer': 'return=representation' } }

function parseEntry(row) {
  const m = (row.summary || '').match(/^家·(.+?)\] ([\s\S]*)$/)
  return {
    id: row.id,
    title: m ? m[1] : '未命名',
    content: m ? m[2] : row.summary || '',
    createdAt: row.created_at || null,
  }
}

export async function onRequestGet(context) {
  const { env } = context
  try {
    const like = encodeURIComponent(`${PREFIX}%`)
    const res = await fetch(
      `${SUPABASE}/memories?select=id,summary&summary=ilike.${like}&order=id.asc&limit=500`,
      { headers: sbHeaders(env) }
    )
    if (!res.ok) return json(500, { error: `supabase [${res.status}]: ${(await res.text()).slice(0, 200)}` })
    const data = await res.json()
    const rows = Array.isArray(data) ? data : []
    return json(200, { memories: rows.map(parseEntry) })
  } catch (e) { return json(500, { error: e.message }) }
}

export async function onRequestPost(context) {
  const { request, env } = context
  try {
    const body = await request.json()
    const title = String(body.title || '未命名').trim()
    const content = String(body.content || '').trim()
    if (!content) return json(400, { error: 'content required' })
    const summary = `${PREFIX}${title}] ${content}`
    const res = await fetch(`${SUPABASE}/memories`, { method: 'POST', headers: sbReturn(env), body: JSON.stringify({ summary }) })
    if (!res.ok) return json(500, { error: `supabase [${res.status}]: ${(await res.text()).slice(0, 200)}` })
    const rows = await res.json()
    const row = Array.isArray(rows) ? rows[0] : null
    return json(200, { memory: row ? parseEntry(row) : null })
  } catch (e) { return json(500, { error: e.message }) }
}

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
}

export async function onRequestOptions() {
  return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } })
}
