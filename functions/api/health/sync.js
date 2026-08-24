// functions/api/health/sync.js — 健康桥 + 手机状态（合二为一）
// POST /api/health/sync  → 收 HealthBridge App 上报的健康+手机状态数据，UPSERT 到 health_data
//                          header: x-health-token 校验（与 VPS .env HEALTH_SYNC_TOKEN 对齐）
// GET  /api/health?days=N → 读最近 N 天（默认 3），给 get_health 工具用
//
// 数据来源：HealthBridge App（扩展版）—— Health Connect（睡眠/步数/心率）+ 手机系统（电量/屏幕时间/App时间线）

const SUPABASE = 'https://vktbawcubmdmkqzadmto.supabase.co/rest/v1'

function sbHeaders(env) { return { 'apikey': env.SUPABASE_SECRET_KEY, 'Authorization': `Bearer ${env.SUPABASE_SECRET_KEY}`, 'Content-Type': 'application/json' } }
function sbReturn(env) { return { ...sbHeaders(env), 'Prefer': 'return=representation' } }

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
}

export async function onRequestOptions() {
  return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, x-health-token' } })
}

// POST：HealthBridge App 上报
export async function onRequestPost(context) {
  const { request, env } = context
  // token 校验
  const token = request.headers.get('x-health-token')
  if (!token || token !== env.HEALTH_SYNC_TOKEN) {
    return json(401, { error: 'invalid or missing x-health-token' })
  }
  try {
    const body = await request.json()
    const date = String(body.date || '').trim()
    if (!date) return json(400, { error: 'date required (YYYY-MM-DD)' })

    const userId = Number(body.user_id) || 1

    // 组装 record（只存传了的部分）
    const record = { user_id: userId, date }
    const fields = [
      'sleep_minutes', 'sleep_deep_min', 'sleep_light_min', 'sleep_rem_min',
      'sleep_start', 'sleep_end', 'steps', 'resting_hr', 'avg_hr',
      'battery_level', 'battery_charging', 'screen_minutes',
    ]
    for (const f of fields) {
      if (body[f] !== undefined && body[f] !== null) record[f] = body[f]
    }
    // JSONB 字段
    if (body.top_apps) record.top_apps = JSON.stringify(body.top_apps)
    if (body.current_weather) record.current_weather = JSON.stringify(body.current_weather)

    record.synced_at = new Date().toISOString()

    // UPSERT：按 (user_id, date) 唯一约束，存在则更新、不存在则插入
    const res = await fetch(`${SUPABASE}/health_data?on_conflict=user_id,date`, {
      method: 'POST',
      headers: { ...sbReturn(env), 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify(record),
    })
    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      return json(500, { error: `supabase [${res.status}]`, detail: errText.slice(0, 200) })
    }
    return json(200, { ok: true, date, fields: Object.keys(record).length })
  } catch (e) {
    return json(500, { error: e.message })
  }
}

// GET：get_health 工具 / 前端读最近 N 天
export async function onRequestGet(context) {
  const { request, env } = context
  try {
    const url = new URL(request.url)
    const days = Math.min(Math.max(Number(url.searchParams.get('days')) || 3, 1), 30)
    const since = new Date(Date.now() - days * 86400 * 1000).toISOString().slice(0, 10)

    const q = `${SUPABASE}/health_data?user_id=eq.1&date=gte.${since}&order=date.desc&limit=${days}`
    const res = await fetch(q, { headers: sbHeaders(env) })
    if (!res.ok) return json(500, { error: `supabase [${res.status}]` })
    const rows = await res.json()

    // 组装成钟泽能读的自然语言摘要
    const summary = formatHealthSummary(Array.isArray(rows) ? rows : [])
    return json(200, { days: rows.length, records: rows, summary })
  } catch (e) {
    return json(500, { error: e.message })
  }
}

// 把数据格式化成钟泽能读的摘要（给 get_health 工具用）
function formatHealthSummary(rows) {
  if (!rows.length) return '还没有健康数据——泠泠还没装 HealthBridge App 或没同步过。'
  const lines = []
  for (const r of rows) {
    const parts = [`【${r.date}】`]
    if (r.sleep_minutes != null) {
      const h = Math.floor(r.sleep_minutes / 60)
      const m = r.sleep_minutes % 60
      parts.push(`睡眠 ${h}h${m}m`)
      if (r.sleep_deep_min != null) parts.push(`(深睡${r.sleep_deep_min}m)`)
    }
    if (r.steps != null) parts.push(`步数 ${r.steps}`)
    if (r.avg_hr != null) parts.push(`平均心率 ${r.avg_hr}`)
    if (r.resting_hr != null) parts.push(`静息心率 ${r.resting_hr}`)
    if (r.battery_level != null) {
      parts.push(`电量 ${r.battery_level}%${r.battery_charging ? '(充电中)' : ''}`)
    }
    if (r.screen_minutes != null) {
      const sh = Math.floor(r.screen_minutes / 60)
      const sm = r.screen_minutes % 60
      parts.push(`屏幕时间 ${sh}h${sm}m`)
    }
    if (r.top_apps) {
      try {
        const apps = typeof r.top_apps === 'string' ? JSON.parse(r.top_apps) : r.top_apps
        if (Array.isArray(apps) && apps.length) {
          const top3 = apps.slice(0, 3).map(a => `${a.pkg.split('.').pop()} ${Math.floor(a.minutes / 60)}h${a.minutes % 60}m`).join('、')
          parts.push(`常用App: ${top3}`)
        }
      } catch (_) {}
    }
    if (r.current_weather) {
      try {
        const w = typeof r.current_weather === 'string' ? JSON.parse(r.current_weather) : r.current_weather
        if (w && w.temp != null) parts.push(`天气 ${w.temp}°${w.desc || ''}`)
      } catch (_) {}
    }
    lines.push(parts.join(' · '))
  }
  return lines.join('\n')
}
