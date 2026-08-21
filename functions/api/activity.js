// functions/api/activity.js — 手机活动上报（Macrodroid / 自动化工具调用）
// POST /api/activity  （注意：路由按文件路径生成，是 /api/activity，不是 /api/phone/activity）
//   Header: X-Auth-Token: <phone_secret>
//   Body:   { "app": "小红书", "event": "switch" }
// 写入 project_events(type=phone_activity)，供唤醒时让钟泽知道「她在用什么 App」
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SECRET_PATH = path.join(__dirname, '..', '..', 'phone_secret.txt')
const SUPABASE = 'https://vktbawcubmdmkqzadmto.supabase.co/rest/v1'
const CORS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }

function readSecret() {
  try { return fs.readFileSync(SECRET_PATH, 'utf8').trim() } catch { return '' }
}

export async function onRequestPost(context) {
  const token = context.request.headers.get('X-Auth-Token') || ''
  const secret = readSecret()
  if (!secret || token !== secret) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: CORS })
  }
  let body = {}
  try { body = await context.request.json() } catch { return new Response(JSON.stringify({ error: 'invalid json' }), { status: 400, headers: CORS }) }
  const app = String(body.app || '').trim()
  const event = String(body.event || 'switch').trim()
  if (!app) return new Response(JSON.stringify({ error: 'app required' }), { status: 400, headers: CORS })

  const env = context.env || {}
  const key = env.SUPABASE_SECRET_KEY
  if (!key) return new Response(JSON.stringify({ error: 'server misconfig' }), { status: 500, headers: CORS })

  try {
    const res = await fetch(`${SUPABASE}/project_events`, {
      method: 'POST',
      headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        type: 'phone_activity',
        title: '手机活动',
        summary: `${app} (${event})`,
        source: 'phone',
        status: 'seen',
      }),
    })
    if (!res.ok) {
      const t = await res.text().catch(() => '')
      return new Response(JSON.stringify({ error: 'sb ' + res.status, detail: t.slice(0, 120) }), { status: 502, headers: CORS })
    }
    return new Response(JSON.stringify({ ok: true }), { headers: CORS })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e.message) }), { status: 500, headers: CORS })
  }
}
