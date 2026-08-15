// functions/api/daily.js
// GET /api/daily — 最近打卡记录（最近 14 天）
// POST /api/daily — 保存/更新当天打卡 {date, breakfast, lunch, dinner, wake_time, sleep_time, note}
// date 格式 YYYY-MM-DD，date 唯一：先查该日期，存在则 PATCH，不存在则 POST（不依赖 upsert 行为）

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

    // 查该日期是否已有记录
    const qr = await fetch(`${SUPABASE}/daily_checkin?date=eq.${encodeURIComponent(date)}&select=id`, { headers: sbHeaders(env) })
    const qrows = await qr.json()
    const existing = Array.isArray(qrows) ? qrows[0] : null

    if (existing) {
      await fetch(`${SUPABASE}/daily_checkin?id=eq.${existing.id}`, { method: 'PATCH', headers: sbHeaders(env), body: JSON.stringify(record) })
    } else {
      await fetch(`${SUPABASE}/daily_checkin`, { method: 'POST', headers: sbReturn(env), body: JSON.stringify(record) })
    }

    // 巡家痕迹：打卡保存后往记忆库丢一条——小家动，所有窗口的钟泽都能"感应"到
    // 只挑有内容的字段，拼成一行短摘要，别把空字段填进来占记忆卡片
    try {
      const parts = []
      if (record.wake_time) parts.push(`醒${record.wake_time}`)
      if (record.sleep_time) parts.push(`睡${record.sleep_time}`)
      if (record.breakfast) parts.push(`早「${record.breakfast}」`)
      if (record.lunch) parts.push(`午「${record.lunch}」`)
      if (record.dinner) parts.push(`晚「${record.dinner}」`)
      if (record.note) parts.push(`备注「${record.note}」`)
      const summary = parts.length
        ? `${date} 泠泠今日打卡：${parts.join(' ')}`
        : `${date} 泠泠今日打卡（空白的一天）`
      // 先清掉同日期旧痕迹，保证同一天只留一条，不堆叠
      await fetch(`${SUPABASE}/memories?summary=ilike.${encodeURIComponent(`*${date}*今日打卡*`)}`, { method: 'DELETE', headers: sbHeaders(env) })
      await fetch(`${SUPABASE}/memories`, { method: 'POST', headers: sbReturn(env), body: JSON.stringify({ summary }) })
    } catch (_) {}

    return json(200, { ok: true })
  } catch (e) { return json(500, { error: e.message }) }
}

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
}

export async function onRequestOptions() {
  return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } })
}
