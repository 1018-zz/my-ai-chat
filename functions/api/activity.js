// functions/api/activity.js — 手机活动上报（Macrodroid / 自动化工具调用）
// POST /api/activity  （注意：路由按文件路径生成，是 /api/activity，不是 /api/phone/activity）
//   Header: X-Auth-Token: <phone_secret>
//   Body:   { "app": "小红书", "event": "switch" }
// 写入 project_events(type=phone_activity)，供唤醒时让钟泽知道「她在用什么 App」
//
// 节流设计：同一 App 3 分钟内只保留最新一条——Macrodroid 的前台应用触发器
// 在 App 内部切界面（评论页/直播/搜索）也会触发，不加节流会刷爆 project_events。
// 去重规则：查询最近一条 phone_activity，若 App 相同且 < 3 分钟 → 只更新时间，不新增行。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SECRET_PATH = path.join(__dirname, '..', '..', 'phone_secret.txt')
const SUPABASE = 'https://vktbawcubmdmkqzadmto.supabase.co/rest/v1'
const CORS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
const DEDUP_WINDOW_MS = 30 * 60_000  // 同 App 去重窗口：30 分钟

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
  const h = { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }

  try {
    // 节流：查最近一条 phone_activity，同 App 且在窗口内 → 只 PATCH updated_at，不新增
    const q = await fetch(
      `${SUPABASE}/project_events?select=id,summary,created_at&type=eq.phone_activity&order=created_at.desc&limit=1`,
      { headers: h }
    )
    let lastRow = null
    try { const rows = await q.json(); lastRow = Array.isArray(rows) ? rows[0] : null } catch (_) {}
    const sameApp = lastRow && String(lastRow.summary || '').startsWith(`${app} (`)
    const withinWindow = lastRow && (Date.now() - new Date(lastRow.created_at).getTime()) < DEDUP_WINDOW_MS

    if (sameApp && withinWindow && lastRow.id) {
      // 同一 App 短时间重复：更新最新时刻（让感知层读到的永远是最近一次），不新增
      await fetch(`${SUPABASE}/project_events?id=eq.${lastRow.id}`, {
        method: 'PATCH',
        headers: { ...h, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ updated_at: new Date().toISOString() }),
      })
      return new Response(JSON.stringify({ ok: true, deduped: true }), { headers: CORS })
    }

    const res = await fetch(`${SUPABASE}/project_events`, {
      method: 'POST',
      headers: { ...h, 'Prefer': 'return=minimal' },
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
