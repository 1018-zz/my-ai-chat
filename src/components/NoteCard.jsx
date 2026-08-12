import { useState, useEffect } from 'react'
import './NoteCard.css'

const API_BASE = 'https://my-ai-chat-4zy.pages.dev'

// 小纸条 · MVP v0.4 —— 双人留言板（澄设计 / 钟泽接入）
// 双向：钟泽留纸条（MCP leave_note）+ 泠泠留纸条（✍ 输入）
// 双向决定：泠泠前端点[收到]/[不要]；钟泽对话里调 decide_note
// 状态：pending → saved（收下）/ discarded（飘走，可捡回）
export default function NoteCard({ onOpenPanel }) {
  const [open, setOpen] = useState(false)
  const [notes, setNotes] = useState([])
  const [counts, setCounts] = useState({ pending: 0, saved: 0, discarded: 0 })
  const [writing, setWriting] = useState(false)
  const [draft, setDraft] = useState('')

  const refresh = () => fetch(`${API_BASE}/api/notes`).then(r => r.json()).then(d => {
    setNotes(d.notes || [])
    setCounts(d.counts || { pending: 0, saved: 0, discarded: 0 })
  }).catch(() => {})

  useEffect(() => { refresh() }, [])

  const latest = notes[0]
  const pendingCount = counts.pending || 0

  const decide = async (id, status) => {
    await fetch(`${API_BASE}/api/notes`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status, decided_by: 'user' }) })
    refresh()
  }

  const submit = async () => {
    const c = draft.trim()
    if (!c) return
    await fetch(`${API_BASE}/api/notes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: c, source: 'user' }) })
    setDraft(''); setWriting(false); refresh()
  }

  const who = (n) => (n.source === 'user' ? '泠泠' : '钟泽')

  return (
    <>
      {/* 首页 · 便利贴入口（有待处理=醒目 / 没有=安静小纸片） */}
      <div
        className={`sticky-note-mini ${pendingCount > 0 ? 'is-new' : 'is-quiet'}`}
        onClick={() => setOpen(true)}
      >
        {pendingCount > 0 ? (
          <>
            <span className="mini-pin">📎</span>
            <span>{latest && latest.source === 'user' ? '泠泠留了一张纸条 ✨' : '钟泽留了一张纸条 ✨'}</span>
          </>
        ) : (
          <>
            <span className="mini-pin">📎</span>
            <span className="mini-hint">纸条</span>
          </>
        )}
      </div>

      {/* 展开浮层 */}
      {open && (
        <div className="note-mask" onClick={() => setOpen(false)}>
          <div className="sticky-note" onClick={(e) => e.stopPropagation()}>
            <div className="tape" />
            <div className="note-date">{latest ? `${latest.date} · ${who(latest)}` : '—'}</div>
            <div className="note-title">今天的小纸条</div>

            {/* 写纸条模式 */}
            {writing ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '10px 0' }}>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="想留点什么？像传纸条一样自然就好…"
                  style={{ width: '100%', minHeight: 64, padding: 8, borderRadius: 8, border: '1px solid var(--color-border-glass)', background: 'rgba(255,255,255,0.7)', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }}
                />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button className="note-btn" onClick={() => { setWriting(false); setDraft('') }}>算了</button>
                  <button className="note-btn" style={{ background: 'var(--color-primary)', color: '#fff', border: 'none' }} onClick={submit}>贴上去 📎</button>
                </div>
              </div>
            ) : (
              <>
                <div className="note-content">{latest ? latest.content : '（还没有纸条——想留的时候，就写一张）'}</div>
                {/* 状态与操作 */}
                {latest && (
                  <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-text-gray)' }}>
                    {latest.status === 'pending' && latest.source === 'ai' && (
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button className="note-btn" onClick={() => decide(latest.id, 'saved')}>收到 ✨</button>
                        <button className="note-btn" onClick={() => decide(latest.id, 'discarded')}>不要 🌬</button>
                      </div>
                    )}
                    {latest.status === 'pending' && latest.source === 'user' && <span>⏳ 钟泽还没看这张</span>}
                    {latest.status === 'saved' && <span>✨ 已收下（{latest.decided_by === 'user' ? '你收的' : '钟泽收的'}）</span>}
                    {latest.status === 'discarded' && <span>🌬 已飘走</span>}
                  </div>
                )}
              </>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'space-between' }}>
              <button className="note-btn" onClick={() => setWriting(true)}>✍ 写一张</button>
              <button className="note-btn" onClick={onOpenPanel}>📖 今日小记{pendingCount > 0 ? `（${pendingCount}）` : ''}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
