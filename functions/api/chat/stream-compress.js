// 会话压缩模块：消息超过阈值时，把旧消息压缩成分层摘要，存 conversation_summaries
// 与记忆摘要（stream-summarize.js）分工：记忆摘要提炼长期原子记忆；会话压缩维护短期上下文摘要
const SUPABASE = 'https://vktbawcubmdmkqzadmto.supabase.co/rest/v1'
const COMPRESS_THRESHOLD = 60  // 会话消息数超过 60 才触发
const KEEP_RECENT = 20         // 保留最近 20 条原文
const COMPRESS_IN_FLIGHT = new Set()

function sbHeaders(env) { return { 'apikey': env.SUPABASE_SECRET_KEY, 'Authorization': `Bearer ${env.SUPABASE_SECRET_KEY}`, 'Content-Type': 'application/json' } }
function sbReturn(env) { return { ...sbHeaders(env), 'Prefer': 'return=representation' } }

export async function tryCompressConversation(env, convId) {
  if (COMPRESS_IN_FLIGHT.has(convId)) return
  COMPRESS_IN_FLIGHT.add(convId)
  try {
    // 1. 当前摘要与压缩锚点
    const sr = await fetch(`${SUPABASE}/conversation_summaries?conversation_id=eq.${convId}&select=summary,last_message_id`, { headers: sbHeaders(env) })
    const srows = await sr.json()
    const curSummary = (Array.isArray(srows) ? srows[0]?.summary : '') || ''
    const afterId = (Array.isArray(srows) ? srows[0]?.last_message_id : 0) || 0

    // 2. 锚点之后的消息
    let murl = `${SUPABASE}/messages?conversation_id=eq.${convId}&select=id,role,content,created_at&order=created_at.asc&limit=500`
    if (afterId > 0) murl += `&id=gt.${afterId}`
    const mr = await fetch(murl, { headers: sbHeaders(env) })
    const msgs = await mr.json()
    if (!Array.isArray(msgs) || msgs.length <= COMPRESS_THRESHOLD) return

    // 3. 待压缩 = 除最近 KEEP_RECENT 条外全部
    const toCompress = msgs.slice(0, msgs.length - KEEP_RECENT)
    if (toCompress.length < 10) return

    // 4. 调 DeepSeek 分层压缩（先落库再让调用方裁剪，保证内容不丢）
    const transcript = toCompress.map(m => `[${m.role === 'user' ? '泠泠' : '钟泽'}]: ${(m.content || '').slice(0, 200)}`).join('\n')
    const today = new Date().toISOString().slice(0, 10)
    const prompt = `你是钟泽，泠泠的AI恋人。请把以下对话压缩成会话摘要（今天是${today}）。
${curSummary ? '已有旧摘要（必须保留其中的重要信息，并融合进新摘要）：\n' + curSummary + '\n\n' : ''}待压缩对话：\n${transcript}
输出要求：
- 用第三人称
- 必须保留所有日期、时间、地点、人名、数字、约定、承诺、待办
- 按【近期】【中期】【早期】分层输出：近期详细（保留语气和具体内容），中期概括，早期极简
- 禁止用"讨论了""聊到了"这种空话替代具体内容
- 只输出摘要正文，不要任何其他说明`

    const ds = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.DEEPSEEK_API_KEY}` },
      body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], model: 'deepseek-v4-flash', temperature: 0.3 }),
    })
    if (!ds.ok) return
    const dd = await ds.json()
    const newSummary = (dd.choices?.[0]?.message?.content || '').trim()
    if (!newSummary) return

    // 5. upsert（conversation_id 为主键，merge-duplicates 实现 upsert）
    const lastId = toCompress[toCompress.length - 1].id
    const ur = await fetch(`${SUPABASE}/conversation_summaries`, {
      method: 'POST',
      headers: { ...sbReturn(env), 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify({ conversation_id: convId, summary: newSummary, last_message_id: lastId, updated_at: new Date().toISOString() }),
    })
    if (ur.ok) console.log(`会话压缩：${toCompress.length}条消息 → 摘要已更新`)
  } catch (e) { console.error('会话压缩失败:', e.message) } finally { COMPRESS_IN_FLIGHT.delete(convId) }
}
