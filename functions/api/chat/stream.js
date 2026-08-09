// functions/api/chat/stream.js
// POST /api/chat/stream — 流式聊天（SSE）+ 自动记忆摘要
// 使用 fetch 直调 Supabase REST API

const SUPABASE = 'https://vktbawcubmdmkqzadmto.supabase.co/rest/v1'
const SUMMARY_MIN_MESSAGES = 10
const SUMMARIES_IN_FLIGHT = new Set()

function sbHeaders(env) {
  return {
    'apikey': env.SUPABASE_SECRET_KEY,
    'Authorization': `Bearer ${env.SUPABASE_SECRET_KEY}`,
    'Content-Type': 'application/json',
  }
}
function sbReturn(env) {
  return { ...sbHeaders(env), 'Prefer': 'return=representation' }
}

export async function onRequestPost(context) {
  const { request, env } = context

  let body
  try { body = await request.json() } catch { return json(400, { error: 'invalid json' }) }

  const { messages, model = 'deepseek-v4-flash', conversationId } = body
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return json(400, { error: 'messages is required' })
  }

  try {
    // 1. 解析 / 创建会话
    let convId = conversationId
    if (!convId) {
      const lastMsg = messages[messages.length - 1]?.content || '新对话'
      const r = await fetch(`${SUPABASE}/conversations`, {
        method: 'POST',
        headers: sbReturn(env),
        body: JSON.stringify({ title: lastMsg.slice(0, 30) }),
      })
      if (!r.ok) return json(500, { error: 'failed to create conversation' })
      const rows = await r.json()
      convId = rows[0]?.id
      if (!convId) return json(500, { error: 'failed to create conversation' })
    }

    // 2. 存储用户消息
    const userMsg = messages[messages.length - 1]
    await fetch(`${SUPABASE}/messages`, {
      method: 'POST',
      headers: sbReturn(env),
      body: JSON.stringify({
        conversation_id: convId,
        role: 'user',
        content: userMsg.content,
      }),
    })

    // 3. 调用 DeepSeek 流式 API
    const dsRes = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({ messages, model, temperature: 0.7, stream: true }),
    })
    if (!dsRes.ok) {
      const errText = await dsRes.text().catch(() => '')
      return json(dsRes.status, { error: `DeepSeek: ${errText.slice(0, 200)}` })
    }

    // 4. SSE 流 — 转发 + 收集
    const encoder = new TextEncoder()
    let fullContent = ''

    const sseStream = new ReadableStream({
      async start(controller) {
        const reader = dsRes.body.getReader()
        const decoder = new TextDecoder()
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            controller.enqueue(value)
            const text = decoder.decode(value, { stream: true })
            for (const line of text.split('\n')) {
              if (!line.startsWith('data: ')) continue
              try {
                const d = JSON.parse(line.slice(6))
                if (d.choices?.[0]?.delta?.content) fullContent += d.choices[0].delta.content
              } catch (_) {}
            }
          }
        } catch (e) {
          console.error('Stream error:', e.message)
        } finally {
          try {
            // 5. 存储 AI 消息
            await fetch(`${SUPABASE}/messages`, {
              method: 'POST',
              headers: sbReturn(env),
              body: JSON.stringify({ conversation_id: convId, role: 'assistant', content: fullContent }),
            })
            // 更新会话时间
            await fetch(`${SUPABASE}/conversations?id=eq.${convId}`, {
              method: 'PATCH',
              headers: sbHeaders(env),
              body: JSON.stringify({ updated_at: new Date().toISOString() }),
            })

            // 手动记忆标记
            const mm = fullContent.match(/<!--\s*记住[：:]\s*(.+?)\s*-->/)
            if (mm) {
              await fetch(`${SUPABASE}/memories`, {
                method: 'POST',
                headers: sbReturn(env),
                body: JSON.stringify({ summary: mm[1].trim() }),
              })
            }

            // 异步摘要
            trySummarize(env, convId)
          } catch (e) { console.error('Post-stream error:', e.message) }

          const doneMsg = `data: ${JSON.stringify({ done: true, conversationId: convId })}\n\n`
          try { controller.enqueue(encoder.encode(doneMsg)) } catch (_) {}
          try { controller.close() } catch (_) {}
        }
      },
    })

    return new Response(sseStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (error) {
    console.error('Stream Error:', error.message)
    return json(500, { error: error.message })
  }
}

