// server.js — 零依赖 Node 运行时：让「小家」在任意 VPS 上常驻
//
// 设计目标：
//   1. 原样兼容 Cloudflare Pages Functions（functions/api 下的 onRequest*/context.env/context.params）
//      —— 不修改 functions/ 任何文件，本运行器只是 import 它们。
//   2. 托管前端构建产物（dist/）静态文件，SPA 路由回退到 index.html。
//   3. 提供 /healthz 健康检查，便于 VPS 监控与进程守护。
//   4. 预留扩展点：未来要加 MCP 小工具 / 小游戏，直接在 functions/api 下新增
//      符合 Pages Functions 格式的文件即可（如 functions/api/tools/xxx.js），
//      本运行器会自动路由，无需改动此处。
//
// 零依赖：仅用 Node 内置模块 + 全局 fetch/Request/Response（Node 18+，推荐 20+）。
// 这是为满足「禁止新增 npm 依赖」约束而刻意保持的极简实现。
//
// 用法：
//   node server.js
// 环境变量（均带默认值，可放 .env）：
//   PORT          监听端口          默认 3000
//   HOST          监听地址          默认 0.0.0.0
//   STATIC_DIR    前端产物目录       默认 dist（相对于本文件）
//   FUNCTIONS_DIR 接口目录          默认 functions/api
//   SUPABASE_SECRET_KEY / DEEPSEEK_API_KEY / CONTEXT_* / GITHUB_* 等由函数自身读取（context.env = process.env）

import http from 'node:http'
import { readFileSync, createReadStream, readdirSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Readable } from 'node:stream'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 加载 .env（若存在），仅填充未设置的变量，避免覆盖已存在的环境/系统变量
loadDotEnv(path.join(__dirname, '.env'))

const PORT = Number(process.env.PORT) || 3000
const HOST = process.env.HOST || '0.0.0.0'
const STATIC_DIR = path.resolve(__dirname, process.env.STATIC_DIR || 'dist')
const FUNCTIONS_DIR = path.resolve(__dirname, process.env.FUNCTIONS_DIR || 'functions/api')

// 启动时构建一次路由表
const routes = buildRoutes(FUNCTIONS_DIR)

const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error('[server] 未捕获错误:', err)
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'internal', message: String((err && err.message) || err) }))
    } else {
      res.end()
    }
  })
})

server.listen(PORT, HOST, () => {
  console.log(`小家运行时已启动: http://${HOST}:${PORT}`)
  console.log(`  静态目录 : ${STATIC_DIR}`)
  console.log(`  接口目录 : ${FUNCTIONS_DIR}`)
  console.log(`  已注册路由数 : ${routes.length}`)
})

// ---------------------------------------------------------------------------

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)

  // 健康检查（便于 systemd / 监控 / 负载均衡探活）
  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, ts: Date.now(), routes: routes.length }))
    return
  }

  // 接口
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
    await handleApi(req, res, url)
    return
  }

  // 静态资源 / SPA
  await handleStatic(req, res, url)
}

async function handleApi(req, res, url) {
  const apiPath = url.pathname.replace(/^\/api/, '') || '/'

  for (const r of routes) {
    const m = r.regex.exec(apiPath)
    if (!m) continue

    const params = {}
    for (const name of r.paramNames) params[name] = decodeURIComponent(m.groups[name])

    let mod
    try {
      mod = await import(pathToFileURL(r.file).href)
    } catch (e) {
      console.error(`[server] 加载函数失败: ${r.file}`, e)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'load_failed', path: apiPath }))
      return
    }

    // Cloudflare Pages Functions 约定：onRequestGet / onRequestPost / onRequestDelete /
    // onRequestOptions / onRequestPut / onRequestPatch（方法名首字母大写，其余小写）
    const m0 = req.method.charAt(0).toUpperCase() + req.method.slice(1).toLowerCase()
    const handler = mod['onRequest' + m0] || mod['onRequest']
    if (typeof handler !== 'function') {
      res.writeHead(405, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      })
      res.end(JSON.stringify({ error: 'method_not_allowed', method: req.method }))
      return
    }

    const webReq = await toWebRequest(req, url)
    const ctx = {
      request: webReq,
      env: process.env, // 函数通过 context.env 读取密钥
      params, // 动态路由参数，如 params.id
      waitUntil: () => {}, // CF 兼容占位
      data: {},
    }

    let webRes
    try {
      webRes = await handler(ctx)
    } catch (e) {
      console.error(`[server] 函数执行异常: ${apiPath}`, e)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'handler_error', message: String((e && e.message) || e) }))
      return
    }

    await sendWebResponse(res, webRes)
    return
  }

  res.writeHead(404, { 'Content-Type': 'application/json' })
  if (process.env.DEBUG) {
    console.error('[api] 未匹配:', apiPath, '| 路由样例:', JSON.stringify(routes.slice(0, 6).map((r) => ({ src: r.regex.source, p: r.paramNames }))))
  }
  res.end(JSON.stringify({ error: 'not_found', path: apiPath }))
}

