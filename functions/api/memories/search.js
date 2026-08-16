// functions/api/memories/search.js
// POST /api/memories/search — 记忆召回（RRF 融合检索版）
// 参考 chuan-101/Hamster-Nest 的「时间窗+检索」与「小克 Cat」的三路检索+RRF 融合思路：
//   - BM25 词面检索：关键词/专有名词精确匹配，带逆文档频加权
//   - 字符 n-gram 语义近似：中文场景用 uni+bigram 重叠（Dice 系数），捕捉同义不同表述（如「牙医」≈「看牙」共用「牙」），无需 embedding 模型
//   - 两路 RRF（Reciprocal Rank Fusion）融合排名，再加 importance / recency 轻微加权
//   - 诚实边界：仅保留真正相关的记忆（关键词命中 或 语义相似度>阈值），杜绝无内容时硬塞无关记忆编造
// 候选集：Supabase or=ilike 关键词预筛 + 取最近 1000 条；返回结构化记忆（content 已是干净正文）

const SUPABASE = 'https://vktbawcubmdmkqzadmto.supabase.co/rest/v1'
const enc = encodeURIComponent
const K = 1.5          // BM25 饱和参数
const B = 0.75         // BM25 长度归一
const RRF_K = 60       // RRF 常数
const SIM_THRESHOLD = 0.05  // 语义相似度诚实边界阈值（Dice 系数）

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

// 字符 n-gram 集合：unigram(单字) + bigram(相邻两字)。中文靠共享字捕捉语义近似，无需向量模型
function charNGrams(str) {
  const s = String(str || '')
  const set = new Set()
  for (const ch of s) {
    if (/\s/.test(ch)) continue
    set.add('u:' + ch)
  }
  for (let i = 0; i < s.length - 1; i++) {
    const a = s[i], b = s[i + 1]
    if (/\s/.test(a) || /\s/.test(b)) continue
    set.add('b:' + a + b)
  }
  return set
}

// Dice 系数：2*|交|/(|A|+|B|)，衡量两字符 n-gram 集合重叠度
function diceSim(a, b) {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const g of a) if (b.has(g)) inter++
  return (2 * inter) / (a.size + b.size)
}

function recencyScore(createdAt) {
  if (!createdAt) return 0.5
  const ageDays = (Date.now() - new Date(createdAt).getTime()) / 86400000
  if (!isFinite(ageDays) || ageDays < 0) return 0.5
  return 1 / (1 + ageDays / 30)  // 30 天半衰期
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
    const N = all.length
    if (N === 0) {
      return json(200, { memories: [], relatedMessages: [], recentMessages: [], hasRelevant: false })
    }

    // 2. 文档频率 df（BM25 用）与平均文档长度
    const docs = all.map(m => {
      const hay = `${m.content || ''} ${m.title || ''} ${m.keywords || ''}`
      return { hay, tokens: tokenize(hay) }
    })
    const avgdl = docs.reduce((s, d) => s + d.tokens.length, 0) / N || 1
    const df = {}
    for (const w of words) df[w] = docs.filter(d => d.hay.includes(w)).length

    // 3. 逐条打分：BM25 + 字符 n-gram 语义近似
    const scored = docs.map((d, idx) => {
      const m = all[idx]
      let bm25 = 0
      const dl = d.tokens.length
      for (const w of words) {
        let f = 0
        for (const t of d.tokens) if (t === w) f++
        if (f === 0) continue
        const idf = Math.log(1 + (N - df[w] + 0.5) / (df[w] + 0.5))
        bm25 += idf * (f * (K + 1)) / (f + K * (1 - B + B * dl / avgdl))
      }
      const sim = diceSim(charNGrams(query), charNGrams(d.hay))
      const kwHit = words.some(w => d.hay.includes(w))
      return {
        m, bm25, sim, kwHit,
        importance: Number(m.importance) || 0.5,
        recency: recencyScore(m.created_at),
      }
    })

    // 4. RRF 融合：两路各自排名 → 倒数排名融合
    const rankOf = (key) => {
      const sorted = [...scored].sort((a, b) => b[key] - a[key])
      const map = new Map()
      sorted.forEach((it, i) => map.set(it, i + 1))
      return map
    }
    const rBm25 = rankOf('bm25')
    const rSim = rankOf('sim')
    for (const it of scored) {
      const rrf = 1 / (RRF_K + (rBm25.get(it) || N)) + 1 / (RRF_K + (rSim.get(it) || N))
      it.rrf = rrf
      it.score = rrf + it.importance * 0.05 + it.recency * 0.03
    }

    // 5. 诚实边界：仅保留真正相关的记忆（关键词命中 或 语义相似度>阈值），
    //    无相关记忆则直接返回空（hasRelevant:false），绝不退化硬塞无关内容编造
    const relevant = scored.filter(it => it.kwHit || it.sim > SIM_THRESHOLD)
    const pool = relevant
    const hasRelevant = relevant.length > 0
    pool.sort((a, b) => b.score - a.score)
    const top = pool.slice(0, Math.max(1, Math.min(Number(limit) || 3, 10)))
    const memories = top.map(it => ({
      id: it.m.id,
      type: it.m.type || 'moment',
      title: it.m.title || '',
      content: it.m.content || '',
      summary: it.m.content || '',
      createdAt: it.m.created_at || null,
      importance: it.importance,
      keywords: it.m.keywords || '',
      source: it.m.source || 'manual',
      score: Math.round(it.score * 100) / 100,
    }))

    // 6. 相关历史对话（关键词匹配消息）
    const likeWords = words.map(w => `%${w.replace(/[%*]/g, '')}%`)
    const msgOr = enc(`(${likeWords.map(w => `content.ilike.${w}`).join(',')})`)
    const msgRes = await fetch(
      `${SUPABASE}/messages?select=role,content&or=${msgOr}&order=created_at.desc&limit=5`,
      { headers: sbHeaders(env) }
    )
    const msgData = await msgRes.json()

    // 7. 最近消息（连续性）
    const recentRes = await fetch(
      `${SUPABASE}/messages?select=role,content,created_at&order=created_at.desc&limit=3`,
      { headers: sbHeaders(env) }
    )
    const recentData = await recentRes.json()

    return json(200, {
      memories,
      relatedMessages: Array.isArray(msgData) ? msgData : [],
      recentMessages: Array.isArray(recentData) ? recentData : [],
      hasRelevant,
    })
  } catch (error) {
    return json(500, { error: error.message })
  }
}

export async function onRequestOptions() {
  return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } })
}
