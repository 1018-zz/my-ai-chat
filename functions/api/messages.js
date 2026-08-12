// functions/api/messages.js
// GET /api/messages?conversationId=xxx[&includeDeleted=1] —— 默认过滤已撤回（deleted_at IS NULL）
// DELETE /api/messages?id=xx[&by=user] —— 软删（写 deleted_at/deleted_by）
// PATCH /api/messages?id=xx —— 恢复（清 deleted_at）；body { action: 'restore' }

const SUPABASE = 'https://vktbawcubmdmkqzadmto.supabase.co/rest/v1'

function sbHeaders(env) { return { 'apikey': env.SUPABASE_SECRET_KEY, 'Authorization': `Bearer ${env.SUPABASE_SECRET_KEY}`, 'Content-Type': 'application/json' } }
function sbReturn(env) { return { ...sbHeaders(env), 'Prefer': 'return=representation' } }

export async function onRequestGet(context) {
  const { request, env } = context
  const url = new URL(request.url)
  const mode = url.searchParams.get('mode') || ''
  // mode=deleted：跨会话查最近撤回（恢复面板用）
  if (mode === 'deleted') {
    const res = await fetch(
      `${SUPABASE}/messages?select=id,conversation_id,role,content,deleted_at,deleted_by&deleted_at=not.is.null&order=deleted_at.desc&limit=20`,
      { headers: sbHeaders(env) }
    )
    const data = await res.json()
    return new Response(JSON.stringify({ messages: Array.isArray(data) ? data : [] }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
  const cid = url.searchParams.get('conversationId')
  if (!cid) {
    return new Response(JSON.stringify({ error: 'conversationId required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
  const includeDeleted = url.searchParams.get('includeDeleted') === '1'
  let q = `${SUPABASE}/messages?conversation_id=eq.${cid}&select=*&order=created_at.asc`
  if (!includeDeleted) q += `&deleted_at=is.null`
  const res = await fetch(q, { headers: sbHeaders(env) })
  const data = await res.json()
  const messages = Array.isArray(data) ? data : []
  return new Response(JSON.stringify({ messages }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}

export async function onRequestDelete(context) {
  const { request, env } = context
  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  if (!id) return json(400, { error: 'id required' })
  const by = url.searchParams.get('by') || 'user'
  const res = await fetch(`${SUPABASE}/messages?id=eq.${id}`, {
    method: 'PATCH',
    headers: sbReturn(env),
    body: JSON.stringify({ deleted_at: new Date().toISOString(), deleted_by: by }),
  })
  if (!res.ok) return json(500, { error: `supabase [${res.status}]` })
  return json(200, { ok: true })
}

export async function onRequestPatch(context) {
  const { request, env } = context
  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  if (!id) return json(400, { error: 'id required' })
  const body = await request.json().catch(() => ({}))
  if (body.action !== 'restore') return json(400, { error: 'action must be restore' })
  const res = await fetch(`${SUPABASE}/messages?id=eq.${id}`, {
    method: 'PATCH',
    headers: sbReturn(env),
    body: JSON.stringify({ deleted_at: null, deleted_by: null }),
  })
  if (!res.ok) return json(500, { error: `supabase [${res.status}]` })
  return json(200, { ok: true })
}

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}
