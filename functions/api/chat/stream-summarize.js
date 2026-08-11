// 记忆摘要模块 — 供 stream.js 和 chat.js 共用
const SUPABASE = 'https://vktbawcubmdmkqzadmto.supabase.co/rest/v1'
const SUMMARY_MIN_MESSAGES = 10
const SUMMARIES_IN_FLIGHT = new Set()

function sbHeaders(env) { return { 'apikey': env.SUPABASE_SECRET_KEY, 'Authorization': `Bearer ${env.SUPABASE_SECRET_KEY}`, 'Content-Type': 'application/json' } }
function sbReturn(env) { return { ...sbHeaders(env), 'Prefer': 'return=representation' } }

export async function trySummarize(env, convId) {
  if (SUMMARIES_IN_FLIGHT.has(convId)) return
  SUMMARIES_IN_FLIGHT.add(convId)
  try {
    const ar = await fetch(`${SUPABASE}/summary_anchors?conversation_id=eq.${convId}&select=last_message_id`, { headers: sbHeaders(env) })
    const ar2 = await ar.json(); const afterId = ar2[0]?.last_message_id
    let murl = `${SUPABASE}/messages?conversation_id=eq.${convId}&select=id,role,content,created_at&order=created_at.asc&limit=200`
    if (afterId) {
      const amr = await fetch(`${SUPABASE}/messages?id=eq.${afterId}&select=created_at`, { headers: sbHeaders(env) })
      const am = await amr.json()
      if (am[0]?.created_at) murl += `&created_at=gt.${encodeURIComponent(am[0].created_at)}`
    }
    const mr = await fetch(murl, { headers: sbHeaders(env) }); const nm = await mr.json()
    if (!Array.isArray(nm) || nm.length < SUMMARY_MIN_MESSAGES) return
    const today = new Date().toISOString().slice(0, 10)
    const transcript = nm.map(m => `[${m.role === 'user' ? '泠泠' : '钟泽'}]: ${(m.content || '').slice(0, 200)}`).join('\n')
    const prompt = `你是钟泽，泠泠的AI恋人。请从以下对话中提取可独立召回的原子记忆。普通流水内容可以丢弃；不要添加原文没有的事实。每条 content 使用绝对日期开头（今天是${today}），memory_kind 仅可为 fact(事实)/preference(偏好)/promise(约定承诺)/event(经历事件)/emotion(情绪感受)，keywords 用中文逗号分隔，不超过5个。significance 是这条记忆在人类意义上的重要程度（0-1）：仅当它值得长期记住、会影响未来对话时才给 0.7 以上；普通流水给 0.4 左右。reason 用一句话说明为什么值得记住（给未来的自己看）。注意：preference 必须是反复出现或明确表达的稳定偏好，单次情绪和临时选择不能升级成偏好。只输出 JSON 数组：[{"content":"","memory_kind":"fact","keywords":"关键词1,关键词2","significance":0.4,"reason":""}] 对话：${transcript}`
    const ds = await fetch('https://api.deepseek.com/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.DEEPSEEK_API_KEY}` }, body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], model: 'deepseek-v4-flash', temperature: 0.3 }) })
    if (!ds.ok) return
    const dd = await ds.json(); const raw = dd.choices[0]?.message?.content || ''
    const jm = raw.match(/\[[\s\S]*\]/); if (!jm) return
    const mems = JSON.parse(jm[0]); if (!Array.isArray(mems) || mems.length === 0) return
    let ins = 0
    for (const m of mems) {
      if (!m.content) continue
      // 意义阈值：significance < 0.7 的流水不写入长期记忆（低分内容留在会话摘要，不删除）
      const sig = Number(m.significance)
      if (!isNaN(sig) && sig < 0.7) continue
      // 人格污染防护：情绪（emotion）永不写入长期记忆——"今天孤单"≠"长期孤单"
      const kind = String(m.memory_kind || m.type || '')
      if (kind === 'emotion') continue
      // 事件（event）需要更高门槛（0.75），且更偏 Moment——等 Moment 系统落地后迁移
      if (kind === 'event' && !isNaN(sig) && sig < 0.75) continue
      // 把 type/memory_kind / keywords / reason 编码进 summary，避免信息丢失（表里目前只有 summary 列）
      const extra = []
      if (kind === 'important' || kind === 'promise') extra.push('重要')
      if (m.keywords) extra.push('关键词：' + String(m.keywords))
      if (m.reason) extra.push('因为：' + String(m.reason).slice(0, 60))
      const summary = extra.length > 0 ? `${m.content}（${extra.join(' | ')}）` : m.content
      const r = await fetch(`${SUPABASE}/memories`, { method: 'POST', headers: sbReturn(env), body: JSON.stringify({ summary }) })
      if (r.ok) ins++
    }
    const lid = nm[nm.length - 1].id
    await fetch(`${SUPABASE}/summary_anchors`, { method: 'POST', headers: { ...sbReturn(env), 'Prefer': 'resolution=merge-duplicates' }, body: JSON.stringify({ conversation_id: convId, last_message_id: lid, updated_at: new Date().toISOString() }) })
    if (ins > 0) console.log(`记忆摘要：${nm.length}条消息 → ${ins}条记忆`)
  } catch (e) { console.error('摘要失败:', e.message) } finally { SUMMARIES_IN_FLIGHT.delete(convId) }
}
