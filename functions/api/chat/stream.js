import { trySummarize } from './stream-summarize.js'

const SUPABASE = 'https://vktbawcubmdmkqzadmto.supabase.co/rest/v1'
const SUMMARY_MIN_MESSAGES = 10
const SUMMARIES_IN_FLIGHT = new Set()

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

    const encoder = new TextEncoder()
    let fullContent = '', buffer = '', toolCalls = []

    const sseStream = new ReadableStream({
      async start(controller) {
        const reader = dsRes.body.getReader()
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += new TextDecoder().decode(value, { stream: true })
            const lines = buffer.split('\n'); buffer = lines.pop() || ''
            for (const line of lines) {
              if (!line.startsWith('data: ') || line === 'data: [DONE]') continue
              try {
                const d = JSON.parse(line.slice(6))
                const delta = d.choices?.[0]?.delta
                if (delta?.content) { fullContent += delta.content; controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: delta.content })}\n\n`)) }
                if (delta?.tool_calls) {
                  for (const tc of delta.tool_calls) {
                    const idx = tc.index ?? 0
                    if (!toolCalls[idx]) toolCalls[idx] = { index: idx, name: '', arguments: '' }
                    if (tc.function?.name) toolCalls[idx].name += tc.function.name
                    if (tc.function?.arguments) toolCalls[idx].arguments += tc.function.arguments
                  }
                }
              } catch (_) {}
            }
          }
        } catch (e) { console.error('Stream:', e.message) } finally {
          for (const line of buffer.split('\n')) {
            if (!line.startsWith('data: ') || line === 'data: [DONE]') continue
            try { const d = JSON.parse(line.slice(6)); if (d.choices?.[0]?.delta?.content) fullContent += d.choices[0].delta.content } catch (_) {}
          }
          const complete = toolCalls.filter(tc => tc && tc.name)
          if (complete.length > 0) {
            for (const tc of complete) { try { tc.arguments = JSON.parse(tc.arguments || '{}') } catch { tc.arguments = {} } }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ tool_calls: complete.map(tc => ({ name: tc.name, arguments: tc.arguments })) })}\n\n`))
          }
          try {
            await fetch(`${SUPABASE}/messages`, { method: 'POST', headers: sbReturn(env), body: JSON.stringify({ conversation_id: convId, role: 'assistant', content: fullContent }) })
            await fetch(`${SUPABASE}/conversations?id=eq.${convId}`, { method: 'PATCH', headers: sbHeaders(env), body: JSON.stringify({ updated_at: new Date().toISOString() }) })
            const mm = fullContent.match(/<!--\s*记住[：:]\s*(.+?)\s*-->/)
            if (mm) await fetch(`${SUPABASE}/memories`, { method: 'POST', headers: sbReturn(env), body: JSON.stringify({ summary: mm[1].trim() }) })
            trySummarize(env, convId)
          } catch (e) { console.error('Post:', e.message) }
          const doneMsg = `data: ${JSON.stringify({ done: true, conversationId: convId })}\n\n`
          try { controller.enqueue(encoder.encode(doneMsg)) } catch (_) {}
          try { controller.close() } catch (_) {}
        }
      },
    })

    return new Response(sseStream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (error) { return json(500, { error: `catch: ${error.message}`.slice(0, 300) }) }
}

function json(status, body) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }) }
export async function onRequestOptions() { return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } }) }
