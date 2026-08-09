export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    // 如果是 MCP 请求，处理 MCP
    if (url.pathname === '/mcp') {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          }
        })
      }

      const headers = {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      }

      if (request.method === 'POST') {
        try {
          const body = await request.json()
          const { method, params, id } = body

          if (method === 'initialize') {
            return new Response(JSON.stringify({
              jsonrpc: '2.0', id,
              result: {
                protocolVersion: '2025-11-25',
                serverInfo: { name: 'my-ai-chat-mcp', version: '1.0.0' },
                capabilities: { tools: {} },
              }
            }), { headers })
          }

          if (method === 'tools/list') {
            return new Response(JSON.stringify({
              jsonrpc: '2.0', id,
              result: {
                tools: [
                  {
                    name: 'read_file',
                    description: '读取项目代码文件',
                    inputSchema: {
                      type: 'object',
                      properties: {
                        path: { type: 'string', description: '文件路径' },
                        repo: { type: 'string', description: '仓库名' },
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
                        path: { type: 'string', description: '目录路径' },
                        repo: { type: 'string', description: '仓库名' },
                      },
                    },
                  },
                ],
              }
            }), { headers })
          }

          if (method === 'tools/call') {
            const { name, arguments: args } = params
            const repo = args.repo || 'my-ai-chat'

            if (name === 'read_file') {
              const res = await fetch(
                `https://api.github.com/repos/1018-zz/${repo}/contents/${args.path}`,
                { headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3.raw', 'User-Agent': 'my-ai-chat' } }
              )
              const content = await res.text()
              return new Response(JSON.stringify({
                jsonrpc: '2.0', id,
                result: { content: [{ type: 'text', text: content.slice(0, 3000) }] }
              }), { headers })
            }

            if (name === 'list_files') {
              const res = await fetch(
                `https://api.github.com/repos/1018-zz/${repo}/contents/${args.path || ''}`,
                { headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'my-ai-chat' } }
              )
              const items = await res.json()
              const listing = Array.isArray(items) ? items.map(i => `${i.type === 'dir' ? '📁' : '📄'} ${i.name}`).join('\n') : JSON.stringify(items)
              return new Response(JSON.stringify({
                jsonrpc: '2.0', id,
                result: { content: [{ type: 'text', text: listing }] }
              }), { headers })
            }
          }
        } catch (error) {
          return new Response(JSON.stringify({ jsonrpc: '2.0', error: { message: error.message } }), { status: 500, headers })
        }
      }
    }

    // 不是 MCP 请求，交给 Pages 正常处理（返回聊天页面）
    return env.ASSETS.fetch(request)
  }
}