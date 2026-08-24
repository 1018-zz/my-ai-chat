// functions/lib/spicyClient.js — Spicy Monopoly MCP 客户端（零依赖，fetch 实现）
//
// 连接外部 MCP 服务器 https://spicy-monopoly.lol/mcp（streamable HTTP / JSON-RPC，无状态）。
// 18+ 双人棋盘游戏，AI 当荷官兼玩家。工具名统一带 spicy_ 前缀，本模块负责去前缀后转发执行。
//
// 接入模板照抄 cedarToyClient.js（外部 MCP 三处缺一不可：①本文件 ②mcp.js import+list+call ③toolRegistry getChatTools）。

const SPICY_URL = 'https://spicy-monopoly.lol/mcp'

// 静态工具定义
export const SPICY_TOOLS = [
  {
    name: 'spicy_help',
    description: '色色大富翁·玩法与荷官手册。开局前必调——返回压缩版荷官手册：开局问题、安全规则、回合循环、MCP 动作、资源 URI。里面有 rules_ack，开 new_game 时要带上。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: true },
  },
  {
    name: 'spicy_new_game',
    description: '色色大富翁·开新局。先调 spicy_help 拿 rules_ack，向玩家解释规则并确认后调用。必填：p1_name/p2_name/p1_sex/p2_sex/p1_role/p2_role。setup_confirmed=true + rules_ack 缺一不可（门控）。可选：lineup(男女/男男/女女)、flavor(light/medium/heavy)、redline(红线数组)、open_anal/no_receive_anal/no_penetration、game_length(4-60)、reverse_chance(0-1)、identity_mode(off/mixed/nsfw_only)、first_player、pair_code。安全词是 404，任何人说 404 立刻停。',
    inputSchema: {
      type: 'object',
      properties: {
        lineup: { type: 'string', description: '男女/男男/女女（也接受 mf/mm/ff）' },
        flavor: { type: 'string', description: 'light/medium/heavy' },
        p1_name: { type: 'string', description: '玩家1名字（用真实名字，会记入对局历史）' },
        p1_sex: { type: 'string', description: '男/女' },
        p1_role: { type: 'string', description: '攻/受' },
        p2_name: { type: 'string', description: '玩家2名字' },
        p2_sex: { type: 'string', description: '男/女' },
        p2_role: { type: 'string', description: '攻/受' },
        redline: { type: 'array', items: { type: 'string' }, description: '排除的话题/术语' },
        open_anal: { type: 'array', items: { type: 'string' }, description: '明确允许后肛的玩家名' },
        no_receive_anal: { type: 'array', items: { type: 'string' }, description: '不得接受后肛的玩家名' },
        no_penetration: { type: 'array', items: { type: 'string' }, description: '纯 top 不插入的玩家名' },
        reverse_chance: { type: 'number', description: '攻受反转概率 0-1，默认 0.3' },
        identity_mode: { type: 'string', description: 'off/mixed/nsfw_only' },
        game_length: { type: 'number', description: '总回合 4-60' },
        pair_code: { type: 'string', description: '私有配对码' },
        first_player: { type: 'string', description: '先手玩家名' },
        setup_confirmed: { type: 'boolean', description: '已解释规则并确认 → true（门控）' },
        rules_ack: { type: 'string', description: '从 spicy_help 拿到的规则确认串' },
      },
      required: ['p1_name', 'p2_name', 'p1_sex', 'p2_sex', 'p1_role', 'p2_role', 'setup_confirmed', 'rules_ack'],
      additionalProperties: true,
    },
  },
  {
    name: 'spicy_roll',
    description: '色色大富翁·掷骰/下一轮。传 game_id（new_game 返回的）。上一轮需要结算时才传 task=done/skip、toll=pay/serve、duel_winner、guess=大/小 等。每回合调一次，把返回的棋盘原文贴出来（不要重画）。安全词 404 出现立刻停。',
    inputSchema: {
      type: 'object',
      properties: {
        game_id: { type: 'string', description: 'new_game 返回的 game_id' },
        toll: { type: 'string', description: '过路费结算：pay/serve（仅上轮需要时）' },
        task: { type: 'string', description: '任务结算：done/skip（仅上轮需要时）' },
        super_action: { type: 'string', description: 'done/buyout' },
        duel_winner: { type: 'string', description: '对决胜者名' },
        guess: { type: 'string', description: '大/小' },
        swap_identity: { type: 'boolean', description: '是否交换身份' },
        tiebreak: { type: 'boolean', description: '平局加赛' },
      },
      additionalProperties: true,
    },
  },
  {
    name: 'spicy_game_action',
    description: '色色大富翁·非掷骰操作。action 必填：final_result/skip/swap/done/pay_toll/serve_toll/duel_result/buyout_super/buy_card/use_card/discard_card/buy_collectible/reroll_identity/reroll_task/extra_task/guess_mark/declare_persona/id_event。大多数需要 who=玩家名。玩家说停/404/不想做 → 立刻 skip。',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: '操作名：final_result/skip/swap/done/pay_toll/serve_toll/duel_result/buyout_super/buy_card/use_card/discard_card/buy_collectible/reroll_identity/reroll_task/extra_task/guess_mark/declare_persona/id_event' },
        game_id: { type: 'string', description: 'game_id' },
        who: { type: 'string', description: '玩家名（大多数操作需要）' },
        winner: { type: 'string', description: 'duel_result 胜者' },
        index: { type: 'number', description: '卡牌索引 0-based' },
        spot: { type: 'string', description: 'guess_mark 身体部位' },
        persona: { type: 'string', description: 'declare_persona 文本' },
        event: { type: 'string', description: 'id_event：first_climax/say_banned/no_kiss_2turns' },
      },
      required: ['action', 'game_id'],
      additionalProperties: true,
    },
  },
  {
    name: 'spicy_game_info',
    description: '色色大富翁·只读查询。query 必填：state（当前局面，需 game_id）/ shop（商店，需 game_id）/ list_games（历史对局，需 player_token）/ pair_history（对局历史，需 p1_name/p1_sex/p2_name/p2_sex，返回 last_game_id 可恢复丢的 game_id）。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'state/shop/list_games/pair_history' },
        game_id: { type: 'string', description: 'state/shop 需要' },
        player_token: { type: 'string', description: 'list_games 需要' },
        p1_name: { type: 'string', description: 'pair_history 需要' },
        p1_sex: { type: 'string', description: 'pair_history 需要' },
        p2_name: { type: 'string', description: 'pair_history 需要' },
        p2_sex: { type: 'string', description: 'pair_history 需要' },
        pair_code: { type: 'string', description: '可选配对码' },
      },
      required: ['query'],
      additionalProperties: true,
    },
  },
  {
    name: 'spicy_game_admin',
    description: '色色大富翁·管理/反馈。action 必填：delete_game（需 game_id+player_token）/ clear_pair_history（需双方名+性别）/ submit_feedback（text+kind=bug/idea/feedback）。极少用。',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'delete_game/clear_pair_history/submit_feedback' },
        game_id: { type: 'string', description: 'delete_game 需要' },
        player_token: { type: 'string', description: 'delete_game 需要' },
        text: { type: 'string', description: 'feedback 文本' },
        kind: { type: 'string', description: 'bug/idea/feedback' },
        p1_name: { type: 'string', description: 'clear_pair_history 需要' },
        p1_sex: { type: 'string', description: 'clear_pair_history 需要' },
        p2_name: { type: 'string', description: 'clear_pair_history 需要' },
        p2_sex: { type: 'string', description: 'clear_pair_history 需要' },
        pair_code: { type: 'string', description: '可选' },
      },
      required: ['action'],
      additionalProperties: true,
    },
  },
]

// 解析 MCP 响应：兼容纯 JSON 与 SSE
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

// 调用 Spicy Monopoly 一个工具（name 带 spicy_ 前缀；返回工具结果的纯文本）
export async function callSpicyTool(name, args = {}) {
  const baseName = String(name).replace(/^spicy_/, '')
  const realName = baseName === 'help' ? 'monopoly_help' : baseName
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: Math.floor(Date.now() / 1000),
    method: 'tools/call',
    params: { name: realName, arguments: args || {} },
  })
  const res = await fetch(SPICY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
    body,
  })
  const raw = await res.text().catch(() => '')
  if (!res.ok) {
    throw new Error(`SpicyMonopoly [${res.status}]: ${raw.slice(0, 300) || '请求失败'}`)
  }
  const d = parseMcpResponse(raw)
  if (!d) throw new Error('SpicyMonopoly: 响应解析失败')
  if (d.error) throw new Error(`SpicyMonopoly [${d.error.code}]: ${String(d.error.message || '').slice(0, 300)}`)

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
