// functions/api/conversations/[id].js
// DELETE /api/conversations/:id — 删除会话

import { createClient } from '@supabase/supabase-js'

export async function onRequestDelete(context) {
  const { request, env } = context
  const url = new URL(request.url)
  const segments = url.pathname.replace(/\/$/, '').split('/')
  const id = segments[segments.length - 1]
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
      'Access-Control-Allow-Methods': 'DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}
