// stream-run.js — SSE 流解析 + tool_calls 收集 + thinking 收集 + <think> 标签剥离 + 消息存储 + 摘要/压缩触发
import { trySummarize } from './stream-summarize.js'
import { tryCompressConversation } from './stream-compress.js'

const SUPABASE = 'https://vktbawcubmdmkqzadmto.supabase.co/rest/v1'

function sbHeaders(env) { return { 'apikey': env.SUPABASE_SECRET_KEY, 'Authorization': `Bearer ${env.SUPABASE_SECRET_KEY}`, 'Content-Type': 'application/json' } }
function sbReturn(env) { return { ...sbHeaders(env), 'Prefer': 'return=representation' } }

// ---- <think> 标签剥离（借鉴 AionsHome 的 ThinkTagReasoningFilter 思路）----
// 部分模型 / relay 把思考链放在正文的 <think>...</think> 里而不是 reasoning_content 字段。
// 流式场景下标签可能被 chunk 切成两半（如 "<thi" + "nk>"），需要状态机逐块处理。
const THINK_OPEN = '<think>'
const THINK_CLOSE = '</think>'

// 检查文本尾部是否是标签的前缀片段（如 "nk>" 是 "</think>" 的后缀 → 需要留到下一块）
function tagPrefixSuffixLen(text, tag) {
  const maxLen = Math.min(text.length, tag.length - 1)
  for (let size = maxLen; size > 0; size--) {
    if (tag.startsWith(text.slice(-size))) return size
  }
  return 0
}

class ThinkTagReasoningFilter {
  constructor() {
    this.pending = ''
    this.inThink = false
    this._reasoningParts = []
    this._reasoningLen = 0
  }

  feed(chunk) {
    if (!chunk) return ''
    let buf = this.pending + String(chunk)
    this.pending = ''
    let out = ''
    while (buf) {
      const lower = buf.toLowerCase()
      if (this.inThink) {
        const closeIdx = lower.indexOf(THINK_CLOSE)
        if (closeIdx >= 0) {
          this._reasoningParts.push(buf.slice(0, closeIdx))
          buf = buf.slice(closeIdx + THINK_CLOSE.length)
          this.inThink = false
          continue
        }
        const keep = tagPrefixSuffixLen(lower, THINK_CLOSE)
        if (keep) {
          this._reasoningParts.push(buf.slice(0, -keep))
          this.pending = buf.slice(-keep)
        } else {
          this._reasoningParts.push(buf)
        }
        break
      }
      const openIdx = lower.indexOf(THINK_OPEN)
      if (openIdx >= 0) {
        out += buf.slice(0, openIdx)
        buf = buf.slice(openIdx + THINK_OPEN.length)
        this.inThink = true
        continue
      }
      const keep = tagPrefixSuffixLen(lower, THINK_OPEN)
      if (keep) {
        out += buf.slice(0, -keep)
        this.pending = buf.slice(-keep)
      } else {
        out += buf
      }
      break
    }
    return out
  }

  flush() {
    const pending = this.pending
    this.pending = ''
    if (!pending) return ''
    if (this.inThink) {
      this._reasoningParts.push(pending)
      return ''
    }
    return pending
  }

  // 自上次调用以来新增的思考文本（供流式增量转发 thinking 事件）
  takeReasoning() {
    const all = this._reasoningParts.join('')
    const delta = all.slice(this._reasoningLen)
    this._reasoningLen = all.length
    return delta
  }

  get reasoningText() {
    return this._reasoningParts.join('').trim()
  }
}

// 非流式兜底剥离：保存前再扫一遍，防止状态机遗漏的残留标签进入历史记录
function extractThinkTagReasoning(text) {
  if (!text) return { visible: text || '', reasoning: '' }
  const parts = []
  const visible = String(text).replace(/<think>([\s\S]*?)<\/think>/gi, (m, inner) => {
    const t = (inner || '').trim()
    if (t) parts.push(t)
    return '\n\n'
  }).replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  return { visible, reasoning: parts.join('\n\n').trim() }
}

