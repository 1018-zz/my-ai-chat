// functions/api/messages.js
// GET /api/messages?conversationId=xxx[&includeDeleted=1] —— 默认过滤已撤回（deleted_at IS NULL）
// DELETE /api/messages?id=xx[&by=user] —— 软删（写 deleted_at/deleted_by）
// PATCH /api/messages?id=xx —— 恢复（清 deleted_at）；body { action: 'restore' }

const SUPABASE = 'https://vktbawcubmdmkqzadmto.supabase.co/rest/v1'

function sbHeaders(env) { return { 'apikey': env.SUPABASE_SECRET_KEY, 'Authorization': `Bearer ${env.SUPABASE_SECRET_KEY}`, 'Content-Type': 'application/json' } }
function sbReturn(env) { return { ...sbHeaders(env), 'Prefer': 'return=representation' } }

export async function onRequestGet(context) {
  const { request, env } = context
  const url = new URL(request.url)
  const mode = url.searchParams.get('mode') || ''
  // mode=deleted：跨会话查最近撤回（恢复面板用）
  if (mode === 'deleted') {
    const res = await fetch(
      `${SUPABASE}/messages?select=id,conversation_id,role,content,deleted_at,deleted_by&deleted_at=not.is.null&order=deleted_at.desc&limit=20`,
      { headers: sbHeaders(env) }
    )
    const data = await res.json()
    return new Response(JSON.stringify({ messages: Array.isArray(data) ? data : [] }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
  const cid = url.searchParams.get('conversationId')
  if (!cid) {
    return new Response(JSON.stringify({ error: 'conversationId required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
  const includeDeleted = url.searchParams.get('includeDeleted') === '1'
  const includeTools = url.searchParams.get('includeTools') === '1'
  // ⚠️ thinking 字段必须拉取：DeepSeek thinking 模式要求历史里带思考链的 assistant 消息
  // 原样回传 reasoning_content，否则刷新后（thinking 从内存丢失）下一轮请求直接 400。
  // 思考链确实是大字段，但无法截断（截断同样 400），由前端 40 条历史 + 后端 token 裁剪兜底体积。
  // 注意：PostgREST 默认 limit=1000，会话超 1000 条时升序查询会截断掉最新消息
  // （表现：刷新后停在旧消息，刚聊的新消息没了）。改为 desc 取最新 2000 条再逆序，保证最新消息必达。
  const MSG_MAX = 2000
  let q = `${SUPABASE}/messages?conversation_id=eq.${cid}&select=id,conversation_id,role,content,tool_calls,meta,thinking,created_at,deleted_at,deleted_by,tool_call_id&order=created_at.desc&limit=${MSG_MAX}`
  if (!includeDeleted) q += `&deleted_at=is.null`
  if (!includeTools) q += `&role=neq.tool`
  const res = await fetch(q, { headers: sbHeaders(env) })
  const data = await res.json()
  let messages = Array.isArray(data) ? data : []
  messages.reverse() // desc → asc，恢复时间顺序（与灰字合并排序兼容）
  // 合并「钟泽沉默唤醒」灰字 + 「她在想」小注 + 「梦的余韵」：无对话归属，按时间插入整段时间线，
  // 作为存在痕（不进对话气泡）。前端 normalize 识别 kind 渲染灰色小字。
  // 只取最近 20 条，避免历史灰字无限累积导致新建对话刷屏一堆。
  try {
    const wr = await fetch(
      `${SUPABASE}/project_events?type=in.(wake_silent,wake_intent,wake_dream)&select=id,type,summary,created_at&order=created_at.desc&limit=20`,
      { headers: sbHeaders(env) }
    )
    const wrows = await wr.json()
    if (Array.isArray(wrows) && wrows.length) {
      const gray = wrows.map(w => ({
        id: (w.type || 'wake_silent') + ':' + (w.created_at || ''),
        role: 'system',
        kind: w.type || 'wake_silent',
        content: w.summary || '',
        created_at: w.created_at,
        meta: { wakeSilent: w.type === 'wake_silent', wakeIntent: w.type === 'wake_intent', wakeDream: w.type === 'wake_dream' },
      })).reverse() // desc → asc，与主消息流时间序一致
      messages = [...messages, ...gray].sort(
        (a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0)
      )
    }
  } catch (_) { /* 灰字不可达不影响主消息流 */ }
  // 附带会话分层摘要（conversation_summaries，由 stream-compress 维护）：前端「更早的对话」卡片用
  let summary = ''
  try {
    const sr = await fetch(
      `${SUPABASE}/conversation_summaries?conversation_id=eq.${cid}&select=summary&limit=1`,
      { headers: sbHeaders(env) }
    )
    const srows = await sr.json()
    if (Array.isArray(srows) && srows[0]?.summary) summary = String(srows[0].summary)
  } catch (_) {}
  return new Response(JSON.stringify({ messages, summary }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}

export async function onRequestDelete(context) {
  const { request, env } = context
  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  const cid = url.searchParams.get('conversationId')
  const content = url.searchParams.get('content')
  if (!id && !(cid && content)) return json(400, { error: 'id 或 conversationId+content 必填' })
  const by = url.searchParams.get('by') || 'user'
  // 优先按 id 软删（历史消息有真实 DB id）
  let deleted = 0
  if (id) {
    const res = await fetch(`${SUPABASE}/messages?id=eq.${id}&deleted_at=is.null`, {
      method: 'PATCH',
      headers: sbReturn(env),
      body: JSON.stringify({ deleted_at: new Date().toISOString(), deleted_by: by }),
    })
    if (res.ok) deleted = (await res.json()).length || 0
  }
  // id 未命中（前端本地 uid 消息未回传 DB id）→ 按会话+内容匹配最近一条
  if (!deleted && cid && content) {
    const q = `${SUPABASE}/messages?conversation_id=eq.${encodeURIComponent(cid)}&role=eq.user&content=eq.${encodeURIComponent(content)}&deleted_at=is.null&select=id&order=id.desc&limit=1`
    const look = await fetch(q, { headers: sbHeaders(env) })
    const rows = await look.json()
    if (Array.isArray(rows) && rows[0]?.id) {
      const res = await fetch(`${SUPABASE}/messages?id=eq.${rows[0].id}`, {
        method: 'PATCH',
        headers: sbReturn(env),
        body: JSON.stringify({ deleted_at: new Date().toISOString(), deleted_by: by }),
      })
      if (res.ok) deleted = (await res.json()).length || 0
    }
  }
  return json(200, { ok: deleted > 0, deleted })
}

export async function onRequestPatch(context) {
  const { request, env } = context
  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  if (!id) return json(400, { error: 'id required' })
  const body = await request.json().catch(() => ({}))
  if (body.action !== 'restore') return json(400, { error: 'action must be restore' })
  const res = await fetch(`${SUPABASE}/messages?id=eq.${id}`, {
    method: 'PATCH',
    headers: sbReturn(env),
    body: JSON.stringify({ deleted_at: null, deleted_by: null }),
  })
  if (!res.ok) return json(500, { error: `supabase [${res.status}]` })
  return json(200, { ok: true })
}

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}
