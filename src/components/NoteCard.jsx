import { useState, useEffect } from 'react'
import './NoteCard.css'

const API_BASE = 'https://my-ai-chat-4zy.pages.dev'

// 小纸条 · MVP v0.3（澄设计 / 钟泽接入 / 已接真数据）
// 状态：有新纸条(unread=true)=展开醒目 / 没有或已读=缩成小纸片
// 数据源：GET /api/notes 取 note_content 最新一条；✍ 按钮跳日记室
export default function NoteCard({ onWrite }) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState(null) // null = 还没有纸条
  const [unread, setUnread] = useState(false)

  useEffect(() => {
    fetch(`${API_BASE}/api/notes`)
      .then(r => r.json())
      .then(d => { if (d.note) { setNote(d.note); setUnread(true) } })
      .catch(() => {})
  }, [])

  const openNote = () => {
    setOpen(true)
    if (unread) setUnread(false)
  }

  const hasNote = !!note

  return (
    <>
      {/* 首页右下角 · 便利贴入口（有新纸条=展开醒目 / 没有=小纸片） */}
      <div
        className={`sticky-note-mini ${unread ? 'is-new' : 'is-quiet'}`}
        onClick={openNote}
      >
        {unread ? (
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

      {/* 展开浮层 */}
      {open && (
        <div className="note-mask" onClick={() => setOpen(false)}>
          <div className="sticky-note" onClick={(e) => e.stopPropagation()}>
            <div className="tape" />
            <div className="note-date">{note?.date || '—'}</div>
            <div className="note-title">今天的小纸条</div>
            <div className="note-content">{note?.content || (hasNote ? '' : '（还没有纸条——钟泽想留的时候会留）')}</div>
            <div className="note-author">—— {note?.source === 'user' ? '泠泠' : '钟泽'}</div>
            {onWrite && <button className="note-btn" onClick={onWrite}>✍ 写一篇</button>}
          </div>
        </div>
      )}
    </>
  )
}
