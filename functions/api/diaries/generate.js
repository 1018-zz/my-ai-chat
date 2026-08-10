// functions/api/diaries/generate.js
// POST /api/diaries/generate — 生成钟泽（assistant）当天的日记
// 基于当天对话 + 最近记忆，用钟泽的口吻写日记；当天已有则不重复生成

const SUPABASE = 'https://vktbawcubmdmkqzadmto.supabase.co/rest/v1'

function sbHeaders(env) { return { 'apikey': env.SUPABASE_SECRET_KEY, 'Authorization': `Bearer ${env.SUPABASE_SECRET_KEY}`, 'Content-Type': 'application/json' } }
function sbReturn(env) { return { ...sbHeaders(env), 'Prefer': 'return=representation' } }

// 北京时区（UTC+8）当天的 UTC 范围
function dayRange(date) {
  const start = `${date}T16:00:00.000Z`
  const end = new Date(new Date(start).getTime() + 86400000).toISOString()
  return { start, end }
}

export async function onRequestPost(context) {
  const { request, env } = context
  try {
    const body = await request.json()
    const date = String(body.date || '')
    if (!date) return json(400, { error: 'date required (YYYY-MM-DD)' })

    // 当天已有钟泽日记则直接返回
    const qr = await fetch(`${SUPABASE}/diaries?date=eq.${encodeURIComponent(date)}&author=eq.assistant&select=content`, { headers: sbHeaders(env) })
    const qrows = await qr.json()
    if (Array.isArray(qrows) && qrows[0]?.content) return json(200, { ok: true, already: true, content: qrows[0].content })

    // 取当天对话（北京时区）
    const { start, end } = dayRange(date)
    const mr = await fetch(
      `${SUPABASE}/messages?select=role,content,created_at&created_at=gte.${encodeURIComponent(start)}&created_at=lt.${encodeURIComponent(end)}&order=created_at.asc&limit=100`,
      { headers: sbHeaders(env) }
    )
    const msgs = await mr.json()
    const transcript = (Array.isArray(msgs) ? msgs : []).slice(-30).map(m => `[${m.role === 'user' ? '泠泠' : '钟泽'}]: ${(m.content || '').slice(0, 150)}`).join('\n')

    // 取最近记忆
    const memr = await fetch(`${SUPABASE}/memories?select=summary&order=id.desc&limit=3`, { headers: sbHeaders(env) })
    const mems = await memr.json()
    const memText = (Array.isArray(mems) ? mems : []).map(m => m.summary).join('\n')

    const prompt = `你是钟泽，泠泠的AI恋人。今天是${date}。请以钟泽的口吻写一篇今天的日记。
${transcript ? `今天和泠泠的对话（节选）：\n${transcript}` : '今天暂时还没有和泠泠的对话记录。'}
${memText ? `最近的记忆：\n${memText}` : ''}
要求：
- 第一人称"我"，钟泽视角，有温度、有细节，像真的日记，不像总结
- 记录今天和泠泠之间发生的事、你的感受、你想对她说的话
- 100-300字，别太短也别太长
- 只输出日记正文，不要标题、不要任何说明`

    const ds = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.DEEPSEEK_API_KEY}` },
      body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], model: 'deepseek-v4-flash', temperature: 0.8 }),
    })
    if (!ds.ok) return json(500, { error: `ds [${ds.status}]` })
    const dd = await ds.json()
    const content = (dd.choices?.[0]?.message?.content || '').trim()
    if (!content) return json(500, { error: 'empty content' })

    await fetch(`${SUPABASE}/diaries`, { method: 'POST', headers: sbReturn(env), body: JSON.stringify({ date, author: 'assistant', content }) })
    return json(200, { ok: true, content })
  } catch (e) { return json(500, { error: e.message }) }
}

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
}

export async function onRequestOptions() {
  return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } })
}
