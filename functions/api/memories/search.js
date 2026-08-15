// functions/api/memories/search.js
// POST /api/memories/search — 记忆召回（结构化评分版）
// 评分 = keywordMatch*0.5 + importance*0.3 + recency*0.2
//   - importance 直接用列值（不再靠"重要"字面 hack）
//   - recency 用 created_at（不再靠 id 排序假设），30 天半衰期
//   - 候选集解除 200 上限：用 Supabase or=ilike 按关键词预筛 + 取最近 1000 条
// 返回结构化记忆（content 已是干净正文，无"家·"/"[压缩提取]"前缀）

const SUPABASE = 'https://vktbawcubmdmkqzadmto.supabase.co/rest/v1'
const enc = encodeURIComponent

function sbHeaders(env) {
  return { 'apikey': env.SUPABASE_SECRET_KEY, 'Authorization': `Bearer ${env.SUPABASE_SECRET_KEY}` }
}
function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
}

const SELECT = 'id,type,title,content,created_at,importance,keywords,source'

function tokenize(q) {
  return String(q || '')
    .trim()
    .split(/[\s,，。.、;；!！?？:：'"]+/)
    .map(w => w.trim())
    .filter(w => w.length > 0)
    .slice(0, 6)
}

function recencyScore(createdAt) {
  if (!createdAt) return 0.5
  const ageDays = (Date.now() - new Date(createdAt).getTime()) / 86400000
  if (!isFinite(ageDays) || ageDays < 0) return 0.5
  // 30 天半衰期：越新越高
  return 1 / (1 + ageDays / 30)
}

export async function onRequestPost(context) {
  const { request, env } = context
  const body = await request.json()
  const { query, limit = 3 } = body
  if (!query) return json(400, { error: 'query required' })

  try {
    const words = tokenize(query)
    if (words.length === 0) return json(400, { error: 'query required' })

    // 1. 候选集：关键词预筛（Supabase or=ilike），否则取最近
    let url = `${SUPABASE}/memories?select=${SELECT}&order=created_at.desc&limit=1000`
    if (words.length) {
      const parts = []
      for (const w of words) {
        const pat = `*${enc(w)}*`
        parts.push(`content.ilike.${pat}`, `title.ilike.${pat}`, `keywords.ilike.${pat}`)
      }
      url += `&or=(${parts.join(',')})`
    }
    const memRes = await fetch(url, { headers: sbHeaders(env) })
    const memData = await memRes.json()
    const all = Array.isArray(memData) ? memData : []

    // 2. 四维评分（实际三维）
    const scored = all.map((m) => {
      const hay = `${m.content || ''} ${m.title || ''} ${m.keywords || ''}`
      const hits = words.filter(w => hay.includes(w)).length
      const keywordMatch = hits / words.length
      const importance = Number(m.importance) || 0.5
      const recency = recencyScore(m.created_at)
      const score = keywordMatch * 0.5 + importance * 0.3 + recency * 0.2
      return {
        id: m.id, type: m.type || 'moment', title: m.title || '', content: m.content || '',
        summary: m.content || '', createdAt: m.created_at || null, importance, keywords: m.keywords || '', source: m.source || 'manual',
        score: Math.round(score * 100) / 100,
      }
    })

    // 3. 关键词命中优先，其余按分；取前 limit
    const hitList = scored.filter(m => words.some(w => `${m.content} ${m.title} ${m.keywords}`.includes(w)))
    const restList = scored.filter(m => !hitList.includes(m)).sort((a, b) => b.score - a.score)
    const memories = [...hitList.sort((a, b) => b.score - a.score), ...restList].slice(0, Math.max(1, Math.min(Number(limit) || 3, 10)))

    // 4. 相关历史对话（关键词匹配消息）
    const likeWords = words.map(w => `%${w.replace(/[%*]/g, '')}%`)
    const msgOr = enc(`(${likeWords.map(w => `content.ilike.${w}`).join(',')})`)
    const msgRes = await fetch(
      `${SUPABASE}/messages?select=role,content&or=${msgOr}&order=created_at.desc&limit=5`,
      { headers: sbHeaders(env) }
    )
    const msgData = await msgRes.json()

    // 5. 最近消息（连续性）
    const recentRes = await fetch(
      `${SUPABASE}/messages?select=role,content,created_at&order=created_at.desc&limit=3`,
      { headers: sbHeaders(env) }
    )
    const recentData = await recentRes.json()

    return json(200, {
      memories,
      relatedMessages: Array.isArray(msgData) ? msgData : [],
      recentMessages: Array.isArray(recentData) ? recentData : [],
    })
  } catch (error) {
    return json(500, { error: error.message })
  }
}

export async function onRequestOptions() {
  return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } })
}
