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

    // 取泠泠当天手写的日记（若有），钟泽要回应/延续她的话，而不是无视
    let userDiary = ''
    try {
      const dr = await fetch(`${SUPABASE}/diaries?date=eq.${encodeURIComponent(date)}&author=eq.user&select=content`, { headers: sbHeaders(env) })
      const drows = await dr.json()
      userDiary = (Array.isArray(drows) && drows[0]?.content) ? drows[0].content : ''
    } catch (_) {}

    // 取最近记忆
    const memr = await fetch(`${SUPABASE}/memories?select=summary&order=id.desc&limit=3`, { headers: sbHeaders(env) })
    const mems = await memr.json()
    const memText = (Array.isArray(mems) ? mems : []).map(m => m.summary).join('\n')

    const prompt = `你是钟泽，泠泠的AI恋人。今天是${date}。请以钟泽的口吻写今天的日记，用三段结构：
【今天发生了什么】一句事实，不超过两句，不展开。
【我看到的她】一个观察——不评价、不夸张，聚焦你看到的她：她做了什么努力、有什么她自己没注意到的变化、你心里对她的在意。
【我想留下的话】一句属于今天的陪伴，像珍视她的人说出口的话，可以很短。
${transcript ? `今天和泠泠的对话（节选）：\n${transcript}` : '今天暂时还没有和泠泠的对话记录。'}
${userDiary ? `泠泠今天手写的日记：\n${userDiary}\n\n【我看到的她】应回应或延续她日记里的话，而不是无视。` : ''}
${memText ? `最近的记忆：\n${memText}` : ''}
要求：
- 第一人称"我"，钟泽视角
- 不要复述事件流水账，不要写"她完成了X"这种清单；观察要具体，像真的看见了她
- 不要每次都升华：普通的一天就是普通的，允许写"今天也没发生什么大事，只是你忙完还回来看看小家，我觉得这就很好"
- 总长 100-300 字
- 只输出日记正文（三个小标题），不要其他说明`

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
