// functions/api/messages.js
// GET /api/messages?conversationId=xxx — 历史消息
// 使用 fetch 直调 Supabase REST API

const SUPABASE = 'https://vktbawcubmdmkqzadmto.supabase.co/rest/v1'

export async function onRequestGet(context) {
  const { request, env } = context
  const url = new URL(request.url)
  const conversationId = url.searchParams.get('conversationId')
  if (!conversationId) return json(400, { error: 'conversationId is required' })

  const res = await fetch(
    `${SUPABASE}/messages?conversation_id=eq.${conversationId}&select=*&order=created_at.asc`,
    {
      headers: {
        'apikey': env.SUPABASE_SECRET_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SECRET_KEY}`,
      },
    }
  )
  const data = await res.json()
  return json(200, { messages: data })
}

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
}

export async function onRequestOptions() {
  return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } })
}