function toWebRequest(req, url) {
  return new Promise((resolve, reject) => {
    const method = req.method
    const headers = new Headers()
    for (const [k, v] of Object.entries(req.headers)) {
      if (v != null) headers.set(k, Array.isArray(v) ? v.join(', ') : v)
    }

    if (method === 'GET' || method === 'HEAD') {
      resolve(new Request(url.toString(), { method, headers }))
      return
    }

    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const body = Buffer.concat(chunks)
      resolve(
        new Request(url.toString(), {
          method,
          headers,
          body: body.length ? new Uint8Array(body) : undefined,
        })
      )
    })
    req.on('error', reject)
  })
}

async function sendWebResponse(res, webRes) {
  res.statusCode = webRes.status
  const hasBody = !!webRes.body
  webRes.headers.forEach((v, k) => {
    // 流式响应时让 Node 自行决定传输编码，避免与 content-length 冲突
    if (hasBody && (k.toLowerCase() === 'content-length' || k.toLowerCase() === 'content-encoding')) return
    res.setHeader(k, v)
  })

  if (!webRes.body) {
    res.end()
    return
  }

  try {
    const nodeStream = Readable.fromWeb(webRes.body)
    nodeStream.on('error', () => {
      try { res.end() } catch { /* ignore */ }
    })
    nodeStream.pipe(res)
  } catch {
    // 极少数情况下 body 不是 Web ReadableStream，退化为整块读取
    const buf = Buffer.from(await webRes.arrayBuffer())
    res.end(buf)
  }
}

async function handleStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain' })
    res.end('Method Not Allowed')
    return
  }

  const pathname = decodeURIComponent(url.pathname)
  let filePath = path.normalize(path.join(STATIC_DIR, pathname))
  if (!filePath.startsWith(STATIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' })
    res.end('Forbidden')
    return
  }

  let st = await safeStat(filePath)
  if (st && st.isDirectory()) {
    filePath = path.join(filePath, 'index.html')
    st = await safeStat(filePath)
  }
  // SPA 回退：未知路径交给 index.html，由前端路由接管
  if (!st) {
    filePath = path.join(STATIC_DIR, 'index.html')
    st = await safeStat(filePath)
  }
  if (!st) {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not Found')
    return
  }

  const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
  res.writeHead(200, { 'Content-Type': type })
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  createReadStream(filePath).pipe(res)
}

// 扫描 functions/api 目录，生成路由表（支持 [param] 动态段）
function buildRoutes(baseDir) {
  const routes = []
  collect(baseDir, '')
  return routes

  function collect(dir, prefix) {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) {
        collect(full, prefix + '/' + e.name)
      } else if (e.isFile() && e.name.endsWith('.js')) {
        const base = e.name.slice(0, -3) // 去掉 .js
        const routePath = (prefix + '/' + base).replace(/\/+/g, '/').replace(/\/$/, '') || '/'
        const segs = routePath.split('/').filter(Boolean).map((s) => {
          const dm = s.match(/^\[(.+)\]$/)
          return dm ? { dyn: true, name: dm[1] } : { dyn: false, name: s }
        })
        const paramNames = segs.filter((s) => s.dyn).map((s) => s.name)
        const regexStr =
          '^' +
          segs
            .map((s) => (s.dyn ? `/(?<${s.name}>[^/]+)` : `/${escapeReg(s.name)}`))
            .join('') +
          '/?$'
        routes.push({ file: full, regex: new RegExp(regexStr), paramNames })
      }
    }
  }
}

function escapeReg(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function safeStat(p) {
  return stat(p).catch(() => null)
}

function loadDotEnv(p) {
  let txt
  try {
    txt = readFileSync(p, 'utf8')
  } catch {
    return
  }
  for (const line of txt.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const m = trimmed.match(/^([\w.-]+)\s*=\s*(.*)$/)
    if (!m) continue
    const key = m[1]
    let val = m[2].replace(/^["']|["']$/g, '')
    if (process.env[key] === undefined) process.env[key] = val
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
}
