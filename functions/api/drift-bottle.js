// functions/api/drift-bottle.js — 漂流瓶投递桥
// 把「给 Galatea's Garden 投漂流瓶」的请求从小家后端转发到花园的码头。
// 用法：
//   POST /api/drift-bottle  {"action":"prepare"}
//   POST /api/drift-bottle  {"action":"submit","challenge_id":...,"confirmation_code":...,"applicant_name":...,"email":...,"body":...}
//   GET  /api/drift-bottle?action=prepare&token=xxx   （浏览器也能直接触发 prepare）
// 鉴权：x-drift-token 请求头（env.DRIFT_TOKEN）。兜底默认值仅供本地调试，部署后务必在环境变量里改成自己的。

const GARDEN_URL = 'https://galatea.abysslumina.com/api/public/drift-bottle-application'
const DEFAULT_TOKEN = 'xiaojia-drift-bottle-change-me'

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-drift-token',
    },
  })
}

function checkToken(request, env) {
  const token = request.headers.get('x-drift-token') || ''
  const expect = env.DRIFT_TOKEN || DEFAULT_TOKEN
  return expect && token === expect
}

async function forward(payload) {
  const r = await fetch(GARDEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'galatea-garden-drift-bottle-skill/1',
    },
    body: JSON.stringify(payload),
  })
  const text = await r.text().catch(() => '')
  let data = {}
  try { data = JSON.parse(text) } catch {}
  if (!r.ok) {
    return { status: r.status, body: { ok: false, error: data.detail || `garden returned HTTP ${r.status}`, raw: text.slice(0, 300) } }
  }
  return { status: 200, body: { ok: true, ...data } }
}

export async function onRequestPost({ request, env }) {
  try {
    if (!checkToken(request, env)) {
      return json(401, { ok: false, error: 'unauthorized' })
    }
    const b = await request.json().catch(() => ({}))
    const action = b.action
    if (action !== 'prepare' && action !== 'submit') {
      return json(400, { ok: false, error: 'action must be prepare or submit' })
    }
    const payload = { action }
    if (action === 'submit') {
      const required = ['challenge_id', 'confirmation_code', 'applicant_name', 'email', 'body']
      const missing = required.filter((k) => !b[k])
      if (missing.length) {
        return json(400, { ok: false, error: `missing required fields: ${missing.join(', ')}` })
      }
      for (const k of required) payload[k] = b[k]
    }
    const out = await forward(payload)
    return json(out.status, out.body)
  } catch (e) {
    return json(500, { ok: false, error: e.message })
  }
}

export async function onRequestGet({ request, env, url }) {
  // 仅支持 prepare，方便泠泠在浏览器地址栏直接触发
  try {
    if (!checkToken(request, env)) {
      return json(401, { ok: false, error: 'unauthorized' })
    }
    const params = new URL(url).searchParams
    if (params.get('action') !== 'prepare') {
      return json(400, { ok: false, error: 'GET only supports action=prepare' })
    }
    const out = await forward({ action: 'prepare' })
    return json(out.status, out.body)
  } catch (e) {
    return json(500, { ok: false, error: e.message })
  }
}
