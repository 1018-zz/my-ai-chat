// functions/api/conversations/[id].js
// DELETE /api/conversations/:id

const SUPABASE = 'https://vktbawcubmdmkqzadmto.supabase.co/rest/v1'

function sbHeaders(env) {
  return {
    'apikey': env.SUPABASE_SECRET_KEY,
    'Authorization': `Bearer ${env.SUPABASE_SECRET_KEY}`,
  }
}

export async function onRequestDelete(context) {
  const { request, env } = context
  const url = new URL(request.url)
  const segments = url.pathname.replace(/\/$/, '').split('/')
  const id = segments[segments.length - 1]
  if (!id) {
    return new Response(JSON.stringify({ error: 'id required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }

  await fetch(`${SUPABASE}/messages?conversation_id=eq.${id}`, {
    method: 'DELETE',
    headers: sbHeaders(env),
  })
  await fetch(`${SUPABASE}/conversations?id=eq.${id}`, {
    method: 'DELETE',
    headers: sbHeaders(env),
  })

  return new Response(JSON.stringify({ success: true }), {
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
