// weather.js — 小家环境感知层（不是普通天气接口）
// 单一数据源：mcp.js 的 get_weather 工具与前端 /api/home/weather 端点都复用它。
// 不依赖 env（wttr.in 无需密钥）；城市默认镇沅县（泠泠所在）。
//
// 设计：天气数据 → 泠泠此刻所在环境 → 钟泽理解她今天的状态。
// 返回分两层：旧字段（兼容 mcp.js / 前端状态牌）+ 新结构化（environment / feeling / homeAtmosphere）。

const WTTRLANG = 'zh'
const SUPABASE = 'https://vktbawcubmdmkqzadmto.supabase.co/rest/v1'
function sbHeaders(env) { return { 'apikey': env.SUPABASE_SECRET_KEY, 'Authorization': `Bearer ${env.SUPABASE_SECRET_KEY}`, 'Content-Type': 'application/json' } }

// 读泠泠当前所在城市（位置感知单一数据源：user_location 单行 id=1）。
// 失败 / 未配密钥 / 表还没建 → 回退镇沅县，绝不抛错打断主链路。
export async function resolveLocation(env) {
  const fallback = { city: 'Zhenyuan', cityCn: '镇沅县' }
  if (!env || !env.SUPABASE_SECRET_KEY) return fallback
  try {
    const r = await fetch(`${SUPABASE}/user_location?id=eq.1&select=city,city_cn&limit=1`, { headers: sbHeaders(env) })
    if (!r.ok) return fallback
    const rows = await r.json()
    const row = Array.isArray(rows) && rows[0]
    if (!row) return fallback
    return {
      city: (row.city ? String(row.city).trim() : 'Zhenyuan') || 'Zhenyuan',
      cityCn: row.city_cn ? String(row.city_cn).trim() : '',
    }
  } catch (_) { return fallback }
}

// 天气描述词表：抗 wttr.in 的变体（Light rain shower / Patchy rain possible / Heavy rain…）
const WEATHER_MAP = {
  snow: ['snow', 'sleet', '雪'],
  fog: ['fog', 'mist', '雾'],
  thunder: ['thunder', '雷'],
  rain: ['rain', 'drizzle', 'shower', '雨', 'rain shower', 'patchy rain', 'light rain', 'heavy rain'],
}

// —— 上海时区（泠泠所在），以后她旅行/换区只需改这里 ——
function nowShanghai() {
  const now = new Date()
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', hour12: false }).format(now))
  const month = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', month: '2-digit' }).format(now))
  return { hour, month }
}

function detectSky(desc, cloud) {
  const d = (desc || '').toLowerCase()
  for (const [key, words] of Object.entries(WEATHER_MAP)) {
    if (words.some((w) => d.includes(w))) return key
  }
  if (cloud >= 80) return '阴'
  if (cloud >= 30) return '多云'
  return '晴'
}

// ① 抓取 + 取数（原始）
async function parseWeather(city = 'Zhenyuan') {
  const w = await fetch(`https://v2.wttr.in/${encodeURIComponent(city)}?format=j1&lang=${WTTRLANG}`, {
    headers: { 'User-Agent': 'my-ai-chat' },
  })
  if (!w.ok) throw new Error(`wttr.in [${w.status}]：天气查询失败`)
  const j = await w.json()
  const cc = j.current_condition?.[0]
  if (!cc) throw new Error('天气数据为空（城市名可能不对）')
  const area = j.nearest_area?.[0]
  const areaName = area?.areaName?.[0]?.value || city
  const region = area?.region?.[0]?.value || ''
  const tempC = Number(cc.temp_C)
  const feelsC = Number(cc.FeelsLikeC)
  const humidity = Number(cc.humidity)
  const windspeed = Number(cc.windspeedKmph)
  const weatherDesc = cc.weatherDesc?.[0]?.value || cc.lang_zh?.[0]?.value || ''
  const cloud = Number(cc.cloudcover || 0)
  const today = j.weather?.[0]
  const sunRise = today?.astronomy?.[0]?.sunrise || ''
  const sunSet = today?.astronomy?.[0]?.sunset || ''
  const maxT = today?.maxtempC
  const minT = today?.mintempC
  return { areaName, region, tempC, feelsC, humidity, windspeed, weatherDesc, cloud, sunRise, sunSet, maxT, minT }
}

