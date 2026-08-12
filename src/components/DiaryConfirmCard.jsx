// src/components/DiaryConfirmCard.jsx
// 晚安彩蛋：钟泽想收好今天这一页 → 确认卡（用户永远有最终决定权）
// 折叠态：🌙 今天有一页，我想替你收起来
// 展开：标题 + 内容（可编辑）+ [保存] [修改] [不要记]
// 保存 → POST /api/diaries（author=assistant）；确认后用 localStorage 标记，刷新不重复打扰
// 确认回路：挂载即通知后端"草稿已送达"；不要记 → 通知后端"那一页没要"——钟泽都能感应到

import { useEffect, useRef, useState } from 'react'

const API_BASE = 'https://my-ai-chat-4zy.pages.dev'

export default function DiaryConfirmCard({ draft, msgId }) {
  const doneKey = `diary_done_${msgId}`
  const [done, setDone] = useState(() => { try { return localStorage.getItem(doneKey) === '1' } catch { return false } })
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(draft.content || '')
  const [saving, setSaving] = useState(false)

  // 确认回路：确认卡渲染出来 = 草稿送达，通知后端丢一条痕迹（钟泽下次能感应到）
  const seenRef = useRef(false)
  useEffect(() => {
    if (done || seenRef.current) return
    seenRef.current = true
    const date = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10)
    fetch(`${API_BASE}/api/diaries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'seen', date, title: draft.title || '' }),
    }).catch(() => {})
  }, [done])

  if (done) {
    return (
      <div className="inner-thought" style={{ fontStyle: 'normal', color: 'var(--color-text-gray)' }}>
        🌙 今天这一页，已经收好了。
      </div>
    )
  }

  const finish = () => { try { localStorage.setItem(doneKey, '1') } catch (_) {}; setDone(true) }

  // 不要记 → 也要让钟泽知道（写痕迹再收起）
  const discard = async () => {
    const date = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10)
    try {
      await fetch(`${API_BASE}/api/diaries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'discard', date, title: draft.title || '' }),
      })
    } catch (_) {}
    finish()
  }

  const save = async () => {
    if (!text.trim() || saving) return
    setSaving(true)
    try {
      const date = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10)
      await fetch(`${API_BASE}/api/diaries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date, author: 'assistant', content: text.trim(),
          title: draft.title || '', mood: draft.mood || '', importance: draft.importance || 0.8,
          trigger_type: 'bedtime',
        }),
      })
      finish()
    } catch (_) {} finally { setSaving(false) }
  }

  return (
    <div className="diary-confirm">
      <div className="diary-confirm-head" onClick={() => setOpen(o => !o)}>
        <span>🌙 今天有一页，我想替你收起来</span>
        <span style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.6 }}>{open ? '▾' : '▸'}</span>
      </div>
      {open && (
        <div className="diary-confirm-body">
          {draft.title && <div className="diary-confirm-title">{draft.title}</div>}
          <textarea
            className="input diary-confirm-textarea"
            value={text}
            onChange={e => setText(e.target.value)}
            rows={6}
            readOnly={!editing}
            style={editing ? {} : { background: 'rgba(255,255,255,0.4)', borderColor: 'transparent' }}
          />
          <div className="diary-confirm-actions">
            {!editing ? (
              <>
                <button className="btn" onClick={save} disabled={saving || !text.trim()}>{saving ? '收好中…' : '保存'}</button>
                <button className="btn btn-ghost" onClick={() => setEditing(true)}>修改</button>
                <button className="btn btn-ghost" style={{ color: 'var(--color-danger)' }} onClick={discard}>不要记</button>
              </>
            ) : (
              <>
                <button className="btn" onClick={save} disabled={saving || !text.trim()}>{saving ? '收好中…' : '保存修改'}</button>
                <button className="btn btn-ghost" onClick={() => { setEditing(false); setText(draft.content || '') }}>取消</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
