// stream-run.js — SSE 流解析 + tool_calls 收集 + thinking 收集 + 消息存储 + 摘要/压缩触发
import { trySummarize } from './stream-summarize.js'
import { tryCompressConversation } from './stream-compress.js'

const SUPABASE = 'https://vktbawcubmdmkqzadmto.supabase.co/rest/v1'

function sbHeaders(env) { return { 'apikey': env.SUPABASE_SECRET_KEY, 'Authorization': `Bearer ${env.SUPABASE_SECRET_KEY}`, 'Content-Type': 'application/json' } }
function sbReturn(env) { return { ...sbHeaders(env), 'Prefer': 'return=representation' } }

export async function runStream(dsRes, env, convId, isToolRound = false) {
  const encoder = new TextEncoder()
  let fullContent = '', buffer = '', toolCalls = [], reasoning = ''
  let aborted = false

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
              if (delta?.content) {
                fullContent += delta.content
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: delta.content })}\n\n`))
              }
              if (delta?.reasoning_content) {
                reasoning += delta.reasoning_content
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ thinking: delta.reasoning_content })}\n\n`))
              }
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
      } catch (e) {
        console.error('Stream:', e.message)
        aborted = true
      } finally {
        for (const line of buffer.split('\n')) {
          if (!line.startsWith('data: ') || line === 'data: [DONE]') continue
          try { const d = JSON.parse(line.slice(6)); if (d.choices?.[0]?.delta?.content) fullContent += d.choices[0].delta.content } catch (_) {}
        }

        const complete = toolCalls.filter(tc => tc && tc.name)
        if (complete.length > 0) {
          for (const tc of complete) { try { tc.arguments = JSON.parse(tc.arguments || '{}') } catch { tc.arguments = {} } }
          try { controller.enqueue(encoder.encode(`data: ${JSON.stringify({ tool_calls: complete.map(tc => ({ name: tc.name, arguments: tc.arguments })) })}\n\n`)) } catch (_) {}
        }
        // 思考链完整文本（如模型支持 reasoning_content），一次性补发
        if (reasoning.trim()) {
          try { controller.enqueue(encoder.encode(`data: ${JSON.stringify({ thinking_done: true, thinking: reasoning })}\n\n`)) } catch (_) {}
        }

        try {
          // 工具内部轮次：不存 assistant 消息、不触发摘要/压缩（避免污染对话历史）
          if (!isToolRound) {
            const saveBody = { conversation_id: convId, role: 'assistant', content: fullContent }
            if (reasoning.trim()) saveBody.thinking = reasoning
            if (complete.length > 0) saveBody.tool_calls = JSON.stringify(complete.map(tc => ({ name: tc.name, arguments: tc.arguments })))
            await fetch(`${SUPABASE}/messages`, { method: 'POST', headers: sbReturn(env), body: JSON.stringify(saveBody) })
            await fetch(`${SUPABASE}/conversations?id=eq.${convId}`, { method: 'PATCH', headers: sbHeaders(env), body: JSON.stringify({ updated_at: new Date().toISOString() }) })
            const mm = fullContent.match(/<!--\s*记住[：:]\s*(.+?)\s*-->/)
            if (mm) await fetch(`${SUPABASE}/memories`, { method: 'POST', headers: sbReturn(env), body: JSON.stringify({ summary: mm[1].trim() }) })
            trySummarize(env, convId)
            tryCompressConversation(env, convId)
          }
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
}
