// functions/api/memories/search.js
// POST /api/memories/search

const SUPABASE = 'https://vktbawcubmdmkqzadmto.supabase.co/rest/v1'

function sbHeaders(env) {
  return {
    'apikey': env.SUPABASE_SECRET_KEY,
    'Authorization': `Bearer ${env.SUPABASE_SECRET_KEY}`,
  }
}

export async function onRequestPost(context) {
  const { request, env } = context
  const body = await request.json()
  const { query, limit = 3 } = body
  if (!query) {
    return new Response(JSON.stringify({ error: 'query required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }

  try {
    const enc = encodeURIComponent
    const like = `*${query.replace(/\*/g, '')}*`

    const memRes = await fetch(
      `${SUPABASE}/memories?select=summary&or=(summary.ilike.${enc(like)})&limit=${limit}`,
      { headers: sbHeaders(env) }
    )
    const memData = await memRes.json()

    const msgRes = await fetch(
      `${SUPABASE}/messages?select=role,content&or=(content.ilike.${enc(like)})&order=created_at.desc&limit=5`,
      { headers: sbHeaders(env) }
    )
    const msgData = await msgRes.json()

    const recentRes = await fetch(
      `${SUPABASE}/messages?select=role,content,created_at&order=created_at.desc&limit=5`,
      { headers: sbHeaders(env) }
    )
    const recentData = await recentRes.json()

    return new Response(JSON.stringify({
      memories: Array.isArray(memData) ? memData : [],
      relatedMessages: Array.isArray(msgData) ? msgData : [],
      recentMessages: Array.isArray(recentData) ? recentData : [],
    }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}
