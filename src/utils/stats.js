// src/utils/stats.js — 小家本地统计（localStorage 增量埋点）
// 原则：聊天过程中只有一次轻量 JSON 读写（几百字节，~0.1ms），
// 所有汇总/图表计算只在进入统计页时执行，绝不在聊天页算——防打字卡顿
const KEY = 'xj_stats_v1'

const empty = () => ({ launches: 0, conversations: 0, messages: 0, inputTokens: 0, outputTokens: 0, cacheTokens: 0, daily: {} })

export function readStats() {
  try { return { ...empty(), ...JSON.parse(localStorage.getItem(KEY)) } } catch (_) { return empty() }
}
function writeStats(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)) } catch (_) {}
}
function bump(fn) {
  const s = readStats()
  fn(s)
  writeStats(s)
}
const dateKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// —— 估算 token：中文/全角 ≈ 1 token，英文/数字 ≈ 0.35 token/字符（接口未返回 usage 前的过渡方案）——
export function estimateTokens(str) {
  const s = String(str || '')
  let cjk = 0, other = 0
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (/[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef\u2e80-\u2eff]/.test(c)) cjk++
    else if (c !== '\n' && c !== ' ' && c !== '\t') other++
  }
  return Math.ceil(cjk + other * 0.35)
}

// StrictMode 防重：dev 下 effect 双跑，启动只计一次
let launched = false

export const stats = {
  // 打开应用 → 启动次数 +1
  launch() {
    if (launched) return
    launched = true
    bump(s => { s.launches++ })
  },
  // 新建对话 → 对话计数 +1
  newConversation() { bump(s => { s.conversations++ }) },
  // 产生一条消息（用户或 AI）→ 消息计数 +1，并记入当天热力图
  message() {
    bump(s => {
      s.messages++
      const d = dateKey(new Date())
      s.daily[d] = (s.daily[d] || 0) + 1
    })
  },
  // AI 请求完成 → 累加 token（现阶段为估算值，接口返回 usage 后直接换真值）
  usage({ input = 0, output = 0, cache = 0 } = {}) {
    bump(s => { s.inputTokens += input; s.outputTokens += output; s.cacheTokens += cache })
  },
}
