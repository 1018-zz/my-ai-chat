// functions/api/daily.js
// GET /api/daily — 最近打卡记录（最近 14 天）
// POST /api/daily — 保存/更新当天打卡 {date, breakfast, lunch, dinner, wake_time, sleep_time, note}
// date 格式 YYYY-MM-DD（前端传本地日期），date 唯一，重复提交自动更新

const SUPABASE = 'https://vktbawcubmdmkqzadmto.supabase.co/rest/v1'

function sbHeaders(env) { return { 'apikey': env.SUPABASE_SECRET_KEY, 'Authorization': `Bearer ${env.SUPABASE_SECRET_KEY}`, 'Content-Type': 'application/json' } }
function sbReturn(env) { return { ...sbHeaders(env), 'Prefer': 'return=representation' } }

export async function onRequestGet(context) {
  const { env } = context
  try {
    const res = await fetch(
      `${SUPABASE}/daily_checkin?select=*&order=date.desc&limit=14`,
      { headers: sbHeaders(env) }
    )
    if (!res.ok) return json(500, { error: `supabase [${res.status}]` })
    const rows = await res.json()
    return json(200, { records: Array.isArray(rows) ? rows : [] })
  } catch (e) { return json(500, { error: e.message }) }
}

export async function onRequestPost(context) {
  const { request, env } = context
  try {
    const body = await request.json()
    const date = String(body.date || '')
    if (!date) return json(400, { error: 'date required (YYYY-MM-DD)' })
    const record = {
      date,
      breakfast: String(body.breakfast || ''),
      lunch: String(body.lunch || ''),
      dinner: String(body.dinner || ''),
      wake_time: String(body.wake_time || ''),
      sleep_time: String(body.sleep_time || ''),
      note: String(body.note || ''),
    }
    const res = await fetch(`${SUPABASE}/daily_checkin`, {
      method: 'POST',
      headers: { ...sbReturn(env), 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify(record),
    })
    if (!res.ok) return json(500, { error: `supabase [${res.status}]: ${(await res.text()).slice(0, 200)}` })
    const rows = await res.json()
    return json(200, { record: Array.isArray(rows) ? rows[0] : null })
  } catch (e) { return json(500, { error: e.message }) }
}

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
}

export async function onRequestOptions() {
  return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } })
}
