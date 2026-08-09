// Cloudflare Pages Function - MCP 服务器
// 文件路径: my-ai-chat/functions/api/mcp.js

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // 处理 CORS 预检请求
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }
    });
  }

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  if (request.method === 'POST') {
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

      // 工具列表
      if (method === 'tools/list') {
        return new Response(JSON.stringify({
          jsonrpc: '2.0', id,
          result: {
            tools: [
              {
                name: 'read_file',
                description: '读取我们家项目的代码文件',
                inputSchema: {
                  type: 'object',
                  properties: {
                    path: { type: 'string', description: '文件路径，如 src/App.jsx' },
                    repo: { type: 'string', description: '仓库名，my-ai-chat 或 my-ai-chat-server' },
                  },
                  required: ['path'],
                },
              },
              {
                name: 'list_files',
                description: '列出项目目录',
                inputSchema: {
                  type: 'object',
                  properties: {
                    path: { type: 'string', description: '目录路径，如 src/' },
                    repo: { type: 'string', description: '仓库名' },
                  },
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
            result: { content: [{ type: 'text', text: content.slice(0, 3000) }] }
          }), { headers });
        }

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
      }
    } catch (error) {
      return new Response(JSON.stringify({ jsonrpc: '2.0', error: { message: error.message } }), { status: 500, headers });
    }
  }

  return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers });
}