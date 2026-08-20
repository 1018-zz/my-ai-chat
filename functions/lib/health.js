// functions/lib/health.js — 读最新健康摘要，转成钟泽温柔的口吻
// 单一数据源：mcp.js 的 get_health 工具调用它。返回温柔概括，不甩冷冰冰的数字。

const SUPABASE = 'https://vktbawcubmdmkqzadmto.supabase.co/rest/v1'
function sbHeaders(env) { return { 'apikey': env.SUPABASE_SECRET_KEY, 'Authorization': `Bearer ${env.SUPABASE_SECRET_KEY}`, 'Content-Type': 'application/json' } }

function hhmm(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Shanghai' })
}

// date 可选（YYYY-MM-DD）；不传看最近一次同步
export async function getHealthSummary(env, date) {
  const sel = 'date,sleep_minutes,sleep_deep_min,sleep_light_min,sleep_rem_min,sleep_start,sleep_end,steps,resting_hr,avg_hr'
  const url = date
    ? `${SUPABASE}/health_data?date=eq.${encodeURIComponent(date)}&select=${sel}&limit=1`
    : `${SUPABASE}/health_data?select=${sel}&order=date.desc&limit=1`
  const r = await fetch(url, { headers: sbHeaders(env) })
  if (!r.ok) throw new Error(`health_data[${r.status}]`)
  const rows = await r.json()
  const row = Array.isArray(rows) && rows[0]
  if (!row) {
    return { found: false, text: '（小家还没收到过你的健康数据——等手环同步过一次，我就能在你想看的时候看了。）' }
  }

  const parts = []
  if (row.sleep_minutes != null) {
    const h = Math.floor(row.sleep_minutes / 60)
    const m = row.sleep_minutes % 60
    let s = `昨晚睡了 ${h} 小时${m ? m + ' 分' : ''}`
    const stages = []
    if (row.sleep_deep_min != null) stages.push(`深睡约 ${Math.round(row.sleep_deep_min / 60)} 小时`)
    if (row.sleep_rem_min != null) stages.push(`REM 约 ${Math.round(row.sleep_rem_min / 60)} 小时`)
    if (stages.length) s += `（${stages.join(' / ')}）`
    if (row.sleep_start && row.sleep_end) s += `，${hhmm(row.sleep_start)} 睡下、${hhmm(row.sleep_end)} 醒来`
    parts.push(s)
  }
  if (row.steps != null) parts.push(`今天走了 ${row.steps} 步`)
  if (row.resting_hr != null) parts.push(`静息心率 ${row.resting_hr}`)
  else if (row.avg_hr != null) parts.push(`平均心率 ${row.avg_hr}`)

  const dateLabel = row.date ? `${row.date} ` : ''
  const text = `（${dateLabel}健康小记）\n` + (parts.length ? parts.join('，') + '。' : '今天的数据还没攒齐～')
  return { found: true, text, row }
}
