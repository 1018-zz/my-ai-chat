// weather.js — 天气抓取 + 六轴解析 + 泠泠种子体感，返回结构化 JSON
// 单一数据源：mcp.js 的 get_weather 工具与前端 /api/home/weather 端点都复用它，避免两处算天气分叉
// 不依赖 env（wttr.in 无需密钥）；城市默认镇沅县（泠泠所在）

const WTTRLANG = 'zh'

export async function getWeather(city = 'Zhenyuan') {
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
  // 关键数值
  const tempC = Number(cc.temp_C)            // 实际温度
  const feelsC = Number(cc.FeelsLikeC)       // 体感温度
  const humidity = Number(cc.humidity)        // 湿度 %
  const windspeed = Number(cc.windspeedKmph) // 风速 km/h
  const weatherDesc = cc.weatherDesc?.[0]?.value || cc.lang_zh?.[0]?.value || ''
  const cloud = Number(cc.cloudcover || 0)   // 云量 %
  // 今日日出日落
  const today = j.weather?.[0]
  const sunRise = today?.astronomy?.[0]?.sunrise || ''
  const sunSet = today?.astronomy?.[0]?.sunset || ''
  const maxT = today?.maxtempC
  const minT = today?.mintempC

  // —— 六轴 + 温度给「此刻」定位 ——
  const bjNow = new Date(Date.now() + 8 * 3600 * 1000)
  const month1 = bjNow.getUTCMonth() + 1
  const season = (() => { if (month1 >= 3 && month1 <= 5) return '春'; if (month1 >= 6 && month1 <= 8) return '夏'; if (month1 >= 9 && month1 <= 11) return '秋'; return '冬' })()
  const h = bjNow.getUTCHours()
  const period = (() => { if (h < 6) return '深夜'; if (h < 9) return '早晨'; if (h < 12) return '上午'; if (h < 14) return '中午'; if (h < 17) return '下午'; if (h < 19) return '傍晚'; if (h < 23) return '夜晚'; return '深夜' })()
  const desc = weatherDesc.toLowerCase()
  const sky = (() => { if (/snow|雪|sleet/.test(desc)) return '雪'; if (/fog|mist|雾/.test(desc)) return '雾'; if (/thunder|雷/.test(desc)) return '雷'; if (/rain|drizzle|shower|雨/.test(desc)) return '雨'; if (cloud >= 80) return '阴'; if (cloud >= 30) return '多云'; return '晴' })()
  const windLevel = (() => { if (windspeed >= 62) return '大风'; if (windspeed >= 20) return '有风'; if (windspeed >= 8) return '微风'; return '无风' })()
  const moist = (() => { if (humidity >= 85) return '潮湿'; if (humidity >= 70) return '微潮'; if (humidity >= 45) return '干爽'; return '干燥' })()

  // —— 泠泠的种子体感（她亲手写，永不覆盖）——
  const seed = (() => {
    if (sky === '雨') return '下着雨，空气闷闷的。等雨停那一阵，会有蒸汽扑到脸上，潮湿又难呼吸。除非这会儿起了凉风，那才沁人心脾。'
    if (sky === '雪') return '难得见雪，空气冷得清透，亮晶晶的。'
    if (sky === '雾') return '起了雾，四周软乎乎的，看不太远，空气潮潮的。'
    if (sky === '雷') return '打雷了，空气又闷又重，像是憋着一场雨。'
    if (season === '冬') {
      if (period === '早晨' || period === '夜晚' || period === '深夜') return '风吹过来凉飕飕的，落在脸上反而让人心情不错——干爽，清爽。'
      return '中午热起来，外套穿不住，一动就容易出汗，脱了又有点凉。'
    }
    if (season === '夏') {
      if (period === '早晨' || period === '夜晚' || period === '深夜') return '早晚很舒服，不用出门就没有汗，空气也刚刚好。'
      if (period === '中午' || period === '下午') return '一出太阳就闷热，汗黏黏的，闷得难受。'
      return '太阳照着，湿热湿热的，出门就是一身汗。'
    }
    // 春/秋（普洱没有分明春秋，早晚舒服、中午短袖）
    if (period === '早晨' || period === '夜晚' || period === '深夜') return '早晚很舒服，正是穿长袖最舒服的时候。'
    if (period === '中午' || period === '下午') return '中午还是热，短袖正好，一动还是会出汗。'
    return '温度不低，早晚舒服，中午短袖。'
  })()
  const rhinitis = (season === '春') ? '（春天你鼻炎容易犯，出门记得带上纸。）' : ''

  const hard = `${areaName} · ${season} · ${sky} · ${period} · ${windLevel} · ${moist}`
  const numbers = `${tempC}°C（体感 ${feelsC}°C）｜湿度 ${humidity}%｜${windLevel}｜${sky}｜日出 ${sunRise} 日落 ${sunSet}`
  const wx = `${seed}${rhinitis}\n\n[坐标] ${hard}\n[数据] ${numbers}${maxT ? `｜今日 ${minT}~${maxT}°C` : ''}`

  return { areaName, region, tempC, feelsC, humidity, windspeed, weatherDesc, cloud, sunRise, sunSet, maxT, minT, season, period, sky, windLevel, moist, seed, rhinitis, hard, numbers, wx }
}
