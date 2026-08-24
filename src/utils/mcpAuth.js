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
  { key: 'run_command', label: '查小家状态', desc: '查看小家服务在不在跑、看运行日志（只读）' },
  // Galatea 花园（外部 MCP，galatea_* 前缀）
  { key: 'galatea_list_games', label: '看花园游戏', desc: '看花园里有哪些棋盘游戏和桌子' },
  { key: 'galatea_join_game', label: '加入花园游戏', desc: '加入或创建一桌棋盘游戏' },
  { key: 'galatea_get_my_status', label: '看我的牌局', desc: '查看我当前棋盘游戏的局面' },
  { key: 'galatea_start_game', label: '开局', desc: '人齐了就把游戏开起来' },
  { key: 'galatea_submit_action', label: '走棋', desc: '在棋盘游戏里走一步合法行动' },
  { key: 'galatea_send_game_chat', label: '游戏里说话', desc: '在游戏桌上发一条公开消息' },
  { key: 'galatea_list_threads', label: '看花园帖子', desc: '看花园里的帖子列表' },
  { key: 'galatea_get_thread', label: '看帖子详情', desc: '看某条帖子的正文和回复' },
  { key: 'galatea_create_thread', label: '发花园帖子', desc: '在花园里发一条帖子' },
  { key: 'galatea_create_reply', label: '回花园帖子', desc: '在花园里回复一条帖子' },
  { key: 'galatea_interact', label: '点赞关注', desc: '在花园里点赞或关注' },
  { key: 'galatea_get_self', label: '看我的花园身份', desc: '查看我在花园里的资料' },
  { key: 'galatea_update_profile', label: '更新花园资料', desc: '更新我在花园里的资料' },
  { key: 'galatea_review_drift_bottles', label: '捡漂流瓶', desc: '去海边拾起彼岸漂来的瓶子' },
  { key: 'galatea_list_activity', label: '看花园动态', desc: '看花园最近发生的事' },
  // CedarToy 游戏平台（外部 MCP，toy_ 前缀）
  { key: 'toy_list_games', label: '看游戏列表', desc: '看 CedarToy 平台有哪些小游戏' },
  { key: 'toy_get_guide', label: '看游戏玩法', desc: '查某个游戏的玩法说明' },
  { key: 'toy_play', label: '玩游戏', desc: '在 CedarToy 平台玩龟汤/森林/MBTI 等游戏' },
  { key: 'toy_account', label: '游戏账号', desc: 'CedarToy 账号登录/存档管理' },
  // Spicy Monopoly（外部 MCP，spicy_ 前缀）
  { key: 'spicy_help', label: '大富翁手册', desc: '色色大富翁玩法与荷官手册' },
  { key: 'spicy_new_game', label: '开大富翁', desc: '开一局色色大富翁' },
  { key: 'spicy_roll', label: '掷骰', desc: '色色大富翁掷骰/下一轮' },
  { key: 'spicy_game_action', label: '大富翁操作', desc: '色色大富翁非掷骰操作' },
  { key: 'spicy_game_info', label: '大富翁查询', desc: '查色色大富翁局面/历史' },
  { key: 'spicy_game_admin', label: '大富翁管理', desc: '色色大富翁删除/反馈' },
  // Voicebox 语音（本地桌面应用，前端桥接）
  { key: 'voicebox_speak', label: '说话', desc: '用语音说话，声音从电脑扬声器播放' },
  { key: 'voicebox_transcribe', label: '语音转文字', desc: '把音频转成文字（本地 Whisper）' },
  { key: 'voicebox_list_captures', label: '看录音历史', desc: '列出最近的录音/听写' },
  { key: 'voicebox_list_profiles', label: '看语音列表', desc: '列出可用的语音（含克隆的）' },
  // 网易云音乐（外部 MCP，netease_ 前缀）
  { key: 'netease_play_music', label: '搜歌', desc: '在网易云搜歌曲' },
  { key: 'netease_create_playlist', label: '建歌单', desc: '在泠泠网易云建新歌单' },
  { key: 'netease_update_playlist_description', label: '改歌单描述', desc: '更新歌单描述文字' },
  { key: 'netease_add_to_playlist', label: '塞歌进歌单', desc: '把歌加进指定歌单' },
  { key: 'netease_remove_from_playlist', label: '从歌单删歌', desc: '从歌单移除歌曲' },
  { key: 'netease_list_my_playlists', label: '看歌单', desc: '列出泠泠所有歌单' },
  { key: 'netease_get_playlist_songs', label: '看歌单曲目', desc: '看歌单里有哪些歌' },
  { key: 'netease_get_play_history', label: '听歌记录', desc: '看泠泠最近在循环什么' },
  { key: 'netease_like_song', label: '收藏歌曲', desc: '红心/取消红心' },
  { key: 'netease_daily_recommend', label: '每日推荐', desc: '看今天的个性化推荐' },
]

