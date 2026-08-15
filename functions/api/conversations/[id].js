// functions/api/conversations/[id].js
// DELETE /api/conversations/:id — 删除会话（先删消息，再删会话）

const SUPABASE = 'https://vktbawcubmdmkqzadmto.supabase.co/rest/v1'

function sbHeaders(env) { return { 'apikey': env.SUPABASE_SECRET_KEY, 'Authorization': `Bearer ${env.SUPABASE_SECRET_KEY}`, 'Content-Type': 'application/json' } }

export async function onRequestDelete(context) {
  const { env, params } = context
  try {
    const id = params?.id
    if (!id) return json(400, { error: 'id required' })
    const cid = encodeURIComponent(id)
    await fetch(`${SUPABASE}/messages?conversation_id=eq.${cid}`, { method: 'DELETE', headers: sbHeaders(env) })
    const res = await fetch(`${SUPABASE}/conversations?id=eq.${cid}`, { method: 'DELETE', headers: sbHeaders(env) })
    if (!res.ok) return json(500, { error: `supabase [${res.status}]` })
    return json(200, { success: true })
  } catch (e) { return json(500, { error: e.message }) }
}

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
}

export async function onRequestOptions() {
  return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } })
}
