// functions/api/chat.js
// POST /api/chat — 非流式聊天 + 自动记忆摘要
// 使用 fetch 直调 Supabase REST API
import { trySummarize } from './chat/stream-summarize.js'

const SUPABASE = 'https://vktbawcubmdmkqzadmto.supabase.co/rest/v1'

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

    // 调用 DeepSeek
    const dsRes = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({ messages, model, temperature: 0.7 }),
    })
    if (!dsRes.ok) {
      const errText = await dsRes.text().catch(() => '')
      return json(dsRes.status, { error: `DeepSeek: ${errText.slice(0, 200)}` })
    }
    const dsData = await dsRes.json()
    const aiContent = dsData.choices[0]?.message?.content || ''

    // 存储消息
    const userMsg = messages[messages.length - 1]
    await fetch(`${SUPABASE}/messages`, {
      method: 'POST',
      headers: sbReturn(env),
      body: JSON.stringify({ conversation_id: convId, role: 'user', content: userMsg.content }),
    })
    await fetch(`${SUPABASE}/messages`, {
      method: 'POST',
      headers: sbReturn(env),
      body: JSON.stringify({ conversation_id: convId, role: 'assistant', content: aiContent }),
    })
    await fetch(`${SUPABASE}/conversations?id=eq.${convId}`, {
      method: 'PATCH',
      headers: sbHeaders(env),
      body: JSON.stringify({ updated_at: new Date().toISOString() }),
    })

    // 手动记忆标记
    const mm = aiContent.match(/<!--\s*记住[：:]\s*(.+?)\s*-->/)
    if (mm) {
      await fetch(`${SUPABASE}/memories`, {
        method: 'POST',
        headers: sbReturn(env),
        body: JSON.stringify({ summary: mm[1].trim() }),
      })
    }

    // 异步摘要（与 stream 共用同一份实现）
    context.waitUntil(trySummarize(env, convId))

    return json(200, { content: aiContent, usage: dsData.usage, conversationId: convId })
  } catch (error) {
    console.error('Chat Error:', error.message)
    return json(500, { error: error.message })
  }
}

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
}

export async function onRequestOptions() {
  return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } })
}
