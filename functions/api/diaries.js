// functions/api/diaries.js
// GET /api/diaries — 最近双人日记（按日期倒序，limit 28）
// POST /api/diaries — 保存泠泠的日记 {date, content}（author=user，同日期覆盖更新）

const SUPABASE = 'https://vktbawcubmdmkqzadmto.supabase.co/rest/v1'

function sbHeaders(env) { return { 'apikey': env.SUPABASE_SECRET_KEY, 'Authorization': `Bearer ${env.SUPABASE_SECRET_KEY}`, 'Content-Type': 'application/json' } }
function sbReturn(env) { return { ...sbHeaders(env), 'Prefer': 'return=representation' } }

export async function onRequestGet(context) {
  const { env } = context
  try {
    const res = await fetch(
      `${SUPABASE}/diaries?select=*&order=date.desc&limit=28`,
      { headers: sbHeaders(env) }
    )
    if (!res.ok) return json(500, { error: `supabase [${res.status}]` })
    const rows = await res.json()
    return json(200, { diaries: Array.isArray(rows) ? rows : [] })
  } catch (e) { return json(500, { error: e.message }) }
}

export async function onRequestPost(context) {
  const { request, env } = context
  try {
    const body = await request.json()
    const date = String(body.date || '')
    const content = String(body.content || '').trim()
    if (!date || !content) return json(400, { error: 'date and content required' })

    // 查该日期 user 日记是否已存在，存在则更新
    const qr = await fetch(`${SUPABASE}/diaries?date=eq.${encodeURIComponent(date)}&author=eq.user&select=id`, { headers: sbHeaders(env) })
    const qrows = await qr.json()
    const existing = Array.isArray(qrows) ? qrows[0] : null

    if (existing) {
      await fetch(`${SUPABASE}/diaries?id=eq.${existing.id}`, { method: 'PATCH', headers: sbHeaders(env), body: JSON.stringify({ content }) })
    } else {
      await fetch(`${SUPABASE}/diaries`, { method: 'POST', headers: sbReturn(env), body: JSON.stringify({ date, author: 'user', content }) })
    }
    return json(200, { ok: true })
  } catch (e) { return json(500, { error: e.message }) }
}

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
}

export async function onRequestOptions() {
  return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } })
}
