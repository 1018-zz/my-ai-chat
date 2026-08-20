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
  // 瘦身查询：不拉 thinking（思考链全文）大字段；默认过滤 role=tool（工具结果，每条最多几千字符）
  let q = `${SUPABASE}/messages?conversation_id=eq.${cid}&select=id,conversation_id,role,content,tool_calls,meta,created_at,deleted_at,deleted_by,tool_call_id&order=created_at.asc`
  if (!includeDeleted) q += `&deleted_at=is.null`
  if (!includeTools) q += `&role=neq.tool`
  const res = await fetch(q, { headers: sbHeaders(env) })
  const data = await res.json()
  let messages = Array.isArray(data) ? data : []
  // 合并「钟泽沉默唤醒」灰字 + 「她在想」小注 + 「梦的余韵」：无对话归属，按时间插入整段时间线，
  // 作为存在痕（不进对话气泡）。前端 normalize 识别 kind 渲染灰色小字。
  try {
    const wr = await fetch(
      `${SUPABASE}/project_events?type=in.(wake_silent,wake_intent,wake_dream)&select=id,type,summary,created_at&order=created_at.asc`,
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
      }))
      messages = [...messages, ...gray].sort(
        (a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0)
      )
    }
  } catch (_) { /* 灰字不可达不影响主消息流 */ }
  return new Response(JSON.stringify({ messages }), {
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
