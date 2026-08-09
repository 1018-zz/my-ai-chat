// functions/api/conversations.js
// GET /api/conversations — 会话列表
// POST /api/conversations — 创建会话

import { createClient } from '@supabase/supabase-js'

export async function onRequestGet(context) {
  const { env } = context
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY)

  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .order('updated_at', { ascending: false })

  if (error) return json(500, { error: error.message })
  return json(200, { conversations: data })
}

export async function onRequestPost(context) {
  const { request, env } = context
  let body
  try { body = await request.json() } catch { return json(400, { error: 'invalid json' }) }

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY)
  const { data, error } = await supabase
    .from('conversations')
    .insert({ title: body.title || '新对话' })
    .select('id')
    .single()

  if (error) return json(500, { error: error.message })
  return json(200, { id: data.id })
}

export async function onRequestDelete(context) {
  const { request, env } = context
  const url = new URL(request.url)
  // DELETE /api/conversations?id=xxx
  const id = url.searchParams.get('id')
  if (!id) return json(400, { error: 'id is required' })

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY)
  await supabase.from('messages').delete().eq('conversation_id', id)
  const { error } = await supabase.from('conversations').delete().eq('id', id)
  if (error) return json(500, { error: error.message })
  return json(200, { success: true })
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
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}
