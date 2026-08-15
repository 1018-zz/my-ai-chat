// functions/api/mcp-proxy.js — MCP 代理：前端无需接触 x-api-key，由后端带鉴权转发
export async function onRequestPost(context) {
  const { request, env } = context
  try {
    const body = await request.json()
    const headers = { 'Content-Type': 'application/json' }
    if (env.MCP_AUTH_KEY) headers['x-api-key'] = env.MCP_AUTH_KEY
    const res = await fetch(`${new URL(request.url).origin}/api/mcp`, { method: 'POST', headers, body: JSON.stringify(body) })
    const data = await res.json()
    return new Response(JSON.stringify(data), { status: res.status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
  }
}
export async function onRequestOptions() {
  return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } })
}
