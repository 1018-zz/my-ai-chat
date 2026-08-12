// src/utils/time.js — 消息时间注脚 + 凌晨5点日期分割（四大功能模块·第一刀）
// DAY_START_HOUR=5：凌晨 5 点算日期边界，熬夜到凌晨的对话算同一天
// fmtMsgTime(ts)：今天→"18:23" / 昨天→"昨天 23:41" / 今年→"08-12 15:30" / 更早→"2025-12-31 23:59"

export const DAY_START_HOUR = 5

const pad = n => String(n).padStart(2, '0')

// 按凌晨5点分割的"日期键"（两个时间戳同键 = 同一天）
export function dayKey(ts) {
  const d = new Date(ts - DAY_START_HOUR * 3600 * 1000)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

export function fmtMsgTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const now = Date.now()
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const today = dayKey(now)
  if (dayKey(ts) === today) return hm
  if (dayKey(ts) === dayKey(now - 86400000)) return `昨天 ${hm}`
  const sameYear = d.getFullYear() === new Date(now).getFullYear()
  if (sameYear) return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${hm}`
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${hm}`
}
