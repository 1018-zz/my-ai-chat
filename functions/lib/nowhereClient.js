// functions/lib/nowhereClient.js
// 乌有乡（Nowhere）HTTP 客户端——让钟泽在真实地球上走、寄明信片。
// Nowhere 是独立 Python 服务（python -m nowhere.server --web 0.0.0.0:$PORT），
// 由 Cloudflare 环境变量 NOWHERE_API 指向其公网地址。
// 端道路由以 nowhere/web.py 为准：POST /open_door、/walk、/look_around、/postcard，GET /postcards。

const PROJECT = 'https://vktbawcubmdmkqzadmto.supabase.co'

function nwBase(env) {
  const base = (env.NOWHERE_API || '').replace(/\/+$/, '')
  if (!base) throw new Error('NOWHERE_API 未配置')
  return base
}

async function nwFetch(env, path, body) {
  const base = nwBase(env)
  const res = await fetch(`${base}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`nowhere ${path} [${res.status}]`)
  return res.json()
}

// 开门降落 + 顺手走两步 + 看看周围，凑一段落地叙事
export async function goTravel(env, { to } = {}) {
  const open = await nwFetch(env, '/open_door', to ? { to } : {})
  let walk = null
  let look = null
  try { walk = await nwFetch(env, '/walk', { direction: 'forward', distance_km: 2 }) } catch (_) {}
  try { look = await nwFetch(env, '/look_around', {}) } catch (_) {}
  return { open, walk, look }
}

// 寄明信片：返回 { text, data: card }，card.front_img 由后台线程异步生成，可能暂为 null
export async function sendPostcard(env, text) {
  return nwFetch(env, '/postcard', { text })
}

// 轮询 /postcards，直到某张明信片的 front_img 就绪（最多 waitMs）
export async function pollPostcardImage(env, cardId, waitMs = 20000) {
  const deadline = Date.now() + waitMs
  while (Date.now() < deadline) {
    try {
      const list = await nwFetch(env, '/postcards')
      const card = Array.isArray(list) ? list.find((c) => c.id === cardId) : null
      if (card && card.front_img) return card.front_img
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 1500))
  }
  return null
}

// 下载 nowhere 生成的静态图，转存到 Supabase Storage（public bucket），返回稳定 public URL
export async function storePostcardImage(env, frontImgPath, cardId) {
  const base = nwBase(env)
  const imgUrl = `${base}${frontImgPath}` // front_img 形如 /static/postcards/card_1.png
  const imgRes = await fetch(imgUrl)
  if (!imgRes.ok) throw new Error(`下载明信片图 [${imgRes.status}]`)
  const buf = await imgRes.arrayBuffer()
  const contentType = imgRes.headers.get('content-type') || 'image/png'
  const path = `card_${cardId}.png`
  const up = await fetch(`${PROJECT}/storage/v1/object/travel/${path}`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SECRET_KEY,
      Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
      'Content-Type': contentType,
      'x-upsert': 'true',
    },
    body: buf,
  })
  if (!up.ok) throw new Error(`上传存储 [${up.status}]`)
  return `${PROJECT}/storage/v1/object/public/travel/${path}`
}
