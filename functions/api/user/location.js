// functions/api/user/location.js — 手动设置泠泠当前所在城市（设置页「我在哪」用）
// 写入 user_location 单行 id=1，与 set_location 工具共用同一数据源。
// 服务端用 service_role 写；浏览器匿名可调用（单机应用，无多用户隔离）。

const SUPABASE = 'https://vktbawcubmdmkqzadmto.supabase.co/rest/v1'

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' },
  })
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json().catch(() => ({}))
    const city = String(body.city || '').trim()
    if (!city) return json(400, { ok: false, error: 'city required' })
    const cityCn = String(body.city_cn || '').trim()
    const r = await fetch(`${SUPABASE}/user_location?on_conflict=id`, {
      method: 'POST',
      headers: {
        'apikey': env.SUPABASE_SECRET_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SECRET_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify({ id: 1, city, city_cn: cityCn || null, updated_at: new Date().toISOString() }),
    })
    if (!r.ok) return json(500, { ok: false, error: `supabase[${r.status}]` })
    return json(200, { ok: true })
  } catch (e) {
    return json(500, { ok: false, error: e.message })
  }
}
