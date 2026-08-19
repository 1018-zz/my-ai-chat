// functions/api/quota.js — DeepSeek 余额查询代理
// 调 https://api.deepseek.com/user/balance（Bearer token 复用 DEEPSEEK_API_KEY）
// 返回 is_available + balance_infos（total_grant/used/total_available/usable）
const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: CORS })

export async function onRequestGet(context) {
  const env = context.env || {}
  const key = env.DEEPSEEK_API_KEY
  if (!key) return json(500, { error: 'no DEEPSEEK_API_KEY' })
  try {
    const r = await fetch('https://api.deepseek.com/user/balance', {
      headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${key}` },
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) return json(r.status, { error: `DS [${r.status}]`, detail: data })
    return json(200, data)
  } catch (e) {
    return json(500, { error: String(e.message) })
  }
}

export async function onRequestOptions() {
  return new Response(null, { headers: CORS })
}