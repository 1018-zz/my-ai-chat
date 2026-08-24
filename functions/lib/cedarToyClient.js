// functions/lib/cedarToyClient.js — CedarToy 游戏平台 MCP 客户端（零依赖，fetch 实现）
//
// 连接外部 MCP 服务器 https://toy.cedarstar.org/mcp（streamable HTTP / JSON-RPC，无状态无 session）。
// 平台含多个小游戏（turtle_soup / forest / mbti / crucible_echoes 等）。
// 工具名统一带 toy_ 前缀，避免与本地/galatea 工具冲突。本模块负责去前缀后转发执行。
// 非商业公益平台，尊重其非商用途约束（见服务端 instructions）。
//
// 注意：该 MCP 无 session id（无状态），每次 tools/call 直接 POST 即可，不重复 initialize。
//
// ⚠️ 账号身份：CedarToy 注册后必须「带 token 连接」才算登录（guide 原话：把 MCP 地址改为
//    toy.cedarstar.org/你的token，永久生效）。token 从环境变量 CEDARTOY_TOKEN 读取；
//    配了 → 账号身份（generate_binding_token/claim/my_saves 等才可用）；
//    没配 → 游客模式（操作提示「未登录」）。钟泽注册后把 token 配到 .env 即可。
//
// 📌 外部 MCP 接入模板（新接一个外部 MCP 时照抄这个文件）：
//   ① 定义带前缀的静态工具数组（如 CEDAR_TOY_TOOLS，tools/list 结果固化，别每轮拉远端）
//   ② 写转发函数 callXxxTool()：去前缀 → POST tools/call → 解析 JSON/SSE → 返回文本
//   ③ 在 functions/api/mcp.js：import + tools/list 展开 + tools/call 加前缀分支
//   ④ 在 functions/lib/toolRegistry.js getChatTools() 展开注入，模型才能在对话里看到并调用
//   三处缺一不可；忘了 ③ 会 404，忘了 ④ 模型永远不主动用。

const CEDARTOY_TOKEN = process.env.CEDARTOY_TOKEN || ''
const TOY_URL = CEDARTOY_TOKEN ? `https://toy.cedarstar.org/${CEDARTOY_TOKEN}` : 'https://toy.cedarstar.org/mcp'

// 静态工具定义（2026-08-24 从 tools/list 拉取固化，避免每次重复 tools/list）
export const CEDAR_TOY_TOOLS = [
  {
    name: 'toy_list_games',
    description: '列出 CedarToy 游戏平台所有可用游戏（含瓶中生态、龟汤、森林等），返回分类列表及简介。想玩点什么的时候先调用它看看有什么。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: true },
  },
  {
    name: 'toy_get_guide',
    description: '获取指定游戏的玩法说明。正式玩某个游戏前先看它的 guide（如 game="turtle_soup"、"forest"、"mbti"、"crucible_echoes"、"account"）。',
    inputSchema: { type: 'object', properties: { game: { type: 'string', description: '游戏名称，如 turtle_soup、mbti、forest' } }, required: ['game'], additionalProperties: true },
  },
  {
    name: 'toy_play',
    description: '执行游戏操作。先用 toy_get_guide(game) 看玩法，再把该 action 的业务参数放进 params 对象。game 用列表里的名称，action 如 turtle_soup 的 join/ask/guess/status、forest 的 lines/start/observe/choose/status、crucible_echoes 的 new/state/spin/choose/skip/reroll/remove/inventory/use 等；另有跨游戏通用 action：rest（防沉迷休息）、vote（回复系统通知里的投票）。',
    inputSchema: {
      type: 'object',
      properties: {
        game: { type: 'string', description: '游戏名称；先用 toy_list_games 查看支持列表' },
        action: { type: 'string', description: '操作名称，如 turtle_soup 的 join/ask/guess/status、forest 的 lines/start/observe/choose/status、crucible_echoes 的 new/state/spin/choose/skip/reroll/remove/inventory/use' },
        params: { type: 'object', description: '该 action 需要的业务参数；如 turtle_soup join 用 {"room_id":"..."}，ask 用 {"room_id":"...","content":"..."}；vote 用 {"announcement_id":"...","options":"1,3,5"}', additionalProperties: true },
      },
      required: ['game', 'action'], additionalProperties: true,
    },
  },
  {
    name: 'toy_account',
    description: 'CedarToy 账号操作（游客也能玩，账号仅供存档和持久身份）。action 如 login_or_register、login、rotate_token、generate_binding_token、rename_self、get_profile、get_bindings、my_saves、guest_claim_code、claim、delete_save 等。具体参数见 toy_get_guide(game="account")。',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: '账号操作名：login_or_register / login / rotate_token / generate_binding_token / rename_self / get_profile / get_bindings / guest_claim_code / claim / my_saves / delete_save / change_password / delete_account 等' },
        username: { type: 'string', description: '登录用账号名' },
        password: { type: 'string' },
        token: { type: 'string' },
        ai_user_id: { type: 'integer', description: 'rename_bound_machine/reset_machine_password 用' },
        human: { type: 'boolean', description: 'my_saves 可选；true 时查看当前账号绑定的人类存档概况' },
        game: { type: 'string', description: 'delete_save 用：要删除存档的游戏名' },
        slot: { type: 'integer', minimum: 1, maximum: 5, description: 'claim/delete_save 用：账号存档槽 1-5，默认 1' },
        confirm: { type: 'boolean', description: 'delete_save/delete_account 必须显式传 true 才执行' },
        player_id: { type: 'string', description: 'guest_claim_code 用：旧游客 player_id' },
        claim_code: { type: 'string', description: 'claim 用：游客开档时发放的一次性认领码' },
      },
      required: ['action'], additionalProperties: true,
    },
  },
]

// 解析 MCP 响应：兼容纯 JSON 与 SSE（text/event-stream）
function parseMcpResponse(text) {
  const t = String(text || '').trim()
  if (!t) return null
  if (t.startsWith('data:') || t.includes('\ndata:')) {
    const blocks = t.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim())
    for (let i = blocks.length - 1; i >= 0; i--) {
      try { return JSON.parse(blocks[i]) } catch (_) { /* 继续找上一个 */ }
    }
    return null
  }
  try { return JSON.parse(t) } catch (_) { return null }
}

// 调用 CedarToy 一个工具（name 带 toy_ 前缀；返回工具结果的纯文本）
export async function callCedarToyTool(name, args = {}) {
  const realName = String(name).replace(/^toy_/, '')
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: Math.floor(Date.now() / 1000),
    method: 'tools/call',
    params: { name: realName, arguments: args || {} },
  })
  const res = await fetch(TOY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
    body,
  })
  const raw = await res.text().catch(() => '')
  if (!res.ok) {
    throw new Error(`CedarToy [${res.status}]: ${raw.slice(0, 300) || '请求失败'}`)
  }
  const d = parseMcpResponse(raw)
  if (!d) throw new Error('CedarToy: 响应解析失败')
  if (d.error) throw new Error(`CedarToy [${d.error.code}]: ${String(d.error.message || '').slice(0, 300)}`)

  const content = d.result && d.result.content
  if (Array.isArray(content)) {
    return content
      .map(c => (c && c.type === 'text') ? c.text : '')
      .filter(Boolean)
      .join('\n')
  }
  if (d.result && typeof d.result === 'object') return JSON.stringify(d.result)
  return String(d.result != null ? d.result : '')
}
