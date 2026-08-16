// functions/api/home/weather.js — LAIR 状态牌用的天气端点（呈现层，不决定 AI 感知）
import { getWeather } from '../../lib/weather.js'

export async function onRequestGet({ request }) {
  const url = new URL(request.url)
  const city = url.searchParams.get('city') || 'Zhenyuan'
  try {
    const d = await getWeather(city)
    return new Response(JSON.stringify({ ok: true, ...d }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, message: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
}
