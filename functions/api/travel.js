// functions/api/travel.js — 旅行相册相册列表（GET）
// 读 travel 表（钟泽寄回的明信片），按时间倒序返回给 LAIR 相册展示。
// 公开读取：相册是给泠泠看的，无需登录。

const SUPABASE = 'https://vktbawcubmdmkqzadmto.supabase.co/rest/v1'

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}

export async function onRequestGet(context) {
  const { env } = context
  try {
    const res = await fetch(
      `${SUPABASE}/travel?select=id,place,lat,lon,text,img_url,stamp,created_at&order=created_at.desc&limit=60`,
      { headers: { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` } }
    )
    if (!res.ok) return json(500, { ok: false, error: `supabase[${res.status}]`, items: [] })
    const rows = await res.json()
    return json(200, { ok: true, items: Array.isArray(rows) ? rows : [] })
  } catch (e) {
    return json(500, { ok: false, error: e.message, items: [] })
  }
}
