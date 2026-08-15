// functions/api/memories/search.js
// POST /api/memories/search — 记忆召回（四维评分版）
// score = keywordMatch*0.35 + importance*0.25 + recency*0.15 + relationship*0.25
// 返回带 score 的记忆列表（按分降序），供前端注入；score 也供 debug

const SUPABASE = 'https://vktbawcubmdmkqzadmto.supabase.co/rest/v1'

function sbHeaders(env) {
  return {
    'apikey': env.SUPABASE_SECRET_KEY,
    'Authorization': `Bearer ${env.SUPABASE_SECRET_KEY}`,
  }
}

export async function onRequestPost(context) {
  const { request, env } = context
  const body = await request.json()
  const { query, limit = 3 } = body
  if (!query) {
    return json(400, { error: 'query required' })
  }

  try {
    const enc = encodeURIComponent
    // 中文/英文/符号分词，取前 4 个词
    const words = String(query)
      .trim()
      .split(/[\s,，。.、;；!！?？:：'"]+/)
      .map(w => w.trim())
      .filter(w => w && w.length > 0)
      .slice(0, 4)

    if (words.length === 0) return json(400, { error: 'query required' })

    // 1. 拉最近 200 条记忆（id.desc，即新到旧），JS 里做评分
    const memRes = await fetch(
      `${SUPABASE}/memories?select=id,summary&order=id.desc&limit=200`,
      { headers: sbHeaders(env) }
    )
    const memData = await memRes.json()
    const all = Array.isArray(memData) ? memData : []

    // 2. 四维评分
    const scored = all.map((m, idx) => {
      const s = m.summary || ''
      // 关键词匹配度：命中词数 / 总词数
      const hits = words.filter(w => s.includes(w)).length
      const keywordMatch = words.length > 0 ? hits / words.length : 0
      // 重要度：含「重要」标记（promise 类）加分
      const importance = s.includes('重要') ? 1 : 0.5
      // 新鲜度：列表按 id.desc，index 越小越新
      const recency = 1 - Math.min(idx / 200, 1)
      // 关系距离：promise/偏好类 > 普通事实 > 事件
      const relationship = s.includes('重要') ? 0.8 : (s.includes('因为') ? 0.6 : 0.5)
      const score = keywordMatch * 0.35 + importance * 0.25 + recency * 0.15 + relationship * 0.25
      return { summary: s, id: m.id, score: Math.round(score * 100) / 100 }
    })

    // 3. 关键词命中优先（保证相关），其余按分排序；取前 limit 条
    const hitList = scored.filter(m => words.some(w => m.summary.includes(w)))
    const restList = scored.filter(m => !hitList.includes(m))
      .sort((a, b) => b.score - a.score)
    const memories = [...hitList.sort((a, b) => b.score - a.score), ...restList].slice(0, limit)

    // 4. 相关历史对话（关键词匹配消息）
    const likeWords = words.map(w => `%${w.replace(/[%*]/g, '')}%`)
    const msgOr = enc(`(${likeWords.map(w => `content.ilike.${w}`).join(',')})`)
    const msgRes = await fetch(
      `${SUPABASE}/messages?select=role,content&or=${msgOr}&order=created_at.desc&limit=5`,
      { headers: sbHeaders(env) }
    )
    const msgData = await msgRes.json()

    // 5. 最近消息（仅作"刚刚聊到哪"的连续性，不作记忆，3 条）
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
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}
