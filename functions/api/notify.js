// functions/api/notify.js — 供 Macrodroid 轮询「钟泽有没有新消息」
// GET /api/notify?token=<phone_secret>
//   → 有钟泽的新消息（自上次拉取以来）：返回纯文本内容（截断 ~120 字），并自动推进游标
//   → 无新消息：返回空字符串
//
// 有状态设计：用 VPS 本地文件 notify_cursor.json 记录「已提醒到哪个时间点」，
// Macrodroid 只需无脑轮询，不需要自己管理时间戳变量。
// 纯文本返回：Macrodroid 免费版只做「响应非空 → 弹通知」，不需要解析 JSON。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SECRET_PATH = path.join(__dirname, '..', '..', 'phone_secret.txt')
const CURSOR_PATH = path.join(__dirname, '..', '..', 'notify_cursor.json')
const SUPABASE = 'https://vktbawcubmdmkqzadmto.supabase.co/rest/v1'
const CORS = { 'Content-Type': 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*' }

function readSecret() {
  try { return fs.readFileSync(SECRET_PATH, 'utf8').trim() } catch { return '' }
}
function sbHeaders(env) {
  return { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`, 'Content-Type': 'application/json' }
}

// 游标：上次已提醒到哪个时间点（默认 5 分钟前，避免首次拉取把所有历史消息都弹一遍）
function readCursor() {
  try {
    const j = JSON.parse(fs.readFileSync(CURSOR_PATH, 'utf8'))
    if (j && j.after) return Number(j.after)
  } catch (_) {}
  return Date.now() - 5 * 60_000
}
function writeCursor(ts) {
  try { fs.writeFileSync(CURSOR_PATH, JSON.stringify({ after: ts })) } catch (_) {}
}

export async function onRequestGet(context) {
  const { request, env } = context
  const url = new URL(request.url)
  const token = url.searchParams.get('token') || ''
  const secret = readSecret()
  if (!secret || token !== secret) {
    return new Response('unauthorized', { status: 401, headers: CORS })
  }
  if (!env.SUPABASE_SECRET_KEY) return new Response('', { headers: CORS })

  const after = readCursor()
  const now = Date.now()
  const since = new Date(after).toISOString()
  try {
    const res = await fetch(
      `${SUPABASE}/messages?select=content,created_at&role=eq.assistant&created_at=gt.${encodeURIComponent(since)}&created_at=lte.${encodeURIComponent(new Date(now).toISOString())}&order=created_at.desc&limit=1`,
      { headers: sbHeaders(env) }
    )
    const rows = await res.json()
    const msg = Array.isArray(rows) ? rows[0] : null
    // 无论有没有消息，都把游标推进到「当前时刻」——只提醒一次，不重复弹历史
    writeCursor(now)
    if (!msg || !msg.content) return new Response('', { headers: CORS })
    let text = String(msg.content).replace(/\s+/g, ' ').trim()
    if (text.length > 120) text = text.slice(0, 120) + '…'
    return new Response(text, { headers: CORS })
  } catch (_) {
    return new Response('', { headers: CORS })
  }
}

export async function onRequestOptions() {
  return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } })
}
