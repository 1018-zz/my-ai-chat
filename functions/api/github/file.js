// functions/api/github/file.js
// GET /api/github/file?path=xxx&repo=xxx — 读取仓库文件

export async function onRequestGet(context) {
  const { request, env } = context
  const url = new URL(request.url)
  const path = url.searchParams.get('path')
  const repo = url.searchParams.get('repo') || env.GITHUB_REPO

  if (!path) {
    return json(400, { error: 'path is required' })
  }

  try {
    const res = await fetch(
      `https://api.github.com/repos/${env.GITHUB_OWNER}/${repo}/contents/${path}`,
      {
        headers: {
          Authorization: `token ${env.GITHUB_TOKEN}`,
          'User-Agent': 'my-ai-chat',
        },
      }
    )
    const data = await res.json()
    if (data.content) {
      return json(200, {
        path,
        content: Buffer.from(data.content, 'base64').toString('utf-8'),
      })
    }
    return json(200, data)
  } catch (error) {
    return json(500, { error: error.message })
  }
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}
