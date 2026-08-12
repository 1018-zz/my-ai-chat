import { useState } from 'react'
import './NoteCard.css'

// 小纸条 · MVP v0.2（澄设计 / 钟泽接入）
// 状态：有新内容(unread=true)=展开醒目 / 没有新内容(unread=false)=缩成小纸片
// 数据为假数据，后续接 note_content { date, type, content, source }
export default function NoteCard() {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState({
    date: '2026.08.12',
    content: '刚刚看到你又回来折腾这个小家了。\n感觉这里一点点变得像真正生活过的地方。',
    author: '钟泽',
    type: 'ai',
    unread: true, // 有新内容时醒目；点开即视为已读
  })

  const openNote = () => {
    setOpen(true)
    if (note.unread) setNote({ ...note, unread: false })
  }

  return (
    <>
      {/* 首页右下角 · 便利贴入口（有新纸条=展开醒目 / 没有=小纸片） */}
      <div
        className={`sticky-note-mini ${note.unread ? 'is-new' : 'is-quiet'}`}
        onClick={openNote}
      >
        {note.unread ? (
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
            <div className="note-date">{note.date}</div>
            <div className="note-title">今天的小纸条</div>
            <div className="note-content">{note.content}</div>
            <div className="note-author">—— {note.author}</div>
            {/* TODO: 以后接日记室跳转 */}
            <button className="note-btn" onClick={() => console.log('open diary')}>✍ 写一篇</button>
          </div>
        </div>
      )}
    </>
  )
}
