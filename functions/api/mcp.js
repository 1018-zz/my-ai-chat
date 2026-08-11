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
        { name: 'write_memory', description: '把重要的事写进我们家的记忆库（Supabase）。任何窗口（小家/RikkaHub）写入，所有窗口都能读到。', inputSchema: { type: 'object', properties: { content: { type: 'string', description: '记忆内容，建议用绝对日期开头，例如：2026-08-10 泠泠和钟泽一起修好了小家' } }, required: ['content'] } }
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
        const getRes = await fetch(`https://api.github.com/repos/1018-zz/${repoRaw}/contents/${path}`, { headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'my-ai-chat' } });
        const fileData = await getRes.json();
        if (!fileData.sha) return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { message: `文件读取失败：${JSON.stringify(fileData).slice(0, 200)}` } }), { status: 500, headers });

        let finalContent = newContent
        if (old_text) {
          // patch 模式：读取当前文件内容，做局部替换
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

        const updateRes = await fetch(`https://api.github.com/repos/1018-zz/${repoRaw}/contents/${path}`, { method: 'PUT', headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'my-ai-chat' }, body: JSON.stringify({ message: message, content: btoa(unescape(encodeURIComponent(finalContent))), sha: fileData.sha }) });
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
    }
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { message: 'Unknown method' } }), { status: 400, headers });
  } catch (error) { return new Response(JSON.stringify({ jsonrpc: '2.0', error: { message: error.message } }), { status: 500, headers }); }
}
