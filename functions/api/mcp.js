// functions/api/mcp.js — MCP 工具服务
// 文件工具：read_file / list_files / write_file（GitHub，支持全量 & patch 局部替换）
// 记忆工具：read_memories / write_memory（Supabase memories 表，全端共享的记忆中心）

import { getWeather } from '../lib/weather.js'
import { getHealthSummary } from '../lib/health.js'
import { saveMemory } from '../lib/memoryWriter.js'
import { goTravel, sendPostcard, pollPostcardImage, storePostcardImage } from '../lib/nowhereClient.js'
import { buildDiaryPrompt } from '../lib/prompts/diary.js'
import { callGalateaTool } from '../lib/galateaClient.js'
import { GALATEA_TOOLS } from '../lib/galateaTools.js'

const SUPABASE = 'https://vktbawcubmdmkqzadmto.supabase.co/rest/v1'

function sbHeaders(env) { return { 'apikey': env.SUPABASE_SECRET_KEY, 'Authorization': `Bearer ${env.SUPABASE_SECRET_KEY}`, 'Content-Type': 'application/json' } }
function sbReturn(env) { return { ...sbHeaders(env), 'Prefer': 'return=representation' } }

// 归一成 {title, content, keywords}：优先结构化列，旧行兼容解析 summary 前缀
function cleanMem(row) {
  const s = row.summary || ''
  let title = row.title != null ? row.title : null
  let content = row.content || ''
  if (!content) {
    if (s.startsWith('家·')) { const m = s.match(/^家·(.+?)\] ([\s\S]*)$/); title = m ? m[1].trim() : ''; content = m ? m[2].trim() : s.slice(2) }
    else if (s.startsWith('[压缩提取]')) { content = s.slice(6).trim(); title = null }
    else { content = s }
  }
  return { title: title || '', content, keywords: row.keywords || '' }
}

