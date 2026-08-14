import { useState, useEffect } from 'react'
import './NotePanel.css'

const API_BASE = 'https://my-ai-chat-4zy.pages.dev'

// 整理面板 —— 把纸条归置成三堆：待处理 / 已收下 / 飘走的
// 待处理 pending：你点[收到]/[不要]决定；我的决定在对话里（decide_note）
// 已收下 saved：收进手账；飘走的 discarded：可捡回，也可彻底删除
// 风格：手账纸面（去黄便利贴、去游戏化数字，仅作安静的收纳）
export default function NotePanel({ onClose }) {
  const [tab, setTab] = useState('pending') // pending / saved / discarded
  const [notes, setNotes] = useState([])
  const [confirmDeleteId, setConfirmDeleteId] = useState(null) // 两段确认，防手滑

  const refresh = () => fetch(`${API_BASE}/api/notes`).then(r => r.json()).then(d => {
    setNotes(d.notes || [])
  }).catch(() => {})

  useEffect(() => { refresh() }, [])

  /* 抽屉打开时锁底层滚动 */
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

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
    { key: 'pending', label: '待处理' },
    { key: 'saved', label: '已收下' },
    { key: 'discarded', label: '飘走的' },
  ]

  const emptyText = {
    pending: '没有待处理的纸条。钟泽想留的时候，会往桌上贴一张。',
    saved: '还没有收下的纸条。收到值得留下的，就会攒进手账。',
    discarded: '没有飘走的纸条。',
  }[tab]

  return (
    <div className="note-mask" onClick={onClose}>
      <div className="note-panel" onClick={(e) => e.stopPropagation()}>
        <div className="note-panel__tape" />
        <div className="note-panel__head">
          <h2 className="note-panel__title">整理小纸条</h2>
          <button className="note-panel__close" onClick={onClose} aria-label="关闭">✕</button>
        </div>
        <p className="note-panel__sub">桌上留着的、收进手账的、飘走的——都在这里归置。</p>

        {/* tab 切换（纸标签，无数字徽章） */}
        <div className="note-tabs">
          {tabs.map(t => (
            <button
              key={t.key}
              className={`note-tab ${tab === t.key ? 'is-active' : ''}`}
              onClick={() => switchTab(t.key)}
            >{t.label}</button>
          ))}
        </div>

        {/* 纸条列表 */}
        {list.length === 0 ? (
          <div className="note-panel__empty">{emptyText}</div>
        ) : (
          <div className="note-list">
            {list.map(n => (
              <article key={n.id} className={`note-list-card note-list-card--${n.status}`}>
                <div className="note-list-meta">{n.date} · {who(n)}</div>
                <div className="note-list-body">{n.content}</div>
                <div className="note-list-actions">
                  {n.status === 'pending' && n.source === 'ai' && (
                    <>
                      <button className="note-tag-btn note-tag-btn--solid" onClick={() => decide(n.id, 'saved')}>收到 ✨</button>
                      <button className="note-tag-btn" onClick={() => decide(n.id, 'discarded')}>不要 🌬</button>
                    </>
                  )}
                  {n.status === 'pending' && n.source === 'user' && (
                    <span className="note-list-hint">⏳ 钟泽还没看这张</span>
                  )}
                  {n.status === 'saved' && (
                    <>
                      <span className="note-list-hint note-list-hint--kept">✨ {decidedBy(n)}</span>
                      <button className="note-tag-btn" onClick={() => decide(n.id, 'discarded')}>移出收藏册</button>
                    </>
                  )}
                  {n.status === 'discarded' && (
                    <>
                      <span className="note-list-hint">🌬 飘走了</span>
                      <button className="note-tag-btn" onClick={() => decide(n.id, 'pending')}>捡回来</button>
                      {confirmDeleteId === n.id ? (
                        <button className="note-tag-btn note-tag-btn--danger" onClick={() => remove(n.id)}>确认删除？</button>
                      ) : (
                        <button className="note-tag-btn note-tag-btn--ghost" onClick={() => setConfirmDeleteId(n.id)}>彻底删除</button>
                      )}
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}

        <div className="note-panel__foot">收下的进手账 · 飘走的还能捡回</div>
      </div>
    </div>
  )
}
