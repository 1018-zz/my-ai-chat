// functions/api/chat.js
// POST /api/chat — 非流式聊天 + 自动记忆摘要

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
      if (convErr || !newConv) return json(500, { error: 'failed to create conversation' })
      convId = newConv.id
    }

    // 2. 调用 DeepSeek
    const dsRes = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({ messages, model, temperature: 0.7 }),
    })
    if (!dsRes.ok) {
      const errText = await dsRes.text()
      return json(dsRes.status, { error: `DeepSeek: ${errText.slice(0, 200)}` })
    }

    const dsData = await dsRes.json()
    const aiContent = dsData.choices[0]?.message?.content || ''

    // 3. 存储消息
    const userMsg = messages[messages.length - 1]
    await supabase.from('messages').insert({
      conversation_id: convId,
      role: 'user',
      content: userMsg.content,
    })
    await supabase.from('messages').insert({
      conversation_id: convId,
      role: 'assistant',
      content: aiContent,
    })
    await supabase.from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', convId)

    // 4. 手动记忆标记 <!-- 记住: xxx -->
    const memoryMatch = aiContent.match(/<!--\s*记住[：:]\s*(.+?)\s*-->/)
    if (memoryMatch) {
      try {
        await supabase.from('memories').insert({ summary: memoryMatch[1].trim() })
        console.log('手动标记记忆:', memoryMatch[1].trim().slice(0, 50))
      } catch (_) { /* best-effort */ }
    }

    // 5. 异步触发自动摘要
    context.waitUntil(trySummarize(supabase, env, convId))

    return json(200, {
      content: aiContent,
      usage: dsData.usage,
      conversationId: convId,
    })
  } catch (error) {
    console.error('Chat Error:', error.message)
    return json(500, { error: error.message })
  }
}

// ==================== 自动记忆摘要 ====================

async function trySummarize(supabase, env, convId) {
  if (SUMMARIES_IN_FLIGHT.has(convId)) return
  SUMMARIES_IN_FLIGHT.add(convId)
  try {
    // 1. 获取锚点
    const { data: anchor } = await supabase
      .from('summary_anchors')
      .select('last_message_id')
      .eq('conversation_id', convId)
      .maybeSingle()

    const afterId = anchor?.last_message_id

    // 2. 获取新消息
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
      if (anchorMsg) {
        query = query.gt('created_at', anchorMsg.created_at)
      }
    }

    const { data: newMessages } = await query
    if (!newMessages || newMessages.length < SUMMARY_MIN_MESSAGES) return

    // 3. 构建摘要提示词
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

    // 4. 调用 DeepSeek 提取记忆
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

    // 5. 解析 JSON
    const jsonMatch = raw.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return
    const memories = JSON.parse(jsonMatch[0])
    if (!Array.isArray(memories) || memories.length === 0) return

    // 6. 存入 memories 表
    let inserted = 0
    for (const mem of memories) {
      if (!mem.content) continue
      try {
        await supabase.from('memories').insert({ summary: mem.content })
        inserted++
      } catch (_) { /* skip duplicates */ }
    }

    // 7. 更新锚点
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
