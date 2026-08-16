import { useState, useEffect } from 'react'
import './NoteCard.css'
import JournalPaper from './JournalPaper'

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

  /* 展开今日小记时锁底层滚动 */
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  const latest = notes[0]
  const pendingCount = counts.pending || 0
  // 迷你入口只关心「等泠泠决定的纸条」（钟泽留的、待处理）；她自己留的 pending 等钟泽看，不触发提醒
  const pendingForHer = notes.filter(n => n.source === 'ai' && n.status === 'pending')
  const alertNote = pendingForHer[0]

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
        className={`sticky-note-mini ${alertNote ? 'is-new' : 'is-quiet'}`}
        onClick={() => setOpen(true)}
      >
        {alertNote ? (
          <>
            <span className="mini-pin">📎</span>
            <span>钟泽留了一张纸条 ✨</span>
          </>
        ) : (
          <>
            <span className="mini-pin">📎</span>
            <span className="mini-hint">纸条</span>
          </>
        )}
      </div>

      {/* 展开浮层：今日小记 = 桌上那页手账纸 */}
      {open && (
        <div className="note-mask" onClick={() => setOpen(false)}>
          <div className="note-sheet" onClick={(e) => e.stopPropagation()}>
            <JournalPaper
              paper="note"
              date={latest ? latest.date : '—'}
              title="今天的小纸条"
              signature={latest ? who(latest) : undefined}
            >
              {writing ? (
                <textarea
                  className="note-write"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="想留点什么？像传纸条一样自然就好…"
                />
              ) : (
                <div className="note-content">{latest ? latest.content : '（还没有纸条——想留的时候，就写一张）'}</div>
              )}
              {latest && (
                <div className="note-status">
                  {latest.status === 'pending' && latest.source === 'user' && '⏳ 钟泽还没看这张'}
                  {latest.status === 'saved' && `✨ 已收下（${latest.decided_by === 'user' ? '你收的' : '钟泽收的'}）`}
                  {latest.status === 'discarded' && '🌬 已飘走'}
                </div>
              )}
            </JournalPaper>

            {/* 操作收成轻量书签，不堆在纸面上 */}
            <div className="note-bookmarks">
              {!writing && latest && latest.status === 'pending' && latest.source === 'ai' && (
                <>
                  <button className="note-bookmark" onClick={() => decide(latest.id, 'saved')}>收到 ✨</button>
                  <button className="note-bookmark" onClick={() => decide(latest.id, 'discarded')}>不要 🌬</button>
                </>
              )}
              {writing && (
                <>
                  <button className="note-bookmark" onClick={() => { setWriting(false); setDraft('') }}>算了</button>
                  <button className="note-bookmark note-bookmark--solid" onClick={submit}>贴上去 📎</button>
                </>
              )}
              {!writing && (
                <button className="note-bookmark" onClick={() => setWriting(true)}>✍ 写一张</button>
              )}
              <button className="note-bookmark" onClick={onOpenPanel}>📖 我们的手账{pendingCount > 0 ? `（${pendingCount}）` : ''}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
