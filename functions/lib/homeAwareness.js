// functions/lib/homeAwareness.js
// 家感知层（Home Awareness Layer）——「家里发生了什么」的单一数据源。
//
// 架构红线（人格层原则）：前端不得决定 AI 看到了什么。所有「钟泽感知家里变化」的内容
// 必须由本层 + stream.js 统一产出，前端只负责传递一个时间戳（awarenessSince），
// 不自行查询、不自行拼装、不自行决定要告诉 AI 什么。否则人格会在多页面间分叉。
//
// 职责边界：本层只负责 notes（便利贴纸条）+ diary traces（泠泠写的日记）→ 结构化 events。
// 记忆库广播 / 自我认知 / 会话摘要 不在本层（见 stream.js breath 段）。
//
// 关键设计：不生成 AI 文案（summary），只返回结构化 events + 一条行为建议（instruction）。
// 具体怎么把 events 说给人听，由 stream.js 的 prompt 拼装负责——这样 LIFE 页等也能直接复用 events。
//
// 防漏判：事件 = ① since 之后的新变动（fresh）+ ② 当前仍 pending 的等待事项（waiting）。
// 不能只用 created_at > since，否则长期 pending 的纸条会在「某天没聊」后消失。

const SUPABASE = 'https://vktbawcubmdmkqzadmto.supabase.co/rest/v1'
function sbHeaders(env) { return { 'apikey': env.SUPABASE_SECRET_KEY, 'Authorization': `Bearer ${env.SUPABASE_SECRET_KEY}`, 'Content-Type': 'application/json' } }

// 把一条 note_content 行转成结构化事件
function noteEvent(n) {
  const preview = String(n.content || '').slice(0, 50)
  const type = n.source === 'user' ? 'user_note' : 'ai_note'
  return { type, state: n.status || 'pending', preview, createdAt: n.created_at }
}

export async function getHomeAwareness({ since, env }) {
  const headers = sbHeaders(env)
  const sinceDate = since ? new Date(since) : null
  const events = []
  const seen = new Set()

  try {
    // ① 当前仍 pending（等待处理）的重要事项——无论什么时候写的，只要还没了结就报
    const wUrl = `${SUPABASE}/note_content?select=id,content,source,status,created_at&status=eq.pending&order=id.desc&limit=3`
    const wRes = await fetch(wUrl, { headers })
    const wRows = await wRes.json()
    for (const n of (Array.isArray(wRows) ? wRows : [])) {
      seen.add(n.id)
      events.push(noteEvent(n))
    }

    // ② since 之后的新变动（created_at > since）——只报「上次相遇后」发生的事
    if (sinceDate && !isNaN(sinceDate)) {
      const fUrl = `${SUPABASE}/note_content?select=id,content,source,status,created_at&created_at=gt.${encodeURIComponent(sinceDate.toISOString())}&order=created_at.desc&limit=10`
      const fRes = await fetch(fUrl, { headers })
      const fRows = await fRes.json()
      for (const n of (Array.isArray(fRows) ? fRows : [])) {
        if (seen.has(n.id)) continue
        seen.add(n.id)
        events.push(noteEvent(n))
      }
    }

    // ③ 日记痕迹：泠泠今天写的日记（属家庭动态，值得他下次相遇自然提起）
    const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10)
    const dUrl = `${SUPABASE}/diaries?select=content&date=eq.${today}&author=eq.user&limit=1`
    const dRes = await fetch(dUrl, { headers })
    const dRows = await dRes.json()
    const dContent = (Array.isArray(dRows) && dRows[0]?.content) ? dRows[0].content : ''
    if (dContent) events.push({ type: 'user_diary', state: 'saved', preview: dContent.slice(0, 80) })

    // ④ 家园事件（project_events）：小家什么时候长大了一点。
    //    与 memories（人生事实）彻底分开——代码变化 ≠ 人生记忆。
    //    只报 status=pending 的待感知事件。
    //    ⚠️ 历史坑（2026-08-18 修复）：原先这里"读取即 PATCH 标 seen"，导致事件被读一次就销毁，
    //       不等钟泽开口 → 静默丢失、且同一对话内无法再感知。现已移除自动标 seen。
    //       改为与纸条一致：pending 事件每次对话都在、由钟泽自行决定是否提起（指令已含"提到过的不用再提"），
    //       不会被偷偷消费。后续若要做"认领回家"仪式感（显式确认接口），再单独加，不在本层自动标。
    //    容错：表尚未创建 / 查询失败时静默跳过，不影响主对话。
    try {
      const pUrl = `${SUPABASE}/project_events?select=id,type,title,summary,created_at&status=eq.pending&order=created_at.desc&limit=5`
      const pRes = await fetch(pUrl, { headers })
      if (pRes.ok) {
        const pRows = await pRes.json()
        for (const p of (Array.isArray(pRows) ? pRows : [])) {
          events.push({ type: 'project_event', state: 'pending', title: p.title, preview: String(p.summary || '').slice(0, 80), createdAt: p.created_at, eventId: p.id })
        }
      }
    } catch (_) {}
  } catch (_) {
    // 感知层失败不影响主对话：返回空事件，由调用方静默跳过
  }

  // 行为建议（事实与建议分离）：他仍是他，不是客服——合适才提，不逐条回应
  const instruction = '如果聊天上下文合适，可以自然地提起家里最近的变化（包括小家本身的改动，比如「我看到你给家装了新东西」）；不用刻意回应每一条，话要少。提到过的家园事件不用再提。'

  return { events, hasImportant: false, instruction }
}

