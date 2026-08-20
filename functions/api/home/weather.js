// functions/api/home/weather.js — LAIR 状态牌用的天气端点（呈现层，不决定 AI 感知）
import { getWeather } from '../../lib/weather.js'

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url)
  // 不传 city 时，由 getWeather 内部解析泠泠当前所在（user_location），实现"状态牌跟随她在哪"
  const city = url.searchParams.get('city')
  try {
    const d = await getWeather(city, env)
    return new Response(JSON.stringify({ ok: true, weather: d }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, message: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
}
