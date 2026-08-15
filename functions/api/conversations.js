// functions/api/conversations.js
// GET /api/conversations / POST /api/conversations

const SUPABASE = 'https://vktbawcubmdmkqzadmto.supabase.co/rest/v1'

function sbHeaders(env) {
  return {
    'apikey': env.SUPABASE_SECRET_KEY,
    'Authorization': `Bearer ${env.SUPABASE_SECRET_KEY}`,
    'Content-Type': 'application/json',
  }
}

export async function onRequestGet(context) {
  const { env } = context
  const res = await fetch(
    `${SUPABASE}/conversations?select=*&order=updated_at.desc`,
    { headers: sbHeaders(env) }
  )
  const data = await res.json()
  const conversations = Array.isArray(data) ? data : []
  return new Response(JSON.stringify({ conversations }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}

export async function onRequestPost(context) {
  const { request, env } = context
  const body = await request.json()
  const res = await fetch(`${SUPABASE}/conversations`, {
    method: 'POST',
    headers: { ...sbHeaders(env), 'Prefer': 'return=representation' },
    body: JSON.stringify({ title: (body.title || '新对话') }),
  })
  const rows = await res.json()
  const id = Array.isArray(rows) ? rows[0]?.id : null
  return new Response(JSON.stringify({ id }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}
