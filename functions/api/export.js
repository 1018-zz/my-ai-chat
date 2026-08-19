// functions/api/export.js — 小家备份：导出整张表为 JSON
// GET /api/export?type=messages|memories|diaries|moments
// 用 service key 一次性拉全表返回 JSON（前端转 Blob 下载）
const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: CORS })
const SUPABASE = 'https://vktbawcubmdmkqzadmto.supabase.co/rest/v1'

const TABLE_MAP = {
  messages: 'messages?select=id,role,content,thinking,tool_calls,created_at&order=created_at.asc&limit=10000',
  memories: 'memories?select=id,summary,type,source,created_at&order=created_at.asc&limit=10000',
  diaries: 'diaries?select=id,content,author,date,mood,importance,created_at&order=created_at.asc&limit=10000',
  moments: 'moments?select=id,title,desc,front_img,stamp,created_at&order=created_at.asc&limit=1000',
}

export async function onRequestGet(context) {
  const env = context.env || {}
  const key = env.SUPABASE_SECRET_KEY
  if (!key) return json(500, { error: 'server misconfig' })
  const url = new URL(context.request.url)
  const type = url.searchParams.get('type') || ''
  const query = TABLE_MAP[type]
  if (!query) return json(400, { error: 'unknown type', supported: Object.keys(TABLE_MAP) })
  try {
    const r = await fetch(`${SUPABASE}/${query}`, {
      headers: { 'apikey': key, 'Authorization': `Bearer ${key}` },
    })
    if (!r.ok) {
      const t = await r.text().catch(() => '')
      return json(r.status, { error: `sb ${r.status}`, detail: t.slice(0, 200) })
    }
    const rows = await r.json()
    return json(200, { type, exported_at: new Date().toISOString(), count: Array.isArray(rows) ? rows.length : 0, data: rows })
  } catch (e) {
    return json(500, { error: String(e.message) })
  }
}

export async function onRequestOptions() {
  return new Response(null, { headers: CORS })
}