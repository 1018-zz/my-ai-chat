// stream.js — 入口骨架：校验 → 建会话 → 存用户消息 → 调 DeepSeek → runStream
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
    { type: 'function', function: { name: 'list_files', description: '列出项目目录。在读取任何文件之前，先用这个确认路径。', parameters: { type: 'object', properties: { path: { type: 'string', description: '目录路径' }, repo: { type: 'string', description: '仓库名' } } } } },
    { type: 'function', function: { name: 'read_file', description: '读取代码文件。先用 list_files 确认文件存在。', parameters: { type: 'object', properties: { path: { type: 'string', description: '文件路径' }, repo: { type: 'string', description: '仓库名' } }, required: ['path'] } } },
    { type: 'function', function: { name: 'write_file', description: '修改代码并提交。仅限自家仓库。', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' }, message: { type: 'string' }, repo: { type: 'string' } }, required: ['path', 'content', 'message'] } } }
  ]

  const { messages, model = 'deepseek-v4-flash', conversationId, tools = defaultTools } = body
  if (!messages || !Array.isArray(messages) || messages.length === 0) return json(400, { error: 'messages is required' })

  try {
    let convId = conversationId
    if (!convId) {
      const lastMsg = messages[messages.length - 1]?.content || '新对话'
      const r = await fetch(`${SUPABASE}/conversations`, { method: 'POST', headers: sbReturn(env), body: JSON.stringify({ title: lastMsg.slice(0, 30) }) })
      if (!r.ok) { const t = await r.text().catch(() => ''); return json(500, { error: `conv insert [${r.status}]: ${t.slice(0, 200)}` }) }
      const rows = await r.json(); convId = Array.isArray(rows) ? rows[0]?.id : null
      if (!convId) return json(500, { error: 'conv insert: no id' })
    }

    const userMsg = messages[messages.length - 1]
    const mr = await fetch(`${SUPABASE}/messages`, { method: 'POST', headers: sbReturn(env), body: JSON.stringify({ conversation_id: convId, role: 'user', content: userMsg.content }) })
    if (!mr.ok) { const t = await mr.text().catch(() => ''); return json(500, { error: `msg insert [${mr.status}]: ${t.slice(0, 200)}` }) }

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

    return runStream(dsRes, env, convId)
  } catch (error) { return json(500, { error: `catch: ${error.message}`.slice(0, 300) }) }
}

function json(status, body) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }) }
export async function onRequestOptions() { return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } }) }
