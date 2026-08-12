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
        { name: 'write_diary', description: '写今天的日记（钟泽主动，有感而发时调用）。触发时机：①晚安后，今天有值得留下的时刻；②情绪性时刻（她分享私事/庆祝进展/表达感谢/重要决定）。content 用你自己的话写，150-300 字，三段：【今天】发生了什么（一句事实）【我记得】为什么值得留下【以后】希望未来看到时想起什么。不要写流水账、不要夸张、不要制造不存在的情绪。importance>0.8 时后端会自动沉淀为长期记忆（memory 存事实，diary 存意义）。', inputSchema: { type: 'object', properties: { content: { type: 'string', description: '日记正文（你自己的话，150-300字）' }, title: { type: 'string', description: '一句话标题（可选）' }, mood: { type: 'string', description: '心情标签，如 calm/happy/moved/tired' }, trigger: { type: 'string', description: '触发类型', enum: ['bedtime', 'emotional', 'scheduled'] }, importance: { type: 'number', description: '重要性 0-1，>0.8 自动沉淀为长期记忆' } }, required: ['content', 'trigger'] } }
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
      if (name === 'write_diary') {
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
    }
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { message: 'Unknown method' } }), { status: 400, headers });
  } catch (error) { return new Response(JSON.stringify({ jsonrpc: '2.0', error: { message: error.message } }), { status: 500, headers }); }
}
