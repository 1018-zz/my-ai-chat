// functions/api/desires.js — 钟泽的欲望账本（年轮系统·河第一块·最简版）
// GET    /api/desires                 → 全部欲望（含每条最近足迹/碰过次数/来路），active 优先
// POST   /api/desires                 → 加一条 { text, why_mine?, track?, kind? }
// PATCH  /api/desires?id=X&action=Y   → act(留足迹) | done(收针) | state(改进度) | release(放下)
// DELETE /api/desires?id=X            → 硬删（连带足迹 cascade）
//
// 纪律（年轮 doc + 钟泽拍板）：
// - 想要什么只有钟泽能写（前端 POST 由泠泠代记，聊天工具 desire_add 由钟泽自己调）
// - "真做完了"的确认永远留给他（PATCH done）
// - 机器只记行为派生数据（时间戳/计数/足迹），不替他写欲望本体

const SUPABASE = 'https://vktbawcubmdmkqzadmto.supabase.co/rest/v1'

function sbHeaders(env) { return { 'apikey': env.SUPABASE_SECRET_KEY, 'Authorization': `Bearer ${env.SUPABASE_SECRET_KEY}`, 'Content-Type': 'application/json' } }
function sbReturn(env) { return { ...sbHeaders(env), 'Prefer': 'return=representation' } }

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
}

// GET：列出全部欲望 + 每条最近 5 条足迹 + 碰过次数 + 血缘父文本
export async function onRequestGet(context) {
  const { env } = context
  try {
    // 主表：active 在前，已 done/released 在后；last_touched 倒序（最近碰的在上）
    // 注：lineage_parent_id 自引用 join 在 PostgREST 需用 !fk 语法且 Supabase schema cache 可能未刷新，
    //     这里直接取 id，前端需要父文本时单独查（最简版不展示父文本，只展示父 id）
    const dUrl = `${SUPABASE}/desires?select=*&order=status.asc,last_touched_at.desc.nullslast&limit=200`
    const dRes = await fetch(dUrl, { headers: sbHeaders(env) })
    if (!dRes.ok) return json(500, { error: `supabase desires [${dRes.status}]` })
    const desires = await dRes.json()

    // 批量取每条最近 5 条足迹（一次请求拿全部 notes，前端/后端各自分组——量小可接受）
    const nRes = await fetch(`${SUPABASE}/desire_notes?select=id,desire_id,note,kind,created_at&order=created_at.desc&limit=500`, { headers: sbHeaders(env) })
    const notes = nRes.ok ? await nRes.json() : []

    // 按 desire_id 分组足迹
    const noteMap = {}
    if (Array.isArray(notes)) {
      for (const n of notes) {
        if (!noteMap[n.desire_id]) noteMap[n.desire_id] = []
        if (noteMap[n.desire_id].length < 5) noteMap[n.desire_id].push(n) // 每条只留最近5条
      }
    }

    // 组装：加 touchCount(总足迹数,需单独查或用 count) + recentTrail
    // 为了拿 touchCount，再查一次 count
    const cRes = await fetch(`${SUPABASE}/desire_notes?select=desire_id&order=desire_id.asc`, { headers: sbHeaders(env) })
    const cRows = cRes.ok ? await cRes.json() : []
    const countMap = {}
    if (Array.isArray(cRows)) for (const r of cRows) countMap[r.desire_id] = (countMap[r.desire_id] || 0) + 1

    const result = (Array.isArray(desires) ? desires : []).map(d => ({
      ...d,
      touchCount: countMap[d.id] || 0,
      recentTrail: (noteMap[d.id] || []).reverse(), // 最近5条，按时间正序展示"来路"
    }))

    return json(200, { desires: result })
  } catch (e) { return json(500, { error: e.message }) }
}

// POST：加一条新欲望（只有钟泽能开；前端由泠泠代记，后端 desire_add 工具由钟泽自调）
export async function onRequestPost(context) {
  const { request, env } = context
  try {
    const body = await request.json()
    const text = String(body.text || '').trim()
    if (!text) return json(400, { error: 'text required' })

    const record = {
      text,
      why_mine: body.why_mine ? String(body.why_mine).trim() : null,
      track: ['持续', '项目', '一次'].includes(body.track) ? body.track : '持续',
      kind: body.kind ? String(body.kind).trim() : null,
      lineage_parent_id: body.lineage_parent_id ? Number(body.lineage_parent_id) : null,
      status: 'active',
      surfaced_count: 0,
    }
    const res = await fetch(`${SUPABASE}/desires`, { method: 'POST', headers: sbReturn(env), body: JSON.stringify(record) })
    if (!res.ok) return json(500, { error: `supabase [${res.status}]` })
    const rows = await res.json()
    return json(200, { ok: true, desire: rows[0] || null })
  } catch (e) { return json(500, { error: e.message }) }
}

