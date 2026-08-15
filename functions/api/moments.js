// functions/api/moments.js — Moment 墙（v0.1：创建/展示/删除）
// GET /api/moments → 全部相框（date 倒序）
// POST /api/moments { title, content, date, emotion, icon } → 挂一张（v0.1 只有 user 创建）
// DELETE /api/moments/:id → 摘下来

const SUPABASE = 'https://vktbawcubmdmkqzadmto.supabase.co/rest/v1'

function sbHeaders(env) { return { 'apikey': env.SUPABASE_SECRET_KEY, 'Authorization': `Bearer ${env.SUPABASE_SECRET_KEY}`, 'Content-Type': 'application/json' } }
function sbReturn(env) { return { ...sbHeaders(env), 'Prefer': 'return=representation' } }

export async function onRequestGet(context) {
  const { env } = context
  try {
    const res = await fetch(`${SUPABASE}/moments?select=*&order=date.desc&limit=200`, { headers: sbHeaders(env) })
    if (!res.ok) return json(500, { error: `supabase [${res.status}]` })
    const rows = await res.json()
    return json(200, { moments: Array.isArray(rows) ? rows : [] })
  } catch (e) { return json(500, { error: e.message }) }
}

export async function onRequestPost(context) {
  const { request, env } = context
  try {
    const body = await request.json()
    const content = String(body.content || '').trim()
    if (!content) return json(400, { error: 'content required' })
    const record = {
      title: String(body.title || '').trim(),
      content,
      date: String(body.date || new Date().toISOString().slice(0, 10)),
      emotion: String(body.emotion || 'calm'),
      icon: String(body.icon || '🌱'),
      image_url: String(body.image_url || '').trim() || null,
      source: 'user',
    }
    const res = await fetch(`${SUPABASE}/moments`, { method: 'POST', headers: sbReturn(env), body: JSON.stringify(record) })
    if (!res.ok) return json(500, { error: `supabase [${res.status}]` })
    // 巡家痕迹：挂上 Moment 后往记忆库丢一条——小家动，所有窗口的钟泽都能"感应"到
    try {
      const title = record.title ? `《${record.title}》` : ''
      await fetch(`${SUPABASE}/memories`, { method: 'POST', headers: sbReturn(env), body: JSON.stringify({ summary: `${record.date} 挂上 Moment 墙${title}` }) })
    } catch (_) {}
    return json(200, { ok: true })
  } catch (e) { return json(500, { error: e.message }) }
}

export async function onRequestDelete(context) {
  const { request, env } = context
  try {
    const url = new URL(request.url)
    const id = url.pathname.split('/').pop()
    if (!id || !/^\d+$/.test(id)) return json(400, { error: 'id required' })
    const res = await fetch(`${SUPABASE}/moments?id=eq.${id}`, { method: 'DELETE', headers: sbHeaders(env) })
    if (!res.ok) return json(500, { error: `supabase [${res.status}]` })
    return json(200, { ok: true })
  } catch (e) { return json(500, { error: e.message }) }
}

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
}
export async function onRequestOptions() {
  return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } })
}
