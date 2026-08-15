// functions/api/compression.js — ④消息压缩：日历三级压缩（照搬 AionsHome memory_compression.py 的灵魂）
// daily（压前一天，等7天闭合）→ weekly（压7天，父级等子级）→ monthly（压30天）
// 输出：compression_summaries（摘要写得像日记）；durable_facts 自动写 memories（记忆库，压缩有损但重要的永远在）
// 输入：messages 归档 archive_state='cold'（不删，可溯源）；批次三表记录完整溯源链
// GET  /api/compression?preview=1&level=daily   → 预览（可压周期/条数/预计调用次数）
// GET  /api/compression?batches=1               → 批次历史
// POST /api/compression { level: 'daily' }      → 执行压缩

const SUPABASE = 'https://vktbawcubmdmkqzadmto.supabase.co/rest/v1'
const DAY_START_HOUR = 5

const LEVELS = {
  daily:   { sourceStage: 0, outputStage: 1, periodKind: 'day',   periodsPerCall: 7, title: '每日记忆' },
  weekly:  { sourceStage: 1, outputStage: 2, periodKind: 'week',  periodsPerCall: 8, title: '每周记忆' },
  monthly: { sourceStage: 2, outputStage: 3, periodKind: 'month', periodsPerCall: 6, title: '每月记忆' },
}

function sbHeaders(env) { return { 'apikey': env.SUPABASE_SECRET_KEY, 'Authorization': `Bearer ${env.SUPABASE_SECRET_KEY}`, 'Content-Type': 'application/json' } }
function sbReturn(env) { return { ...sbHeaders(env), 'Prefer': 'return=representation' } }
function json(status, body) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }) }

