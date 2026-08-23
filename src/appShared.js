// src/appShared.js
// 从 App.jsx 抽离的「纯常量 / 纯函数 / 不依赖 React state·effect 的工具方法」。
// 仅搬家，不改名字与行为；App.jsx 与其余组件统一从此处 import。
// 注意：本文件不含 JSX（保持纯 .js），含 JSX 的 avatarNode 单独放 avatarNode.jsx。
import { buildSystemPrompt } from './project/instructions'

// —— 复制相关 ——
export function stripMarkdown(src) {
  return String(src || '')
    .replace(/`{1,3}([^`]*)`{1,3}/g, '$1')            // 行内/块代码
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')              // 图片
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')           // 链接 → 文字
    .replace(/^#{1,6}\s+/gm, '')                       // 标题 #
    .replace(/^>\s?/gm, '')                            // 引用 >
    .replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/g, '$1')   // 粗体/斜体/删除线
    .replace(/^\s*[-*+]\s+/gm, '• ')                   // 列表 → 圆点
    .replace(/\n{3,}/g, '\n\n')                        // 多余空行
    .trim()
}
export async function copyText(text) {
  const t = String(text || '')
  try {
    await navigator.clipboard.writeText(t)
  } catch (e) {
    const ta = document.createElement('textarea')
    ta.value = t
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    try { document.execCommand('copy') } catch (_) { /* 忽略降级失败 */ }
    document.body.removeChild(ta)
  }
}
export function showCopyHint(text = '已复制到剪贴板') {
  const el = document.createElement('div')
  el.className = 'copy-hint'
  el.textContent = text
  document.body.appendChild(el)
  requestAnimationFrame(() => el.classList.add('show'))
  setTimeout(() => {
    el.classList.remove('show')
    setTimeout(() => el.remove(), 250)
  }, 1200)
}

// —— 后端/对话基础常量 ——
export const API_BASE = import.meta.env.VITE_API_BASE || ''
export const MCP_URL = `${API_BASE}/api/mcp-proxy`
export const systemPrompt = buildSystemPrompt()
export const MAX_TOOL_ROUNDS = 16
export const TOOL_OUTPUT_LIMIT = 6000

// —— 卡片统一玻璃样式 ——
export const glassCard = {
  borderRadius: 'var(--radius-lg)',
  overflow: 'hidden',
  border: '1px solid var(--color-border-glass)',
  background: 'var(--color-card-glass)',
  backdropFilter: 'blur(20px) saturate(1.6)',
  WebkitBackdropFilter: 'blur(20px) saturate(1.6)',
  boxShadow: 'var(--shadow-soft)',
  maxWidth: '75%',
}

// —— 天气 / 窗外 ——
export const WEATHER_STATE = {
  雨: '在窗边听雨', 雪: '在窗边看雪', 雷: '在窗边看雨', 雾: '在雾里发呆',
  晴: '在晒太阳', 多云: '窝在沙发上', 阴: '窝在沙发上',
}
export const WEATHER_TINT = {
  雨: 'rgba(104,120,146,0.09)', 雪: 'rgba(206,220,238,0.07)', 雾: 'rgba(200,202,206,0.08)',
  雷: 'rgba(86,86,110,0.10)', 晴: 'rgba(255,226,160,0.06)', 多云: 'rgba(190,192,198,0.05)', 阴: 'rgba(124,130,142,0.08)',
}
export const WINDOW_PHRASE = {
  雨: '🌧 窗外有点雨',
  雪: '❄ 窗外落雪',
  雾: '🌫 外面起了雾',
  雷: '⚡ 外头在打雷',
  晴: '☀ 窗外有光',
  多云: '⛅ 云有点多',
  阴: '☁ 天有点阴',
}
export const NOWHERE_BASE = window.location.port === '8081'
  ? `http://${window.location.hostname}:8080`
  : '/nowhere'

// —— 日记/日期工具 ——
export const fmtDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const bjDayStr = (d = new Date()) => {
  const bj = new Date(d.getTime() + 8 * 3600 * 1000)
  let s = bj.toISOString().slice(0, 10)
  if (bj.getUTCHours() < 5) s = new Date(bj.getTime() - 24 * 3600 * 1000).toISOString().slice(0, 10)
  return s
}
export const diaryDateParts = (s) => {
  const [y, m, d] = String(s).split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return {
    mmdd: `${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')}`,
    week: dt.toLocaleDateString('zh-CN', { weekday: 'long' }),
  }
}

// —— 记忆类型 ——
export const MEM_TYPE = {
  moment: { label: '不能丢的时刻', badge: '时刻', cls: 'mem-type-moment' },
  note: { label: 'AI 记下的', badge: 'AI', cls: 'mem-type-note' },
  compressed: { label: '压缩沉淀', badge: '沉淀', cls: 'mem-type-compressed' },
}
export const MEM_ORDER = ['moment', 'note', 'compressed']

// —— 自我觉察维度 ——
export const ASPECT_ORDER = [
  { key: 'nature', label: '本质' },
  { key: 'values', label: '价值观' },
  { key: 'patterns', label: '模式' },
  { key: 'limits', label: '边界' },
  { key: 'becoming', label: '成长' },
  { key: 'uncertainty', label: '不确定' },
  { key: 'stance', label: '立场' },
]

// —— 会话元数据本地缓存 ——
export const CHAT_META_KEY = 'chat_meta'
export const getChatMeta = () => { try { return JSON.parse(localStorage.getItem(CHAT_META_KEY) || '{}') } catch { return {} } }
export const setChatMeta = (next) => { try { localStorage.setItem(CHAT_META_KEY, JSON.stringify(next)) } catch (_) {} }
export const updateChatPreview = (convId, text) => {
  if (!convId || !text) return
  const m = getChatMeta()
  m[convId] = { ...(m[convId] || {}), last_message: String(text).slice(0, 80), updated_at: Date.now() }
  setChatMeta(m)
}
export const updateChatTitle = (convId, title) => {
  if (!convId) return
  const t = (title || '').trim()
  const m = getChatMeta()
  if (t) m[convId] = { ...(m[convId] || {}), title: t }
  else if (m[convId]) delete m[convId].title
  setChatMeta(m)
}
export const mergeChatMeta = (convs) => { const m = getChatMeta(); return convs.map(c => ({ ...c, title: (m[c.id] && m[c.id].title) || c.title, last_message: (m[c.id] && m[c.id].last_message) || c.last_message, updated_at: (m[c.id] && m[c.id].updated_at) || c.updated_at })) }

// —— 头像节点 ——（含 JSX，单独放 avatarNode.jsx，本文件保持纯 .js）
