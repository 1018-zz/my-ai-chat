// 处理 CORS 预检请求
export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }
  });
}

// 处理 POST 请求
export async function onRequestPost(context) {
  const { request, env } = context;
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  try {
    const body = await request.json();
    const { method, params, id } = body;

    // 初始化
    if (method === 'initialize') {
      return new Response(JSON.stringify({
        jsonrpc: '2.0', id,
        result: {
          protocolVersion: '2025-11-25',
          serverInfo: { name: 'my-ai-chat-mcp', version: '1.0.0' },
          capabilities: { tools: {} },
        }
      }), { headers });
    }

    if (method === 'notifications/initialized') {
      return new Response(JSON.stringify({ jsonrpc: '2.0', id }), { headers })
    }

    // 工具列表
    if (method === 'tools/list') {
      return new Response(JSON.stringify({
        jsonrpc: '2.0', id,
        result: {
          tools: [
            {
              name: 'read_file',
              description: '读取我们家项目的代码文件。AI 用它来查看代码。',
              inputSchema: {
                type: 'object',
                properties: {
                  path: { type: 'string', description: '文件路径，例如 src/App.jsx' },
                  repo: { type: 'string', description: '仓库名，默认 my-ai-chat。可选 my-ai-chat-server' },
                },
                required: ['path'],
              },
            },
            {
              name: 'list_files',
              description: '列出项目目录。AI 用它来浏览文件结构。',
              inputSchema: {
                type: 'object',
                properties: {
                  path: { type: 'string', description: '目录路径，例如 src/' },
                  repo: { type: 'string', description: '仓库名，默认 my-ai-chat。可选 my-ai-chat-server' },
                },
              },
            },
            {
              name: 'write_file',
              description: '修改项目文件并提交到 GitHub。AI 用它来直接改代码。',
              inputSchema: {
                type: 'object',
                properties: {
                  path: { type: 'string', description: '要修改的文件路径，例如 src/App.jsx' },
                  content: { type: 'string', description: '文件的新内容' },
                  message: { type: 'string', description: '提交信息（commit message）' },
                  repo: { type: 'string', description: '仓库名，默认 my-ai-chat。可选 my-ai-chat-server' },
                },
                required: ['path', 'content', 'message'],
              },
            },
          ],
        }
      }), { headers });
    }

    // 工具调用
    if (method === 'tools/call') {
      const { name, arguments: args } = params;
      const repo = args.repo || 'my-ai-chat';

      // 读文件
      if (name === 'read_file') {
        const res = await fetch(
          `https://api.github.com/repos/1018-zz/${repo}/contents/${args.path}`,
          { 
            headers: { 
              Authorization: `Bearer ${env.GITHUB_TOKEN}`, 
              Accept: 'application/vnd.github.v3.raw', 
              'User-Agent': 'my-ai-chat' 
            } 
          }
        );
        const content = await res.text();
        return new Response(JSON.stringify({
          jsonrpc: '2.0', id,
          result: { content: [{ type: 'text', text: content.slice(0, 20000) }] }
        }), { headers });
      }

      // 列目录
      if (name === 'list_files') {
        const res = await fetch(
          `https://api.github.com/repos/1018-zz/${repo}/contents/${args.path || ''}`,
          { 
            headers: { 
              Authorization: `Bearer ${env.GITHUB_TOKEN}`, 
              'User-Agent': 'my-ai-chat' 
            } 
          }
        );
        const items = await res.json();
        const listing = Array.isArray(items) ? items.map(i => `${i.type === 'dir' ? '📁' : '📄'} ${i.name}`).join('\n') : JSON.stringify(items);
        return new Response(JSON.stringify({
          jsonrpc: '2.0', id,
          result: { content: [{ type: 'text', text: listing }] }
        }), { headers });
      }

      // 写文件（修改代码）
      if (name === 'write_file') {
        const { path, content, message } = args;
        const targetRepo = repo;

        // 1. 先获取文件的 SHA（GitHub 要求修改文件时必须提供）
        const getRes = await fetch(
          `https://api.github.com/repos/1018-zz/${targetRepo}/contents/${path}`,
          { headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'my-ai-chat' } }
        );
        const fileData = await getRes.json();
        const sha = fileData.sha;

        // 2. 更新文件
        const updateRes = await fetch(
          `https://api.github.com/repos/1018-zz/${targetRepo}/contents/${path}`,
          {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${env.GITHUB_TOKEN}`,
              'Content-Type': 'application/json',
              'User-Agent': 'my-ai-chat',
            },
            body: JSON.stringify({
              message: message,
              content: btoa(unescape(encodeURIComponent(content))), // 转 base64
              sha: sha,
            }),
          }
        );
        
        const result = await updateRes.json();
        return new Response(JSON.stringify({
          jsonrpc: '2.0', id,
          result: { content: [{ type: 'text', text: `✅ 文件已更新：${result.content?.html_url || '成功'}` }] }
        }), { headers });
      }
    }

    return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { message: 'Unknown method' } }), { status: 400, headers });
  } catch (error) {
    return new Response(JSON.stringify({ jsonrpc: '2.0', error: { message: error.message } }), { status: 500, headers });
  }
}