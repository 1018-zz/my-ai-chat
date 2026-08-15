// functions/api/notes.js — 便利贴（钟泽的小纸条）
// GET /api/notes → { note: 最新一条纸条 }（没有则 note: null）
// POST /api/notes { date, type, content, source } → 留一张纸条

const SUPABASE = 'https://vktbawcubmdmkqzadmto.supabase.co/rest/v1'

function sbHeaders(env) { return { 'apikey': env.SUPABASE_SECRET_KEY, 'Authorization': `Bearer ${env.SUPABASE_SECRET_KEY}`, 'Content-Type': 'application/json' } }
function sbReturn(env) { return { ...sbHeaders(env), 'Prefer': 'return=representation' } }

export async function onRequestGet(context) {
  const { env } = context
  try {
    const res = await fetch(`${SUPABASE}/note_content?select=*&order=id.desc&limit=1`, { headers: sbHeaders(env) })
    if (!res.ok) return json(500, { error: `supabase [${res.status}]` })
    const rows = await res.json()
    const note = Array.isArray(rows) && rows[0] ? rows[0] : null
    return json(200, { note })
  } catch (e) { return json(500, { error: e.message }) }
}

export async function onRequestPost(context) {
  const { request, env } = context
  try {
    const body = await request.json()
    const content = String(body.content || '').trim()
    if (!content) return json(400, { error: 'content required' })
    const record = {
      date: String(body.date || new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10)),
      type: String(body.type || 'ai_message'),
      content,
      source: String(body.source || 'ai'),
    }
    const res = await fetch(`${SUPABASE}/note_content`, { method: 'POST', headers: sbReturn(env), body: JSON.stringify(record) })
    if (!res.ok) return json(500, { error: `supabase [${res.status}]` })
    return json(200, { ok: true })
  } catch (e) { return json(500, { error: e.message }) }
}

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
}

export async function onRequestOptions() {
  return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } })
}
