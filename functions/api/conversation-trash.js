// functions/api/conversation-trash.js — 会话软删 / 恢复 / 回收站列表
// 不动现有 conversations.js / [id].js（永久删除仍走 DELETE /api/conversations/:id）。
//
// GET  /api/conversation-trash?mode=deleted        → 列出已软删（待恢复）的会话
// POST /api/conversation-trash { action:'soft',   id } → 标记删除（deleted_at），消息不动
// POST /api/conversation-trash { action:'restore',id } → 清除 deleted_at，恢复
//
// 彻底删除（连同消息从数据库移除、不可恢复）走：DELETE /api/conversations/:id

const SUPABASE = 'https://vktbawcubmdmkqzadmto.supabase.co/rest/v1'

function sbHeaders(env) { return { 'apikey': env.SUPABASE_SECRET_KEY, 'Authorization': `Bearer ${env.SUPABASE_SECRET_KEY}`, 'Content-Type': 'application/json' } }
function sbReturn(env) { return { ...sbHeaders(env), 'Prefer': 'return=representation' } }
function json(status, body) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }) }

export async function onRequestGet(context) {
  const { request, env } = context
  const url = new URL(request.url)
  if (url.searchParams.get('mode') !== 'deleted') return json(400, { error: 'use ?mode=deleted' })
  try {
    const res = await fetch(
      `${SUPABASE}/conversations?select=id,title,updated_at,deleted_at&deleted_at=not.is.null&order=deleted_at.desc&limit=200`,
      { headers: sbHeaders(env) }
    )
    const data = await res.json()
    return json(200, { conversations: Array.isArray(data) ? data : [] })
  } catch (e) { return json(500, { error: e.message }) }
}

export async function onRequestPost(context) {
  const { request, env } = context
  try {
    const body = await request.json().catch(() => ({}))
    const id = body.id
    const action = body.action
    if (!id) return json(400, { error: 'id required' })
    if (action !== 'soft' && action !== 'restore') return json(400, { error: 'action must be soft|restore' })
    const patch = action === 'soft'
      ? { deleted_at: new Date().toISOString() }
      : { deleted_at: null }
    const res = await fetch(`${SUPABASE}/conversations?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: sbReturn(env),
      body: JSON.stringify(patch),
    })
    if (!res.ok) return json(500, { error: `supabase [${res.status}]` })
    return json(200, { ok: true, action })
  } catch (e) { return json(500, { error: e.message }) }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}
