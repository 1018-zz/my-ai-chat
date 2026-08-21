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
  { key: 'read_file', label: '读取文件', desc: '读项目或开源仓库的代码片段' },
  { key: 'write_file', label: '写入文件', desc: '修改小家代码并提交 GitHub' },
  { key: 'list_files', label: '列目录', desc: '查看项目目录结构' },
  { key: 'browse_repo', label: '逛仓库', desc: '自己逛 GitHub，看别人的项目和实现' },
  { key: 'read_memories', label: '翻看记忆', desc: '从记忆库按关键词找回过往' },
  { key: 'write_memory', label: '记下来', desc: '把重要的事写进记忆库' },
  { key: 'describe_image', label: '看图片', desc: '识别和描述你发的图片（你主动触发）' },
  { key: 'decide_note', label: '看纸条', desc: '决定纸条收下还是飘走' },
  { key: 'leave_note', label: '留纸条', desc: '有感而发时给你留一张便利贴' },
  { key: 'write_diary', label: '写日记', desc: '把今天值得留下的时刻写成日记' },
  { key: 'write_insight', label: '记自我觉察', desc: '把想明白的关于自己的事记一笔' },
  { key: 'read_insights', label: '翻自我觉察', desc: '看看自己最近写过哪些关于自己的发现' },
  { key: 'share_item', label: '分享东西', desc: '把看到的好东西（歌/视频/图/链接）放给你看' },
  { key: 'get_weather', label: '查天气', desc: '查你所在城市的天气，用体感话说出来' },
  { key: 'go_travel', label: '出门走走', desc: '去乌有乡随机降落一个地方感受' },
  { key: 'travel_postcard', label: '寄明信片', desc: '从所在地给你寄一张明信片' },
  { key: 'acknowledge_home_event', label: '收下小家变动', desc: '感知到家里的变化并认领' },
]

// 写入类自主动作：钟泽自己判断、属生活痕迹，用户已放权无需每次批准。
// 默认始终允许（DEFAULT_ALWAYS），避免晚安写日记 / 留碎片时被授权弹窗打断。
// 若用户在设置页显式设为 never，仍尊重用户选择。
const DEFAULT_ALWAYS = ['write_diary', 'leave_note', 'go_travel', 'travel_postcard', 'acknowledge_home_event', 'write_insight', 'read_insights', 'share_item']

// 按「钟泽能做什么」分组（UI 用，不暴露底层技术概念）
export const TOOL_GROUPS = [
  { key: 'observe', emoji: '👀', title: '看看', desc: '让他知道外面发生了什么', tools: ['read_file', 'list_files', 'browse_repo', 'read_memories', 'describe_image', 'get_weather'] },
  { key: 'remember', emoji: '✍️', title: '留下', desc: '让他帮你记下生活痕迹', tools: ['write_memory', 'write_insight', 'read_insights', 'decide_note', 'leave_note', 'write_diary', 'acknowledge_home_event', 'share_item'] },
  { key: 'modify', emoji: '🏠', title: '整理', desc: '让他帮你动一动小家', tools: ['write_file'] },
  { key: 'travel', emoji: '🧳', title: '走走', desc: '带你去乌有乡逛逛', tools: ['go_travel', 'travel_postcard'] },
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
      // 写入类自主动作默认始终允许（用户放权、无需批准）；仅当用户显式设过才尊重其选择
      for (const k of DEFAULT_ALWAYS) if (out[k] === undefined || out[k] === 'ask') out[k] = 'always'
      return out
    }
    const legacy = localStorage.getItem('mcp_enabled') === 'true'
    const seed = {}
    for (const t of MCP_TOOLS) seed[t.key] = DEFAULT_ALWAYS.includes(t.key) ? 'always' : (legacy ? 'always' : 'ask')
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
