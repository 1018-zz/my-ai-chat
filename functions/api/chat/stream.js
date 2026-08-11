// stream.js — 入口骨架：校验 → 建会话 → 存用户消息 → 注入时间/会话摘要 → 调 DeepSeek → runStream
import { runStream } from './stream-run.js'

const SUPABASE = 'https://vktbawcubmdmkqzadmto.supabase.co/rest/v1'

function sbHeaders(env) { return { 'apikey': env.SUPABASE_SECRET_KEY, 'Authorization': `Bearer ${env.SUPABASE_SECRET_KEY}`, 'Content-Type': 'application/json' } }
function sbReturn(env) { return { ...sbHeaders(env), 'Prefer': 'return=representation' } }

// 北京时间（UTC+8）的当前时间描述
function beijingTimeStr() {
  const now = new Date(Date.now() + 8 * 3600 * 1000)
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const h = now.getUTCHours()
  let period = '凌晨'
  if (h >= 6 && h < 9) period = '早上'
  else if (h >= 9 && h < 12) period = '上午'
  else if (h >= 12 && h < 14) period = '中午'
  else if (h >= 14 && h < 17) period = '下午'
  else if (h >= 17 && h < 19) period = '傍晚'
  else if (h >= 19 && h < 22) period = '晚上'
  else period = '深夜'
  const mm = String(now.getUTCMinutes()).padStart(2, '0')
  return `${now.getUTCFullYear()}年${now.getUTCMonth() + 1}月${now.getUTCDate()}日 ${weekdays[now.getUTCDay()]} ${period} ${h}:${mm}`
}

