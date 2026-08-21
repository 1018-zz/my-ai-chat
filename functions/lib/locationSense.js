// functions/lib/locationSense.js — 位置感知核心（参考 AionsHome location.py 设计）
//
// 能力：GPS 心跳 → 坐标转换(WGS84→GCJ02) → 状态机(unknown/at_home/outside)
//       → 三级研判(轻量/刷新/全量) → 高德逆地理/天气/POI → Supabase 落库。
//
// 降级策略（高德 key 未配时也能跑基础版）：
//   - 无 env.AMAP_KEY：状态机 + 离家距离照常（haversine 不需要 key）；
//     地址/POI/高德天气留空；天气仍由现有 weather.js（wttr.in + user_location 城市）负责。
//   - 配了 AMAP_KEY：逆地理得到 city/adcode → 高德天气 + 周边 POI 全开。
//
// 存储：Supabase `location_status` 单行 id=1（含家的坐标 / 阈值 / 静默时段配置）。

const SUPABASE = 'https://vktbawcubmdmkqzadmto.supabase.co/rest/v1'
function sbHeaders(env) { return { 'apikey': env.SUPABASE_SECRET_KEY, 'Authorization': `Bearer ${env.SUPABASE_SECRET_KEY}`, 'Content-Type': 'application/json' } }
function sbReturn(env) { return { ...sbHeaders(env), 'Prefer': 'return=representation' } }

// 默认配置（与 AionsHome 对齐，可覆盖）
const DEFAULTS = {
  home_lng: null, home_lat: null,      // 家的坐标（GCJ-02），由 set_home 写入
  home_threshold: 500,                  // 离家判定阈值（米）
  movement_threshold: 500,              // "显著移动"判定（米）
  poi_radius: 2000,                     // POI 搜索半径（米）
  weather_expire_s: 30 * 60,            // 天气过期时长（30 分钟）
  quiet_hours_enabled: false,           // 静默时段开关
  quiet_start: '00:00', quiet_end: '08:00',
}

