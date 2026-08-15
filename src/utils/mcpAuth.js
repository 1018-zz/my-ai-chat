// src/utils/mcpAuth.js
// MCP 工具授权：按用途分组 + 状态式授权（ask / always / never）+ 对话内临授权
// 状态以 localStorage 为唯一真源，跨组件（聊天页 / LIFE 设置）通过 window 事件同步。
//
// 授权模式语义：
//   ask    —— 每次调用前先问用户（默认）
//   always —— 以后都允许，不再问
//   never  —— 永久禁止，调用时直接跳过
// 另外「本次会话」的临时允许存在运行时 sessionAuth（不持久），见 App.jsx。

// 工具清单（label 仅用于显示，不含任何 MCP / JSON-RPC 等技术术语）
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

// 按「钟泽能做什么」分组（UI 用，不暴露底层技术概念）
export const TOOL_GROUPS = [
  { key: 'observe', emoji: '👀', title: '看看', desc: '让他知道外面发生了什么', tools: ['read_file', 'list_files', 'read_memories', 'describe_image'] },
  { key: 'remember', emoji: '✍️', title: '留下', desc: '让他帮你记下生活痕迹', tools: ['write_memory', 'decide_note', 'leave_note'] },
  { key: 'modify', emoji: '🏠', title: '整理', desc: '让他帮你动一动小家', tools: ['write_file'] },
]

// 模式 → 显示文字（设置页默认只显示状态，不堆开关）
export const MODE_LABEL = { ask: '每次询问', always: '已允许', never: '已禁止' }

const KEY = 'mcp_tool_auth'
export const MCP_AUTH_EVENT = 'mcp-auth-change'

// 兼容旧数据：true → always，false → never，其余（含 undefined / 'ask'）→ ask
export function normalizeMode(v) {
  if (v === true || v === 'always') return 'always'
  if (v === false || v === 'never') return 'never'
  return 'ask'
}

// 读取授权表；首次无记录时按旧开关 mcp_enabled 播种（向后兼容）
export function loadMcpAuth() {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved) {
      const obj = JSON.parse(saved)
      const out = {}
      for (const t of MCP_TOOLS) out[t.key] = normalizeMode(obj[t.key])
      return out
    }
    const legacy = localStorage.getItem('mcp_enabled') === 'true'
    const seed = {}
    for (const t of MCP_TOOLS) seed[t.key] = legacy ? 'always' : 'ask'
    return seed
  } catch {
    return {}
  }
}

export function saveMcpAuth(obj) {
  try { localStorage.setItem(KEY, JSON.stringify(obj)) } catch (_) {}
}

// 设置页修改某工具授权模式（ask / always / never）
export function setMcpToolMode(auth, key, mode) {
  const n = { ...auth, [key]: mode }
  saveMcpAuth(n)
  return n
}
