// functions/api/diaries/generate.js
// POST /api/diaries/generate — 生成钟泽（assistant）当天的日记
// 基于当天对话 + 最近记忆，用钟泽的口吻写日记；当天已有则不重复生成

import { buildDiaryPrompt } from '../../lib/prompts/diary.js'

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
      const raw = (Array.isArray(drows) && drows[0]?.content) ? drows[0].content : ''
      if (raw) userDiary = raw.length > 2000 ? raw.slice(0, 2000) + '\n（她今天的日记较长，以上为节选）' : raw
    } catch (_) {}

    // 取今天收下的纸条（碎片），与 write_diary compose 模式保持一致
    let fragments = ''
    try {
      const nr = await fetch(`${SUPABASE}/note_content?date=eq.${encodeURIComponent(date)}&or=(status.eq.pending,status.eq.saved)&order=id.asc&limit=30`, { headers: sbHeaders(env) })
      const nrows = await nr.json()
      const list = Array.isArray(nrows) ? nrows : []
      if (list.length) fragments = list.map(n => `（${n.source === 'user' ? '泠泠留' : '我留'}）${String(n.content || '').slice(0, 200)}`).join('\n')
    } catch (_) {}

    // 取最近记忆
    const memr = await fetch(`${SUPABASE}/memories?select=summary&order=id.desc&limit=3`, { headers: sbHeaders(env) })
    const mems = await memr.json()
    const memText = (Array.isArray(mems) ? mems : []).map(m => m.summary).join('\n')

    const prompt = buildDiaryPrompt({ date, transcript, fragments, userDiary, memText })

    const ds = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.DEEPSEEK_API_KEY}` },
      body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], model: 'deepseek-v4-flash', temperature: 0.8 }),
    })
    if (!ds.ok) return json(500, { error: `ds [${ds.status}]` })
    const dd = await ds.json()
    const content = (dd.choices?.[0]?.message?.content || '').trim()
    // 钟泽今天选择不写日记（prompt 约定输出【不写】）——不生成记录，保留稀缺感
    if (/^【?不写】?$/.test(content)) return json(200, { ok: true, skipped: true, reason: 'nothing_to_write' })
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
