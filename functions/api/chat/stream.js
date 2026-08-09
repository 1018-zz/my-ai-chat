// functions/api/chat/stream.js
// POST /api/chat/stream — 流式聊天（SSE）+ 自动记忆摘要

import { createClient } from '@supabase/supabase-js'

const SUMMARY_MIN_MESSAGES = 10
const SUMMARIES_IN_FLIGHT = new Set()

export async function onRequestPost(context) {
  const { request, env } = context

  let body
  try { body = await request.json() } catch {
    return json(400, { error: 'invalid json' })
  }

  const { messages, model = 'deepseek-v4-flash', conversationId } = body
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return json(400, { error: 'messages is required' })
  }

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY)

  try {
    // 1. 解析 / 创建会话
    let convId = conversationId
    if (!convId) {
      const lastMsg = messages[messages.length - 1]?.content || '新对话'
      const { data: newConv, error: convErr } = await supabase
        .from('conversations')
        .insert({ title: lastMsg.slice(0, 30) })
        .select('id')
        .single()
      if (convErr || !newConv) {
        return json(500, { error: 'failed to create conversation' })
      }
      convId = newConv.id
    }

    // 2. 存储用户消息
    const userMsg = messages[messages.length - 1]
    await supabase.from('messages').insert({
      conversation_id: convId,
      role: 'user',
      content: userMsg.content,
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

    // 4. 创建 SSE 流 — 同时转发 + 收集完整内容
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
            // 转发原始 chunk
            controller.enqueue(value)
            // 收集内容
            const text = decoder.decode(value, { stream: true })
            for (const line of text.split('\n')) {
              if (!line.startsWith('data: ')) continue
              try {
                const d = JSON.parse(line.slice(6))
                if (d.choices?.[0]?.delta?.content) {
                  fullContent += d.choices[0].delta.content
                }
              } catch (_) { /* partial chunk, ok */ }
            }
          }
        } catch (e) {
          console.error('Stream error:', e.message)
        } finally {
          // 5. 流结束后：存储 AI 消息 + 检查手动记忆 + 更新会话
          try {
            await supabase.from('messages').insert({
              conversation_id: convId,
              role: 'assistant',
              content: fullContent,
            })
            await supabase.from('conversations')
              .update({ updated_at: new Date().toISOString() })
              .eq('id', convId)

            // 手动记忆标记
            const mm = fullContent.match(/<!--\s*记住[：:]\s*(.+?)\s*-->/)
            if (mm) {
              await supabase.from('memories').insert({ summary: mm[1].trim() })
              console.log('手动标记记忆:', mm[1].trim().slice(0, 50))
            }

            // 异步触发自动摘要
            trySummarize(supabase, env, convId)
          } catch (e) {
            console.error('Post-stream storage error:', e.message)
          }

          // 发送结束标记
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

// ==================== 自动记忆摘要（与 chat.js 共用逻辑） ====================

async function trySummarize(supabase, env, convId) {
  if (SUMMARIES_IN_FLIGHT.has(convId)) return
  SUMMARIES_IN_FLIGHT.add(convId)
  try {
    const { data: anchor } = await supabase
      .from('summary_anchors')
      .select('last_message_id')
      .eq('conversation_id', convId)
      .maybeSingle()

    const afterId = anchor?.last_message_id

    let query = supabase
      .from('messages')
      .select('id, role, content, created_at')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true })

    if (afterId) {
      const { data: anchorMsg } = await supabase
        .from('messages')
        .select('created_at')
        .eq('id', afterId)
        .maybeSingle()
      if (anchorMsg) query = query.gt('created_at', anchorMsg.created_at)
    }

    const { data: newMessages } = await query
    if (!newMessages || newMessages.length < SUMMARY_MIN_MESSAGES) return

    const today = new Date().toISOString().slice(0, 10)
    const transcript = newMessages.map(m =>
      `[${m.role === 'user' ? '泠泠' : '钟泽'}]: ${m.content.slice(0, 200)}`
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
      try {
        await supabase.from('memories').insert({ summary: mem.content })
        inserted++
      } catch (_) { /* skip duplicates */ }
    }

    const lastId = newMessages[newMessages.length - 1].id
    await supabase.from('summary_anchors').upsert({
      conversation_id: convId,
      last_message_id: lastId,
      updated_at: new Date().toISOString(),
    })

    if (inserted > 0) {
      console.log(`记忆摘要：${newMessages.length}条消息 → ${inserted}条记忆`)
    }
  } catch (e) {
    console.error('记忆摘要失败:', e.message)
  } finally {
    SUMMARIES_IN_FLIGHT.delete(convId)
  }
}

// ==================== 工具函数 ====================

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
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
