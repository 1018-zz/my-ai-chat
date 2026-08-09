// functions/api/conversations.js
// GET /api/conversations — 列表 | POST /api/conversations — 创建
// 使用 fetch 直调 Supabase REST API

const SUPABASE = 'https://vktbawcubmdmkqzadmto.supabase.co/rest/v1'

function sbHeaders(env) {
  return { 'apikey': env.SUPABASE_SECRET_KEY, 'Authorization': `Bearer ${env.SUPABASE_SECRET_KEY}`, 'Content-Type': 'application/json' }
}

export async function onRequestGet(context) {
  const { env } = context
  const res = await fetch(
    `${SUPABASE}/conversations?select=*&order=updated_at.desc`,
    { headers: sbHeaders(env) }
  )
  const data = await res.json()
  return json(200, { conversations: data })
}

export async function onRequestPost(context) {
  const { request, env } = context
  let body
  try { body = await request.json() } catch { return json(400, { error: 'invalid json' }) }

  const res = await fetch(`${SUPABASE}/conversations`, {
    method: 'POST',
    headers: { ...sbHeaders(env), 'Prefer': 'return=representation' },
    body: JSON.stringify({ title: body.title || '新对话' }),
  })
  if (!res.ok) return json(500, { error: 'failed to create conversation' })
  const rows = await res.json()
  return json(200, { id: rows[0]?.id })
}

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
}

export async function onRequestOptions() {
  return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } })
}
