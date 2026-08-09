// functions/api/conversations/[id].js
// DELETE /api/conversations/:id — 删除会话
// 使用 fetch 直调 Supabase REST API

const SUPABASE = 'https://vktbawcubmdmkqzadmto.supabase.co/rest/v1'

function sbHeaders(env) {
  return { 'apikey': env.SUPABASE_SECRET_KEY, 'Authorization': `Bearer ${env.SUPABASE_SECRET_KEY}` }
}

export async function onRequestDelete(context) {
  const { request, env } = context
  const url = new URL(request.url)
  const segments = url.pathname.replace(/\/$/, '').split('/')
  const id = segments[segments.length - 1]
  if (!id) return json(400, { error: 'id is required' })

  await fetch(`${SUPABASE}/messages?conversation_id=eq.${id}`, { method: 'DELETE', headers: sbHeaders(env) })
  await fetch(`${SUPABASE}/conversations?id=eq.${id}`, { method: 'DELETE', headers: sbHeaders(env) })
  return json(200, { success: true })
}

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
}

export async function onRequestOptions() {
  return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } })
}