export async function runStream(dsRes, env, convId, isToolRound = false) {
  const encoder = new TextEncoder()
  // TextDecoder 提到循环外：跨 chunk 保持解码状态，中文字符被 chunk 切开时不再烂成 U+FFFD
  const decoder = new TextDecoder()
  let fullContent = '', buffer = '', toolCalls = [], reasoning = ''
  let aborted = false
  const thinkFilter = new ThinkTagReasoningFilter()

  const sseStream = new ReadableStream({
    async start(controller) {
      const reader = dsRes.body.getReader()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n'); buffer = lines.pop() || ''
          for (const line of lines) {
            if (!line.startsWith('data: ') || line === 'data: [DONE]') continue
            try {
              const d = JSON.parse(line.slice(6))
              const delta = d.choices?.[0]?.delta
              if (delta?.content) {
                // 同 chunk 两路思考并存（reasoning_content + content 内 <think>）时，
                // 几乎必为同一份思考被 relay 双写 → <think> 提取的不再重复转发，防"思考重复出现"
                const hasFieldReasoning = !!(delta?.reasoning_content)
                // <think> 块剥离：思考进 thinking 链，正文只留可见部分
                const visible = thinkFilter.feed(delta.content)
                if (visible) {
                  fullContent += visible
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: visible })}\n\n`))
                }
                const thinkDelta = thinkFilter.takeReasoning()
                if (thinkDelta && !hasFieldReasoning) {
                  reasoning += thinkDelta
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ thinking: thinkDelta })}\n\n`))
                }
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
        // 冲刷 TextDecoder 残留字节（流结束时补全最后一个被切开的多字节字符）
        buffer += decoder.decode()
        // 冲刷过滤器残留：pending 尾块 + 最后一段思考
        const tail = thinkFilter.flush()
        if (tail) {
          fullContent += tail
          try { controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: tail })}\n\n`)) } catch (_) {}
        }
        const thinkTail = thinkFilter.takeReasoning()
        if (thinkTail) {
          reasoning += thinkTail
          try { controller.enqueue(encoder.encode(`data: ${JSON.stringify({ thinking: thinkTail })}\n\n`)) } catch (_) {}
        }

        for (const line of buffer.split('\n')) {
          if (!line.startsWith('data: ') || line === 'data: [DONE]') continue
          try { const d = JSON.parse(line.slice(6)); if (d.choices?.[0]?.delta?.content) fullContent += d.choices[0].delta.content } catch (_) {}
        }

        // 保存前兜底：非流式剥离残留 <think> 标签（历史记录绝不带思考原文）
        const cleaned = extractThinkTagReasoning(fullContent)
        if (cleaned.reasoning) reasoning = [reasoning, cleaned.reasoning].filter(Boolean).join('\n\n')
        fullContent = cleaned.visible

        const rawToolCount = toolCalls.filter(tc => tc).length
        const complete = toolCalls.filter(tc => tc && tc.name)
        // 观测①：原始收集到工具调用但被过滤（name 不完整）→ 流截断证据
        if (rawToolCount > 0 && complete.length === 0) {
          console.warn(`[stream-run] 🔍 工具调用被过滤：raw=${rawToolCount} complete=0 | aborted=${aborted} | 疑似流截断（tool_calls 未传完）`)
        }
        // 观测②：说了没做（预告词命中但无工具调用）→ 模型层行为证据
        const hasPromise = /(我去|我去看|我查|我看一下|现在就看|让我看看|先读|先看|直接做|这就去|马上做|我看一眼|让我看)/.test(fullContent)
        if (hasPromise && complete.length === 0) {
          console.warn(`[stream-run] ⚠️ 说了没做 | aborted=${aborted} | 开头=${fullContent.slice(0, 50).replace(/\n/g, ' ')}`)
        }
        if (complete.length > 0) {
          let brokenArgs = 0
          for (const tc of complete) {
            try { tc.arguments = JSON.parse(tc.arguments || '{}') }
            catch {
              brokenArgs++
              console.error('[stream-run] 工具调用参数解析失败:', tc.name, String(tc.arguments || '').slice(0, 200))
              tc.arguments = {}
              tc.arguments_incomplete = true
            }
          }
          try { controller.enqueue(encoder.encode(`data: ${JSON.stringify({ tool_calls: complete.map(tc => ({ name: tc.name, arguments: tc.arguments, arguments_incomplete: !!tc.arguments_incomplete })) })}\n\n`)) } catch (_) {}
          if (brokenArgs > 0) console.warn(`[stream-run] ${brokenArgs} 个工具调用参数不完整，已标记（前端可识别，不会假装成功）`)
        }
        // 思考链完整文本（reasoning_content + <think> 提取合并），一次性补发
        if (reasoning.trim()) {
          try { controller.enqueue(encoder.encode(`data: ${JSON.stringify({ thinking_done: true, thinking: reasoning })}\n\n`)) } catch (_) {}
        }

        // 消息存储：原子消息全部落库（含工具轮次的 assistant 续写），
        // 形成 assistant(tool_calls) → tool(result) → assistant(续写) 标准链，
        // 前端恢复时按序列聚合回 Run。空消息保护：完全无内容、无工具调用、无思考时不落库
        if (fullContent.trim() || complete.length > 0 || reasoning.trim()) {
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

        const doneMsg = `data: ${JSON.stringify({ done: true, conversationId: convId, aborted })}\n\n`
        try { controller.enqueue(encoder.encode(doneMsg)) } catch (_) {}
        try { controller.close() } catch (_) {}
      }
    },
  })

  return new Response(sseStream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'Access-Control-Allow-Origin': '*' },
  })
}
