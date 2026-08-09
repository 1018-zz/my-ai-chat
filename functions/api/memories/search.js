// functions/api/memories/search.js
// POST /api/memories/search — 记忆检索

import { createClient } from '@supabase/supabase-js'

export async function onRequestPost(context) {
  const { request, env } = context
  let body
  try { body = await request.json() } catch { return json(400, { error: 'invalid json' }) }

  const { query, limit = 3 } = body
  if (!query) return json(400, { error: 'query is required' })

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY)

  try {
    const { data: memories } = await supabase
      .from('memories')
      .select('summary')
      .or(`summary.ilike.%${query}%`)
      .limit(limit)

    const { data: relatedMessages } = await supabase
      .from('messages')
      .select('role, content')
      .or(`content.ilike.%${query}%`)
      .order('created_at', { ascending: false })
      .limit(5)

    const { data: recentMessages } = await supabase
      .from('messages')
      .select('role, content, created_at')
      .order('created_at', { ascending: false })
      .limit(5)

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
