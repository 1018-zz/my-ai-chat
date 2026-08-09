// functions/api/messages.js
// GET /api/messages?conversationId=xxx

const SUPABASE = 'https://vktbawcubmdmkqzadmto.supabase.co/rest/v1'

export async function onRequestGet(context) {
  const { request, env } = context
  const url = new URL(request.url)
  const cid = url.searchParams.get('conversationId')
  if (!cid) {
    return new Response(JSON.stringify({ error: 'conversationId required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }

  const res = await fetch(
    `${SUPABASE}/messages?conversation_id=eq.${cid}&select=*&order=created_at.asc`,
    {
      headers: {
        'apikey': env.SUPABASE_SECRET_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SECRET_KEY}`,
      },
    }
  )
  const data = await res.json()
  return new Response(JSON.stringify({ messages: data }), {
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
