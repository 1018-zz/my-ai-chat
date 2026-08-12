// functions/api/notes.js — 便利贴（双人留言板 · 今日小记收藏）
// 纸条状态流转：pending（待处理）→ saved（收下）/ discarded（飘走，可捡回）
// GET /api/notes?status=pending|saved|discarded → 纸条列表 + counts 统计
// POST /api/notes { date, type, content, source } → 留一张纸条（默认 pending）
// PATCH /api/notes { id, status, decided_by } → 决定纸条去向

const SUPABASE = 'https://vktbawcubmdmkqzadmto.supabase.co/rest/v1'

function sbHeaders(env) { return { 'apikey': env.SUPABASE_SECRET_KEY, 'Authorization': `Bearer ${env.SUPABASE_SECRET_KEY}`, 'Content-Type': 'application/json' } }
function sbReturn(env) { return { ...sbHeaders(env), 'Prefer': 'return=representation' } }

export async function onRequestGet(context) {
  const { env, request } = context
  try {
    const url = new URL(request.url)
    const status = url.searchParams.get('status') || ''
    let q = `${SUPABASE}/note_content?select=*&order=id.desc&limit=50`
    if (status && ['pending', 'saved', 'discarded'].includes(status)) q += `&status=eq.${status}`
    const res = await fetch(q, { headers: sbHeaders(env) })
    if (!res.ok) return json(500, { error: `supabase [${res.status}]` })
    const rows = await res.json()
    const list = Array.isArray(rows) ? rows : []
    const counts = { pending: 0, saved: 0, discarded: 0 }
    for (const n of list) if (counts[n.status] !== undefined) counts[n.status]++
    return json(200, { notes: list, counts })
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
      source: String(body.source || 'user'),
      status: 'pending',
    }
    const res = await fetch(`${SUPABASE}/note_content`, { method: 'POST', headers: sbReturn(env), body: JSON.stringify(record) })
    if (!res.ok) return json(500, { error: `supabase [${res.status}]` })
    return json(200, { ok: true, note: (await res.json())[0] || null })
  } catch (e) { return json(500, { error: e.message }) }
}

export async function onRequestPatch(context) {
  const { request, env } = context
  try {
    const body = await request.json()
    const id = Number(body.id)
    if (!id) return json(400, { error: 'id required' })
    const status = String(body.status || '')
    if (!['saved', 'discarded', 'pending'].includes(status)) return json(400, { error: 'status must be saved/discarded/pending' })
    const patch = { status, updated_at: new Date().toISOString() }
    if (body.decided_by) patch.decided_by = String(body.decided_by)
    const res = await fetch(`${SUPABASE}/note_content?id=eq.${id}`, { method: 'PATCH', headers: sbReturn(env), body: JSON.stringify(patch) })
    if (!res.ok) return json(500, { error: `supabase [${res.status}]` })
    return json(200, { ok: true })
  } catch (e) { return json(500, { error: e.message }) }
}

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
}

export async function onRequestOptions() {
  return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } })
}
