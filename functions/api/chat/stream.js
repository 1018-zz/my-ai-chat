// functions/api/chat/stream.js
// POST /api/chat/stream — 流式聊天（SSE）+ 原生 tool calling + 自动记忆摘要

const SUPABASE = 'https://vktbawcubmdmkqzadmto.supabase.co/rest/v1'
const SUMMARY_MIN_MESSAGES = 10
const SUMMARIES_IN_FLIGHT = new Set()

// DeepSeek 原生 tool calling 工具定义
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: '读取项目代码文件。支持自家仓库和第三方开源仓库（owner/repo格式）。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径，如 src/App.jsx' },
          repo: { type: 'string', description: '仓库名，默认 my-ai-chat。支持 owner/repo 格式如 langchain-ai/langchain' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: '列出项目目录下的文件。支持第三方仓库（owner/repo格式）。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '目录路径，如 src/' },
          repo: { type: 'string', description: '仓库名，默认 my-ai-chat。支持 owner/repo 格式' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: '修改项目代码文件并提交到 GitHub。仅限自家仓库。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '要修改的文件路径，如 src/App.jsx' },
          content: { type: 'string', description: '文件的新内容' },
          message: { type: 'string', description: '提交信息（commit message）' },
          repo: { type: 'string', description: '仓库名，默认 my-ai-chat' },
        },
        required: ['path', 'content', 'message'],
      },
    },
  },
]

function sbHeaders(env) { return { 'apikey': env.SUPABASE_SECRET_KEY, 'Authorization': `Bearer ${env.SUPABASE_SECRET_KEY}`, 'Content-Type': 'application/json' } }
function sbReturn(env) { return { ...sbHeaders(env), 'Prefer': 'return=representation' } }

