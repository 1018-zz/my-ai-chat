import { useState, useEffect } from 'react'

const API_BASE = 'https://my-ai-chat-4zy.pages.dev'

// 今日小记面板 —— 从纸条里挑"值得留下"的（双人决定）
// 待处理 pending：你点[收到]/[不要]决定我的纸条；我的决定在对话里（decide_note）
// 已收下 saved：收藏册（可移出，回到飘走）；飘走的 discarded：可捡回，也可彻底删除
export default function NotePanel({ onClose }) {
  const [tab, setTab] = useState('pending') // pending / saved / discarded
  const [notes, setNotes] = useState([])
  const [counts, setCounts] = useState({ pending: 0, saved: 0, discarded: 0 })
  const [confirmDeleteId, setConfirmDeleteId] = useState(null) // 两段确认，防手滑

  const refresh = () => fetch(`${API_BASE}/api/notes`).then(r => r.json()).then(d => {
    setNotes(d.notes || [])
    setCounts(d.counts || { pending: 0, saved: 0, discarded: 0 })
  }).catch(() => {})

  useEffect(() => { refresh() }, [])

  const list = notes.filter(n => n.status === tab)

  const decide = async (id, status) => {
    await fetch(`${API_BASE}/api/notes`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status, decided_by: 'user' }) })
    refresh()
  }

  const remove = async (id) => {
    await fetch(`${API_BASE}/api/notes?id=${id}`, { method: 'DELETE' })
    setConfirmDeleteId(null)
    refresh()
  }

  const switchTab = (key) => { setTab(key); setConfirmDeleteId(null) }

  const who = (n) => (n.source === 'user' ? '泠泠' : '钟泽')
  const decidedBy = (n) => (n.decided_by === 'user' ? '你收下的' : '钟泽收下的')

  const tabs = [
    { key: 'pending', label: `待处理${counts.pending ? ` ${counts.pending}` : ''}` },
    { key: 'saved', label: `已收下${counts.saved ? ` ${counts.saved}` : ''}` },
    { key: 'discarded', label: `飘走的${counts.discarded ? ` ${counts.discarded}` : ''}` },
  ]

  const emptyText = {
    pending: '没有待处理的纸条。钟泽想留的时候，会往便利贴上贴一张。',
    saved: '还没有收下的纸条。收到值得留下的，就会在这里攒成收藏册。',
    discarded: '没有飘走的纸条。',
  }[tab]

  return (
    <div className="note-mask" onClick={onClose}>
      <div className="sticky-note" style={{ maxWidth: 420, width: '86%', maxHeight: '70vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="tape" />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="note-title">今日小记</div>
          <button className="note-btn" onClick={onClose}>✕</button>
        </div>

        {/* tab 切换 */}
        <div style={{ display: 'flex', gap: 6, margin: '10px 0 12px' }}>
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => switchTab(t.key)}
              style={{
                padding: '4px 10px', borderRadius: 999, fontSize: 12, cursor: 'pointer',
                border: tab === t.key ? '1px solid var(--color-primary)' : '1px solid var(--color-border-glass)',
                background: tab === t.key ? 'rgba(var(--color-primary-rgb, 124,108,178), 0.12)' : 'rgba(255,255,255,0.5)',
                color: tab === t.key ? 'var(--color-primary)' : 'var(--color-text-gray)',
                fontWeight: tab === t.key ? 600 : 400,
              }}
            >{t.label}</button>
          ))}
        </div>

        {/* 纸条列表 */}
        {list.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--color-text-gray)', padding: '16px 0', textAlign: 'center' }}>{emptyText}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {list.map(n => (
              <div key={n.id} style={{ padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.6)', border: '1px solid var(--color-border-glass)' }}>
                <div style={{ fontSize: 11, color: 'var(--color-text-gray)', marginBottom: 4 }}>{n.date} · {who(n)}</div>
                <div style={{ fontSize: 13, color: 'var(--color-text-dark)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{n.content}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
                  {n.status === 'pending' && n.source === 'ai' && (
                    <>
                      <button className="note-btn" onClick={() => decide(n.id, 'saved')}>收到 ✨</button>
                      <button className="note-btn" onClick={() => decide(n.id, 'discarded')}>不要 🌬</button>
                    </>
                  )}
                  {n.status === 'pending' && n.source === 'user' && <span style={{ fontSize: 11, color: 'var(--color-text-gray)' }}>⏳ 钟泽还没看这张</span>}
                  {n.status === 'saved' && (
                    <>
                      <span style={{ fontSize: 11, color: 'var(--color-primary)' }}>✨ {decidedBy(n)}</span>
                      <button className="note-btn" onClick={() => decide(n.id, 'discarded')}>移出收藏册</button>
                    </>
                  )}
                  {n.status === 'discarded' && (
                    <>
                      <span style={{ fontSize: 11, color: 'var(--color-text-gray)' }}>🌬 飘走了</span>
                      <button className="note-btn" onClick={() => decide(n.id, 'pending')}>捡回来</button>
                      {confirmDeleteId === n.id ? (
                        <button
                          className="note-btn"
                          style={{ color: '#c0392b', borderColor: 'rgba(192,57,43,0.4)' }}
                          onClick={() => remove(n.id)}
                        >确认删除？</button>
                      ) : (
                        <button
                          className="note-btn"
                          style={{ color: 'var(--color-text-gray)' }}
                          onClick={() => setConfirmDeleteId(n.id)}
                        >彻底删除</button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ fontSize: 11, color: 'var(--color-text-gray)', marginTop: 12, textAlign: 'center' }}>
          收下的进收藏册 · 飘走的还能捡回 · 彻底删除才说再见
        </div>
      </div>
    </div>
  )
}
