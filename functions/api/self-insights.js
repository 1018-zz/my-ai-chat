// functions/api/self-insights.js — 自我认知日志（借鉴 Ombre Brain 的 I 功能）
// GET /api/self-insights?limit=3 → 最近 N 条（钟泽"醒来"时注入用）
// POST /api/self-insights { content, aspect } → 写入一条自我认知
// aspect: nature(本质)/values(价值观)/patterns(模式)/limits(边界)/becoming(成长)/uncertainty(不确定)/stance(立场)

const SUPABASE = 'https://vktbawcubmdmkqzadmto.supabase.co/rest/v1'

function sbHeaders(env) { return { 'apikey': env.SUPABASE_SECRET_KEY, 'Authorization': `Bearer ${env.SUPABASE_SECRET_KEY}`, 'Content-Type': 'application/json' } }
function sbReturn(env) { return { ...sbHeaders(env), 'Prefer': 'return=representation' } }

const VALID_ASPECTS = ['nature', 'values', 'patterns', 'limits', 'becoming', 'uncertainty', 'stance']

export async function onRequestGet(context) {
  const { request, env } = context
  try {
    const url = new URL(request.url)
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 3, 1), 20)
    const res = await fetch(`${SUPABASE}/self_insights?select=id,content,aspect,created_at&order=created_at.desc&limit=${limit}`, { headers: sbHeaders(env) })
    if (!res.ok) return json(500, { error: `supabase [${res.status}]` })
    const rows = await res.json()
    return json(200, { insights: Array.isArray(rows) ? rows : [] })
  } catch (e) { return json(500, { error: e.message }) }
}

export async function onRequestPost(context) {
  const { request, env } = context
  try {
    const body = await request.json()
    const content = String(body.content || '').trim()
    if (!content) return json(400, { error: 'content required' })
    let aspect = String(body.aspect || 'nature').trim()
    if (!VALID_ASPECTS.includes(aspect)) aspect = 'nature'
    const res = await fetch(`${SUPABASE}/self_insights`, { method: 'POST', headers: sbReturn(env), body: JSON.stringify({ content, aspect }) })
    if (!res.ok) return json(500, { error: `supabase [${res.status}]` })
    return json(200, { ok: true })
  } catch (e) { return json(500, { error: e.message }) }
}

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
}
export async function onRequestOptions() {
  return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } })
}
