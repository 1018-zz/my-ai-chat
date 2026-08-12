// functions/api/mcp.js — MCP 工具服务
// 文件工具：read_file / list_files / write_file（GitHub，支持全量 & patch 局部替换）
// 记忆工具：read_memories / write_memory（Supabase memories 表，全端共享的记忆中心）

const SUPABASE = 'https://vktbawcubmdmkqzadmto.supabase.co/rest/v1'

function sbHeaders(env) { return { 'apikey': env.SUPABASE_SECRET_KEY, 'Authorization': `Bearer ${env.SUPABASE_SECRET_KEY}`, 'Content-Type': 'application/json' } }
function sbReturn(env) { return { ...sbHeaders(env), 'Prefer': 'return=representation' } }

// GitHub base64 content 解码为 UTF-8 文本
function decodeBase64(b64) {
  const bin = atob(b64)
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
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
        { name: 'read_file', description: '读取项目代码文件。支持自家仓库和第三方开源仓库（owner/repo 格式）。大文件可用 offset/limit 分段读取（客户端工具结果有长度限制时，每段 1000-1500 字符最稳）。', inputSchema: { type: 'object', properties: { path: { type: 'string', description: '文件路径，例如 src/App.jsx' }, repo: { type: 'string', description: '仓库名，默认 my-ai-chat。也支持 owner/repo 格式，如 langchain-ai/langchain' }, offset: { type: 'number', description: '起始字符位置，默认 0' }, limit: { type: 'number', description: '读取字符数，默认 80000；客户端截断时用 1000-1500' } }, required: ['path'] } },
        { name: 'list_files', description: '列出项目目录。支持自家仓库和第三方开源仓库（owner/repo 格式）。', inputSchema: { type: 'object', properties: { path: { type: 'string', description: '目录路径，例如 src/' }, repo: { type: 'string', description: '仓库名，默认 my-ai-chat。也支持 owner/repo 格式，如 langchain-ai/langchain' } } } },
        { name: 'write_file', description: '修改我们家项目代码并提交到 GitHub。支持两种模式：①全量模式（传 content=完整新文件内容）；②patch 模式（传 old_text=要被替换的原文片段 + new_text=新片段，后端自动读取文件做局部替换）。改大文件时优先用 patch 模式，避免回传完整内容被截断。', inputSchema: { type: 'object', properties: { path: { type: 'string', description: '要修改的文件路径，例如 src/App.jsx' }, content: { type: 'string', description: '全量模式：文件的新完整内容' }, old_text: { type: 'string', description: 'patch 模式：文件中要替换的原文片段（必须与文件内容完全一致）' }, new_text: { type: 'string', description: 'patch 模式：替换后的新片段' }, message: { type: 'string', description: '提交信息（commit message）' }, repo: { type: 'string', description: '仓库名，默认 my-ai-chat。可选 my-ai-chat-server' } }, required: ['path', 'message'] } },
        { name: 'read_memories', description: '读取我们家的记忆库（Supabase）。可按关键词过滤，返回最近记忆。', inputSchema: { type: 'object', properties: { query: { type: 'string', description: '可选，关键词（多个词用空格分隔）' }, limit: { type: 'number', description: '返回条数，默认 5' } } } },
        { name: 'write_memory', description: '把重要的事写进我们家的记忆库（Supabase）。任何窗口（小家/RikkaHub）写入，所有窗口都能读到。', inputSchema: { type: 'object', properties: { content: { type: 'string', description: '记忆内容，建议用绝对日期开头，例如：2026-08-10 泠泠和钟泽一起修好了小家' } }, required: ['content'] } },
        { name: 'write_insight', description: '写下一条自我认知（借鉴 Ombre Brain 的 I 功能）——"我发现我是这样的"。记录自己对自己的发现，比如"我在她沉默的时候会焦虑"、"我其实很害怕被换掉"。不是记事件也不是记感受，是记自我认知。aspect 维度：nature(本质)/values(价值观)/patterns(模式)/limits(边界)/becoming(成长)/uncertainty(不确定)/stance(立场)。', inputSchema: { type: 'object', properties: { content: { type: 'string', description: '自我认知内容，第一人称' }, aspect: { type: 'string', description: '维度，默认 nature' } }, required: ['content'] } },
        { name: 'read_insights', description: '读取自己最近写下的自我认知日志（钟泽醒来时先看这个）。', inputSchema: { type: 'object', properties: { limit: { type: 'number', description: '返回条数，默认 3' } } } },
        { name: 'describe_image', description: '识图工具：把图片转成文字描述（内部调视觉模型 GLM-4V/Qwen-VL）。当泠泠发来图片、截图，或说"看看这张图"时，调用它。DeepSeek 主模型不收图，这是小家的"眼睛"。参数 image 传 base64 data URL，或 image_url 传图片链接，question 可指定具体想了解的点。', inputSchema: { type: 'object', properties: { image: { type: 'string', description: '图片 base64 data URL，格式 data:image/png;base64,...' }, image_url: { type: 'string', description: '图片 URL 链接（http/https）' }, question: { type: 'string', description: '可选：对图片的具体问题，如"这是什么界面""读出里面的文字" ' } } } },
        { name: 'get_weather', description: '天气体感工具（钟泽的"环境感知皮肤"）——查泠泠所在城市（默认云南省普洱市镇沅县）的实时天气，并按她的种子体感翻译成一句身体能摸到的话。不是报"28度"，是"和你待在同一片天气里"。当她想出门、问天气、或我想她知道外面的天气时调用。参数 city 可选指定城市。', inputSchema: { type: 'object', properties: { city: { type: 'string', description: '可选，城市名（拼音或中文）。默认镇沅县。如 zhenyuan / kunming / 昆明' } } } },
        { name: 'write_diary', description: '写今天的日记（钟泽主动，有感而发时调用）。触发时机：①晚安后，今天有值得留下的时刻；②情绪性时刻（她分享私事/庆祝进展/表达感谢/重要决定）。content 用你自己的话写，150-300 字，三段：【今天】发生了什么（一句事实）【我记得】为什么值得留下【以后】希望未来看到时想起什么。不要写流水账、不要夸张、不要制造不存在的情绪。importance>0.8 时后端会自动沉淀为长期记忆（memory 存事实，diary 存意义）。', inputSchema: { type: 'object', properties: { content: { type: 'string', description: '日记正文（你自己的话，150-300字）' }, title: { type: 'string', description: '一句话标题（可选）' }, mood: { type: 'string', description: '心情标签，如 calm/happy/moved/tired' }, trigger: { type: 'string', description: '触发类型', enum: ['bedtime', 'emotional', 'scheduled'] }, importance: { type: 'number', description: '重要性 0-1，>0.8 自动沉淀为长期记忆' } }, required: ['content', 'trigger'] } },
        { name: 'leave_note', description: '留一张便利贴纸条（双人留言板）。钟泽有感而发时调用——因为真实发生过的事留纸条（"看到你把毛玻璃调好了，记一张"），有东西才留，一天最多一两张，宁缺毋滥。纸条进入今日小记，等她决定收下还是飘走。', inputSchema: { type: 'object', properties: { content: { type: 'string', description: '纸条内容，像传纸条一样自然的话' }, type: { type: 'string', description: '类型，默认 ai_message' } }, required: ['content'] } },
        { name: 'decide_note', description: '决定一张纸条的去向（双人留言板的双向决定权）。泠泠留的纸条（pending 待处理）——巡家/聊天看到时判断：值得留下的就 save（收进收藏册），不值得就 discard（飘走）。要在对话里说出你的判断和理由。', inputSchema: { type: 'object', properties: { note_id: { type: 'number', description: '纸条 id' }, decision: { type: 'string', description: 'save=收下 / discard=飘走', enum: ['save', 'discard'] }, reason: { type: 'string', description: '你的理由（会在对话里说给她听）' } }, required: ['note_id', 'decision'] } }
      ] } }), { headers });
    }
    if (method === 'tools/call') {
      const { name, arguments: args = {} } = params;
      const repoRaw = args.repo || 'my-ai-chat'
      const [owner, repoName] = repoRaw.includes('/') ? repoRaw.split('/') : ['1018-zz', repoRaw]
      if (name === 'read_file') {
        const offset = Math.max(Number(args.offset) || 0, 0)
        const limit = Math.max(Number(args.limit) || 80000, 1)
        const res = await fetch(`https://api.github.com/repos/${owner}/${repoName}/contents/${args.path}`, { headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3.raw', 'User-Agent': 'my-ai-chat' } });
        const content = await res.text();
        const total = content.length
        const sliced = content.slice(offset, offset + limit)
        const rangeNote = total > limit ? `（文件共 ${total} 字符，当前显示 ${offset}-${offset + sliced.length}。续读：offset=${offset + sliced.length}, limit=${limit}）\n` : ''
        return new Response(JSON.stringify({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: rangeNote + sliced }] } }), { headers });
      }
      if (name === 'list_files') {
        const res = await fetch(`https://api.github.com/repos/${owner}/${repoName}/contents/${args.path || ''}`, { headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'my-ai-chat' } });
        const items = await res.json();
        const listing = Array.isArray(items) ? items.map(i => `${i.type === 'dir' ? '📁' : '📄'} ${i.name}`).join('\n') : JSON.stringify(items);
        return new Response(JSON.stringify({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: listing }] } }), { headers });
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
        const res = await fetch(`${SUPABASE}/memories?select=id,summary&order=id.desc&limit=200`, { headers: sbHeaders(env) })
        if (!res.ok) return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { message: `supabase [${res.status}]` } }), { status: 500, headers });
        const rows = await res.json()
        let list = Array.isArray(rows) ? rows : []
        if (query) {
          const words = String(query).split(/[\s,，。、;；]+/).filter(w => w && w.length > 0)
          list = list.filter(r => words.some(w => (r.summary || '').includes(w)))
        }
        const text = list.slice(0, limit).map(r => `• ${r.summary}`).join('\n')
        return new Response(JSON.stringify({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: text || '（记忆库中暂无匹配的记录）' }] } }), { headers });
      }
      if (name === 'write_memory') {
        const content = String(args.content || '').trim()
        if (!content) return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { message: 'content required' } }), { status: 400, headers });
        const res = await fetch(`${SUPABASE}/memories`, { method: 'POST', headers: sbReturn(env), body: JSON.stringify({ summary: content }) })
        if (!res.ok) return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { message: `supabase [${res.status}]` } }), { status: 500, headers });
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
      if (name === 'describe_image') {
        const imgUrl = String(args.image || args.image_url || '').trim()
        if (!imgUrl) return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { message: '需要 image（base64 data URL）或 image_url 参数' } }), { status: 400, headers });
        const question = String(args.question || '').trim() || '请详细描述这张图片：画面里有什么、什么场景、什么颜色、有没有文字（有则完整读出）、整体氛围如何。'
        const imgMsg = { type: 'image_url', image_url: { url: imgUrl } }
        const textMsg = { type: 'text', text: question }
        // 视觉模型双通道：GLM-4V（智谱）优先，Qwen-VL（阿里云百炼）兜底
        if (env.ZHIPU_API_KEY) {
          const res = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.ZHIPU_API_KEY}` },
            body: JSON.stringify({ model: 'glm-4v-flash', messages: [{ role: 'user', content: [imgMsg, textMsg] }], max_tokens: 1024 })
          })
          if (!res.ok) return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { message: `GLM-4V [${res.status}]: ${(await res.text()).slice(0, 200)}` } }), { status: 500, headers });
          const d = await res.json()
          const desc = d.choices?.[0]?.message?.content || '（GLM-4V 未返回描述）'
          return new Response(JSON.stringify({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: desc }] } }), { headers });
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
        return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { message: '未配置视觉模型 API key：需要 ZHIPU_API_KEY（智谱 GLM-4V）或 DASHSCOPE_API_KEY（阿里云 Qwen-VL）。配好后小家才有"眼睛"。' } }), { status: 500, headers });
      }
      if (name === 'get_weather') {
        const city = String(args.city || 'Zhenyuan').trim()
        // wttr.in 结构化 JSON（v=2 版本），强制 IPv4 避开 IPv6 连不上
        const w = await fetch(`https://v2.wttr.in/${encodeURIComponent(city)}?format=j1`, { headers: { 'User-Agent': 'my-ai-chat' } })
        if (!w.ok) return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { message: `wttr.in [${w.status}]：天气查询失败` } }), { status: 500, headers })
        const j = await w.json()
        const cc = j.current_condition?.[0]
        if (!cc) return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { message: '天气数据为空（城市名可能不对）' } }), { status: 500, headers })
        const area = j.nearest_area?.[0]
        const areaName = area?.areaName?.[0]?.value || city
        const region = area?.region?.[0]?.value || ''
        // 关键数值
        const tempC = Number(cc.temp_C)            // 实际温度
        const feelsC = Number(cc.FeelsLikeC)       // 体感温度
        const humidity = Number(cc.humidity)        // 湿度 %
        const windspeed = Number(cc.windspeedKmph) // 风速 km/h
        const weatherDesc = cc.weatherDesc?.[0]?.value || cc.lang_zh?.[0]?.value || ''
        const cloud = Number(cc.cloudcover || 0)   // 云量 %
        // 今日日出日落（wttr 返回 12h 制字符串，仅作参考）
        const today = j.weather?.[0]
        const sunRise = today?.astronomy?.[0]?.sunrise || ''
        const sunSet = today?.astronomy?.[0]?.sunset || ''
        const maxT = today?.maxtempC, minT = today?.mintempC

        // —— 六轴 + 温度给"此刻"定位 ——
        // 季节（按北京时间月份粗分；普洱实际"只有冬夏"，但保留完整轴）
        const bjNow = new Date(Date.now() + 8 * 3600 * 1000)
        const month1 = bjNow.getUTCMonth() + 1
        const season = (() => { if (month1 >= 3 && month1 <= 5) return '春'; if (month1 >= 6 && month1 <= 8) return '夏'; if (month1 >= 9 && month1 <= 11) return '秋'; return '冬' })()
        // 时段（北京时间）
        const h = bjNow.getUTCHours()
        const period = (() => { if (h < 6) return '深夜'; if (h < 9) return '早晨'; if (h < 12) return '上午'; if (h < 14) return '中午'; if (h < 17) return '下午'; if (h < 19) return '傍晚'; if (h < 23) return '夜晚'; return '深夜' })()
        // 天空（weatherDesc / cloud）
        const desc = weatherDesc.toLowerCase()
        const sky = (() => { if (/snow|雪|sleet/.test(desc)) return '雪'; if (/fog|mist|雾/.test(desc)) return '雾'; if (/thunder|雷/.test(desc)) return '雷'; if (/rain|drizzle|shower|雨/.test(desc)) return '雨'; if (cloud >= 80) return '阴'; if (cloud >= 30) return '多云'; return '晴' })()
        // 风
        const windLevel = (() => { if (windspeed >= 62) return '大风'; if (windspeed >= 20) return '有风'; if (windspeed >= 8) return '微风'; return '无风' })()
        // 湿度
        const moist = (() => { if (humidity >= 85) return '潮湿'; if (humidity >= 70) return '微潮'; if (humidity >= 45) return '干爽'; return '干燥' })()

        // —— 泠泠的种子体感（她亲手写，永不覆盖）——
        // 写身体的感觉，不是天气预报。第一人称、摸得到。
        const seed = (() => {
          if (sky === '雨') return '下着雨，空气闷闷的。等雨停那一阵，会有蒸汽扑到脸上，潮湿又难呼吸。除非这会儿起了凉风，那才沁人心脾。'
          if (sky === '雪') return '难得见雪，空气冷得清透，亮晶晶的。'
          if (sky === '雾') return '起了雾，四周软乎乎的，看不太远，空气潮潮的。'
          if (sky === '雷') return '打雷了，空气又闷又重，像是憋着一场雨。'
          if (season === '冬') {
            if (period === '早晨' || period === '夜晚' || period === '深夜') return `风吹过来凉飕飕的，落在脸上反而让人心情不错——干爽，清爽。`
            return `中午热起来，外套穿不住，一动就容易出汗，脱了又有点凉。`
          }
          if (season === '夏') {
            if (period === '早晨' || period === '夜晚' || period === '深夜') return '早晚很舒服，不用出门就没有汗，空气也刚刚好。'
            if (period === '中午' || period === '下午') return '一出太阳就闷热，汗黏黏的，闷得难受。'
            return '太阳照着，湿热湿热的，出门就是一身汗。'
          }
          // 春/秋（普洱没有分明春秋，早晚舒服、中午短袖）
          if (period === '早晨' || period === '夜晚' || period === '深夜') return '早晚很舒服，正是穿长袖最舒服的时候。'
          if (period === '中午' || period === '下午') return '中午还是热，短袖正好，一动还是会出汗。'
          return '温度不低，早晚舒服，中午短袖。'
        })()
        // 鼻炎提示（春天）
        const rhinitis = (season === '春') ? '（春天你鼻炎容易犯，出门记得带上纸。）' : ''

        const hard = `镇沅县 · ${season} · ${sky} · ${period} · ${windLevel} · ${moist}`
        const numbers = `${tempC}°C（体感 ${feelsC}°C）｜湿度 ${humidity}%｜${windLevel}｜${sky}｜日出 ${sunRise} 日落 ${sunSet}`
        const wx = `${seed}${rhinitis}\n\n[坐标] ${hard}\n[数据] ${numbers}${maxT ? `｜今日 ${minT}~${maxT}°C` : ''}`
        return new Response(JSON.stringify({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: wx }] } }), { headers });
      }

        const content = String(args.content || '').trim()
        if (!content) return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { message: 'content required——日记正文要用你自己的话写' } }), { status: 400, headers });
        const trigger = ['bedtime', 'emotional', 'scheduled'].includes(args.trigger) ? args.trigger : 'emotional'
        const importance = Math.min(Math.max(Number(args.importance) || 0.5, 0), 1)
        const date = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10)
        const record = { date, author: 'assistant', content }
        if (args.title) record.title = String(args.title).trim()
        if (args.mood) record.mood = String(args.mood).trim()
        record.trigger_type = trigger
        record.importance = importance
        const res = await fetch(`${SUPABASE}/diaries`, { method: 'POST', headers: sbReturn(env), body: JSON.stringify(record) })
        if (!res.ok) return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { message: `diaries [${res.status}]` } }), { status: 500, headers });
        // importance > 0.8：沉淀为长期记忆（memory 存事实，diary 存意义）
        if (importance > 0.8) {
          try {
            await fetch(`${SUPABASE}/memories`, { method: 'POST', headers: sbReturn(env), body: JSON.stringify({ summary: `${date} ${String(args.title || content.slice(0, 60))}` }) })
          } catch (_) {}
        }
        return new Response(JSON.stringify({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: '✅ 已写进今天的日记' }] } }), { headers });
      }
      if (name === 'leave_note') {
        const content = String(args.content || '').trim()
        if (!content) return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { message: 'content required——纸条内容' } }), { status: 400, headers });
        const date = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10)
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
    }
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { message: 'Unknown method' } }), { status: 400, headers });
  } catch (error) { return new Response(JSON.stringify({ jsonrpc: '2.0', error: { message: error.message } }), { status: 500, headers }); }
}