// ==================== 自动记忆摘要 ====================

async function trySummarize(env, convId) {
  if (SUMMARIES_IN_FLIGHT.has(convId)) return
  SUMMARIES_IN_FLIGHT.add(convId)
  try {
    // 锚点
    const anchorRes = await fetch(
      `${SUPABASE}/summary_anchors?conversation_id=eq.${convId}&select=last_message_id`,
      { headers: sbHeaders(env) }
    )
    const anchorRows = await anchorRes.json()
    const afterId = anchorRows[0]?.last_message_id

    // 新消息
    let msgUrl = `${SUPABASE}/messages?conversation_id=eq.${convId}&select=id,role,content,created_at&order=created_at.asc&limit=200`
    if (afterId) {
      const anchorMsgRes = await fetch(
        `${SUPABASE}/messages?id=eq.${afterId}&select=created_at`,
        { headers: sbHeaders(env) }
      )
      const am = await anchorMsgRes.json()
      if (am[0]?.created_at) {
        msgUrl += `&created_at=gt.${encodeURIComponent(am[0].created_at)}`
      }
    }

    const msgRes = await fetch(msgUrl, { headers: sbHeaders(env) })
    const newMessages = await msgRes.json()
    if (!Array.isArray(newMessages) || newMessages.length < SUMMARY_MIN_MESSAGES) return

    // 构建提示词
    const today = new Date().toISOString().slice(0, 10)
    const transcript = newMessages.map(m =>
      `[${m.role === 'user' ? '泠泠' : '钟泽'}]: ${(m.content || '').slice(0, 200)}`
    ).join('\n')

    const summaryPrompt = `你是钟泽，泠泠的AI恋人。请从以下对话中提取可独立召回的原子记忆。
普通流水内容可以丢弃；不要添加原文没有的事实。
每条 content 使用绝对日期开头（今天是${today}），type 仅可为 daily 或 important，keywords 用中文逗号分隔，不超过5个。
只输出 JSON 数组：
[{"content":"","type":"daily","keywords":"关键词1,关键词2","importance":0.4}]

对话：
${transcript}`

    const dsRes = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: summaryPrompt }],
        model: 'deepseek-v4-flash',
        temperature: 0.3,
      }),
    })
    if (!dsRes.ok) return
    const dsData = await dsRes.json()
    const raw = dsData.choices[0]?.message?.content || ''
    const jsonMatch = raw.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return
    const memories = JSON.parse(jsonMatch[0])
    if (!Array.isArray(memories) || memories.length === 0) return

    let inserted = 0
    for (const mem of memories) {
      if (!mem.content) continue
      const r = await fetch(`${SUPABASE}/memories`, {
        method: 'POST',
        headers: sbReturn(env),
        body: JSON.stringify({ summary: mem.content }),
      })
      if (r.ok) inserted++
    }

    // 更新锚点
    const lastId = newMessages[newMessages.length - 1].id
    await fetch(`${SUPABASE}/summary_anchors`, {
      method: 'POST',
      headers: { ...sbReturn(env), 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify({
        conversation_id: convId,
        last_message_id: lastId,
        updated_at: new Date().toISOString(),
      }),
    })

    if (inserted > 0) console.log(`记忆摘要：${newMessages.length}条消息 → ${inserted}条记忆`)
  } catch (e) {
    console.error('记忆摘要失败:', e.message)
  } finally {
    SUMMARIES_IN_FLIGHT.delete(convId)
  }
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}
