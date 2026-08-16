// functions/lib/memoryWriter.js
// 统一的记忆写入入口：所有写 memories 表的地方都必须经过 saveMemory()，
// 避免「读取回灌 → 自我写入」的记忆回声环（Memory Echo Loop）。
//
// 去重分两层（对齐 GPT 建议，先低成本后高精度）：
//   1) normalizeMemory：剥前缀标签(家:/家·/家庭:/[压缩提取] 等) + 去括号 + 折叠空白，
//      挡掉「家:她给了我名字」与「她给了我名字」这类同义不同写的精确重复。
//   2) findSimilar：用规范化串做 ilike 探测，跨全表命中再精确比对，拦语义相近。
//      （向量相似度是未来规模扩大时再做的第三层，现在不需要）
//
// 注意：本文件自包含 SUPABASE/sbHeaders/sbReturn，调用方无需传这些。

const SUPABASE = 'https://vktbawcubmdmkqzadmto.supabase.co/rest/v1'

function sbHeaders(env) { return { 'apikey': env.SUPABASE_SECRET_KEY, 'Authorization': `Bearer ${env.SUPABASE_SECRET_KEY}`, 'Content-Type': 'application/json' } }
function sbReturn(env) { return { ...sbHeaders(env), 'Prefer': 'return=representation' } }

// 规范化：用于去重比对。剥掉常见前缀标签与括号注释，折叠空白。
// 这样「家:她给了我名字」「家·[关系] 她给了我名字」「她给了我名字（重要）」都会归一成「她给了我名字」。
export function normalizeMemory(text) {
  return String(text || '')
    .replace(/^[家家庭记忆小家][:：·]?\s*/, '')   // 前缀标签：家: / 家· / 家庭： / 记忆: / 小家:
    .replace(/^\[\s*\w+\s*\]\s*/, '')              // [压缩提取] 之类
    .replace(/[（(][\s\S]*?[)）]/g, '')            // 括号及内部注释（关键词/因为：…）
    .replace(/\s+/g, '')
    .trim()
}

// 相似检测：先 ilike 窄探，再对命中项做规范化精确比对。
async function findSimilar(env, normalized) {
  if (!normalized) return null
  const probe = normalized.length > 16 ? normalized.slice(0, 16) : normalized
  const esc = probe.replace(/[%_]/g, '\\$&')       // 转义 ilike 通配符
  const url = `${SUPABASE}/memories?select=id,summary&summary=ilike.*${encodeURIComponent(esc)}*&limit=20`
  try {
    const r = await fetch(url, { headers: sbHeaders(env) })
    if (!r.ok) return null
    const rows = await r.json()
    if (!Array.isArray(rows)) return null
    for (const row of rows) {
      if (normalizeMemory(row.summary) === normalized) return row
    }
    return null
  } catch (_) { return null }
}

// 统一写入。返回 { saved, reason }，调用方可据此决定回复文案。
export async function saveMemory({ summary, type = null, title = null, content = null, importance = null, source = null, env }) {
  const text = String(content || summary || '').trim()
  const normalized = normalizeMemory(text)
  if (!normalized) return { saved: false, reason: 'empty' }

  // 第一层 + 第二层去重
  const dup = await findSimilar(env, normalized)
  if (dup) return { saved: false, reason: 'duplicate', id: dup.id }

  const payload = { summary: text }
  if (type) payload.type = type
  if (title != null) payload.title = title
  if (content) payload.content = content
  if (importance != null) payload.importance = importance
  if (source) payload.source = source

  // 容错：新列(type/title/content/importance/source)未建时退回只写 summary
  let res = await fetch(`${SUPABASE}/memories`, { method: 'POST', headers: sbReturn(env), body: JSON.stringify(payload) })
  if (!res.ok && (type || title != null || content || importance != null || source)) {
    res = await fetch(`${SUPABASE}/memories`, { method: 'POST', headers: sbReturn(env), body: JSON.stringify({ summary: text }) })
  }
  if (!res.ok) return { saved: false, reason: `supabase[${res.status}]` }
  return { saved: true }
}
