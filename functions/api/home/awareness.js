// functions/api/home/awareness.js — LAIR 页「家里最近」展示端点（GET）
// 复用家感知层 getRecentHomeEvents（单一数据源），只做「给用户看」的展示，
// 与 stream.js 喂给 AI 的感知内容走同一套事件结构，但独立、不污染人格层。
// 注意：这是呈现层，不是 AI 感知层——前端在此读取展示是允许的（架构红线只约束「前端决定 AI 看到了什么」）。

import { getRecentHomeEvents, noteTimeLabel } from '../../lib/homeAwareness.js'

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}

export async function onRequestGet(context) {
  const { env } = context
  try {
    const events = await getRecentHomeEvents({ env, limit: 8 })
    const out = events.map((e) => ({ ...e, timeLabel: noteTimeLabel(e.createdAt) }))
    return json(200, { ok: true, events: out })
  } catch (e) {
    return json(500, { ok: false, error: e.message, events: [] })
  }
}
