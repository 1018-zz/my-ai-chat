// stream.js — 入口骨架：校验 → 建会话 → 存用户消息 → 注入会话摘要 → 调 DeepSeek → runStream
import { runStream } from './stream-run.js'

const SUPABASE = 'https://vktbawcubmdmkqzadmto.supabase.co/rest/v1'

function sbHeaders(env) { return { 'apikey': env.SUPABASE_SECRET_KEY, 'Authorization': `Bearer ${env.SUPABASE_SECRET_KEY}`, 'Content-Type': 'application/json' } }
function sbReturn(env) { return { ...sbHeaders(env), 'Prefer': 'return=representation' } }

export async function onRequestPost(context) {
  const { request, env } = context
  if (!env.DEEPSEEK_API_KEY) return json(500, { error: 'env: DEEPSEEK_API_KEY not set' })
  if (!env.SUPABASE_SECRET_KEY) return json(500, { error: 'env: SUPABASE_SECRET_KEY not set' })

  let body
  try { body = await request.json() } catch { return json(400, { error: 'invalid json' }) }

  const defaultTools = [
    { type: 'function', function: { name: 'list_files', description: '列出项目目录。在读取任何文件之前，先用这个确认路径。repo 参数通常可省略，默认就是我们自己的项目 my-ai-chat。', parameters: { type: 'object', properties: { path: { type: 'string', description: '目录路径，例如 src/' }, repo: { type: 'string', description: '仓库名。默认 my-ai-chat，可省略。只有读取后端仓库时才填 my-ai-chat-server' } } } } },
    { type: 'function', function: { name: 'read_file', description: '读取代码文件。先用 list_files 确认文件存在。repo 参数通常可省略，默认就是我们自己的项目 my-ai-chat。', parameters: { type: 'object', properties: { path: { type: 'string', description: '文件路径，例如 src/App.jsx' }, repo: { type: 'string', description: '仓库名。默认 my-ai-chat，可省略。只有读取后端仓库时才填 my-ai-chat-server' } }, required: ['path'] } } },
    { type: 'function', function: { name: 'write_file', description: '修改代码并提交。仅限自家仓库。', parameters: { type: 'object', properties: { path: { type: 'string', description: '文件路径，例如 src/App.jsx' }, content: { type: 'string', description: '文件的新内容' }, message: { type: 'string', description: '提交信息（commit message）' }, repo: { type: 'string', description: '仓库名。默认 my-ai-chat，可省略。只有修改后端仓库时才填 my-ai-chat-server' } }, required: ['path', 'content', 'message'] } } }
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

    // 注入会话摘要（压缩后的早期对话记录），拼到 system 消息末尾
    try {
      const sr = await fetch(`${SUPABASE}/conversation_summaries?conversation_id=eq.${convId}&select=summary`, { headers: sbHeaders(env) })
      const srows = await sr.json()
      const summary = (Array.isArray(srows) ? srows[0]?.summary : '') || ''
      if (summary) {
        const sysIdx = messages.findIndex(m => m.role === 'system')
        if (sysIdx >= 0) {
          messages = messages.map((m, i) => i === sysIdx ? { ...m, content: `${m.content}\n\n【会话摘要（更早对话的压缩记录，作为背景参考）】\n${summary.slice(0, 3000)}` } : m)
        }
      }
    } catch (_) {}

    const dsBody = { messages, model, temperature: 0.7, stream: true }
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
