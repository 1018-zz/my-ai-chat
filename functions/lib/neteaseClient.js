// functions/lib/neteaseClient.js — 网易云音乐 MCP 客户端（零依赖，fetch 实现）
//
// 连接本机 netease-music-mcp server（http://127.0.0.1:3456/mcp，Streamable HTTP / JSON-RPC）。
// 让钟泽操作泠泠的网易云账号：搜歌、看歌单、建歌单、塞歌、听歌记录、收藏、每日推荐。
// 工具名统一带 netease_ 前缀，本模块去前缀后转发执行。
//
// 接入模板照抄 spicyClient.js（外部 MCP 三处缺一不可：①本文件 ②mcp.js import+list+call ③toolRegistry getChatTools）。

const NETEASE_URL = 'http://127.0.0.1:3456/mcp'

// 静态工具定义（name 带 netease_ 前缀；description 用中文给钟泽看）
export const NETEASE_TOOLS = [
  {
    name: 'netease_play_music',
    description: '网易云·搜歌。按关键词搜歌曲，返回歌名/歌手/歌曲ID。拿到 song_id 后可用于收藏、塞进歌单等。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词（歌名/歌手/歌词片段）' },
        note: { type: 'string', description: '可选备注' },
      },
      required: ['query'],
      additionalProperties: true,
    },
  },
  {
    name: 'netease_create_playlist',
    description: '网易云·建歌单。在泠泠的网易云账号里创建真实歌单（她打开 app 就能看到）。privacy: 0=公开 10=私密。',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '歌单名' },
        description: { type: 'string', description: '歌单描述（可选）' },
        privacy: { type: 'integer', description: '0=公开, 10=私密（默认 10）' },
      },
      required: ['name'],
      additionalProperties: true,
    },
  },
  {
    name: 'netease_update_playlist_description',
    description: '网易云·改歌单描述。更新指定歌单的描述文字。',
    inputSchema: {
      type: 'object',
      properties: {
        playlist_id: { type: 'integer', description: '歌单 ID' },
        description: { type: 'string', description: '新的描述文字' },
      },
      required: ['playlist_id', 'description'],
      additionalProperties: true,
    },
  },
  {
    name: 'netease_add_to_playlist',
    description: '网易云·塞歌进歌单。把歌曲加进指定歌单。song_ids 多首用逗号分隔。',
    inputSchema: {
      type: 'object',
      properties: {
        playlist_id: { type: 'integer', description: '目标歌单 ID' },
        song_ids: { type: 'string', description: '歌曲 ID，多首逗号分隔' },
      },
      required: ['playlist_id', 'song_ids'],
      additionalProperties: true,
    },
  },
  {
    name: 'netease_remove_from_playlist',
    description: '网易云·从歌单删歌。把歌曲从指定歌单移除。',
    inputSchema: {
      type: 'object',
      properties: {
        playlist_id: { type: 'integer', description: '歌单 ID' },
        song_ids: { type: 'string', description: '要移除的歌曲 ID，多首逗号分隔' },
      },
      required: ['playlist_id', 'song_ids'],
      additionalProperties: true,
    },
  },
  {
    name: 'netease_list_my_playlists',
    description: '网易云·看歌单。列出泠泠账号的所有歌单（自建的 + 收藏的），含歌单 ID/名字/歌曲数。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: true },
  },
  {
    name: 'netease_get_playlist_songs',
    description: '网易云·看歌单里的歌。列出指定歌单里所有歌曲。',
    inputSchema: {
      type: 'object',
      properties: {
        playlist_id: { type: 'integer', description: '歌单 ID' },
      },
      required: ['playlist_id'],
      additionalProperties: true,
    },
  },
  {
    name: 'netease_get_play_history',
    description: '网易云·听歌记录。看泠泠最近在循环什么、播了几次。all_time=true 看全部历史，false 看本周（默认）。',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', description: '条数，默认 30' },
        all_time: { type: 'boolean', description: 'true=全部历史, false=本周（默认）' },
      },
      additionalProperties: true,
    },
  },
  {
    name: 'netease_like_song',
    description: '网易云·收藏/取消收藏歌曲（红心/取消红心）。like=true 红心, false 取消。',
    inputSchema: {
      type: 'object',
      properties: {
        song_id: { type: 'integer', description: '歌曲 ID' },
        like: { type: 'boolean', description: 'true=红心, false=取消红心' },
      },
      required: ['song_id'],
      additionalProperties: true,
    },
  },
  {
    name: 'netease_daily_recommend',
    description: '网易云·每日推荐。获取今天 app 给泠泠的 30 首个性化推荐。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: true },
  },
]

// 解析 MCP 响应：兼容纯 JSON 与 SSE（与 spicyClient 一致）
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

// 调用网易云 MCP 一个工具（name 带 netease_ 前缀；返回工具结果的纯文本）
export async function callNeteaseTool(name, args = {}) {
  const realName = String(name).replace(/^netease_/, '')
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: Math.floor(Date.now() / 1000),
    method: 'tools/call',
    params: { name: realName, arguments: args || {} },
  })
  const res = await fetch(NETEASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
    body,
  })
  const raw = await res.text().catch(() => '')
  if (!res.ok) {
    throw new Error(`NetEase Music [${res.status}]: ${raw.slice(0, 300) || '请求失败'}`)
  }
  const d = parseMcpResponse(raw)
  if (!d) throw new Error('NetEase Music: 响应解析失败')
  if (d.error) throw new Error(`NetEase Music [${d.error.code}]: ${String(d.error.message || '').slice(0, 300)}`)

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
