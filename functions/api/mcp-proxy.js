// functions/api/mcp-proxy.js — MCP 代理：前端无需接触 x-api-key，由后端带鉴权转发
export async function onRequestPost(context) {
  const { request, env } = context
  try {
    const body = await request.json()
    const headers = { 'Content-Type': 'application/json' }
    if (env.MCP_AUTH_KEY) headers['x-api-key'] = env.MCP_AUTH_KEY
    // 内网转发到同机的 /api/mcp：必须走 127.0.0.1，不能用 request.url.origin。
    // 原因：nginx 反代时把 Host 头设为公网域名（ling1018.com），导致 request.url.origin
    // 变成公网地址；若用它转发会绕回 Cloudflare/公网，撞上 80→443 的 301 跳转，
    // Node fetch(undici) 跟随 301 时会把 POST 降级成 GET，最终 server.js 收到 GET → 405。
    // 直接打本机回环，绕开公网与重定向，method 不会被篡改。
    const internalOrigin = env.INTERNAL_ORIGIN || `http://127.0.0.1:${process.env.PORT || 3000}`
    const res = await fetch(`${internalOrigin}/api/mcp`, { method: 'POST', headers, body: JSON.stringify(body) })
    const data = await res.json()
    return new Response(JSON.stringify(data), { status: res.status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
  }
}
export async function onRequestOptions() {
  return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } })
}
