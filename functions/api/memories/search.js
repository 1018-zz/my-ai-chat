// functions/api/memories/search.js
// POST /api/memories/search — 记忆检索
// 使用 fetch 直调 Supabase REST API

const SUPABASE = 'https://vktbawcubmdmkqzadmto.supabase.co/rest/v1'

function sbHeaders(env) {
  return { 'apikey': env.SUPABASE_SECRET_KEY, 'Authorization': `Bearer ${env.SUPABASE_SECRET_KEY}` }
}

export async function onRequestPost(context) {
  const { request, env } = context
  let body
  try { body = await request.json() } catch { return json(400, { error: 'invalid json' }) }

  const { query, limit = 3 } = body
  if (!query) return json(400, { error: 'query is required' })

  try {
    const enc = encodeURIComponent
    const like = `*${query.replace(/\*/g, '')}*`

    const memRes = await fetch(
      `${SUPABASE}/memories?select=summary&or=(summary.ilike.${enc(like)})&limit=${limit}`,
      { headers: sbHeaders(env) }
    )
    const memories = await memRes.json()

    const msgRes = await fetch(
      `${SUPABASE}/messages?select=role,content&or=(content.ilike.${enc(like)})&order=created_at.desc&limit=5`,
      { headers: sbHeaders(env) }
    )
    const relatedMessages = await msgRes.json()

    const recentRes = await fetch(
      `${SUPABASE}/messages?select=role,content,created_at&order=created_at.desc&limit=5`,
      { headers: sbHeaders(env) }
    )
    const recentMessages = await recentRes.json()

    return json(200, {
      memories: memories || [],
      relatedMessages: relatedMessages || [],
      recentMessages: recentMessages || [],
    })
  } catch (error) {
    return json(500, { error: error.message })
  }
}

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
}

export async function onRequestOptions() {
  return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } })
}