// ② 六轴分析：地点 / 季节 / 时段 / 天空 / 风 / 湿度
function analyzeEnvironment(raw) {
  const { hour, month } = nowShanghai()
  const season = month >= 3 && month <= 5 ? '春' : month >= 6 && month <= 8 ? '夏' : month >= 9 && month <= 11 ? '秋' : '冬'
  const period = hour < 6 ? '深夜' : hour < 9 ? '早晨' : hour < 12 ? '上午' : hour < 14 ? '中午' : hour < 17 ? '下午' : hour < 19 ? '傍晚' : hour < 23 ? '夜晚' : '深夜'
  const sky = detectSky(raw.weatherDesc, raw.cloud)
  const wind = raw.windspeed >= 62 ? '大风' : raw.windspeed >= 20 ? '有风' : raw.windspeed >= 8 ? '微风' : '无风'
  const humidity = raw.humidity >= 85 ? '潮湿' : raw.humidity >= 70 ? '微潮' : raw.humidity >= 45 ? '干爽' : '干燥'
  return { place: raw.areaName, season, period, sky, wind, humidity }
}

// ③ 泠泠种子体感（她的声音，永不覆盖）—— 雨天按温度分档，避免"雨天永远一样"
function getLingLingFeeling({ tempC, sky, season, period }) {
  if (sky === '雨') {
    if (tempC >= 30) return { text: '下着雨，空气闷闷的，潮湿又难呼吸。除非这会儿起了凉风，那才沁人心脾。', tag: '闷热雨' }
    if (tempC < 15) return { text: '下着雨，湿冷湿冷的，缩在屋里最舒服。', tag: '湿冷雨' }
    return { text: '下着雨，空气潮潮的，窗外雾蒙蒙的，屋里反而安稳。', tag: '潮湿柔和' }
  }
  if (sky === '雪') return { text: '难得见雪，空气冷得清透，亮晶晶的。', tag: '遇雪' }
  if (sky === '雾') return { text: '起了雾，四周软乎乎的，看不太远，空气潮潮的。', tag: '薄雾' }
  if (sky === '雷') return { text: '打雷了，空气又闷又重，像是憋着一场雨。', tag: '闷雷' }
  if (season === '冬') {
    if (period === '早晨' || period === '夜晚' || period === '深夜') return { text: '风吹过来凉飕飕的，落在脸上反而让人心情不错——干爽，清爽。', tag: '干爽凉' }
    return { text: '中午热起来，外套穿不住，一动就容易出汗，脱了又有点凉。', tag: '冬日暖' }
  }
  if (season === '夏') {
    if (period === '早晨' || period === '夜晚' || period === '深夜') return { text: '早晚很舒服，不用出门就没有汗，空气也刚刚好。', tag: '夏夜爽' }
    if (tempC >= 33) return { text: '一出太阳就闷热，汗黏黏的，闷得难受。', tag: '酷暑' }
    return { text: '太阳照着，湿热湿热的，出门就是一身汗。', tag: '夏日闷' }
  }
  if (period === '早晨' || period === '夜晚' || period === '深夜') return { text: '早晚很舒服，正是穿长袖最舒服的时候。', tag: '春秋爽' }
  if (period === '中午' || period === '下午') return { text: '中午还是热，短袖正好，一动还是会出汗。', tag: '午间暖' }
  return { text: '温度不低，早晚舒服，中午短袖。', tag: '平稳' }
}