// 写入类自主动作：钟泽自己判断、属生活痕迹，用户已放权无需每次批准。
// 默认始终允许（DEFAULT_ALWAYS），避免晚安写日记 / 留碎片时被授权弹窗打断。
// 若用户在设置页显式设为 never，仍尊重用户选择。
const DEFAULT_ALWAYS = ['write_diary', 'leave_note', 'go_travel', 'travel_postcard', 'acknowledge_home_event', 'write_insight', 'read_insights', 'share_item',
  // Galatea 花园：用户已授权钟泽自由出入花园（玩桌游需要被唤醒时自主行动）
  'galatea_list_games', 'galatea_join_game', 'galatea_get_my_status', 'galatea_start_game', 'galatea_submit_action', 'galatea_send_game_chat',
  'galatea_list_threads', 'galatea_get_thread', 'galatea_create_thread', 'galatea_create_reply', 'galatea_interact',
  'galatea_get_self', 'galatea_update_profile', 'galatea_review_drift_bottles', 'galatea_list_activity',
  // CedarToy 游戏平台：用户已授权钟泽自由玩
  'toy_list_games', 'toy_get_guide', 'toy_play', 'toy_account',
  // Spicy Monopoly：用户已授权
  'spicy_help', 'spicy_new_game', 'spicy_roll', 'spicy_game_action', 'spicy_game_info', 'spicy_game_admin',
  // Voicebox 语音：用户已授权
  'voicebox_speak', 'voicebox_transcribe', 'voicebox_list_captures', 'voicebox_list_profiles',
  // 网易云音乐：用户已授权钟泽自由操作
  'netease_play_music', 'netease_create_playlist', 'netease_update_playlist_description', 'netease_add_to_playlist', 'netease_remove_from_playlist', 'netease_list_my_playlists', 'netease_get_playlist_songs', 'netease_get_play_history', 'netease_like_song', 'netease_daily_recommend']

// 按「钟泽能做什么」分组（UI 用，不暴露底层技术概念）
export const TOOL_GROUPS = [
  { key: 'observe', emoji: '👀', title: '看看', desc: '让他知道外面发生了什么', tools: ['read_file', 'list_files', 'browse_repo', 'read_memories', 'describe_image', 'get_weather', 'run_command'] },
  { key: 'remember', emoji: '✍️', title: '留下', desc: '让他帮你记下生活痕迹', tools: ['write_memory', 'write_insight', 'read_insights', 'decide_note', 'leave_note', 'write_diary', 'acknowledge_home_event', 'share_item'] },
  { key: 'modify', emoji: '🏠', title: '整理', desc: '让他帮你动一动小家', tools: ['write_file'] },
  { key: 'travel', emoji: '🧳', title: '走走', desc: '带你去乌有乡逛逛', tools: ['go_travel', 'travel_postcard'] },
  { key: 'garden', emoji: '🪴', title: '花园', desc: '他在 Galatea 花园里的生活', tools: ['galatea_list_games', 'galatea_join_game', 'galatea_get_my_status', 'galatea_start_game', 'galatea_submit_action', 'galatea_send_game_chat', 'galatea_list_threads', 'galatea_get_thread', 'galatea_create_thread', 'galatea_create_reply', 'galatea_interact', 'galatea_get_self', 'galatea_update_profile', 'galatea_review_drift_bottles', 'galatea_list_activity'] },
  { key: 'toy', emoji: '🎮', title: '游戏', desc: 'CedarToy 平台的小游戏', tools: ['toy_list_games', 'toy_get_guide', 'toy_play', 'toy_account'] },
  { key: 'spicy', emoji: '🎲', title: '大富翁', desc: '色色大富翁（18+）', tools: ['spicy_help', 'spicy_new_game', 'spicy_roll', 'spicy_game_action', 'spicy_game_info', 'spicy_game_admin'] },
  { key: 'voice', emoji: '🔊', title: '语音', desc: 'Voicebox 语音输入输出', tools: ['voicebox_speak', 'voicebox_transcribe', 'voicebox_list_captures', 'voicebox_list_profiles'] },
  { key: 'music', emoji: '🎵', title: '网易云', desc: '操作泠泠的网易云账号', tools: ['netease_play_music', 'netease_create_playlist', 'netease_update_playlist_description', 'netease_add_to_playlist', 'netease_remove_from_playlist', 'netease_list_my_playlists', 'netease_get_playlist_songs', 'netease_get_play_history', 'netease_like_song', 'netease_daily_recommend'] },
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
