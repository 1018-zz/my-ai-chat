// functions/api/push.js — Web Push 订阅管理（运行层 wake/push.js 的 HTTP 入口）
// GET  /api/push            → { publicKey }（前端订阅时要用）
// POST /api/push            → body.action:
//    subscribe   { subscription } → 存订阅
//    unsubscribe { endpoint }     → 删订阅
//    test        { title, body }  → 给所有订阅发一条测试通知
import { addSubscription, removeSubscription, sendPushToAll, getPublicKey } from '../../wake/push.js'

const CORS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS })
}

export async function onRequestGet() {
  try {
    return json({ publicKey: getPublicKey() })
  } catch (e) {
    return json({ error: String(e.message) }, 500)
  }
}

export async function onRequestPost(context) {
  let body = {}
  try {
    body = await context.request.json()
  } catch {
    return json({ error: 'invalid json' }, 400)
  }
  const action = body.action

  if (action === 'subscribe') {
    if (!body.subscription || !body.subscription.endpoint) {
      return json({ error: 'subscription required' }, 400)
    }
    const added = addSubscription(body.subscription)
    return json({ ok: true, added })
  }

  if (action === 'unsubscribe') {
    if (!body.endpoint) return json({ error: 'endpoint required' }, 400)
    const removed = removeSubscription(body.endpoint)
    return json({ ok: true, removed })
  }

  if (action === 'test') {
    const payload = { title: body.title || '小家', body: body.body || '推送测试成功 ✅' }
    try {
      const r = await sendPushToAll(payload)
      return json({ ok: true, result: r })
    } catch (e) {
      return json({ error: String(e.message) }, 500)
    }
  }

  return json({ error: 'unknown action' }, 400)
}

export async function onRequestDelete(context) {
  let body = {}
  try { body = await context.request.json() } catch {}
  if (!body.endpoint) return json({ error: 'endpoint required' }, 400)
  const removed = removeSubscription(body.endpoint)
  return json({ ok: true, removed })
}