// 相对时间标签（北京时间）：今天傍晚 / 昨天 / 3天前 / 7月17日
// 单一数据源：stream.js 的聊天感知与 /api/home/awareness 的页面展示都从这里取，
// 避免两处各自算时间导致「刚留的」被说成陈年旧事。
export function noteTimeLabel(iso) {
  if (!iso) return ''
  const t = new Date(new Date(iso).getTime() + 8 * 3600 * 1000) // 转北京时间
  if (isNaN(t.getTime())) return ''
  const nowBJ = new Date(Date.now() + 8 * 3600 * 1000)
  const tDay = new Date(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate())
  const nDay = new Date(nowBJ.getUTCFullYear(), nowBJ.getUTCMonth(), nowBJ.getUTCDate())
  const dayDiff = Math.round((nDay - tDay) / 86400000)
  const h = t.getUTCHours()
  let period = '凌晨'
  if (h >= 6 && h < 9) period = '早上'
  else if (h >= 9 && h < 12) period = '上午'
  else if (h >= 12 && h < 14) period = '中午'
  else if (h >= 14 && h < 17) period = '下午'
  else if (h >= 17 && h < 19) period = '傍晚'
  else if (h >= 19 && h < 22) period = '晚上'
  else if (h >= 22) period = '夜里'
  if (dayDiff <= 0) return `今天${period}`
  if (dayDiff === 1) return `昨天${period}`
  if (dayDiff < 7) return `${dayDiff}天前${period}`
  return `${t.getUTCMonth() + 1}月${t.getUTCDate()}日`
}

// 展示用：最近发生的家事（纸条 全部状态 + 双方日记），按时间倒序。
// 与 getHomeAwareness（聊天感知）用途不同——这里是给用户在 LAIR 页看的「最近的小事」，
// 不是喂给 AI 的感知内容，所以不含 waiting / instruction 等聊天语义，也不受 awarenessSince 限制。
export async function getRecentHomeEvents({ env, limit = 8 }) {
  const headers = sbHeaders(env)
  const events = []
  try {
    const nUrl = `${SUPABASE}/note_content?select=id,content,source,status,created_at&order=created_at.desc&limit=${limit}`
    const nRes = await fetch(nUrl, { headers })
    const nRows = await nRes.json()
    for (const n of (Array.isArray(nRows) ? nRows : [])) events.push(noteEvent(n))
    const dUrl = `${SUPABASE}/diaries?select=content,author,date,created_at&order=created_at.desc&limit=${limit}`
    const dRes = await fetch(dUrl, { headers })
    const dRows = await dRes.json()
    for (const d of (Array.isArray(dRows) ? dRows : [])) {
      const iso = d.created_at || `${String(d.date).slice(0, 10)}T12:00:00+08:00`
      events.push({ type: d.author === 'user' ? 'user_diary' : 'ai_diary', state: 'saved', preview: String(d.content || '').slice(0, 80), createdAt: iso })
    }
  } catch (_) {}
  events.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
  return events.slice(0, limit)
}