// ---- 坐标工具 ----
// WGS84 → GCJ-02（火星坐标偏移）；中国境外不偏移
export function wgs84ToGcj02(lng, lat) {
  if (outOfChina(lng, lat)) return { lng, lat }
  const a = 6378245.0
  const ee = 0.00669342162296594323
  let dLat = transformLat(lng - 105.0, lat - 35.0)
  let dLng = transformLng(lng - 105.0, lat - 35.0)
  const radLat = (lat / 180.0) * Math.PI
  let magic = Math.sin(radLat)
  magic = 1 - ee * magic * magic
  const sqrtMagic = Math.sqrt(magic)
  dLat = (dLat * 180.0) / (((a * (1 - ee)) / (magic * sqrtMagic)) * Math.PI)
  dLng = (dLng * 180.0) / ((a / sqrtMagic) * Math.cos(radLat) * Math.PI)
  return { lng: lng + dLng, lat: lat + dLat }
}
function outOfChina(lng, lat) { return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271 }
function transformLat(x, y) {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x))
  ret += ((20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0) / 3.0
  ret += ((20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin((y / 3.0) * Math.PI)) * 2.0) / 3.0
  ret += ((160.0 * Math.sin((y / 12.0) * Math.PI) + 320 * Math.sin((y * Math.PI) / 30.0)) * 2.0) / 3.0
  return ret
}
function transformLng(x, y) {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x))
  ret += ((20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0) / 3.0
  ret += ((20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin((x / 3.0) * Math.PI)) * 2.0) / 3.0
  ret += ((150.0 * Math.sin((x / 12.0) * Math.PI) + 300.0 * Math.sin((x / 30.0) * Math.PI)) * 2.0) / 3.0
  return ret
}
// 球面距离（米）
export function haversine(lng1, lat1, lng2, lat2) {
  const R = 6371000
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ---- 高德 API（无 key 时返回 null）----
async function amapRegeo(env, lng, lat) {
  const key = env.AMAP_KEY
  if (!key) return null
  try {
    const r = await fetch(`https://restapi.amap.com/v3/geocode/regeo?key=${key}&location=${lng},${lat}&extensions=base`)
    const d = await r.json()
    if (d.status !== '1') return null
    const rc = d.regeocode || {}
    const ac = rc.addressComponent || {}
    return {
      address: rc.formatted_address || '',
      adcode: ac.adcode || '',
      province: ac.province || '',
      city: ac.city && ac.city !== '[]' ? ac.city : (ac.province || ''),
      district: ac.district || '',
      township: ac.township || '',
    }
  } catch { return null }
}
async function amapWeather(env, adcode) {
  const key = env.AMAP_KEY
  if (!key || !adcode) return null
  try {
    const [live, fc] = await Promise.all([
      fetch(`https://restapi.amap.com/v3/weather/weatherInfo?key=${key}&city=${adcode}&extensions=base`).then(r => r.json()),
      fetch(`https://restapi.amap.com/v3/weather/weatherInfo?key=${key}&city=${adcode}&extensions=all`).then(r => r.json()),
    ])
    const liveW = (live.status === '1' && live.lives && live.lives[0]) ? live.lives[0] : null
    const casts = (fc.status === '1' && fc.forecasts && fc.forecasts[0] && fc.forecasts[0].casts) ? fc.forecasts[0].casts : []
    return {
      live: liveW ? { temp: liveW.temperature, weather: liveW.weather, wind: liveW.windpower, humidity: liveW.humidity } : null,
      forecast: casts.slice(0, 3).map(c => ({ date: c.date, day: c.dayweather, night: c.nightweather, temp: `${c.daytemp}~${c.nighttemp}℃` })),
    }
  } catch { return null }
}
const POI_TYPES = { '餐饮美食': '050000', '风景名胜': '110000', '休闲娱乐': '100000', '购物': '060000' }
async function amapPoiSearch(env, lng, lat) {
  const key = env.AMAP_KEY
  if (!key) return {}
  const out = {}
  try {
    for (const [label, code] of Object.entries(POI_TYPES)) {
      const r = await fetch(`https://restapi.amap.com/v3/place/around?key=${key}&location=${lng},${lat}&types=${code}&radius=${DEFAULTS.poi_radius}&offset=5&sortrule=distance`)
      const d = await r.json()
      if (d.status !== '1' || !Array.isArray(d.pois)) continue
      out[label] = d.pois.slice(0, 5).map(p => ({
        name: p.name,
        address: p.address || '',
        distance: p.distance || '',
        rating: (p.biz_ext || {}).rating || '',
      }))
    }
  } catch { /* POI 失败不阻断 */ }
  return out
}

// ---- 静默时段 ----
function isQuietHours(cfg) {
  if (!cfg.quiet_hours_enabled) return false
  const now = new Date()
  const hm = now.getHours() * 100 + now.getMinutes()
  const s = Number(cfg.quiet_start.replace(':', ''))
  const e = Number(cfg.quiet_end.replace(':', ''))
  return s <= e ? (hm >= s && hm < e) : (hm >= s || hm < e)
}

// ---- 读取/保存状态 ----
export async function loadStatus(env) {
  const empty = { state: 'unknown', lng: null, lat: null, accuracy: 0, address: '', adcode: '', city: '', city_cn: '', weather: null, nearby_pois: {}, distance_from_home: null, updated_at: null, state_changed_at: null, last_api_lng: null, last_api_lat: null, last_weather_at: null }
  if (!env || !env.SUPABASE_SECRET_KEY) return empty
  try {
    const r = await fetch(`${SUPABASE}/location_status?id=eq.1&select=*&limit=1`, { headers: sbHeaders(env) })
    if (!r.ok) return empty
    const rows = await r.json()
    const row = Array.isArray(rows) && rows[0]
    if (!row) return empty
    return {
      state: row.state || 'unknown',
      lng: row.lng, lat: row.lat, accuracy: row.accuracy || 0,
      address: row.address || '', adcode: row.adcode || '',
      city: row.city || '', city_cn: row.city_cn || '',
      weather: row.weather ? (typeof row.weather === 'string' ? safeParse(row.weather) : row.weather) : null,
      nearby_pois: row.nearby_pois ? (typeof row.nearby_pois === 'string' ? safeParse(row.nearby_pois) : row.nearby_pois) : {},
      distance_from_home: row.distance_from_home,
      updated_at: row.updated_at, state_changed_at: row.state_changed_at,
      last_api_lng: row.last_api_lng, last_api_lat: row.last_api_lat,
      last_weather_at: row.last_weather_at,
      home_lng: row.home_lng, home_lat: row.home_lat, home_threshold: row.home_threshold,
      quiet_hours_enabled: !!row.quiet_hours_enabled, quiet_start: row.quiet_start || DEFAULTS.quiet_start, quiet_end: row.quiet_end || DEFAULTS.quiet_end,
    }
  } catch { return empty }
}
function safeParse(s) { try { return JSON.parse(s) } catch { return null } }

async function saveStatus(env, status) {
  if (!env || !env.SUPABASE_SECRET_KEY) return
  const body = {
    id: 1, state: status.state, lng: status.lng, lat: status.lat, accuracy: status.accuracy,
    address: status.address || null, adcode: status.adcode || null,
    city: status.city || null, city_cn: status.city_cn || null,
    weather: status.weather ? JSON.stringify(status.weather) : null,
    nearby_pois: status.nearby_pois && Object.keys(status.nearby_pois).length ? JSON.stringify(status.nearby_pois) : null,
    distance_from_home: status.distance_from_home,
    updated_at: new Date().toISOString(),
    state_changed_at: status.state_changed_at,
    last_api_lng: status.last_api_lng, last_api_lat: status.last_api_lat,
    last_weather_at: status.last_weather_at,
    home_lng: status.home_lng ?? null, home_lat: status.home_lat ?? null, home_threshold: status.home_threshold ?? DEFAULTS.home_threshold,
    quiet_hours_enabled: status.quiet_hours_enabled || false, quiet_start: status.quiet_start || DEFAULTS.quiet_start, quiet_end: status.quiet_end || DEFAULTS.quiet_end,
  }
  try {
    await fetch(`${SUPABASE}/location_status?on_conflict=id`, {
      method: 'POST',
      headers: { ...sbReturn(env), 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify(body),
    })
  } catch { /* 落库失败不阻断心跳 */ }
}

// 状态变化事件 → project_events（钟泽 breath / 未来 wake 感知）
async function notifyStateChange(env, oldState, newState, status) {
  try {
    const desc = newState === 'outside' ? '她出门了' : newState === 'at_home' ? '她到家了' : '位置状态变化'
    const where = status.city_cn || status.city || status.address || ''
    await fetch(`${SUPABASE}/project_events`, {
      method: 'POST',
      headers: sbReturn(env),
      body: JSON.stringify({
        type: 'location_change',
        title: '位置变化',
        summary: `${desc}${where ? `（${where}）` : ''}`,
        source: 'location',
        status: 'pending',
        created_at: new Date().toISOString(),
      }),
    })
  } catch { /* 事件写失败不阻断 */ }
}

// ---- 心跳主流程（核心入口）----
// 参数：lng/lat（GCJ-02 或 WGS84，is_gcj02 指定）；accuracy 定位精度；
//       skipNotify 跳过状态变化事件（测试用）；forceFull 强制全量刷新。
export async function processHeartbeat(env, { lng, lat, accuracy = 0, is_gcj02 = false, skipNotify = false, forceFull = false }) {
  if (lng == null || lat == null || !isFinite(lng) || !isFinite(lat)) {
    return { error: 'lng/lat 无效' }
  }
  const gcj = is_gcj02 ? { lng: Number(lng), lat: Number(lat) } : wgs84ToGcj02(Number(lng), Number(lat))
  const status = await loadStatus(env)
  const now = new Date().toISOString()

  const oldState = status.state || 'unknown'
  // 静默时段：只存坐标，不调 API
  if (isQuietHours(status)) {
    status.lng = gcj.lng; status.lat = gcj.lat; status.accuracy = accuracy; status.updated_at = now
    await saveStatus(env, status)
    return { state: oldState, state_changed: false, skipped: 'quiet_hours', lng: gcj.lng, lat: gcj.lat }
  }

  // 状态机：离家距离判定
  let newState = oldState
  let distanceFromHome = null
  if (status.home_lng != null && status.home_lat != null) {
    distanceFromHome = Math.round(haversine(gcj.lng, gcj.lat, Number(status.home_lng), Number(status.home_lat)))
    const threshold = status.home_threshold ?? DEFAULTS.home_threshold
    newState = distanceFromHome <= threshold ? 'at_home' : 'outside'
  }
  const stateChanged = oldState !== 'unknown' && newState !== 'unknown' && oldState !== newState

  // 三级研判：是否需要全量 API（逆地理 + 天气 + POI）
  const moved = status.last_api_lng != null && status.last_api_lat != null
    ? haversine(gcj.lng, gcj.lat, Number(status.last_api_lng), Number(status.last_api_lat))
    : Infinity
  const significantMove = moved >= (status.home_threshold ?? DEFAULTS.movement_threshold)
  const weatherStale = !status.last_weather_at || (Date.now() - new Date(status.last_weather_at).getTime()) > DEFAULTS.weather_expire_s * 1000
  const needFull = stateChanged || significantMove || forceFull

  let address = status.address || ''
  let adcode = status.adcode || ''
  let city = status.city || ''
  let cityCn = status.city_cn || ''
  let weather = status.weather
  let pois = status.nearby_pois || {}

  if (needFull && env.AMAP_KEY) {
    const regeo = await amapRegeo(env, gcj.lng, gcj.lat)
    if (regeo) {
      address = regeo.address; adcode = regeo.adcode
      city = regeo.city || status.city || ''; cityCn = regeo.district || regeo.city || regeo.province || ''
      status.last_api_lng = gcj.lng; status.last_api_lat = gcj.lat
    }
    const w = await amapWeather(env, adcode)
    if (w && (w.live || w.forecast.length)) { weather = w; status.last_weather_at = now }
    if (newState === 'outside') pois = await amapPoiSearch(env, gcj.lng, gcj.lat)
  } else if (weatherStale && env.AMAP_KEY && adcode) {
    const w = await amapWeather(env, adcode)
    if (w && (w.live || w.forecast.length)) { weather = w; status.last_weather_at = now }
  }

  // 更新状态
  status.lng = gcj.lng; status.lat = gcj.lat; status.accuracy = accuracy; status.updated_at = now
  status.state = newState
  status.address = address; status.adcode = adcode; status.city = city; status.city_cn = cityCn
  status.weather = weather
  status.nearby_pois = pois
  status.distance_from_home = distanceFromHome
  if (stateChanged) status.state_changed_at = now

  await saveStatus(env, status)

  // 状态变化 → 通知（写 project_events，供钟泽感知；未来可接 wake bridge）
  if (stateChanged && !skipNotify) {
    await notifyStateChange(env, oldState, newState, status)
  }

  return {
    state: newState, state_changed: stateChanged, old_state: oldState,
    distance_from_home: distanceFromHome, full_api: needFull,
    lng: gcj.lng, lat: gcj.lat, address: address || null,
    city: city || null, city_cn: cityCn || null,
  }
}

// 写家的坐标（set_home 工具用）。传入坐标按 WGS84 处理（手机 GPS 原始值），
// 内部转 GCJ-02 存储——与心跳的坐标转换保持一致，保证离家距离计算正确。
export async function setHome(env, { lng, lat, threshold }) {
  if (lng == null || lat == null || !isFinite(lng) || !isFinite(lat)) return { error: '需要合法的 lng/lat' }
  const gcj = wgs84ToGcj02(Number(lng), Number(lat))
  const status = await loadStatus(env)
  status.home_lng = gcj.lng; status.home_lat = gcj.lat
  status.home_threshold = threshold ? Number(threshold) : (status.home_threshold ?? DEFAULTS.home_threshold)
  status.home_set_at = new Date().toISOString()
  await saveStatus(env, status)
  return { home_lng: status.home_lng, home_lat: status.home_lat, home_threshold: status.home_threshold }
}

// 读当前状态并格式化为钟泽可读的一句话（breath 注入用）
export async function formatLocationForPrompt(env) {
  const s = await loadStatus(env)
  const parts = []
  if (s.state === 'at_home') parts.push('她在家')
  else if (s.state === 'outside') parts.push(`她在外（离家${s.distance_from_home ? Math.round(s.distance_from_home) + '米' : '较远'}）`)
  else if (s.lng != null) parts.push('她在移动中')
  if (s.city_cn || s.city) parts.push(`位置：${s.city_cn || s.city}`)
  if (s.address) parts.push(s.address)
  if (!parts.length) return null
  return `【位置感知】${parts.join('，')}（环境信息，不用刻意提起，合适时自然带一句）`
}
