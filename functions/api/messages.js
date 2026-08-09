// functions/api/messages.js
// GET /api/messages?conversationId=xxx — 历史消息

import { createClient } from '@supabase/supabase-js'

export async function onRequestGet(context) {
  const { request, env } = context
  const url = new URL(request.url)
  const conversationId = url.searchParams.get('conversationId')
  if (!conversationId) {
    return json(400, { error: 'conversationId is required' })
  }

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY)
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })

  if (error) return json(500, { error: error.message })
  return json(200, { messages: data })
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
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}