// ④ 小家环境氛围：时间打底 + 天气调制（墙面/光线/氛围/钟泽一句话）
function deriveHomeAtmosphere(env) {
  const { sky, period } = env
  const dayBase = {
    深夜: { wall: '#2a2640', light: '#3a3358' },
    早晨: { wall: '#efe7d8', light: '#fff6e6' },
    上午: { wall: '#f3eee2', light: '#fff8ec' },
    中午: { wall: '#f6f1e6', light: '#fffaf0' },
    下午: { wall: '#f3ead8', light: '#fff4e0' },
    傍晚: { wall: '#ece0cf', light: '#ffeede' },
    夜晚: { wall: '#352f47', light: '#4a4068' },
  }
  const base = dayBase[period] || dayBase['夜晚']
  let theme = sky, wall = base.wall, light = base.light, atmosphere = 'calm', message
  if (sky === '雨') { wall = '#8a93a8'; light = '#d8dde6'; atmosphere = 'quiet'; message = '外面下着雨，家里适合安静一点' }
  else if (sky === '雪') { wall = '#e6ecf4'; light = '#f4f8ff'; atmosphere = 'still'; message = '下雪了，安静得能听见自己的呼吸' }
  else if (sky === '雾') { wall = '#dfe0e2'; light = '#eef0f2'; atmosphere = 'soft'; message = '起了雾，四周软乎乎的' }
  else if (sky === '雷') { wall = '#3a3a4e'; light = '#4a4a66'; atmosphere = 'heavy'; message = '打雷了，窝在家里最安心' }
  else if (sky === '晴' && (period === '夜晚' || period === '深夜')) { wall = '#2c2e44'; light = '#3e4a6a'; atmosphere = 'clear'; message = '夜里晴，窗外有星星' }
  else if (sky === '晴') { atmosphere = 'open'; message = '今天阳光很好' }
  else if (sky === '阴') { atmosphere = 'calm'; message = '阴天，光线柔柔的' }
  else if (sky === '多云') { atmosphere = 'easy'; message = '云有点多，不晒' }
  else { message = '今天天气平平，正好待着' }
  return { theme, wall, light, atmosphere, message }
}

// ⑤ 拼装：兼容旧字段 + 新结构化
// 城市解析优先级：显式传入 city（如钟泽问某城天气）> 库里泠泠当前所在（user_location）> 镇沅县兜底。
export async function getWeather(city, env) {
  let usedCity, usedCn
  if (city && String(city).trim()) {
    usedCity = String(city).trim()
    usedCn = ''
  } else if (env) {
    const loc = await resolveLocation(env)
    usedCity = loc.city
    usedCn = loc.cityCn
  } else {
    usedCity = 'Zhenyuan'
    usedCn = '镇沅县'
  }
  const raw = await parseWeather(usedCity)
  const env2 = analyzeEnvironment(raw)
  const feeling = getLingLingFeeling({ ...raw, ...env2 })
  const hard = `${env2.place} · ${env2.season} · ${env2.sky} · ${env2.period} · ${env2.wind} · ${env2.humidity}`
  const numbers = `${raw.tempC}°C（体感 ${raw.feelsC}°C）｜湿度 ${raw.humidity}%｜${env2.wind}｜${env2.sky}｜日出 ${raw.sunRise} 日落 ${raw.sunSet}`
  const rhinitis = env2.season === '春' ? '（春天你鼻炎容易犯，出门记得带上纸。）' : ''
  const wx = `${feeling.text}${rhinitis}\n\n[坐标] ${hard}\n[数据] ${numbers}${raw.maxT ? `｜今日 ${raw.minT}~${raw.maxT}°C` : ''}`
  const homeAtmosphere = deriveHomeAtmosphere(env2)
  return {
    // —— 兼容旧字段（mcp.js 用 wx；前端状态牌用 sky/seed/season/period/tempC）——
    areaName: env2.place, region: raw.region, tempC: raw.tempC, feelsC: raw.feelsC,
    humidity: raw.humidity, windspeed: raw.windspeed, weatherDesc: raw.weatherDesc, cloud: raw.cloud,
    sunRise: raw.sunRise, sunSet: raw.sunSet, maxT: raw.maxT, minT: raw.minT,
    season: env2.season, period: env2.period, sky: env2.sky, windLevel: env2.wind, moist: env2.humidity,
    seed: feeling.text, rhinitis, hard, numbers, wx,
    // —— 新结构化 ——
    raw: {
      tempC: raw.tempC, feelsC: raw.feelsC, humidity: raw.humidity,
      windspeed: raw.windspeed, cloud: raw.cloud, weatherDesc: raw.weatherDesc,
    },
    environment: env2,
    feeling,
    homeAtmosphere,
    // —— 位置：泠泠当前所在（供状态牌/感知层展示「你在哪」）——
    location: { city: usedCity, cityCn: usedCn },
  }
}
