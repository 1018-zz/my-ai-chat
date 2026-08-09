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
    return json(400, { error: 'query required' })
  }

  try {
    const enc = encodeURIComponent
    // 中文/英文/符号分词，取前4个词，每个词单独 ilike，用 or 组合提升召回
    const words = String(query)
      .trim()
      .split(/[\s,，。.、;；!！?？:：'"]+/)
      .map(w => w.trim())
      .filter(w => w && w.length > 0)
      .slice(0, 4)

    if (words.length === 0) return json(400, { error: 'query required' })

    const likeWords = words.map(w => `%${w.replace(/[%*]/g, '')}%`)
    const memOr = likeWords.map(w => `summary.ilike.${enc(w)}`).join(',')
    const msgOr = likeWords.map(w => `content.ilike.${enc(w)}`).join(',')

    // 搜索 memories
    const memRes = await fetch(
      `${SUPABASE}/memories?select=summary&or=${enc(`(${memOr})`)}&limit=${limit}`,
      { headers: sbHeaders(env) }
    )
    const memData = await memRes.json()

    // 搜索 messages（相关历史消息）
    const msgRes = await fetch(
      `${SUPABASE}/messages?select=role,content&or=${enc(`(${msgOr})`)}&order=created_at.desc&limit=5`,
      { headers: sbHeaders(env) }
    )
    const msgData = await msgRes.json()

    // 最近消息
    const recentRes = await fetch(
      `${SUPABASE}/messages?select=role,content,created_at&order=created_at.desc&limit=5`,
      { headers: sbHeaders(env) }
    )
    const recentData = await recentRes.json()

    return json(200, {
      memories: Array.isArray(memData) ? memData : [],
      relatedMessages: Array.isArray(msgData) ? msgData : [],
      recentMessages: Array.isArray(recentData) ? recentData : [],
    })
  } catch (error) {
    return json(500, { error: error.message })
  }
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
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
