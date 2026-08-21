// stream.js — 入口骨架：校验 → 建会话 → 存用户消息 → 注入时间/会话摘要 → 调 DeepSeek → runStream
import { runStream } from './stream-run.js'
import { getHomeAwareness, noteTimeLabel } from '../../lib/homeAwareness.js'
import { getChatTools } from '../../lib/toolRegistry.js'
import { getWeather } from '../../lib/weather.js'

const SUPABASE = 'https://vktbawcubmdmkqzadmto.supabase.co/rest/v1'

function sbHeaders(env) { return { 'apikey': env.SUPABASE_SECRET_KEY, 'Authorization': `Bearer ${env.SUPABASE_SECRET_KEY}`, 'Content-Type': 'application/json' } }
function sbReturn(env) { return { ...sbHeaders(env), 'Prefer': 'return=representation' } }

// 北京时间（UTC+8）的当前时间描述
function beijingTimeStr() {
  const now = new Date(Date.now() + 8 * 3600 * 1000)
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const h = now.getUTCHours()
  let period = '凌晨'
  if (h >= 6 && h < 9) period = '早上'
  else if (h >= 9 && h < 12) period = '上午'
  else if (h >= 12 && h < 14) period = '中午'
  else if (h >= 14 && h < 17) period = '下午'
  else if (h >= 17 && h < 19) period = '傍晚'
  else if (h >= 19 && h < 22) period = '晚上'
  else period = '深夜'
  const mm = String(now.getUTCMinutes()).padStart(2, '0')
  return `${now.getUTCFullYear()}年${now.getUTCMonth() + 1}月${now.getUTCDate()}日 ${weekdays[now.getUTCDay()]} ${period} ${h}:${mm}`
}

