// src/utils/normalize.js
// —— 消息双轨迁移（Phase 0）——
//
// 三个来源统一入口：
//   数据库旧消息   { id, content, role, thinking, tool_calls }
//   localStorage / 内存旧消息 { id, text, isSelf, thinking, toolCalls }
//   新格式消息     { id, role, status, blocks[] }
// 全部经过 normalizeMessage() → 统一 ContentBlock 结构
//
// 过渡期策略：统一结构同时携带旧字段（text/isSelf/thinking/toolCalls），
//             UI 渲染零改动；Phase 1 BlockRenderer 切换后删除兼容字段。
//
// ContentBlock 不叫 MessageBlock——日记、Moment、回忆都是"生活事件块"，
// 未来小家的日记/Moment 也复用这个模型。

// 剥离历史消息正文里残留的 <think> 思考块（旧数据清洗——修复前存的旧消息
// 可能在 content 里带着思考原文；新消息后端已剥离，这里兜底展示层）
function stripLegacyThinkTags(text) {
  if (!text) return text || ''
  return String(text)
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// 统一入口：已统一 → 补兼容字段返回；旧格式 → 迁移
export function normalizeMessage(raw) {
  if (!raw) return null
  if (Array.isArray(raw.blocks)) {
    return {
      ...raw,
      isSelf: raw.role === 'user',
      text: extractText(raw.blocks),
      thinking: extractThinking(raw.blocks),
      toolCalls: extractToolCalls(raw.blocks),
    }
  }
  return migrateLegacyMessage(raw)
}

// 旧格式 → 统一 ContentBlock 结构
export function migrateLegacyMessage(raw) {
  const {
    id, created_at, text, content, isSelf, role,
    loading, thinking, thinkingDone, thinkingDur,
    toolCalls, tool_calls, interrupted,
  } = raw

  const self = typeof isSelf === 'boolean' ? isSelf : role === 'user'
  // 历史消息清洗：正文里残留的 <think> 思考块剥掉（思考归 thinking 块，正文归正文）
  const body = stripLegacyThinkTags(text ?? content ?? '')

  // 数据库格式 tool_calls 可能是 JSON 字符串
  let tcs = toolCalls
  if (!Array.isArray(tcs) && tool_calls) {
    try { tcs = JSON.parse(tool_calls) } catch { tcs = null }
  }

  const blocks = []
  // 历史消息的 thinking 必然是想完了的，一律 done（流式进行中的消息不经此函数）
  if (thinking) blocks.push({ type: 'thinking', content: thinking, done: true, duration: thinkingDur || 0 })
  if (Array.isArray(tcs) && tcs.length > 0) {
    for (const tc of tcs) {
      blocks.push({
        type: 'tool',
        name: tc.name,
        arguments: tc.arguments || {},
        // 历史消息：过程已完成，结果未存——不是"执行中"（避免 RunCard 误判 running）
        status: 'done',
        result: tc.result || '（历史工具结果未保存）',
      })
    }
  }
  if (body) blocks.push({ type: 'text', content: body })

  return {
    id: id ?? created_at ?? Date.now(),
    ts: created_at ? new Date(created_at).getTime() : Date.now(),
    role: self ? 'user' : 'assistant',
    isSelf: self,
    status: interrupted ? 'interrupted' : loading ? 'running' : 'done',
    blocks,
    // 唤醒来源标记（messages.meta.wake= spontaneous|precise）：透传给 UI 识别"钟泽主动醒来"
    // 仅携带来源标识，绝不携带任何调度概率/评分（铁律：调度数学不可见于任意 UI 层）
    meta: raw.meta ?? null,
    // —— 过渡期兼容字段（Phase 1 渲染器切换后删）——
    text: body,
    thinking,
    thinkingDone: !!thinking,
    thinkingDur: thinkingDur || 0,
    toolCalls: extractToolCalls(blocks),
    loading,
    interrupted,
  }
}

// —— 工具函数：从 blocks 提取旧字段（新格式消息的兼容层）——
export function extractText(blocks) {
  const t = (blocks || []).find(b => b.type === 'text')
  return t ? t.content : ''
}
export function extractThinking(blocks) {
  const t = (blocks || []).find(b => b.type === 'thinking')
  return t ? t.content : undefined
}
export function extractToolCalls(blocks) {
  return (blocks || [])
    .filter(b => b.type === 'tool')
    .map(b => ({ name: b.name, arguments: b.arguments, result: b.result }))
}
