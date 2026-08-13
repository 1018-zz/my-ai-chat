// src/utils/mcpAuth.js
// MCP 工具授权：逐项开关 + 对话内临授权
// 状态以 localStorage 为唯一真源，跨组件（聊天页 / LIFE 设置）通过 window 事件同步。
export const MCP_TOOLS = [
  { key: 'read_file', label: '读取文件' },
  { key: 'write_file', label: '写入文件' },
  { key: 'list_files', label: '列目录' },
  { key: 'read_memories', label: '翻看记忆' },
  { key: 'write_memory', label: '记下来' },
  { key: 'describe_image', label: '看图片' },
  { key: 'decide_note', label: '看纸条' },
  { key: 'leave_note', label: '留纸条' },
]

const KEY = 'mcp_tool_auth'
export const MCP_AUTH_EVENT = 'mcp-auth-change'

// 读取授权表；首次无记录时按旧开关 mcp_enabled 播种（向后兼容）
export function loadMcpAuth() {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved) return JSON.parse(saved)
    const legacy = localStorage.getItem('mcp_enabled') === 'true'
    const seed = {}
    for (const t of MCP_TOOLS) seed[t.key] = legacy
    return seed
  } catch {
    return {}
  }
}

export function saveMcpAuth(obj) {
  try { localStorage.setItem(KEY, JSON.stringify(obj)) } catch (_) {}
}

export function toggleMcpTool(auth, key) {
  const n = { ...auth, [key]: !auth[key] }
  saveMcpAuth(n)
  return n
}
