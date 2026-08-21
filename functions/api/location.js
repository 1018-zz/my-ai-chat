// functions/api/location.js — 位置上报端点
//
// POST /api/location  — 手机（Macrodroid 等）上报 GPS 心跳
//    body: { lng, lat, accuracy?, is_gcj02?, skip_notify?, force_full? }
//    返回: 状态机结果 { state, state_changed, distance_from_home, ... }
// GET  /api/location  — 读当前位置状态（前端状态牌 / 调试用）
//
// 鉴权：若 env.LOCATION_TOKEN 已配置则要求 ?token= 或 Authorization: Bearer；
//       未配置时放行（内网/信任环境），避免 Macrodroid 配置复杂化。

import { processHeartbeat, loadStatus } from '../lib/locationSense.js'

export async function onRequestPost(context) {
  const { request, env } = context
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }

  // 鉴权（可选）
  if (env.LOCATION_TOKEN) {
    const auth = request.headers.get('authorization') || ''
    const url = new URL(request.url)
    const tok = url.searchParams.get('token') || (auth.startsWith('Bearer ') ? auth.slice(7) : '')
    if (tok !== env.LOCATION_TOKEN) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers })
    }
  }

  let body
  try { body = await request.json() } catch { return new Response(JSON.stringify({ error: 'invalid json' }), { status: 400, headers }) }

  const { lng, lat, accuracy = 0, is_gcj02 = false, skip_notify = false, force_full = false } = body
  if (lng == null || lat == null) return new Response(JSON.stringify({ error: '需要 lng/lat' }), { status: 400, headers })

  try {
    const r = await processHeartbeat(env, { lng, lat, accuracy, is_gcj02, skipNotify: !!skip_notify, forceFull: !!force_full })
    return new Response(JSON.stringify(r), { status: 200, headers })
  } catch (e) {
    return new Response(JSON.stringify({ error: `location: ${e.message}` }), { status: 500, headers })
  }
}

export async function onRequestGet(context) {
  const { env } = context
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  try {
    const s = await loadStatus(env)
    return new Response(JSON.stringify({
      state: s.state, lng: s.lng, lat: s.lat, accuracy: s.accuracy,
      address: s.address || '', city: s.city || '', city_cn: s.city_cn || '',
      distance_from_home: s.distance_from_home,
      home_set: s.home_lng != null,
      updated_at: s.updated_at,
    }), { status: 200, headers })
  } catch (e) {
    return new Response(JSON.stringify({ error: `location: ${e.message}` }), { status: 500, headers })
  }
}

export async function onRequestOptions() {
  return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } })
}