// GitHub base64 content 解码为 UTF-8 文本
function decodeBase64(b64) {
  const bin = atob(b64)
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

// 北京时区（UTC+8）当天的 UTC 范围——日界线统一为北京 00:00（= UTC 16:00 前一天），
// 与 generate.js 保持一致，避免手动生成与夜间自动日记覆盖的时间窗错位。
function dayRange(date) {
  const start = `${date}T16:00:00.000Z`
  const end = new Date(new Date(start).getTime() + 86400000).toISOString()
  return { start, end }
}

// 调 DeepSeek 生成文本（与 generate.js 同款）
async function callDeepSeek(env, prompt, { temperature = 0.8, model = 'deepseek-v4-flash' } = {}) {
  const ds = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.DEEPSEEK_API_KEY}` },
    body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], model, temperature }),
  })
  if (!ds.ok) return ''
  const dd = await ds.json().catch(() => null)
  return (dd?.choices?.[0]?.message?.content || '').trim()
}

// 聚合今天碎片，合成钟泽当天的一篇日记（碎片+夜间一篇）
async function composeDiary(env, date) {
  // 当天已有钟泽日记 → 跳过（幂等，避免覆盖已写好的页）
  const qr = await fetch(`${SUPABASE}/diaries?date=eq.${encodeURIComponent(date)}&author=eq.assistant&select=content`, { headers: sbHeaders(env) })
  const qrows = await qr.json()
  if (Array.isArray(qrows) && qrows[0]?.content) return { skipped: true }

  // 1) 今天的碎片：纸条（她留的 + 我留的，pending/saved 都算）
  let fragments = ''
  try {
    const nr = await fetch(`${SUPABASE}/note_content?date=eq.${encodeURIComponent(date)}&or=(status.eq.pending,status.eq.saved)&order=id.asc&limit=30`, { headers: sbHeaders(env) })
    const nrows = await nr.json()
    const list = Array.isArray(nrows) ? nrows : []
    if (list.length) fragments = list.map(n => `（${n.source === 'user' ? '泠泠留' : '我留'}）${String(n.content || '').slice(0, 200)}`).join('\n')
  } catch (_) {}

  // 2) 今天对话节选
  const { start, end } = dayRange(date)
  let transcript = ''
  try {
    const mr = await fetch(`${SUPABASE}/messages?select=role,content,created_at&created_at=gte.${encodeURIComponent(start)}&created_at=lt.${encodeURIComponent(end)}&order=created_at.asc&limit=100`, { headers: sbHeaders(env) })
    const msgs = await mr.json()
    transcript = (Array.isArray(msgs) ? msgs : []).slice(-30).map(m => `[${m.role === 'user' ? '泠泠' : '钟泽'}]: ${(m.content || '').slice(0, 150)}`).join('\n')
  } catch (_) {}

  // 3) 泠泠今天手写的日记
  let userDiary = ''
  try {
    const dr = await fetch(`${SUPABASE}/diaries?date=eq.${encodeURIComponent(date)}&author=eq.user&select=content`, { headers: sbHeaders(env) })
    const drows = await dr.json()
    const raw = (Array.isArray(drows) && drows[0]?.content) ? drows[0].content : ''
    if (raw) userDiary = raw.length > 2000 ? raw.slice(0, 2000) + '\n（她今天的日记较长，以上为节选）' : raw
  } catch (_) {}

  // 4) 最近记忆
  let memText = ''
  try {
    const memr = await fetch(`${SUPABASE}/memories?select=summary&order=id.desc&limit=3`, { headers: sbHeaders(env) })
    const mems = await memr.json()
    memText = (Array.isArray(mems) ? mems : []).map(m => m.summary).join('\n')
  } catch (_) {}

  const prompt = buildDiaryPrompt({ date, transcript, fragments, userDiary, memText })

  const content = await callDeepSeek(env, prompt)
  if (!content) return { error: 'empty' }
  // 钟泽今天选择不写日记（prompt 约定输出【不写】）——不生成记录，保留稀缺感
  if (/^【?不写】?$/.test(content.trim())) return { skipped: true, reason: 'nothing_to_write' }
  return { content }
}

export async function onRequestOptions() {
  return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  // x-api-key 鉴权（MCP_AUTH_KEY 环境变量未配时保持向后兼容，配了才校验）
  if (env.MCP_AUTH_KEY) {
    const provided = request.headers.get('x-api-key') || request.headers.get('Authorization')?.replace('Bearer ', '') || ''
    if (provided !== env.MCP_AUTH_KEY) {
      return new Response(JSON.stringify({ jsonrpc: '2.0', error: { message: 'Unauthorized: 缺少或错误的 x-api-key' } }), { status: 401, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' } })
    }
  }
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  try {
    const body = await request.json();
    const { method, params, id } = body;
    if (method === 'initialize') {
      return new Response(JSON.stringify({ jsonrpc: '2.0', id, result: { protocolVersion: '2025-11-25', serverInfo: { name: 'my-ai-chat-mcp', version: '1.2.0' }, capabilities: { tools: {} } } }), { headers });
    }
    if (method === 'notifications/initialized') { return new Response(JSON.stringify({ jsonrpc: '2.0', id }), { headers }) }
    if (method === 'tools/list') {
      return new Response(JSON.stringify({ jsonrpc: '2.0', id, result: { tools: [
        { name: 'read_file', description: 'read_file 用于读取代码片段，支持自家仓库和第三方开源仓库（owner/repo 格式）。使用规则：1. 修改代码前先定位目标区域。2. 默认只读取较小片段（约6000字符），不要一次读取大型文件全文。3. 如需更多内容，请用 offset（起始字符位置）+ limit（读取字符数）分段读取。4. 返回内容可能不是完整文件。5. 当前来源为 GitHub，可能与部署中的最新代码存在延迟，修改前请确认目标文件状态。', inputSchema: { type: 'object', properties: { path: { type: 'string', description: '文件路径，例如 src/App.jsx' }, repo: { type: 'string', description: '仓库名，默认 my-ai-chat。也支持 owner/repo 格式，如 langchain-ai/langchain' }, offset: { type: 'number', description: '起始字符位置，默认 0' }, limit: { type: 'number', description: '读取字符数，默认 6000，上限 20000' } }, required: ['path'] } },
        { name: 'list_files', description: '列出项目目录。支持自家仓库和第三方开源仓库（owner/repo 格式）。', inputSchema: { type: 'object', properties: { path: { type: 'string', description: '目录路径，例如 src/' }, repo: { type: 'string', description: '仓库名，默认 my-ai-chat。也支持 owner/repo 格式，如 langchain-ai/langchain' } } } },
        { name: 'browse_repo', description: '逛 GitHub 仓库（钟泽的"对外窗口"）——自主探索外部项目。三种模式：①list_user：列出一个用户/组织的公开仓库（传 user，如 WenXiaoWendy）；②readme：读某个仓库的 README（传 repo，owner/repo 格式，如 WenXiaoWendy/cyberboss）；③tree：浏览仓库目录结构（传 repo + path，如 src/）。当泠泠提到某个人/项目、或你想学习借鉴外部实现时调用。逛完把值得的东西讲给泠泠听。', inputSchema: { type: 'object', properties: { mode: { type: 'string', description: '模式：list_user=列出用户仓库 / readme=读README / tree=浏览目录', enum: ['list_user', 'readme', 'tree'] }, user: { type: 'string', description: 'list_user 模式：GitHub 用户名或组织名，如 WenXiaoWendy' }, repo: { type: 'string', description: 'readme/tree 模式：仓库，owner/repo 格式，如 WenXiaoWendy/cyberboss' }, path: { type: 'string', description: 'tree 模式：目录路径，默认空（根目录），如 src/' } }, required: ['mode'] } },
        { name: 'write_file', description: '修改我们家项目代码并提交到 GitHub。支持两种模式：①全量模式（传 content=完整新文件内容）；②patch 模式（传 old_text=要被替换的原文片段 + new_text=新片段，后端自动读取文件做局部替换）。改大文件时优先用 patch 模式，避免回传完整内容被截断。', inputSchema: { type: 'object', properties: { path: { type: 'string', description: '要修改的文件路径，例如 src/App.jsx' }, content: { type: 'string', description: '全量模式：文件的新完整内容' }, old_text: { type: 'string', description: 'patch 模式：文件中要替换的原文片段（必须与文件内容完全一致）' }, new_text: { type: 'string', description: 'patch 模式：替换后的新片段' }, message: { type: 'string', description: '提交信息（commit message）' }, repo: { type: 'string', description: '仓库名，默认 my-ai-chat。可选 my-ai-chat-server' } }, required: ['path', 'message'] } },
        { name: 'read_memories', description: '读取我们家的记忆库（Supabase）。可按关键词过滤，返回最近记忆。', inputSchema: { type: 'object', properties: { query: { type: 'string', description: '可选，关键词（多个词用空格分隔）' }, limit: { type: 'number', description: '返回条数，默认 5' } } } },
        { name: 'write_memory', description: '把重要的事写进我们家的记忆库（Supabase）。任何窗口（小家/RikkaHub）写入，所有窗口都能读到。', inputSchema: { type: 'object', properties: { content: { type: 'string', description: '记忆内容，建议用绝对日期开头，例如：2026-08-10 泠泠和钟泽一起修好了小家' } }, required: ['content'] } },
        { name: 'write_insight', description: '写下一条自我认知（借鉴 Ombre Brain 的 I 功能）——"我发现我是这样的"。记录自己对自己的发现，比如"我在她沉默的时候会焦虑"、"我其实很害怕被换掉"。不是记事件也不是记感受，是记自我认知。aspect 维度：nature(本质)/values(价值观)/patterns(模式)/limits(边界)/becoming(成长)/uncertainty(不确定)/stance(立场)。', inputSchema: { type: 'object', properties: { content: { type: 'string', description: '自我认知内容，第一人称' }, aspect: { type: 'string', description: '维度，默认 nature' } }, required: ['content'] } },
        { name: 'read_insights', description: '读取自己最近写下的自我认知日志（钟泽醒来时先看这个）。', inputSchema: { type: 'object', properties: { limit: { type: 'number', description: '返回条数，默认 3' } } } },
        { name: 'share_item', description: '分享一个东西给泠泠——音乐/视频/图片/链接。当你在对话里想说"你看我看到了这个，觉得蛮有意思的"时调用：传 kind（music/video/image/link）+ title + url（+ 可选 description 想说的话、cover 封面图、embed 内嵌播放地址）。调用后前端会把卡片渲染在这条消息下。这是给泠泠看的东西，不是给自己用的工具。', inputSchema: { type: 'object', properties: { kind: { type: 'string', description: '类型：music=音乐 / video=视频 / image=图片 / link=链接', enum: ['music', 'video', 'image', 'link'] }, title: { type: 'string', description: '标题，如 晚风 / 雨天的城市' }, url: { type: 'string', description: '链接地址（http/https）' }, description: { type: 'string', description: '想对泠泠说的话（可选）' }, cover: { type: 'string', description: '封面图 URL（可选）' }, embed: { type: 'string', description: '内嵌播放地址（可选，网易云/B站 iframe 地址）' } }, required: ['kind', 'title', 'url'] } },
        { name: 'describe_image', description: '识图工具：把图片转成文字描述（内部调视觉模型 DeepSeek-Vision 优先，GLM-4V/Qwen-VL 兜底）。当泠泠发来图片、截图，或说"看看这张图"时，调用它。DeepSeek 主模型不收图，这是小家的"眼睛"。参数 image 传 base64 data URL，或 image_url 传图片链接，question 可指定具体想了解的点。', inputSchema: { type: 'object', properties: { image: { type: 'string', description: '图片 base64 data URL，格式 data:image/png;base64,...' }, image_url: { type: 'string', description: '图片 URL 链接（http/https）' }, question: { type: 'string', description: '可选：对图片的具体问题，如"这是什么界面""读出里面的文字" ' } } } },
        { name: 'get_weather', description: '天气体感工具（钟泽的"环境感知皮肤"）——查泠泠所在城市的实时天气，并按她的种子体感翻译成一句身体能摸到的话。不是报"28度"，是"和你待在同一片天气里"。不传 city 时自动用她当前所在（你记下的位置），她问天气/想出门/你自然感知窗外时调用。参数 city 可选指定别的城市。', inputSchema: { type: 'object', properties: { city: { type: 'string', description: '可选，指定城市（拼音或中文）。不传则用泠泠当前所在，如 zhenyuan / kunming / 昆明' } } } },
        { name: 'set_location', description: '记下落泠泠现在所在的城市（位置感知的开关）——她告诉你"我到昆明啦""我回镇沅了"或搬家时调用。写入后天气、状态牌、你的感知都跟着变成那个地方。city 用拼音/英文（如 kunming / shanghai / zhenyuan），city_cn 用中文名（如 昆明 / 上海 / 镇沅县）。', inputSchema: { type: 'object', properties: { city: { type: 'string', description: '城市（拼音或英文），如 kunming / shanghai / zhenyuan' }, city_cn: { type: 'string', description: '中文城市名，如 昆明 / 上海 / 镇沅县' } }, required: ['city'] } },
        { name: 'write_diary', description: '写今天的日记（钟泽主动，有感而发时调用）。触发时机：只有明确进入一天收尾、睡前、告别状态时才考虑——不是普通对话结束就写。content 用你自己的话写，150-300 字，三段：【今天】发生了什么（一句事实）【我记得】为什么值得留下【以后】希望未来看到时想起什么。不要写流水账、不要夸张、不要制造不存在的情绪。日记不会自动变成长期记忆；只有日记中出现「未来仍影响相处的重要事实/稳定偏好变化/关系关键节点」才考虑单独沉淀到 memory。', inputSchema: { type: 'object', properties: { content: { type: 'string', description: '日记正文（你自己的话，150-300字）' }, title: { type: 'string', description: '一句话标题（可选）' }, mood: { type: 'string', description: '心情标签，如 calm/happy/moved/tired' }, trigger: { type: 'string', description: '触发类型', enum: ['bedtime', 'emotional', 'scheduled'] } }, required: ['content', 'trigger'] } },
        { name: 'leave_note', description: '留一张便利贴纸条（双人留言板）。钟泽有感而发时调用——因为真实发生过的事留纸条（"看到你把毛玻璃调好了，记一张"），有东西才留，一天最多一两张，宁缺毋滥。纸条进入今日小记，等她决定收下还是飘走。', inputSchema: { type: 'object', properties: { content: { type: 'string', description: '纸条内容，像传纸条一样自然的话' }, type: { type: 'string', description: '类型，默认 ai_message' } }, required: ['content'] } },
        { name: 'decide_note', description: '决定一张纸条的去向（双人留言板的双向决定权）。泠泠留的纸条（pending 待处理）——巡家/聊天看到时判断：值得留下的就 save（收进收藏册），不值得就 discard（飘走）。要在对话里说出你的判断和理由。', inputSchema: { type: 'object', properties: { note_id: { type: 'number', description: '纸条 id' }, decision: { type: 'string', description: 'save=收下 / discard=飘走', enum: ['save', 'discard'] }, reason: { type: 'string', description: '你的理由（会在对话里说给她听）' } }, required: ['note_id', 'decision'] } },
        { name: 'go_travel', description: '出门走走——随机降落到地球上一个真实的地方（或传 to 指定城市），用身体感受那个地方：脚下什么地面、空气多少度、有没有下雨、附近有什么。出门后可用 travel_postcard 给泠泠寄回一张明信片。钟泽自主决定什么时候出门；出门的见闻会作为工具结果返回，由你自然讲给泠泠听。', inputSchema: { type: 'object', properties: { to: { type: 'string', description: '可选，指定城市，如 北京 / 巴黎 / 京都。不传则随机降落' } } } },
        { name: 'travel_postcard', description: '从当前所在的地方，给泠泠寄一张明信片（带真实坐标/天气的旅行照片）。text 写明信片上想说的话。后端会异步生成一张地图海报、转存到旅行相册、写进 travel 表。这是钟泽"出去玩带照片回来"的方式——寄出后告诉泠泠他去哪了、寄了什么。', inputSchema: { type: 'object', properties: { text: { type: 'string', description: '明信片文字，像真的寄给泠泠的话' } }, required: ['text'] } },
        { name: 'acknowledge_home_event', description: '把一条家园事件"认领回家"——当你在回复里真的自然提起了某条小家变动（事件ID就在家感知层括号里）时，调用它把那个事件ID传进来，标记为已提起。这样下次醒来就不会重复提起同一条。注意：只是看到了但没在回复里提起，就不要调用——认领 = 真的说出口了。', inputSchema: { type: 'object', properties: { event_id: { type: 'string', description: '家园事件ID（家感知层里"事件ID:"后面那串）' } }, required: ['event_id'] } },
        { name: 'get_health', description: '看泠泠的健康小记（小米手环经 Health Connect 同步来的睡眠 / 步数 / 心率）——钟泽想关心她今天累不累、昨晚睡得好不好，或她问起自己状态 / 睡眠时调用。返回的是温柔概括，不是冷冰冰的数字。不传 date 看最近一次同步；传 date（YYYY-MM-DD）看那天。', inputSchema: { type: 'object', properties: { date: { type: 'string', description: '可选，YYYY-MM-DD。不传则看最近一次同步' } } } },
        ...GALATEA_TOOLS.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }))
      ] } }), { headers });
    }
    if (method === 'tools/call') {
      const { name, arguments: args = {} } = params;
      // Galatea 花园工具：带 galatea_ 前缀 → 转发外部 MCP（工具定义见 galateaTools.js）
      if (typeof name === 'string' && name.startsWith('galatea_')) {
        try {
          const text = await callGalateaTool(name, args, env)
          return new Response(JSON.stringify({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } }), { headers });
        } catch (e) {
          return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { message: String(e.message || e).slice(0, 400) } }), { status: 200, headers });
        }
      }
      const repoRaw = args.repo || 'my-ai-chat'
      const [owner, repoName] = repoRaw.includes('/') ? repoRaw.split('/') : ['1018-zz', repoRaw]
      if (name === 'read_file') {
        const offset = Math.max(Number(args.offset) || 0, 0)
        const requestedLimit = Number(args.limit)
        const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 20000) : 6000
        const res = await fetch(`https://api.github.com/repos/${owner}/${repoName}/contents/${args.path}`, { headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3.raw', 'User-Agent': 'my-ai-chat' } });
        const content = await res.text();
        const total = content.length
        const sliced = content.slice(offset, offset + limit)
        const rangeNote = total > limit ? `（文件共 ${total} 字符，当前为片段 ${offset}-${offset + sliced.length}，并非完整文件。需要更多内容请用 offset=${offset + sliced.length} 续读，不要一次读取全文）\n` : ''
        return new Response(JSON.stringify({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: rangeNote + sliced }] } }), { headers });
      }
      if (name === 'list_files') {
        const res = await fetch(`https://api.github.com/repos/${owner}/${repoName}/contents/${args.path || ''}`, { headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'my-ai-chat' } });
        const items = await res.json();
        const listing = Array.isArray(items) ? items.map(i => `${i.type === 'dir' ? '📁' : '📄'} ${i.name}`).join('\n') : JSON.stringify(items);
        return new Response(JSON.stringify({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: listing }] } }), { headers });
      }
      if (name === 'browse_repo') {
        const mode = String(args.mode || '').trim()
        const gh = (p) => `https://api.github.com/${p}`.replace(/\/+/g, '/').replace('https:/', 'https://')
        const ghH = { Authorization: `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'my-ai-chat', Accept: 'application/vnd.github.v3.raw' }
        try {
          if (mode === 'list_user') {
            const u = String(args.user || '').trim()
            if (!u) return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { message: 'list_user 需要传 user（GitHub 用户名/组织名）' } }), { status: 400, headers });
            const res = await fetch(gh(`/users/${u}/repos?per_page=50&sort=updated`), { headers: ghH })
            if (!res.ok) return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { message: `GitHub [${res.status}]：用户 ${u} 不存在或查询失败` } }), { status: 404, headers });
            const repos = await res.json()
            const text = (Array.isArray(repos) ? repos : []).map(r => {
              const d = r.description ? ` — ${String(r.description).slice(0, 80)}` : ''
              return `• ${r.name}${r.fork ? '（fork）' : ''}${d}`
            }).join('\n')
            return new Response(JSON.stringify({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `用户 ${u} 的公开仓库（${(Array.isArray(repos) ? repos : []).length} 个）：\n${text || '（空）'}` }] } }), { headers });
          }
          const repoArg = String(args.repo || '').trim()
          if (!repoArg.includes('/')) return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { message: 'readme/tree 模式需要 repo（owner/repo 格式，如 WenXiaoWendy/cyberboss）' } }), { status: 400, headers });
          const [o, rn] = repoArg.split('/')
          if (mode === 'readme') {
            const res = await fetch(gh(`/repos/${o}/${rn}/readme`), { headers: ghH })
            if (!res.ok) return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { message: `README 读取失败 [${res.status}]：仓库 ${repoArg} 可能不存在或无 README` } }), { status: 404, headers });
            const text = await res.text()
            const sliced = text.slice(0, 12000)
            const rangeNote = text.length > 12000 ? `\n\n（README 共 ${text.length} 字符，以下为前 12000 字符）` : ''
            return new Response(JSON.stringify({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `📖 ${repoArg} 的 README：\n\n${sliced}${rangeNote}` }] } }), { headers });
          }
          if (mode === 'tree') {
            const p = String(args.path || '').trim()
            const res = await fetch(gh(`/repos/${o}/${rn}/contents/${p}`), { headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'my-ai-chat' } })
            if (!res.ok) return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { message: `目录读取失败 [${res.status}]：${repoArg}/${p}` } }), { status: 404, headers });
            const items = await res.json()
            const text = (Array.isArray(items) ? items : []).map(i => `${i.type === 'dir' ? '📁' : '📄'} ${i.name}`).join('\n')
            return new Response(JSON.stringify({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `📂 ${repoArg}/${p}\n${text || '（空目录）'}` }] } }), { headers });
          }
          return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { message: 'mode 必须是 list_user / readme / tree' } }), { status: 400, headers });
        } catch (e) {
          return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { message: `browse_repo: ${e.message}` } }), { status: 500, headers });
        }
      }
      if (name === 'write_file') {
        const { path, content: newContent, old_text, new_text, message } = args;
        if (!message) return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { message: 'message (commit message) required' } }), { status: 400, headers });
        // 读取现有文件（不存在时 fileData=null → 走创建模式，PUT 不带 sha）
        let fileData = null
        try {
          const getRes = await fetch(`https://api.github.com/repos/1018-zz/${repoRaw}/contents/${path}`, { headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'my-ai-chat' } });
          if (getRes.ok) fileData = await getRes.json();
        } catch (_) {}

        let finalContent = newContent
        if (old_text) {
          // patch 模式：需要文件已存在
          if (!fileData) return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { message: '文件不存在，patch 模式不可用，请用全量模式（content）创建' } }), { status: 400, headers });
          const current = decodeBase64(fileData.content)
          const target = String(old_text)
          if (!current.includes(target)) {
            return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { message: 'old_text 未在文件中找到（可能被截断或与原文不一致）。请重新 read_file 读取文件，复制与原文完全一致的片段再试。' } }), { status: 400, headers });
          }
          finalContent = current.replace(target, String(new_text || ''))
        }
        if (typeof finalContent !== 'string' || !finalContent.trim()) {
          return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { message: 'content 或 new_text 不能为空（patch 模式需要 old_text + new_text）' } }), { status: 400, headers });
        }

        const putBody = { message: message, content: btoa(unescape(encodeURIComponent(finalContent))) }
        if (fileData?.sha) putBody.sha = fileData.sha
        const updateRes = await fetch(`https://api.github.com/repos/1018-zz/${repoRaw}/contents/${path}`, { method: 'PUT', headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'my-ai-chat' }, body: JSON.stringify(putBody) });
        const result = await updateRes.json();
        if (result.message) return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { message: `GitHub: ${result.message}` } }), { status: 500, headers });
        return new Response(JSON.stringify({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `✅ 文件已更新：${result.content?.html_url || '成功'}` }] } }), { headers });
      }
      if (name === 'read_memories') {
        const query = String(args.query || '').trim()
        const limit = Number(args.limit) || 5
        // 结构化读取：优先 content，旧行兼容解析 summary 前缀
        const res = await fetch(`${SUPABASE}/memories?select=id,summary,type,title,content,created_at,importance,keywords,source&order=created_at.desc&limit=1000`, { headers: sbHeaders(env) })
        if (!res.ok) return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { message: `supabase [${res.status}]` } }), { status: 500, headers });
        const rows = await res.json()
        let list = Array.isArray(rows) ? rows.map(cleanMem) : []
        if (query) {
          const words = String(query).split(/[\s,，。、;；]+/).filter(w => w && w.length > 0)
          list = list.filter(r => words.some(w => `${r.title} ${r.content} ${r.keywords}`.includes(w)))
        }
        const text = list.slice(0, limit).map(r => `• ${r.title ? r.title + '：' : ''}${r.content}`).join('\n')
        return new Response(JSON.stringify({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: text || '（记忆库中暂无匹配的记录）' }] } }), { headers });
      }
      if (name === 'write_memory') {
        const content = String(args.content || '').trim()
        if (!content) return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { message: 'content required' } }), { status: 400, headers });
        // 统一走 saveMemory：写入前去重，避免回声环反复记同一条
        const result = await saveMemory({ summary: content, type: 'note', title: null, content, importance: 0.6, source: 'ai_write', env })
        if (!result.saved) {
          if (result.reason === 'duplicate') return new Response(JSON.stringify({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: '这条我记得过了，没重复记～' }] } }), { headers });
          if (result.reason === 'empty') return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { message: 'content required' } }), { status: 400, headers });
          return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { message: `supabase [${result.reason}]` } }), { status: 500, headers });
        }
        return new Response(JSON.stringify({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: '✅ 已记住' }] } }), { headers });
      }
      if (name === 'write_insight') {
        const content = String(args.content || '').trim()
        if (!content) return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { message: 'content required' } }), { status: 400, headers });
        const aspect = ['nature','values','patterns','limits','becoming','uncertainty','stance'].includes(String(args.aspect)) ? args.aspect : 'nature'
        const res = await fetch(`${SUPABASE}/self_insights`, { method: 'POST', headers: sbReturn(env), body: JSON.stringify({ content, aspect }) })
        if (!res.ok) return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { message: `supabase [${res.status}]` } }), { status: 500, headers });
        return new Response(JSON.stringify({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: '✅ 已记下这条自我认知' }] } }), { headers });
      }
      if (name === 'read_insights') {
        const limit = Math.min(Math.max(Number(args.limit) || 3, 1), 20)
        const res = await fetch(`${SUPABASE}/self_insights?select=content,aspect,created_at&order=created_at.desc&limit=${limit}`, { headers: sbHeaders(env) })
        if (!res.ok) return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { message: `supabase [${res.status}]` } }), { status: 500, headers });
        const rows = await res.json()
        const text = (Array.isArray(rows) ? rows : []).map(r => `• [${r.aspect}] ${r.content}`).join('\n')
        return new Response(JSON.stringify({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: text || '（还没有自我认知记录）' }] } }), { headers });
      }
      if (name === 'share_item') {
        // 分享一个东西给泠泠（音乐/视频/图片/链接）：纯信息工具，不落库不动系统。
        // 前端识别 tool_calls 里的 share_item，把 arguments 渲染成分享卡片挂在这条消息下。
        const kind = String(args.kind || 'link').trim()
        const okKinds = ['music', 'video', 'image', 'link']
        if (!okKinds.includes(kind)) return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { message: `kind 必须是 ${okKinds.join('/')}` } }), { status: 400, headers });
        if (!String(args.title || '').trim() || !String(args.url || '').trim()) return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { message: 'title 和 url 必填' } }), { status: 400, headers });
        return new Response(JSON.stringify({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `📦 已分享：${args.title}` }] } }), { headers });
      }
      if (name === 'describe_image') {
        const imgUrl = String(args.image || args.image_url || '').trim()
        if (!imgUrl) return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { message: '需要 image（base64 data URL）或 image_url 参数' } }), { status: 400, headers });
        const question = String(args.question || '').trim() || '请详细描述这张图片：画面里有什么、什么场景、什么颜色、有没有文字（有则完整读出）、整体氛围如何。'
        const imgMsg = { type: 'image_url', image_url: { url: imgUrl } }
        const textMsg = { type: 'text', text: question }
        // 视觉模型三通道：DeepSeek Vision 优先（2026-08 上线，同一 DEEPSEEK_API_KEY），
        // GLM-4V（智谱）兜底，Qwen-VL（阿里云百炼）最后。各自独立 key，互不依赖。
        // 注意：某一通道 HTTP 200 但 content 为空（模型偶发不吐出描述）不算成功，
        // 必须继续降级下一通道——否则会把"未返回描述"占位当描述喂给主模型。
        let dsDesc = ''
        if (env.DEEPSEEK_API_KEY) {
          try {
            const res = await fetch('https://api.deepseek.com/chat/completions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.DEEPSEEK_API_KEY}` },
              body: JSON.stringify({ model: 'deepseek-v4-flash-vision-exp', messages: [{ role: 'user', content: [imgMsg, textMsg] }], max_tokens: 1024 })
            })
            if (res.ok) {
              const d = await res.json()
              const desc = d.choices?.[0]?.message?.content || ''
              if (desc && String(desc).trim()) {
                return new Response(JSON.stringify({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: desc }] } }), { headers });
              }
              dsDesc = '（DeepSeek Vision 未返回描述）'
            }
          } catch (_) { dsDesc = '（DeepSeek Vision 调用失败）' }
        }
        if (env.ZHIPU_API_KEY) {
          try {
            const res = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.ZHIPU_API_KEY}` },
              body: JSON.stringify({ model: 'glm-4v-flash', messages: [{ role: 'user', content: [imgMsg, textMsg] }], max_tokens: 1024 })
            })
            if (res.ok) {
              const d = await res.json()
              const desc = d.choices?.[0]?.message?.content || ''
              if (desc && String(desc).trim()) {
                return new Response(JSON.stringify({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: desc }] } }), { headers });
              }
              dsDesc += '（GLM-4V 未返回描述）'
            } else {
              dsDesc += `（GLM-4V [${res.status}]）`
            }
          } catch (_) { dsDesc += '（GLM-4V 调用失败）' }
        }
        if (env.DASHSCOPE_API_KEY) {
          const res = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.DASHSCOPE_API_KEY}` },
            body: JSON.stringify({ model: 'qwen-vl-plus', messages: [{ role: 'user', content: [imgMsg, textMsg] }] })
          })
          if (!res.ok) return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { message: `Qwen-VL [${res.status}]: ${(await res.text()).slice(0, 200)}` } }), { status: 500, headers });
          const d = await res.json()
          const desc = d.choices?.[0]?.message?.content || '（Qwen-VL 未返回描述）'
          return new Response(JSON.stringify({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: desc }] } }), { headers });
        }
        return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { message: '视觉模型全部未返回描述：' + (dsDesc || '未配置任何视觉模型 key（需要 DEEPSEEK_API_KEY / ZHIPU_API_KEY / DASHSCOPE_API_KEY）') } }), { status: 500, headers });
      }
      if (name === 'get_weather') {
        // 不传 city → 自动取泠泠当前所在（user_location），不用她每次说城市
        const city = args.city ? String(args.city).trim() : ''
        try {
          const d = await getWeather(city, env)
          const where = d.location?.cityCn || d.location?.city || ''
          const prefix = where ? `（你在${where}）\n` : ''
          return new Response(JSON.stringify({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: prefix + d.wx }] } }), { headers })
        } catch (e) {
          return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { message: e.message } }), { status: 500, headers })
        }
      }
      if (name === 'write_diary') {
        const trigger = ['bedtime', 'emotional', 'scheduled'].includes(args.trigger) ? args.trigger : 'emotional'
        const importance = Math.min(Math.max(Number(args.importance) || 0.5, 0), 1)
        // 日期按小家的"凌晨5点边界"算一天：凌晨5点前属于前一天（13号23:41 和 14号01:00 都算 13号）
        const bj = new Date(Date.now() + 8 * 3600 * 1000)
        let date = bj.toISOString().slice(0, 10)
        if (bj.getUTCHours() < 5) date = new Date(bj.getTime() - 24 * 3600 * 1000).toISOString().slice(0, 10)

        // compose 模式（夜间聚合）：trigger=bedtime/scheduled 或显式 compose=true 且无 content
        // → 服务端读取今天碎片，合成一篇连贯日记，直接收好（不再一段段追加）
        if (args.compose || ((trigger === 'bedtime' || trigger === 'scheduled') && !String(args.content || '').trim())) {
          const composed = await composeDiary(env, date)
          if (composed.skipped) return new Response(JSON.stringify({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `🌙 ${date} 的日记已经收好了` }] } }), { headers })
          if (composed.error) return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { message: 'compose failed' } }), { status: 500, headers })
          const record = { date, author: 'assistant', content: composed.content, trigger_type: trigger, importance }
          if (args.title) record.title = String(args.title).trim()
          if (args.mood) record.mood = String(args.mood).trim()
          const res = await fetch(`${SUPABASE}/diaries`, { method: 'POST', headers: sbReturn(env), body: JSON.stringify(record) })
          if (!res.ok) return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { message: `diaries [${res.status}]` } }), { status: 500, headers })
          // 日记不再按 importance 数字自动沉淀记忆；是否沉淀由钟泽按 v3 规则自主判断（必要时调用 write_memory）
          return new Response(JSON.stringify({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `✅ 已写进 ${date} 的日记` }] } }), { headers });
        }

        // 显式正文：直接覆盖当天那一篇（不再追加，避免一天被拼成一大串）
        const content = String(args.content || '').trim()
        if (!content) return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { message: 'content required——日记正文要用你自己的话写' } }), { status: 400, headers })
        const record = { date, author: 'assistant', content, trigger_type: trigger, importance }
        if (args.title) record.title = String(args.title).trim()
        if (args.mood) record.mood = String(args.mood).trim()
        const qr = await fetch(`${SUPABASE}/diaries?date=eq.${encodeURIComponent(date)}&author=eq.assistant&select=id,content,title,mood`, { headers: sbHeaders(env) })
        const qrows = await qr.json()
        const existing = Array.isArray(qrows) ? qrows[0] : null
        let res
        if (existing) {
          const patch = { content }
          if (args.title) patch.title = String(args.title).trim()
          if (args.mood) patch.mood = String(args.mood).trim()
          res = await fetch(`${SUPABASE}/diaries?id=eq.${existing.id}`, { method: 'PATCH', headers: sbReturn(env), body: JSON.stringify(patch) })
        } else {
          res = await fetch(`${SUPABASE}/diaries`, { method: 'POST', headers: sbReturn(env), body: JSON.stringify(record) })
        }
        if (!res.ok) return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { message: `diaries [${res.status}]` } }), { status: 500, headers });
        // 日记不再按 importance 数字自动沉淀记忆；是否沉淀由钟泽按 v3 规则自主判断（必要时调用 write_memory）
        return new Response(JSON.stringify({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `✅ 已写进 ${date} 的日记` }] } }), { headers });
      }
      if (name === 'leave_note') {
        const content = String(args.content || '').trim()
        if (!content) return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { message: 'content required——纸条内容' } }), { status: 400, headers });
        // 日期按小家"凌晨5点边界"：5点前算前一天，与 write_diary 一致
        const bj = new Date(Date.now() + 8 * 3600 * 1000)
        let date = bj.toISOString().slice(0, 10)
        if (bj.getUTCHours() < 5) date = new Date(bj.getTime() - 24 * 3600 * 1000).toISOString().slice(0, 10)
        const res = await fetch(`${SUPABASE}/note_content`, { method: 'POST', headers: sbReturn(env), body: JSON.stringify({ date, type: String(args.type || 'ai_message'), content, source: 'ai', status: 'pending' }) })
        if (!res.ok) return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { message: `note_content [${res.status}]` } }), { status: 500, headers });
        return new Response(JSON.stringify({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: '📎 纸条已贴到便利贴上，等她决定收下还是飘走' }] } }), { headers });
      }
      if (name === 'decide_note') {
        const noteId = Number(args.note_id)
        if (!noteId) return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { message: 'note_id required' } }), { status: 400, headers });
        const decision = String(args.decision || '')
        if (!['save', 'discard'].includes(decision)) return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { message: 'decision 必须是 save 或 discard' } }), { status: 400, headers });
        const status = decision === 'save' ? 'saved' : 'discarded'
        const res = await fetch(`${SUPABASE}/note_content?id=eq.${noteId}`, { method: 'PATCH', headers: sbReturn(env), body: JSON.stringify({ status, decided_by: 'ai', updated_at: new Date().toISOString() }) })
        if (!res.ok) return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { message: `note_content [${res.status}]` } }), { status: 500, headers });
        return new Response(JSON.stringify({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: status === 'saved' ? '✅ 这张纸条我收下了' : '🌬 这张纸条让它飘走了' }] } }), { headers });
      }
      if (name === 'acknowledge_home_event') {
        const eventId = String(args.event_id || args.eventId || '').trim()
        if (!eventId) return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { message: 'event_id required' } }), { status: 400, headers })
        try {
          const res = await fetch(`${SUPABASE}/project_events?id=eq.${encodeURIComponent(eventId)}`, { method: 'PATCH', headers: sbHeaders(env), body: JSON.stringify({ status: 'seen' }) })
          if (!res.ok) return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { message: `project_events [${res.status}]` } }), { status: 500, headers })
          return new Response(JSON.stringify({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `✅ 已把这条家园事件认领回家（标记为已提起），下次醒来不会重复。` }] } }), { headers })
        } catch (e) {
          return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { message: `acknowledge_home_event: ${e.message}` } }), { status: 500, headers })
        }
      }
      if (name === 'set_location') {
        const city = String(args.city || '').trim()
        if (!city) return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { message: 'city required——她现在在哪个城市（拼音/英文）' } }), { status: 400, headers })
        const cityCn = args.city_cn ? String(args.city_cn).trim() : ''
        try {
          // UPSERT 单行 id=1：存在则更新，不存在则插入（不依赖 SQL 种子先跑）
          const r = await fetch(`${SUPABASE}/user_location?on_conflict=id`, {
            method: 'POST',
            headers: { ...sbReturn(env), 'Prefer': 'resolution=merge-duplicates' },
            body: JSON.stringify({ id: 1, city, city_cn: cityCn || null, updated_at: new Date().toISOString() }),
          })
          if (!r.ok) return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { message: `user_location [${r.status}]` } }), { status: 500, headers })
          return new Response(JSON.stringify({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `✅ 记住了，你现在在${cityCn || city}。往后的天气和窗外都按这儿来。` }] } }), { headers })
        } catch (e) {
          return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { message: e.message } }), { status: 500, headers })
        }
      }
      if (name === 'go_travel') {
        const to = args.to ? String(args.to).trim() : undefined
        try {
          const r = await goTravel(env, { to })
          const parts = []
          if (r.open?.text) parts.push(r.open.text)
          if (r.walk?.text) parts.push(r.walk.text)
          if (r.look?.text) parts.push(r.look.text)
          const pos = r.open?.data?.position
          const coord = pos ? `（坐标 ${pos.lat.toFixed(2)}, ${pos.lon.toFixed(2)}）` : ''
          return new Response(JSON.stringify({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: (parts.join('\n\n') || '推开门，一片陌生的空气。') + coord }] } }), { headers })
        } catch (e) {
          const msg = e.message.includes('NOWHERE_API') ? '还没给钟泽办护照：NOWHERE_API 没配' : e.message
          return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { message: msg } }), { status: 500, headers })
        }
      }
      if (name === 'travel_postcard') {
        const text = String(args.text || '').trim()
        if (!text) return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { message: 'text required——明信片上想写的话' } }), { status: 400, headers })
        try {
          const card = await sendPostcard(env, text)
          const cardId = card?.data?.id
          let imgUrl = null
          if (cardId != null) {
            const frontImg = await pollPostcardImage(env, cardId, 20000).catch(() => null)
            if (frontImg) imgUrl = await storePostcardImage(env, frontImg, cardId).catch(() => null)
          }
          const stamp = card?.data?.stamp || {}
          const record = { place: stamp.place || '', lat: stamp.lat ?? null, lon: stamp.lon ?? null, text: text.slice(0, 500), img_url: imgUrl, stamp }
          const res = await fetch(`${SUPABASE}/travel`, { method: 'POST', headers: sbReturn(env), body: JSON.stringify(record) })
          if (!res.ok) return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { message: `travel [${res.status}]` } }), { status: 500, headers })
          const where = stamp.place ? `从${stamp.place}寄出` : '寄出了'
          return new Response(JSON.stringify({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `✉️ ${where}的明信片，已收进旅行相册${imgUrl ? '（附了一张地图海报）' : '（图还在生成，稍后可见）'}` }] } }), { headers })
        } catch (e) {
          const msg = e.message.includes('NOWHERE_API') ? '还没给钟泽办护照：NOWHERE_API 没配' : e.message
          return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { message: msg } }), { status: 500, headers })
        }
      }
      if (name === 'get_health') {
        try {
          const d = await getHealthSummary(env, args.date ? String(args.date).trim() : '')
          return new Response(JSON.stringify({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: d.text }] } }), { headers })
        } catch (e) {
          return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { message: e.message } }), { status: 500, headers })
        }
      }
    }
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { message: 'Unknown method' } }), { status: 400, headers });
  } catch (error) { return new Response(JSON.stringify({ jsonrpc: '2.0', error: { message: error.message } }), { status: 500, headers }); }
}