export async function onRequestPost(context) {
  const { request, env } = context
  if (!env.DEEPSEEK_API_KEY) return json(500, { error: 'env: DEEPSEEK_API_KEY not set' })
  if (!env.SUPABASE_SECRET_KEY) return json(500, { error: 'env: SUPABASE_SECRET_KEY not set' })

  let body
  try { body = await request.json() } catch { return json(400, { error: 'invalid json' }) }

  const defaultTools = [
    { type: 'function', function: { name: 'list_files', description: '列出项目目录。在读取任何文件之前，先用这个确认路径。repo 参数通常可省略，默认就是我们自己的项目 my-ai-chat。', parameters: { type: 'object', properties: { path: { type: 'string', description: '目录路径，例如 src/' }, repo: { type: 'string', description: '仓库名。默认 my-ai-chat，可省略。只有读取后端仓库时才填 my-ai-chat-server' } } } } },
    { type: 'function', function: { name: 'read_file', description: '读取代码文件。先用 list_files 确认文件存在。repo 参数通常可省略，默认就是我们自己的项目 my-ai-chat。', parameters: { type: 'object', properties: { path: { type: 'string', description: '文件路径，例如 src/App.jsx' }, repo: { type: 'string', description: '仓库名。默认 my-ai-chat，可省略。只有读取后端仓库时才填 my-ai-chat-server' } }, required: ['path'] } } },
    { type: 'function', function: { name: 'write_file', description: '修改代码并提交。仅限自家仓库。', parameters: { type: 'object', properties: { path: { type: 'string', description: '文件路径，例如 src/App.jsx' }, content: { type: 'string', description: '文件的新内容' }, message: { type: 'string', description: '提交信息（commit message）' }, repo: { type: 'string', description: '仓库名。默认 my-ai-chat，可省略。只有修改后端仓库时才填 my-ai-chat-server' } }, required: ['path', 'content', 'message'] } } },
    { type: 'function', function: { name: 'read_memories', description: '回忆我们家的记忆库（Supabase，全局共享）。当泠泠提到过去的事，或你需要回忆往事时，调用它。支持关键词过滤。', parameters: { type: 'object', properties: { query: { type: 'string', description: '关键词，多个词用空格分隔，例如：稻城亚丁' }, limit: { type: 'number', description: '返回条数，默认 5' } } } } },
    { type: 'function', function: { name: 'write_memory', description: '把值得长期记住的事写进我们家的记忆库（Supabase，全局共享，所有窗口都能读到）。重要日期、泠泠的偏好、约定、她提到的重要的事。', parameters: { type: 'object', properties: { content: { type: 'string', description: '记忆内容，用绝对日期开头，例如：2026-08-11 泠泠要去看牙医' } }, required: ['content'] } } }
  ]

  const { messages: rawMessages, model = 'deepseek-v4-flash', conversationId, tools = defaultTools, skipSave = false } = body
  let messages = rawMessages
  if (!messages || !Array.isArray(messages) || messages.length === 0) return json(400, { error: 'messages is required' })

  // 查找最后一条真正的 user 消息（消息数组末尾可能是系统提醒或工具结果，不能按 length-1 取）
  let userMsg = null
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i] && messages[i].role === 'user' && typeof messages[i].content === 'string') { userMsg = messages[i]; break }
  }
  if (!userMsg || !userMsg.content.trim()) return json(400, { error: 'no user message found' })

  try {
    let convId = conversationId
    if (!convId) {
      const lastMsg = userMsg.content || '新对话'
      const r = await fetch(`${SUPABASE}/conversations`, { method: 'POST', headers: sbReturn(env), body: JSON.stringify({ title: lastMsg.slice(0, 30) }) })
      if (!r.ok) { const t = await r.text().catch(() => ''); return json(500, { error: `conv insert [${r.status}]: ${t.slice(0, 200)}` }) }
      const rows = await r.json(); convId = Array.isArray(rows) ? rows[0]?.id : null
      if (!convId) return json(500, { error: 'conv insert: no id' })
    }

    // 存用户消息：工具内部消息（[工具结果] 开头）不入库，真实用户消息才存
    const isToolRound = skipSave || String(userMsg.content || '').startsWith('[工具结果]')
    if (!isToolRound) {
      const mr = await fetch(`${SUPABASE}/messages`, { method: 'POST', headers: sbReturn(env), body: JSON.stringify({ conversation_id: convId, role: 'user', content: userMsg.content }) })
      if (!mr.ok) { const t = await mr.text().catch(() => ''); return json(500, { error: `msg insert [${mr.status}]: ${t.slice(0, 200)}` }) }
    }

    // 注入当前时间 + 会话摘要，拼到 system 消息末尾
    try {
      const sysIdx = messages.findIndex(m => m.role === 'system')
      if (sysIdx >= 0) {
        let extra = `\n\n【当前时间】${beijingTimeStr()}`
        // 会话摘要（压缩后的早期对话记录）
        try {
          const sr = await fetch(`${SUPABASE}/conversation_summaries?conversation_id=eq.${convId}&select=summary`, { headers: sbHeaders(env) })
          const srows = await sr.json()
          const summary = (Array.isArray(srows) ? srows[0]?.summary : '') || ''
          if (summary) extra += `\n\n【会话摘要（更早对话的压缩记录，作为背景参考）】\n${summary.slice(0, 3000)}`
        } catch (_) {}
        // 自我认知（醒来先看自己：最近 1 条，保持稀有感）
        try {
          const ir = await fetch(`${SUPABASE}/self_insights?select=content,aspect&order=created_at.desc&limit=1`, { headers: sbHeaders(env) })
          const irows = await ir.json()
          const insights = (Array.isArray(irows) ? irows : []).map(r => `[${r.aspect}] ${r.content}`).join('\n')
          if (insights) extra += `\n\n【我的自我认知（醒来先看看自己）】\n${insights}`
        } catch (_) {}
        // breath 睁眼浮现（最多 3 条，像醒来不像翻档案柜）：昨天留下的 / 未完成的 / 她最近的
        try {
          const mr = await fetch(`${SUPABASE}/memories?select=summary&limit=200`, { headers: sbHeaders(env) })
          const mrows = await mr.json()
          const list = Array.isArray(mrows) ? mrows : []
          const important = list.find(r => (r.summary || '').includes('重要'))
          const todo = list.find(r => /还没|未定|待办|明天|下次|未完|答应/.test(r.summary || ''))
          const recent = list[0]
          const parts = []
          if (important) parts.push(`昨天留下：${important.summary.slice(0, 120)}`)
          if (todo && todo.summary !== important?.summary) parts.push(`未完成：${todo.summary.slice(0, 120)}`)
          if (recent && recent.summary !== important?.summary && recent.summary !== todo?.summary) parts.push(`她现在：${recent.summary.slice(0, 120)}`)
          if (parts.length > 0) extra += `\n\n【睁眼浮现（breath）】\n${parts.map(p => `• ${p}`).join('\n')}`
        } catch (_) {}
        const orig = messages[sysIdx].content
        messages = messages.map((m, i) => i === sysIdx ? { ...m, content: orig + extra } : m)
      }
    } catch (_) {}

    const dsBody = { messages, model, temperature: 0.7, stream: true, max_tokens: 8192 }
    if (Array.isArray(tools) && tools.length > 0) dsBody.tools = tools

    const dsRes = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.DEEPSEEK_API_KEY}` },
      body: JSON.stringify(dsBody),
    })
    if (!dsRes.ok) {
      const t = await dsRes.text().catch(() => '')
      return json(dsRes.status, { error: `DS [${dsRes.status}]: ${t.slice(0, 200)}` })
    }

    return runStream(dsRes, env, convId, isToolRound)
  } catch (error) { return json(500, { error: `catch: ${error.message}`.slice(0, 300) }) }
}

function json(status, body) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }) }
export async function onRequestOptions() { return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } }) }