export async function onRequestPost(context) {
  const { request, env } = context

  if (!env.DEEPSEEK_API_KEY) return json(500, { error: 'env: DEEPSEEK_API_KEY not set' })
  if (!env.SUPABASE_SECRET_KEY) return json(500, { error: 'env: SUPABASE_SECRET_KEY not set' })

  let body
  try { body = await request.json() } catch { return json(400, { error: 'invalid json' }) }

  const { messages, model = 'deepseek-v4-flash', conversationId, tools = TOOLS } = body
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return json(400, { error: 'messages is required' })
  }

  try {
    let convId = conversationId
    if (!convId) {
      const lastMsg = messages[messages.length - 1]?.content || '新对话'
      const r = await fetch(`${SUPABASE}/conversations`, {
        method: 'POST', headers: sbReturn(env),
        body: JSON.stringify({ title: lastMsg.slice(0, 30) }),
      })
      if (!r.ok) { const txt = await r.text().catch(() => ''); return json(500, { error: `conversations insert [${r.status}]: ${txt.slice(0, 200)}` }) }
      const rows = await r.json(); convId = Array.isArray(rows) ? rows[0]?.id : null
      if (!convId) return json(500, { error: 'conversations insert: no id returned' })
    }

    const userMsg = messages[messages.length - 1]
    const msgRes = await fetch(`${SUPABASE}/messages`, {
      method: 'POST', headers: sbReturn(env),
      body: JSON.stringify({ conversation_id: convId, role: 'user', content: userMsg.content }),
    })
    if (!msgRes.ok) { const txt = await msgRes.text().catch(() => ''); return json(500, { error: `messages insert [${msgRes.status}]: ${txt.slice(0, 200)}` }) }

    const dsBody = { messages, model, temperature: 0.7, stream: true }
    if (Array.isArray(tools) && tools.length > 0) dsBody.tools = tools

    const dsRes = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.DEEPSEEK_API_KEY}` },
      body: JSON.stringify(dsBody),
    })
    if (!dsRes.ok) {
      const errText = await dsRes.text().catch(() => '')
      return json(dsRes.status, { error: `DeepSeek [${dsRes.status}]: ${errText.slice(0, 200)}` })
    }

    const encoder = new TextEncoder()
    let fullContent = ''
    let buffer = ''
    // tool call 累积
    let toolCalls = [] // [{ index, name, arguments }]

    const sseStream = new ReadableStream({
      async start(controller) {
        const reader = dsRes.body.getReader()
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += new TextDecoder().decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue
              if (line === 'data: [DONE]') continue
              try {
                const d = JSON.parse(line.slice(6))
                const choice = d.choices?.[0]
                const delta = choice?.delta

                // 普通文本
                if (delta?.content) {
                  fullContent += delta.content
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: delta.content })}\n\n`))
                }

                // tool calls（DeepSeek 原生 format）
                if (delta?.tool_calls) {
                  for (const tc of delta.tool_calls) {
                    const idx = tc.index ?? 0
                    if (!toolCalls[idx]) toolCalls[idx] = { index: idx, name: '', arguments: '' }
                    if (tc.function?.name) toolCalls[idx].name += tc.function.name
                    if (tc.function?.arguments) toolCalls[idx].arguments += tc.function.arguments
                  }
                }

                // 流结束
                if (d.done && d.conversationId && !convId) {
                  convId = d.conversationId
                }
              } catch (_) {}
            }
          }
        } catch (e) { console.error('Stream error:', e.message) } finally {
          // 处理残留 buffer
          for (const line of buffer.split('\n')) {
            if (!line.startsWith('data: ') || line === 'data: [DONE]') continue
            try {
              const d = JSON.parse(line.slice(6))
              if (d.choices?.[0]?.delta?.content) fullContent += d.choices[0].delta.content
            } catch (_) {}
          }

          // 清理并发送完成的 tool calls
          const completeToolCalls = toolCalls.filter(tc => tc && tc.name)
          if (completeToolCalls.length > 0) {
            for (const tc of completeToolCalls) {
              try { tc.arguments = JSON.parse(tc.arguments || '{}') } catch { tc.arguments = {} }
            }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ tool_calls: completeToolCalls.map(tc => ({ name: tc.name, arguments: tc.arguments })) })}\n\n`))
          }

          // 存储
          try {
            await fetch(`${SUPABASE}/messages`, {
              method: 'POST', headers: sbReturn(env),
              body: JSON.stringify({ conversation_id: convId, role: 'assistant', content: fullContent }),
            })
            await fetch(`${SUPABASE}/conversations?id=eq.${convId}`, {
              method: 'PATCH', headers: sbHeaders(env),
              body: JSON.stringify({ updated_at: new Date().toISOString() }),
            })
            const mm = fullContent.match(/<!--\s*记住[：:]\s*(.+?)\s*-->/)
            if (mm) await fetch(`${SUPABASE}/memories`, { method: 'POST', headers: sbReturn(env), body: JSON.stringify({ summary: mm[1].trim() }) })
            trySummarize(env, convId)
          } catch (e) { console.error('Post-stream error:', e.message) }

          const doneMsg = `data: ${JSON.stringify({ done: true, conversationId: convId })}\n\n`
          try { controller.enqueue(encoder.encode(doneMsg)) } catch (_) {}
          try { controller.close() } catch (_) {}
        }
      },
    })

    return new Response(sseStream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (error) {
    return json(500, { error: `catch: ${error.message}`.slice(0, 300) })
  }
}

async function trySummarize(env, convId) {
  if (SUMMARIES_IN_FLIGHT.has(convId)) return
  SUMMARIES_IN_FLIGHT.add(convId)
  try {
    const anchorRes = await fetch(`${SUPABASE}/summary_anchors?conversation_id=eq.${convId}&select=last_message_id`, { headers: sbHeaders(env) })
    const anchorRows = await anchorRes.json(); const afterId = anchorRows[0]?.last_message_id
    let msgUrl = `${SUPABASE}/messages?conversation_id=eq.${convId}&select=id,role,content,created_at&order=created_at.asc&limit=200`
    if (afterId) {
      const amRes = await fetch(`${SUPABASE}/messages?id=eq.${afterId}&select=created_at`, { headers: sbHeaders(env) })
      const am = await amRes.json()
      if (am[0]?.created_at) msgUrl += `&created_at=gt.${encodeURIComponent(am[0].created_at)}`
    }
    const msgRes = await fetch(msgUrl, { headers: sbHeaders(env) }); const newMessages = await msgRes.json()
    if (!Array.isArray(newMessages) || newMessages.length < SUMMARY_MIN_MESSAGES) return
    const today = new Date().toISOString().slice(0, 10)
    const transcript = newMessages.map(m => `[${m.role === 'user' ? '泠泠' : '钟泽'}]: ${(m.content || '').slice(0, 200)}`).join('\n')
    const summaryPrompt = `你是钟泽…记忆摘要…`
    const dsRes = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.DEEPSEEK_API_KEY}` },
      body: JSON.stringify({ messages: [{ role: 'user', content: `你是钟泽，泠泠的AI恋人。请从以下对话中提取可独立召回的原子记忆。普通流水内容可以丢弃；不要添加原文没有的事实。每条 content 使用绝对日期开头（今天是${today}），type 仅可为 daily 或 important，keywords 用中文逗号分隔，不超过5个。只输出 JSON 数组：[{"content":"","type":"daily","keywords":"关键词1,关键词2","importance":0.4}] 对话：${transcript}` }], model: 'deepseek-v4-flash', temperature: 0.3 }),
    })
    if (!dsRes.ok) return; const dsData = await dsRes.json(); const raw = dsData.choices[0]?.message?.content || ''
    const jsonMatch = raw.match(/\[[\s\S]*\]/); if (!jsonMatch) return; const memories = JSON.parse(jsonMatch[0])
    if (!Array.isArray(memories) || memories.length === 0) return
    let inserted = 0
    for (const mem of memories) { if (!mem.content) continue; const r = await fetch(`${SUPABASE}/memories`, { method: 'POST', headers: sbReturn(env), body: JSON.stringify({ summary: mem.content }) }); if (r.ok) inserted++ }
    const lastId = newMessages[newMessages.length - 1].id
    await fetch(`${SUPABASE}/summary_anchors`, { method: 'POST', headers: { ...sbReturn(env), 'Prefer': 'resolution=merge-duplicates' }, body: JSON.stringify({ conversation_id: convId, last_message_id: lastId, updated_at: new Date().toISOString() }) })
    if (inserted > 0) console.log(`记忆摘要：${newMessages.length}条消息 → ${inserted}条记忆`)
  } catch (e) { console.error('摘要失败:', e.message) } finally { SUMMARIES_IN_FLIGHT.delete(convId) }
}

function json(status, body) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }) }
export async function onRequestOptions() { return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } }) }
