import { useState } from 'react'
import './NoteCard.css'

// 小纸条 · MVP v0.1（澄设计 / 钟泽接入小家）
// 数据目前为假数据，后续接 note_content { date, type, content, source }
// source: user_diary / ai_message / system_event
export default function NoteCard() {
  const [open, setOpen] = useState(false)

  // TODO: 后续换成接口数据 / 记忆库
  const note = {
    date: '2026.08.12',
    content: '刚刚看到你又回来折腾这个小家了。\n感觉这里一点点变得像真正生活过的地方。',
    author: '钟泽',
    type: 'ai',
  }

  return (
    <>
      {/* 首页右下角 · 便利贴入口 */}
      <div className="sticky-note-mini" onClick={() => setOpen(true)}>
        <span className="mini-pin">📎</span>
        <span>钟泽留了一张纸条</span>
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