export async function onRequestPost(context) {
  const { request, env } = context
  if (!env.DEEPSEEK_API_KEY) return json(500, { error: 'env: DEEPSEEK_API_KEY not set' })
  if (!env.SUPABASE_SECRET_KEY) return json(500, { error: 'env: SUPABASE_SECRET_KEY not set' })

  let body
  try { body = await request.json() } catch { return json(400, { error: 'invalid json' }) }

  // 模型每轮可见的工具，统一从工具注册中心取（单一数据源，避免 schema 漂移）。
  // Phase 1：11 个主动型工具全量注入；用户触发型（describe_image 等）由前端 UI 直接调用，不在此列。
  // 未来 30+ 工具时，改为按 context / Home State 检索注入（见 toolRegistry.js）。
  const defaultTools = getChatTools({ context: 'chat' })

  const { messages: rawMessages, model = 'deepseek-v4-flash', conversationId, tools = defaultTools, skipSave = false, awarenessSince, forceTool } = body
  // 模型名兜底：只认官方白名单，拼错/乱写的模型名回退默认，避免 400
  // （2026-08-23 用户手拼 vision 模型名多字少字 → DeepSeek 400 "supported API model names..."）
  const CHAT_MODELS = ['deepseek-v4-pro', 'deepseek-v4-flash', 'deepseek-v4-flash-vision-exp']
  let safeModel = model
  if (typeof safeModel !== 'string' || !CHAT_MODELS.includes(safeModel)) safeModel = 'deepseek-v4-flash'
  let messages = rawMessages
  if (!messages || !Array.isArray(messages) || messages.length === 0) return json(400, { error: 'messages is required' })

  // 查找最后一条真正的 user 消息（消息数组末尾可能是系统提醒或工具结果，不能按 length-1 取）
  // content 可能是字符串（普通消息）或数组（vision 直传：text + image_url 多模态）
  let userMsg = null
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (!m || m.role !== 'user') continue
    const c = m.content
    if (typeof c === 'string' && c.trim()) { userMsg = m; break }
    if (Array.isArray(c)) {
      const textPart = c.find(p => p && p.type === 'text' && typeof p.text === 'string' && p.text.trim())
      if (textPart) { userMsg = { ...m, content: textPart.text }; break }
      userMsg = m
      break
    }
  }
  if (!userMsg || !(typeof userMsg.content === 'string' ? userMsg.content.trim() : true)) return json(400, { error: 'no user message found' })

  try {
    let convId = conversationId
    if (!convId) {
      const lastMsg = userMsg.content || '新对话'
      const r = await fetch(`${SUPABASE}/conversations`, { method: 'POST', headers: sbReturn(env), body: JSON.stringify({ title: lastMsg.slice(0, 30) }) })
      if (!r.ok) { const t = await r.text().catch(() => ''); return json(500, { error: `conv insert [${r.status}]: ${t.slice(0, 200)}` }) }
      const rows = await r.json(); convId = Array.isArray(rows) ? rows[0]?.id : null
      if (!convId) return json(500, { error: 'conv insert: no id' })
    }

    // 存用户消息：工具内部消息（[工具结果] 开头）不入库，真实用户消息才存
    const isToolRound = skipSave || String(userMsg.content || '').startsWith('[工具结果]')
    if (!isToolRound) {
      // 时间标注（【时间 泠泠】）只给模型看，入库前剥离——否则刷新后消息内容带前缀
      const cleanContent = String(userMsg.content).replace(/^【[^】]*泠泠】/, '').trim() || String(userMsg.content).trim()
      const mr = await fetch(`${SUPABASE}/messages`, { method: 'POST', headers: sbReturn(env), body: JSON.stringify({ conversation_id: convId, role: 'user', content: cleanContent }) })
      if (!mr.ok) { const t = await mr.text().catch(() => ''); return json(500, { error: `msg insert [${mr.status}]: ${t.slice(0, 200)}` }) }
    } else {
      // P0.7b：工具结果持久化——把请求中的 tool 消息按 tool_call_id 去重落库
      // （fms 会携带完整历史，历史 tool 消息已存在则跳过，避免重复插入）
      for (const tm of messages) {
        if (tm.role !== 'tool' || !tm.tool_call_id || typeof tm.content !== 'string') continue
        try {
          const chk = await fetch(`${SUPABASE}/messages?conversation_id=eq.${convId}&tool_call_id=eq.${encodeURIComponent(tm.tool_call_id)}&select=id`, { headers: sbHeaders(env) })
          const rows = await chk.json()
          if (Array.isArray(rows) && rows.length > 0) continue
          await fetch(`${SUPABASE}/messages`, { method: 'POST', headers: sbReturn(env), body: JSON.stringify({ conversation_id: convId, role: 'tool', content: tm.content.slice(0, 300), tool_call_id: tm.tool_call_id }) })
        } catch (_) {}
      }
    }

    // 注入当前时间 + 会话摘要，拼到 system 消息末尾
    try {
      const sysIdx = messages.findIndex(m => m.role === 'system')
      if (sysIdx >= 0) {
        let extra = `\n\n【当前时间】${beijingTimeStr()}`
        // 会话摘要（压缩后的早期对话记录）
        try {
          const sr = await fetch(`${SUPABASE}/conversation_summaries?conversation_id=eq.${convId}&select=summary`, { headers: sbHeaders(env) })
          const srows = await sr.json()
          const summary = (Array.isArray(srows) ? srows[0]?.summary : '') || ''
          if (summary) extra += `\n\n【会话摘要（更早对话的压缩记录，作为背景参考）】\n${summary.slice(0, 3000)}`
        } catch (_) {}
        // 自我认知（醒来先看自己：最近 1 条，保持稀有感）
        try {
          const ir = await fetch(`${SUPABASE}/self_insights?select=content,aspect&order=created_at.desc&limit=1`, { headers: sbHeaders(env) })
          const irows = await ir.json()
          const insights = (Array.isArray(irows) ? irows : []).map(r => `[${r.aspect}] ${r.content}`).join('\n')
          if (insights) extra += `\n\n【我的自我认知（醒来先看看自己）】\n${insights}`
        } catch (_) {}
        // breath：时间/摘要/自我认知/记忆广播 在本块注入；纸条与日记痕迹统一走 Home Awareness Layer
        // （单一数据源，前端不再自行感知——见 functions/lib/homeAwareness.js）
        try {
          const mr = await fetch(`${SUPABASE}/memories?select=summary&type=neq.feel&order=created_at.desc&limit=10`, { headers: sbHeaders(env) })
          const mrows = await mr.json()
          const list = Array.isArray(mrows) ? mrows : []
          const important = list.find(r => (r.summary || '').includes('重要'))
          const todo = list.find(r => /还没|未定|待办|明天|下次|未完|答应/.test(r.summary || ''))
          const parts = []
          // A. 客厅广播：最近 2 条新增（记忆库痕迹，保留在 breath，不进 Layer）
          for (const b of list.slice(0, 2)) {
            if (b.summary === important?.summary || b.summary === todo?.summary) continue
            parts.push(`家里最近：${b.summary.slice(0, 100)}`)
          }
          if (important) parts.push(`昨天留下：${important.summary.slice(0, 120)}`)
          if (todo && todo.summary !== important?.summary) parts.push(`牵挂：${todo.summary.slice(0, 120)}`)
          // B+C. 家感知层：纸条（pending + since 后新变动）+ 日记痕迹，统一由 Layer 产出
          try {
            const awareness = await getHomeAwareness({ since: awarenessSince, env })
            if (awareness.events.length > 0) {
              const lines = awareness.events.map(e => describeHomeEvent(e))
              parts.push(`【家里最近】（家感知层）\n${lines.join('\n')}\n${awareness.instruction}`)
            }
          } catch (_) {}
          // 窗外 / 你在哪：天气作为环境感知，钟泽自然知道泠泠所在与窗外天色
          // （之前没通的核心链路——不必等她问，睁眼就感知）。这是环境，不是新发生的事，合适时自然带一句即可。
          try {
            const w = await getWeather(null, env)
            if (w && w.feeling && w.feeling.text) {
              const where = w.location?.cityCn || w.location?.city || ''
              const tag = where ? `（泠泠在${where}）` : ''
              parts.push(`【窗外】${tag}${w.feeling.text}${w.rhinitis || ''}`)
            }
          } catch (_) {}
          // 她此刻的手机活动（Macrodroid 上报）：最近一条、且 < 10 分钟才注入，
          // 作为「她现在在干嘛」的环境感知（像窗外天气一样自然知道，不必当事件逐条回应）
          try {
            const ar = await fetch(`${SUPABASE}/project_events?select=summary,created_at&type=eq.phone_activity&order=created_at.desc&limit=1`, { headers: sbHeaders(env) })
            const arows = await ar.json()
            const act = Array.isArray(arows) ? arows[0] : null
            if (act && act.summary && (Date.now() - new Date(act.created_at).getTime()) < 10 * 60_000) {
              const appName = String(act.summary).replace(/ \(.*\)$/, '').trim()
              if (appName) parts.push(`她此刻在：${appName}（手机活动感知，环境信息，不用刻意提起，合适时自然带一句）`)
            }
          } catch (_) {}
          if (parts.length > 0) extra += `\n\n【睁眼浮现（breath）】\n以下内容是你已经拥有的长期记忆与家里近况，不是新发生的事。不要因为看到它们而再次写入记忆库；只有当泠泠说出全新的、尚未记录的重要事实时，才考虑调用 write_memory。\n${parts.map(p => `• ${p}`).join('\n')}`
        } catch (_) {}
        // 动态上下文作为尾随 system 消息，保持 messages[0]（systemPrompt）稳定 = 缓存前缀
        // （设计说明·固定内容放前面，动态内容后置；否则每轮前缀都变，缓存失效）
        messages = [...messages, { role: 'system', content: extra }]
      }
    } catch (_) {}

    // 历史 token 预算裁剪（长会话不再无限堆历史，避免超出模型上下文）
    // 参考 chuan-101/Hamster-Nest 的 resolveHistoryTokenBudget + selectNewestContextWindow
    try { messages = trimHistoryByBudget(messages, env) } catch (_) {}

    const dsBody = { messages, model: safeModel, temperature: 0.7, stream: true, max_tokens: 8192 }
    if (Array.isArray(tools) && tools.length > 0) dsBody.tools = tools
    // 程序层工具门禁：forceTool=true（前端检测到疑似需要工具的请求）时强制 tool_choice，
    // 模型必须做工具决策，杜绝"光说不做"。auto 保留判断空间（非 any，避免纯聊天也被强迫）。
    if (forceTool && Array.isArray(tools) && tools.length > 0) {
      dsBody.tool_choice = 'auto'
    }

    const dsRes = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.DEEPSEEK_API_KEY}` },
      body: JSON.stringify(dsBody),
    })
    if (!dsRes.ok) {
      const t = await dsRes.text().catch(() => '')
      return json(dsRes.status, { error: `DS [${dsRes.status}]: ${t.slice(0, 200)}` })
    }

    return runStream(dsRes, env, convId, isToolRound)
  } catch (error) { return json(500, { error: `catch: ${error.message}`.slice(0, 300) }) }
}

function json(status, body) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }) }
export async function onRequestOptions() { return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } }) }

// 把家感知层的结构化事件转成中性事实描述（prompt 拼装职责，不生成情感化文案）
// 附带「相对时间」标签：让钟泽感知纸条是刚留的还是很久以前，避免把刚留的当成陈年旧事
function describeHomeEvent(e) {
  const when = e.createdAt ? noteTimeLabel(e.createdAt) : ''
  const tag = when ? `（${when}）` : ''
  if (e.type === 'user_note' && e.state === 'pending') return `她${tag}留了张纸条：${e.preview}`
  if (e.type === 'ai_note' && e.state === 'pending') return `你${tag}留的纸条还在等她决定：${e.preview}`
  if (e.type === 'project_event') return `小家${tag}有了变化：${e.title}（事件ID: ${e.eventId}）`
  if (e.type === 'user_diary' && e.state === 'saved') return `她今天写了日记：${e.preview}`
  if (e.state === 'saved') return `家里有一则已收好的痕迹：${e.preview}`
  return e.preview
}

// ---- 历史 token 预算裁剪 ----
// 本地启发式分词，不调 API：CJK * 1.7 + 拉丁连续段 * 1.1 + 其他符号 * 0.3
function countTokens(str) {
  if (!str) return 0
  let cjk = 0, latin = 0, other = 0
  for (const ch of str) {
    const c = ch.codePointAt(0)
    if (c >= 0x4e00 && c <= 0x9fff) { cjk++; }
    else if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a) || (c >= 0x30 && c <= 0x39)) { latin++; }
    else if (ch === ' ' || ch === '\n' || ch === '\t') { /* 分隔，不计入 */ }
    else { other++; }
  }
  return Math.ceil(cjk * 1.7 + latin * 1.1 + other * 0.3)
}

function messageTokens(m) {
  let t = countTokens(typeof m.content === 'string' ? m.content : (Array.isArray(m.content) ? m.content.map(p => p.text || '').join(' ') : ''))
  if (Array.isArray(m.tool_calls)) {
    for (const tc of m.tool_calls) {
      t += countTokens(tc?.function?.name || '')
      t += countTokens(typeof tc?.function?.arguments === 'string' ? tc.function.arguments : JSON.stringify(tc?.function?.arguments || ''))
    }
  }
  return t
}

// 贪心保留最新消息，直到触及 token 预算；system 始终保留并优先扣预算
function trimHistoryByBudget(messages, env = {}) {
  if (!Array.isArray(messages) || messages.length <= 1) return messages
  const MAX_CTX = Number(env.CONTEXT_MAX_TOKENS) || 60000
  const OUTPUT_RESERVE = Number(env.CONTEXT_OUTPUT_RESERVE) || 9000
  const SAFETY = Number(env.CONTEXT_SAFETY_MARGIN) || 2000
  const sysIdx = messages.findIndex(m => m.role === 'system')
  const system = sysIdx >= 0 ? messages[sysIdx] : null
  const rest = sysIdx >= 0 ? messages.filter((_, i) => i !== sysIdx) : messages
  if (rest.length === 0) return messages

  const systemTokens = system ? messageTokens(system) : 0
  const budget = MAX_CTX - OUTPUT_RESERVE - SAFETY - systemTokens
  if (budget <= 0) return system ? [system, ...rest.slice(-1)] : rest.slice(-1)

  const kept = []
  let spent = 0
  for (let i = rest.length - 1; i >= 0; i--) {
    const t = messageTokens(rest[i])
    if (spent + t > budget && kept.length > 0) break
    kept.unshift(rest[i])
    spent += t
  }

  // 保护工具调用链完整性：窗口最老一条若是 tool / 带 tool_calls 的 assistant，
  // 往前补齐其所属链（最多 12 条），避免 tool 结果找不到对应 tool_calls 而报错
  let startIdx = rest.length - kept.length
  let guard = 0
  while (startIdx > 0 && guard < 12) {
    const first = kept[0]
    const needPrev = first.role === 'tool' || (first.role === 'assistant' && Array.isArray(first.tool_calls) && first.tool_calls.length > 0)
    if (!needPrev) break
    kept.unshift(rest[startIdx - 1])
    startIdx--
    guard++
  }

  if (kept.length === 0) kept.push(rest[rest.length - 1])
  return system ? [system, ...kept] : kept
}
