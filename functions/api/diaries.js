// functions/api/diaries.js
// GET /api/diaries — 最近双人日记（按日期倒序，limit 28）
// POST /api/diaries — 保存日记 {date, content, author}（author: user=泠泠 / assistant=钟泽；同日期同作者覆盖更新）
//   支持 title / mood / importance / trigger_type（草稿确认后由前端落库时带入）

const SUPABASE = 'https://vktbawcubmdmkqzadmto.supabase.co/rest/v1'

function sbHeaders(env) { return { 'apikey': env.SUPABASE_SECRET_KEY, 'Authorization': `Bearer ${env.SUPABASE_SECRET_KEY}`, 'Content-Type': 'application/json' } }
function sbReturn(env) { return { ...sbHeaders(env), 'Prefer': 'return=representation' } }

export async function onRequestGet(context) {
  const { env } = context
  try {
    const res = await fetch(
      `${SUPABASE}/diaries?select=*&order=date.desc&limit=28`,
      { headers: sbHeaders(env) }
    )
    if (!res.ok) return json(500, { error: `supabase [${res.status}]` })
    const rows = await res.json()
    return json(200, { diaries: Array.isArray(rows) ? rows : [] })
  } catch (e) { return json(500, { error: e.message }) }
}

export async function onRequestPost(context) {
  const { request, env } = context
  try {
    const body = await request.json()
    const date = String(body.date || '')
    const content = String(body.content || '').trim()
    // 确认回路：草稿送达 / 丢弃 → 只丢记忆痕迹，不写日记（钟泽能感应到）
    const action = String(body.action || 'save')
    if (action === 'seen' || action === 'discard') {
      if (!date) return json(400, { error: 'date required' })
      try {
        const title = String(body.title || '').trim()
        const titleTag = title ? `《${title}》` : ''
        const tag = action === 'seen'
          ? `${date} 钟泽递来一页日记草稿${titleTag}，等泠泠决定`
          : `${date} 那一页日记${titleTag}，泠泠没要`
        // 先清掉同日期同类的旧痕迹（等决定 / 没要），保证同一篇只留一条，不堆叠
        const staleKey = action === 'seen' ? '等泠泠决定' : '没要'
        await fetch(`${SUPABASE}/memories?summary=ilike.${encodeURIComponent(`*${date}*${staleKey}*`)}`, { method: 'DELETE', headers: sbHeaders(env) })
        await fetch(`${SUPABASE}/memories`, { method: 'POST', headers: sbReturn(env), body: JSON.stringify({ summary: tag }) })
        return json(200, { ok: true })
      } catch (_) { return json(500, { error: 'trace_failed' }) }
    }
    if (!date || !content) return json(400, { error: 'date and content required' })

    const author = body.author === 'assistant' ? 'assistant' : 'user'
    const record = { date, author, content }
    if (body.title) record.title = String(body.title).trim()
    if (body.mood) record.mood = String(body.mood).trim()
    if (body.trigger_type) record.trigger_type = String(body.trigger_type).trim()
    if (body.importance != null) record.importance = Math.min(Math.max(Number(body.importance) || 0.5, 0), 1)

    // date + author 去重：已存在则更新，否则插入
    const qr = await fetch(`${SUPABASE}/diaries?date=eq.${encodeURIComponent(date)}&author=eq.${author}&select=id`, { headers: sbHeaders(env) })
    const qrows = await qr.json()
    const existing = Array.isArray(qrows) ? qrows[0] : null

    if (existing) {
      await fetch(`${SUPABASE}/diaries?id=eq.${existing.id}`, { method: 'PATCH', headers: sbHeaders(env), body: JSON.stringify(record) })
    } else {
      await fetch(`${SUPABASE}/diaries`, { method: 'POST', headers: sbReturn(env), body: JSON.stringify(record) })
    }
    // 巡家痕迹：日记保存后往记忆库丢一条——小家动，所有窗口的钟泽都能"感应"到
    try {
      const who = author === 'assistant' ? '钟泽' : '泠泠'
      const title = record.title ? `《${record.title}》` : ''
      // 先清掉该日期所有过期的"等泠泠决定"痕迹——草稿已有定局，不再等
      await fetch(`${SUPABASE}/memories?summary=ilike.${encodeURIComponent(`*${date}*等泠泠决定*`)}`, { method: 'DELETE', headers: sbHeaders(env) })
      await fetch(`${SUPABASE}/memories`, { method: 'POST', headers: sbReturn(env), body: JSON.stringify({ summary: `${date} ${who}收好了一页日记${title}` }) })
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