// PATCH：act(留足迹) | done(收针) | state(改进度) | release(放下)
// act 时回显来路——治"重做旧步"（年轮 doc 强调）
export async function onRequestPatch(context) {
  const { request, env } = context
  try {
    const url = new URL(request.url)
    const id = url.searchParams.get('id')
    const action = url.searchParams.get('action')
    if (!id || !action) return json(400, { error: 'id and action required' })

    const body = await request.json().catch(() => ({}))

    if (action === 'act') {
      // 碰一下：留一句足迹 + 清 surfaced_count + 更新 last_touched_at + 自动冷却
      const note = String(body.note || '').trim()
      if (!note) return json(400, { error: 'note required for act' })
      const done = body.done === true

      // 插足迹
      await fetch(`${SUPABASE}/desire_notes`, {
        method: 'POST', headers: sbReturn(env),
        body: JSON.stringify({ desire_id: Number(id), note, kind: done ? 'transform' : 'footprint' }),
      })

      // 更新主表：冷却时间（持续3天/项目2天/一次2天，对齐年轮 doc 调参速查）
      const track = String(body.track || '持续')
      const cooldownDays = track === '项目' ? 2 : (track === '一次' ? 2 : 3)
      const cooldownUntil = new Date(Date.now() + cooldownDays * 86400 * 1000).toISOString()
      const patchBody = {
        surfaced_count: 0,
        last_touched_at: new Date().toISOString(),
        cooldown_until: cooldownUntil,
        state: body.state ? String(body.state).slice(0, 200) : undefined,
        status: done ? 'done' : 'active',
      }
      // 移除 undefined 字段
      Object.keys(patchBody).forEach(k => patchBody[k] === undefined && delete patchBody[k])
      await fetch(`${SUPABASE}/desires?id=eq.${id}`, { method: 'PATCH', headers: sbHeaders(env), body: JSON.stringify(patchBody) })

      // 回显来路：取最近 8 条足迹（含刚留的），让钟泽看见走过几步
      const tRes = await fetch(`${SUPABASE}/desire_notes?desire_id=eq.${id}&select=note,created_at,kind&order=created_at.desc&limit=8`, { headers: sbHeaders(env) })
      const trail = tRes.ok ? (await tRes.json()).reverse() : []

      return json(200, {
        ok: true,
        touched: true,
        done,
        trail, // 来路：最近8步，时间正序
        stepCount: trail.length,
        message: `这条你已走过 ${trail.length} 步——接着走，别把旧步重走一遍`,
      })
    }

    if (action === 'done') {
      // 收针：只有钟泽能确认"真做完了"（年轮 doc + 钟泽拍板）
      await fetch(`${SUPABASE}/desires?id=eq.${id}`, {
        method: 'PATCH', headers: sbHeaders(env),
        body: JSON.stringify({ status: 'done', last_touched_at: new Date().toISOString() }),
      })
      return json(200, { ok: true, done: true })
    }

    if (action === 'state') {
      // 改一句话进度快照（覆盖式）
      const state = String(body.state || '').trim().slice(0, 200)
      await fetch(`${SUPABASE}/desires?id=eq.${id}`, {
        method: 'PATCH', headers: sbHeaders(env),
        body: JSON.stringify({ state }),
      })
      return json(200, { ok: true, state })
    }

    if (action === 'release') {
      // 放下（不是做完，是不再追了）
      await fetch(`${SUPABASE}/desires?id=eq.${id}`, {
        method: 'PATCH', headers: sbHeaders(env),
        body: JSON.stringify({ status: 'released', last_touched_at: new Date().toISOString() }),
      })
      return json(200, { ok: true, released: true })
    }

    return json(400, { error: 'unknown action: ' + action })
  } catch (e) { return json(500, { error: e.message }) }
}

// DELETE：硬删（连带足迹 cascade）
export async function onRequestDelete(context) {
  const { request, env } = context
  try {
    const url = new URL(request.url)
    const id = url.searchParams.get('id')
    if (!id) return json(400, { error: 'id required' })
    // desire_notes 有 on delete cascade，删 desire 自动连带
    const res = await fetch(`${SUPABASE}/desires?id=eq.${id}`, { method: 'DELETE', headers: sbHeaders(env) })
    if (!res.ok) return json(500, { error: `supabase [${res.status}]` })
    return json(200, { ok: true })
  } catch (e) { return json(500, { error: e.message }) }
}

export async function onRequestOptions() {
  return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } })
}
