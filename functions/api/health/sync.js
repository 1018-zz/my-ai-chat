// functions/api/health/sync.js — 极简安卓桥写入每日健康摘要
// 鉴权：HEALTH_SYNC_TOKEN（与 App 端一致）。不匹配直接拒绝。
// 写入 health_data（upsert on user_id,date），service_role 落库。
// 路由：server.js 自动把 functions/api/health/sync.js 暴露为 /api/health/sync。

const SUPABASE = 'https://vktbawcubmdmkqzadmto.supabase.co/rest/v1'
// 个人单机应用兜底默认值：部署后务必在 VPS .env 里设成你自己的 HEALTH_SYNC_TOKEN，
// 且 App 端 Config.kt 用同一个值。
const DEFAULT_TOKEN = 'xiaojia-health-bridge-change-me'

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
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-health-token',
    },
  })
}

function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export async function onRequestPost({ request, env }) {
  try {
    const token = request.headers.get('x-health-token') || ''
    const expect = env.HEALTH_SYNC_TOKEN || DEFAULT_TOKEN
    if (!expect || token !== expect) {
      return json(401, { ok: false, error: 'unauthorized' })
    }
    const b = await request.json().catch(() => ({}))
    const date = String(b.date || '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return json(400, { ok: false, error: 'date required (YYYY-MM-DD)' })
    }
    const row = {
      user_id: 1,
      date,
      sleep_minutes: num(b.sleep_minutes),
      sleep_deep_min: num(b.sleep_deep_min),
      sleep_light_min: num(b.sleep_light_min),
      sleep_rem_min: num(b.sleep_rem_min),
      sleep_start: b.sleep_start || null,
      sleep_end: b.sleep_end || null,
      steps: num(b.steps),
      resting_hr: num(b.resting_hr),
      avg_hr: num(b.avg_hr),
      synced_at: new Date().toISOString(),
    }
    const r = await fetch(`${SUPABASE}/health_data?on_conflict=user_id,date`, {
      method: 'POST',
      headers: {
        'apikey': env.SUPABASE_SECRET_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SECRET_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify(row),
    })
    if (!r.ok) {
      const t = await r.text().catch(() => '')
      return json(500, { ok: false, error: `supabase[${r.status}] ${t.slice(0, 200)}` })
    }
    return json(200, { ok: true })
  } catch (e) {
    return json(500, { ok: false, error: e.message })
  }
}
