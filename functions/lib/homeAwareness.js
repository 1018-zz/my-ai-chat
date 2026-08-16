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
  return { type, state: n.status || 'pending', preview }
}

export async function getHomeAwareness({ since, env }) {
  const headers = sbHeaders(env)
  const sinceDate = since ? new Date(since) : null
  const events = []
  const seen = new Set()

  try {
    // ① 当前仍 pending（等待处理）的重要事项——无论什么时候写的，只要还没了结就报
    const wUrl = `${SUPABASE}/note_content?select=id,content,source,status&status=eq.pending&order=id.desc&limit=3`
    const wRes = await fetch(wUrl, { headers })
    const wRows = await wRes.json()
    for (const n of (Array.isArray(wRows) ? wRows : [])) {
      seen.add(n.id)
      events.push(noteEvent(n))
    }

    // ② since 之后的新变动（created_at > since）——只报「上次相遇后」发生的事
    if (sinceDate && !isNaN(sinceDate)) {
      const fUrl = `${SUPABASE}/note_content?select=id,content,source,status&created_at=gt.${encodeURIComponent(sinceDate.toISOString())}&order=created_at.desc&limit=10`
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
  } catch (_) {
    // 感知层失败不影响主对话：返回空事件，由调用方静默跳过
  }

  // 行为建议（事实与建议分离）：他仍是他，不是客服——合适才提，不逐条回应
  const instruction = '如果聊天上下文合适，可以自然地提起家里最近的变化；不用刻意回应每一条，话要少。'

  return { events, hasImportant: false, instruction }
}
