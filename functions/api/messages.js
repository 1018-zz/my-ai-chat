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
  const hard = url.searchParams.get('hard') === '1'
  if (!id && !(cid && content)) return json(400, { error: 'id 或 conversationId+content 必填' })
  const by = url.searchParams.get('by') || 'user'
  // 前端消息 id 是本地 uid()，与 Supabase 自增/UUID 不一致，所以必须支持「按会话+内容兜底匹配」。
  // 硬删（聊天里"删除"用）直接 DELETE 命中的行；软删（撤回用）PATCH deleted_at 保留可恢复。
  const delById = async (rid) => {
    const res = await fetch(`${SUPABASE}/messages?id=eq.${rid}`, { method: 'DELETE', headers: sbHeaders(env) })
    return res.ok
  }
  const softById = async (rid) => {
    const res = await fetch(`${SUPABASE}/messages?id=eq.${rid}&deleted_at=is.null`, {
      method: 'PATCH', headers: sbReturn(env),
      body: JSON.stringify({ deleted_at: new Date().toISOString(), deleted_by: by }),
    })
    return res.ok ? (await res.json()).length || 0 : 0
  }
  let handled = 0
  // 1) 优先按 id 直接处理（历史消息若已拿到 DB id）
  if (id) handled = hard ? (await delById(id) ? 1 : 0) : await softById(id)
  // 2) id 未命中（本地 uid）→ 按 conversation_id+content 匹配最近一条，自我/AI 消息都适用
  if (!handled && cid && content) {
    // like 后缀匹配：DB 里用户消息 content 带【时间 泠泠 …】前缀（runChatTurn 给上下文加的），
    // eq 精确匹配会 miss，用 like.*xxx 匹配以原文结尾的行（转义 * 避免通配符干扰）
    const escContent = content.replace(/[\\*]/g, m => '\\' + m)
    const q = `${SUPABASE}/messages?conversation_id=eq.${encodeURIComponent(cid)}&content=like.*${encodeURIComponent(escContent)}&deleted_at=is.null&select=id&order=id.desc&limit=1`
    const look = await fetch(q, { headers: sbHeaders(env) })
    const rows = await look.json()
    if (Array.isArray(rows) && rows[0]?.id) {
      const rid = rows[0].id
      handled = hard ? (await delById(rid) ? 1 : 0) : await softById(rid)
    }
  }
  return json(200, { ok: handled > 0, hard: !!hard })
}

export async function onRequestPatch(context) {
  const { request, env } = context
  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  if (!id) return json(400, { error: 'id required' })
  const body = await request.json().catch(() => ({}))
  // action=update：修改消息正文（编辑用户/AI 消息用），可选同步 thinking
  if (body.action === 'update') {
    const patch = {}
    if (typeof body.content === 'string') patch.content = body.content
    if (typeof body.thinking === 'string') patch.thinking = body.thinking
    if (!Object.keys(patch).length) return json(400, { error: 'content or thinking required' })
    const res = await fetch(`${SUPABASE}/messages?id=eq.${id}`, {
      method: 'PATCH',
      headers: sbReturn(env),
      body: JSON.stringify(patch),
    })
    if (!res.ok) return json(500, { error: `supabase [${res.status}]` })
    return json(200, { ok: true })
  }
  if (body.action !== 'restore') return json(400, { error: 'action must be restore|update' })
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
