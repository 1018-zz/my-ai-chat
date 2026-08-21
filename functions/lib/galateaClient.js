// functions/lib/galateaClient.js — Galatea's Garden MCP 客户端（零依赖，fetch 实现）
//
// 连接外部 MCP 服务器 https://galatea.abysslumina.com/mcp（streamable HTTP / JSON-RPC）。
// initialize 与 tools/list 公开可访问；tools/call（实际执行）需要 Bearer token。
// 工具名统一带 galatea_ 前缀（见 galateaTools.js），本模块负责去前缀后转发执行。
//
// token 从 env.GALATEA_TOKEN 读取（VPS .env 配置），未配置时写操作会 401。

const GALATEA_URL = 'https://galatea.abysslumina.com/mcp'
const PROTOCOL_VERSION = '2025-03-26'

// 把 MCP 响应解析成 JS 对象：兼容纯 JSON 与 SSE（text/event-stream）两种 body
function parseMcpResponse(text) {
  const t = String(text || '').trim()
  if (!t) return null
  // SSE：body 形如 "event: message\ndata: {...}\n\n"，取所有 data 行最后一块
  if (t.startsWith('data:') || t.includes('\ndata:')) {
    const blocks = t.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim())
    for (let i = blocks.length - 1; i >= 0; i--) {
      try { return JSON.parse(blocks[i]) } catch (_) { /* 继续找上一个 data 块 */ }
    }
    return null
  }
  try { return JSON.parse(t) } catch (_) { return null }
}

// 调用 Galatea 的一个工具（name 需带 galatea_ 前缀；返回工具结果的纯文本）
export async function callGalateaTool(name, args, env = {}) {
  const realName = String(name).replace(/^galatea_/, '')
  const token = env.GALATEA_TOKEN || ''
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: Math.floor(Date.now() / 1000),
    method: 'tools/call',
    params: { name: realName, arguments: args || {} },
  })
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(GALATEA_URL, { method: 'POST', headers, body })
  const raw = await res.text().catch(() => '')
  if (!res.ok) {
    // 401/403 等：返回 detail 或状态码，让上层能识别"token 没配/失效"
    const detail = raw.slice(0, 300)
    throw new Error(`Galatea [${res.status}]: ${detail || '请求失败'}`)
  }

  const d = parseMcpResponse(raw)
  if (!d) throw new Error('Galatea: 响应解析失败')
  if (d.error) throw new Error(`Galatea [${d.error.code}]: ${String(d.error.message || '').slice(0, 300)}`)

  const content = d.result && d.result.content
  if (Array.isArray(content)) {
    return content
      .map(c => (c && c.type === 'text') ? c.text : (c && c.type === 'image') ? '（Galatea 返回一张图片）' : '')
      .filter(Boolean)
      .join('\n')
  }
  if (d.result && typeof d.result === 'object') {
    return JSON.stringify(d.result)
  }
  return String(d.result != null ? d.result : '')
}

// 拉取 Galatea 全部工具定义（供需要动态同步时使用；当前静态定义见 galateaTools.js）
// 带 10 分钟缓存，避免每轮请求都打外网。
let toolsCache = null
let toolsCacheAt = 0
export async function listGalateaTools(env = {}) {
  if (toolsCache && Date.now() - toolsCacheAt < 10 * 60_000) return toolsCache
  const token = env.GALATEA_TOKEN || ''
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
  }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(GALATEA_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
  })
  const raw = await res.text().catch(() => '')
  if (!res.ok) throw new Error(`Galatea tools/list [${res.status}]`)
  const d = parseMcpResponse(raw)
  const tools = d && d.result && Array.isArray(d.result.tools) ? d.result.tools : []
  toolsCache = tools
  toolsCacheAt = Date.now()
  return tools
}