// ---- 周期计算（凌晨5点分割，与 utils/time.js 一致）----
function shifted(ts) { return new Date(ts - DAY_START_HOUR * 3600 * 1000) }
function dayBounds(dayText) {
  const start = new Date(dayText + 'T05:00:00+08:00')
  return { start: start.getTime(), end: start.getTime() + 86400000 }
}
function dayLabel(ts) {
  const d = shifted(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function weekBounds(ts) {
  const d = shifted(ts)
  const monday = new Date(d)
  monday.setDate(d.getDate() - d.getDay() + (d.getDay() === 0 ? -6 : 1))
  monday.setHours(5, 0, 0, 0)
  const start = monday.getTime()
  return { label: `${dayLabel(start)} ~ ${dayLabel(start + 6 * 86400000)}`, start, end: start + 7 * 86400000 }
}
function monthBounds(ts) {
  const d = shifted(ts)
  const start = new Date(d.getFullYear(), d.getMonth(), 1, 5, 0, 0).getTime()
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 1, 5, 0, 0).getTime()
  return { label: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, start, end }
}
function periodFor(level, ts) {
  if (level === 'daily') return { label: dayLabel(ts), ...dayBounds(dayLabel(ts)) }
  if (level === 'weekly') return weekBounds(ts)
  return monthBounds(ts)
}

// 只压已闭合周期：daily 等 7 天；weekly 跨周 + 7 天；monthly 跨月
function eligible(level, periodEnd, nowTs) {
  if (level === 'daily') return periodEnd <= nowTs - 7 * 86400000
  if (level === 'weekly') return periodEnd <= weekBounds(nowTs).start && periodEnd <= nowTs - 7 * 86400000
  return periodEnd <= monthBounds(nowTs).start
}

// ---- 候选输入 ----
async function fetchJson(url, env) {
  const r = await fetch(url, { headers: sbHeaders(env) })
  if (!r.ok) throw new Error(`supabase [${r.status}]`)
  return r.json()
}

// daily 输入：stage0 原始消息（未压缩、未删除、非 tool）
function dailyInputsQuery() {
  return `${SUPABASE}/messages?select=id,conversation_id,role,content,created_at&archive_state=eq.active&compression_stage=eq.0&deleted_at=is.null&role=in.(user,assistant)&order=created_at.asc&limit=1000`
}
// weekly/monthly 输入：上一级摘要（active 未归档）
function summaryInputsQuery(level) {
  const srcLevel = level === 'weekly' ? 'daily' : 'weekly'
  return `${SUPABASE}/compression_summaries?select=id,conversation_id,level,period_label,content,created_at,period_start,period_end&level=eq.${srcLevel}&archive_state=eq.active&order=period_start.asc&limit=500`
}

async function candidateInputs(env, level) {
  if (level === 'daily') return fetchJson(dailyInputsQuery(), env)
  return fetchJson(summaryInputsQuery(level), env)
}

// ---- 压缩 prompt（照搬 AionsHome：只归纳不编造，按周期分组，1-5 条 + durable_facts）----
function periodPrompt(level, periods, itemsById) {
  const payload = periods.map(p => ({
    period: p.label,
    items: p.itemIds.map(id => String(itemsById[id]?.content || '').slice(0, 800)),
  }))
  const instruction = {
    daily: '每个日期根据实际价值保留 1-5 条主题明确的每日记忆；平淡日期可以少于 1 条。',
    weekly: '每个自然周根据实际价值保留 1-5 条主题明确的每周记忆。',
    monthly: '每个自然月根据实际价值保留 1-5 条完整的月度记忆；不限制单条字数。',
  }[level]
  return (
    '你正在整理两个人（钟泽和泠泠）的对话记忆。输入已经由程序按时间周期分组。\n' +
    '只归纳内容，不要输出、猜测或引用任何数据库 ID，也不要制造新事实。\n' +
    instruction + '\n' +
    '每条只表达一个可独立召回的主题，但可以写得完整。旅行、健康、关系变化、承诺、重要人物、宠物和项目节点优先保留；重复流水账可以合并或省略。\n' +
    '摘要写得像日记，保留质感（有生活气息，不是干巴巴的要点列表）。\n' +
    '稳定偏好、健康安全、长期承诺等原子事实放入 durable_facts，不占普通摘要名额。\n' +
    '严格输出 JSON：{"periods":[{"period":"输入中的周期标签","items":[{"content":"完整摘要","keywords":["关键词"],"importance":0.5}]}],"durable_facts":[{"content":"长期事实","keywords":["关键词"],"importance":0.85}]}\n' +
    `输入：${JSON.stringify(payload, null, 2).slice(0, 12000)}`
  )
}

function parseJsonResponse(raw) {
  let text = String(raw || '').trim()
  if (text.startsWith('```')) { text = text.replace(/^```(json)?/i, '').replace(/```$/, '').trim() }
  try { return JSON.parse(text) } catch (_) {}
  const s = text.indexOf('{'), e = text.lastIndexOf('}')
  if (s < 0 || e <= s) return null
  try { return JSON.parse(text.slice(s, e + 1)) } catch (_) { return null }
}

function normalizeOutputs(parsed, expectedLabels) {
  const normalized = {}
  const seen = new Set()
  for (const p of (parsed?.periods || [])) {
    const label = String(p?.period || '').trim()
    if (!expectedLabels.has(label) || seen.has(label)) continue
    seen.add(label)
    normalized[label] = (p?.items || []).slice(0, 5).map(it => ({
      content: String(it?.content || '').trim(),
      keywords: (Array.isArray(it?.keywords) ? it.keywords : []).map(String).slice(0, 8),
      importance: Math.max(0, Math.min(0.7, Number(it?.importance) || 0.4)),
    })).filter(x => x.content)
  }
  if (seen.size !== expectedLabels.size) return null
  const durable = (parsed?.durable_facts || []).slice(0, 8).map(it => ({
    content: String(it?.content || '').trim(),
    keywords: (Array.isArray(it?.keywords) ? it.keywords : []).map(String).slice(0, 8),
    importance: Math.max(0.8, Math.min(1, Number(it?.importance) || 0.85)),
  })).filter(x => x.content)
  return { normalized, durable }
}

// ---- 调用压缩模型（DeepSeek 非流式）----
async function callCompressionModel(env, prompt) {
  if (!env.DEEPSEEK_API_KEY) throw new Error('env: DEEPSEEK_API_KEY not set')
  const r = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.DEEPSEEK_API_KEY}` },
    body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'user', content: prompt }], max_tokens: 4000, temperature: 0.4 }),
  })
  if (!r.ok) throw new Error(`DeepSeek [${r.status}]: ${(await r.text()).slice(0, 200)}`)
  const d = await r.json()
  return d.choices?.[0]?.message?.content || ''
}

// ---- 预览 ----
export async function onRequestGet(context) {
  const { request, env } = context
  const url = new URL(request.url)
  try {
    if (url.searchParams.get('batches') === '1') {
      const rows = await fetchJson(`${SUPABASE}/compression_batches?select=*&order=created_at.desc&limit=20`, env)
      return json(200, { batches: rows })
    }
    const level = url.searchParams.get('level') || 'daily'
    if (!LEVELS[level]) return json(400, { error: 'level must be daily/weekly/monthly' })
    const nowTs = Date.now()
    const items = await candidateInputs(env, level)
    const byId = {}
    const grouped = {}
    for (const item of items) {
      byId[item.id] = item
      const ts = new Date(item.created_at || item.period_start || Date.now()).getTime()
      const p = periodFor(level, ts)
      if (!eligible(level, p.end, nowTs)) continue
      const g = grouped[p.label] || (grouped[p.label] = { label: p.label, start: p.start, end: p.end, itemIds: [] })
      g.itemIds.push(item.id)
    }
    // 父级阻塞：weekly 前检查该周期是否还有未压的 stage0 原始消息；monthly 检查未压的 daily 摘要
    const blocked = new Set()
    if (level !== 'daily') {
      const lower = level === 'weekly'
        ? await fetchJson(`${SUPABASE}/messages?select=id,created_at&archive_state=eq.active&compression_stage=eq.0&deleted_at=is.null&role=in.(user,assistant)&limit=1000`, env)
        : await fetchJson(`${SUPABASE}/compression_summaries?select=id,period_start,period_end&level=eq.daily&archive_state=eq.active&limit=500`, env)
      for (const row of lower) {
        const ts = new Date(row.created_at || row.period_start || Date.now()).getTime()
        const p = periodFor(level, ts)
        if (p.end <= nowTs - 7 * 86400000) blocked.add(p.label)
      }
    }
    const periods = Object.values(grouped).filter(p => !blocked.has(p.label)).sort((a, b) => a.start - b.start)
    const size = LEVELS[level].periodsPerCall
    return json(200, {
      level, title: LEVELS[level].title, nowTs,
      itemCount: periods.reduce((s, p) => s + p.itemIds.length, 0),
      periodCount: periods.length,
      estimatedCalls: periods.length ? Math.ceil(periods.length / size) : 0,
      periods: periods.slice(0, 40).map(p => ({ label: p.label, itemCount: p.itemIds.length })),
      canRun: periods.length > 0,
      blockedCount: blocked.size,
    })
  } catch (e) { return json(500, { error: e.message }) }
}

// ---- 执行 ----
export async function onRequestPost(context) {
  const { request, env } = context
  try {
    const body = await request.json()
    const level = String(body.level || 'daily')
    if (!LEVELS[level]) return json(400, { error: 'level must be daily/weekly/monthly' })
    const cfg = LEVELS[level]
    const nowTs = Date.now()
    const items = await candidateInputs(env, level)
    const byId = {}
    const grouped = {}
    for (const item of items) {
      byId[item.id] = item
      const ts = new Date(item.created_at || item.period_start || Date.now()).getTime()
      const p = periodFor(level, ts)
      if (!eligible(level, p.end, nowTs)) continue
      const g = grouped[p.label] || (grouped[p.label] = { label: p.label, start: p.start, end: p.end, itemIds: [] })
      g.itemIds.push(item.id)
    }
    const periods = Object.values(grouped).sort((a, b) => a.start - b.start)
    if (periods.length === 0) return json(200, { ok: false, reason: 'no_candidates', message: '没有到期可压的周期（daily 要等 7 天闭合）' })

    let totalInputs = 0, totalOutputs = 0
    const batchIds = []
    for (let i = 0; i < periods.length; i += cfg.periodsPerCall) {
      const chunk = periods.slice(i, i + cfg.periodsPerCall)
      const prompt = periodPrompt(level, chunk, byId)
      const raw = await callCompressionModel(env, prompt)
      const parsed = parseJsonResponse(raw)
      const out = normalizeOutputs(parsed, new Set(chunk.map(p => p.label)))
      if (!out) return json(500, { error: `模型输出无法解析（level=${level}），旧数据保持活跃`, raw: String(raw).slice(0, 300) })

      const batchId = `cmb_${Date.now()}_${i}`
      const inputIds = chunk.flatMap(p => p.itemIds)
      const overallStart = new Date(Math.min(...chunk.map(p => p.start))).toISOString()
      const overallEnd = new Date(Math.max(...chunk.map(p => p.end))).toISOString()
      const outputIds = []

      // durable_facts → 记忆库（压缩有损，重要的永远在）
      for (const d of out.durable) {
        await fetch(`${SUPABASE}/memories`, { method: 'POST', headers: sbReturn(env), body: JSON.stringify({ summary: `[压缩提取] ${d.content}` }) })
      }
      // 摘要 → compression_summaries
      for (const p of chunk) {
        for (const it of (out.normalized[p.label] || [])) {
          const r = await fetch(`${SUPABASE}/compression_summaries`, {
            method: 'POST', headers: sbReturn(env),
            body: JSON.stringify({
              level, period_label: p.label,
              period_start: new Date(p.start).toISOString(), period_end: new Date(p.end).toISOString(),
              content: it.content, keywords: JSON.stringify(it.keywords), importance: it.importance,
              batch_id: batchId, source_ids: JSON.stringify(inputIds), archive_state: 'active',
            }),
          })
          const rows = await r.json()
          const sid = Array.isArray(rows) ? rows[0]?.id : null
          if (sid) outputIds.push(sid)
        }
      }
      // 批次记录 + 溯源映射
      await fetch(`${SUPABASE}/compression_batches`, { method: 'POST', headers: sbReturn(env), body: JSON.stringify({
        id: batchId, level, status: 'done', period_start: overallStart, period_end: overallEnd,
        input_count: inputIds.length, output_count: outputIds.length, completed_at: new Date().toISOString(),
      }) })
      for (const mid of inputIds) {
        await fetch(`${SUPABASE}/compression_batch_inputs`, { method: 'POST', headers: sbReturn(env), body: JSON.stringify({ batch_id: batchId, message_id: mid }) })
      }
      for (const sid of outputIds) {
        await fetch(`${SUPABASE}/compression_batch_outputs`, { method: 'POST', headers: sbReturn(env), body: JSON.stringify({ batch_id: batchId, summary_id: sid }) })
      }
      // 输入归档：active → cold（不删，可溯源）
      for (const mid of inputIds) {
        await fetch(`${SUPABASE}/messages?id=eq.${mid}`, { method: 'PATCH', headers: sbReturn(env), body: JSON.stringify({ archive_state: 'cold', compression_stage: cfg.outputStage }) })
      }
      if (level !== 'daily') {
        // weekly/monthly 输入是上一级摘要：归档为 cold
        for (const mid of inputIds) {
          await fetch(`${SUPABASE}/compression_summaries?id=eq.${mid}`, { method: 'PATCH', headers: sbReturn(env), body: JSON.stringify({ archive_state: 'cold' }) })
        }
      }
      totalInputs += inputIds.length
      totalOutputs += outputIds.length
      batchIds.push(batchId)
    }
    return json(200, { ok: true, level, inputCount: totalInputs, outputCount: totalOutputs, batchIds })
  } catch (e) { return json(500, { error: e.message }) }
}

export async function onRequestOptions() {
  return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } })
}
