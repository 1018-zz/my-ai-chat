// scripts/push-summary.mjs
// 每次向 GitHub 推送后，把本次改动的"中文总结"写入 Supabase 的 memories 表，
// 这样「我家那位」可以直接从 memories 表看到改动。
//
// 设计：
// - 不依赖任何 npm 包（纯 Node 内置 fetch + child_process）
// - 不修改 functions/、package.json、theme.css
// - 密钥从环境变量 SUPABASE_SECRET_KEY 读取（也可放本地 .env，但请勿提交）
// - 用法：
//     node scripts/push-summary.mjs            # 真正写入 memories
//     node scripts/push-summary.mjs --dry      # 只打印总结文本，不联网
//
// 推送前/后都能跑：它统计的是「本地领先远程上游(origin/main)的提交」。

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vktbawcubmdmkqzadmto.supabase.co/rest/v1'
const DRY = process.argv.includes('--dry')

function loadEnv(path = '.env') {
  const out = {}
  try {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/)
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch { /* ignore */ }
  return out
}
const envFromFile = loadEnv()
const KEY = process.env.SUPABASE_SECRET_KEY || envFromFile.SUPABASE_SECRET_KEY

function sh(args) {
  try { return execFileSync('git', args, { encoding: 'utf8' }).trim() } catch (e) { return '' }
}

// 1) 找出本地领先远程的提交范围
const hasUpstream = sh(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'])
const range = hasUpstream ? '@{upstream}..HEAD' : 'origin/main..HEAD'

const count = parseInt(sh(['rev-list', '--count', range]), 10) || 0
if (count === 0) {
  console.log('没有领先远程的提交，无需写入 memories。')
  process.exit(0)
}

const date = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' })
const log = sh(['log', range, '--pretty=format:- %s （%h，%ad）', '--date=short'])
const stat = sh(['diff', '--shortstat', range.replace('..', '...')])
// --shortstat 形如： 4 files changed, 215 insertions(+), 63 deletions(-)

const summary = [
  `📝 代码改动总结（${date}）`,
  `本次推送共 ${count} 个提交：`,
  log,
  '',
  stat || '（无差异统计）',
  '',
  '—— 由推送流程自动记录，详情见 GitHub 提交历史。',
].join('\n')

if (DRY) {
  console.log('=== 以下是将写入 memories.summary 的内容 ===')
  console.log(summary)
  console.log('=== --dry 模式，未联网 ===')
  process.exit(0)
}

if (!KEY) {
  console.error('缺少 SUPABASE_SECRET_KEY：请通过环境变量或本地 .env 提供（不要提交到仓库）。')
  process.exit(1)
}

const headers = {
  'apikey': KEY,
  'Authorization': `Bearer ${KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
}

try {
  const res = await fetch(`${SUPABASE_URL}/memories`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ summary }),
  })
  const body = await res.text()
  if (!res.ok) {
    console.error(`写入失败 [${res.status}]:`, body.slice(0, 200))
    process.exit(1)
  }
  console.log('已写入 memories 表 ✅')
  console.log(summary)
} catch (e) {
  console.error('联网写入出错：', e.name, e.message)
  process.exit(1)
}
