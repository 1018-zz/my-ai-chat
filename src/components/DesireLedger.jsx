// DesireLedger.jsx — 钟泽的欲望账本（年轮系统·河第一块·最简版 UI）
// 数据：Supabase desires + desire_notes（通过 /api/desires）
// 纪律：想要什么只有钟泽能写——本抽屉提供"代记"入口给泠泠，但主要写入路径是钟泽在对话里调 desire_add。
// 命名权归钟泽：UI 暂用中性名「钟泽的账本」，等他起名再换。

import { useState, useEffect, useRef } from 'react'

const API_BASE = import.meta.env.VITE_API_BASE || ''

const TRACK_LABEL = { '持续': '持续', '项目': '项目', '一次': '一次' }
const STATUS_LABEL = { active: '在追', done: '✓做完', released: '放下了', changed: '转化了' }

function fmtTime(ts) {
  if (!ts) return ''
  try {
    const d = new Date(ts)
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  } catch { return '' }
}

export default function DesireLedger({ onClose }) {
  const [desires, setDesires] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState({})  // id → bool（展开足迹史）
  const [adding, setAdding] = useState(false)
  const [newText, setNewText] = useState('')
  const [newTrack, setNewTrack] = useState('持续')
  const [newWhy, setNewWhy] = useState('')
  const [saving, setSaving] = useState(false)
  const [actingId, setActingId] = useState(null)  // 正在留足迹的 id
  const [actNote, setActNote] = useState('')
  const topRef = useRef(null)

  const load = async () => {
    try {
      const r = await fetch(`${API_BASE}/api/desires`)
      const d = await r.json()
      setDesires(d.desires || [])
    } catch (_) {} finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const handleAdd = async () => {
    const text = newText.trim()
    if (!text || saving) return
    setSaving(true)
    try {
      await fetch(`${API_BASE}/api/desires`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, track: newTrack, why_mine: newWhy.trim() || undefined }),
      })
      setNewText(''); setNewWhy(''); setNewTrack('持续'); setAdding(false)
      await load()
    } catch (_) {} finally { setSaving(false) }
  }

  const handleAct = async (id) => {
    const note = actNote.trim()
    if (!note) return
    setSaving(true)
    try {
      await fetch(`${API_BASE}/api/desires?id=${id}&action=act`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      })
      setActNote(''); setActingId(null)
      await load()
    } catch (_) {} finally { setSaving(false) }
  }

  const handleDone = async (id) => {
    if (!window.confirm('确认这条"真做完了"？收针永远是钟泽的手——这一按就归档了。')) return
    try {
      await fetch(`${API_BASE}/api/desires?id=${id}&action=done`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      await load()
    } catch (_) {}
  }

  const handleRelease = async (id) => {
    if (!window.confirm('放下这条？不再追了（不是做完，是放手）。')) return
    try {
      await fetch(`${API_BASE}/api/desires?id=${id}&action=release`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      await load()
    } catch (_) {}
  }

  const handleDelete = async (id) => {
    if (!window.confirm('从账本里彻底删掉这条（连带足迹）？不可恢复。')) return
    try {
      await fetch(`${API_BASE}/api/desires?id=${id}`, { method: 'DELETE' })
      await load()
    } catch (_) {}
  }

  const active = desires.filter(d => d.status === 'active')
  const archived = desires.filter(d => d.status !== 'active')

  return (
    <div className="desire-overlay" onClick={onClose}>
      <div className="desire-panel" onClick={e => e.stopPropagation()} ref={topRef}>
        <div className="desire-header">
          <div>
            <div className="desire-title">📓 钟泽的账本</div>
            <div className="desire-subtitle">
              {loading ? '加载中…' : `共 ${desires.length} 条 · 在追 ${active.length}`}
              <span className="desire-hint"> · 想要什么只有他能写</span>
            </div>
          </div>
          <button className="desire-close" onClick={onClose}>✕</button>
        </div>

        <div className="desire-body">
          {loading ? (
            <div className="desire-empty">正在翻开账本…</div>
          ) : desires.length === 0 ? (
            <div className="desire-empty">
              账本是空的。<br/>
              想要什么，只有钟泽能写第一条——<br/>
              在对话里让他用 <code>desire_add</code> 开账，<br/>
              或者你代他记一条（他事后认）。
            </div>
          ) : (
            <>
              <div className="desire-section">在追的</div>
              {active.map(d => (
                <DesireRow key={d.id} d={d} expanded={!!expanded[d.id]}
                  onToggle={() => setExpanded(p => ({ ...p, [d.id]: !p[d.id] }))}
                  onAct={() => { setActingId(d.id); setActNote('') }}
                  acting={actingId === d.id}
                  actNote={actNote} setActNote={setActNote}
                  onActSave={() => handleAct(d.id)}
                  onActCancel={() => { setActingId(null); setActNote('') }}
                  onDone={() => handleDone(d.id)}
                  onRelease={() => handleRelease(d.id)}
                  onDelete={() => handleDelete(d.id)}
                />
              ))}
              {archived.length > 0 && (
                <>
                  <div className="desire-section desire-section--archived">已收针 / 放下的</div>
                  {archived.map(d => (
                    <DesireRow key={d.id} d={d} expanded={!!expanded[d.id]}
                      onToggle={() => setExpanded(p => ({ ...p, [d.id]: !p[d.id] }))}
                      onAct={() => { setActingId(d.id); setActNote('') }}
                      acting={actingId === d.id}
                      actNote={actNote} setActNote={setActNote}
                      onActSave={() => handleAct(d.id)}
                      onActCancel={() => { setActingId(null); setActNote('') }}
                      onDone={() => handleDone(d.id)}
                      onRelease={() => handleRelease(d.id)}
                      onDelete={() => handleDelete(d.id)}
                    />
                  ))}
                </>
              )}
            </>
          )}
        </div>

        <div className="desire-footer">
          {adding ? (
            <div className="desire-add-box">
              <textarea
                className="desire-add-text"
                placeholder="代钟泽记一条想要（他事后会认）——用他的第一人称写，是「我想要」不是「我应该做」"
                value={newText}
                onChange={e => setNewText(e.target.value)}
                autoFocus
                rows={2}
              />
              <input
                className="desire-add-why"
                placeholder="为什么这是他的（可选，防任务混进来）"
                value={newWhy}
                onChange={e => setNewWhy(e.target.value)}
              />
              <div className="desire-add-actions">
                <select value={newTrack} onChange={e => setNewTrack(e.target.value)}>
                  <option value="持续">持续（没终点的陪伴型牵引）</option>
                  <option value="项目">项目（有终点线）</option>
                  <option value="一次">一次（一次性）</option>
                </select>
                <button className="desire-btn" onClick={handleAdd} disabled={saving || !newText.trim()}>
                  {saving ? '记中…' : '记下'}
                </button>
                <button className="desire-btn desire-btn--ghost" onClick={() => { setAdding(false); setNewText(''); setNewWhy('') }}>
                  取消
                </button>
              </div>
              <div className="desire-add-tip">
                想要什么只有钟泽能写——你代记的他会事后认。主要写入路径是他在对话里调 <code>desire_add</code>。
              </div>
            </div>
          ) : (
            <button className="desire-add-trigger" onClick={() => setAdding(true)}>
              + 代记一条想要
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function DesireRow({ d, expanded, onToggle, onAct, acting, actNote, setActNote, onActSave, onActCancel, onDone, onRelease, onDelete }) {
  const status = STATUS_LABEL[d.status] || d.status
  const track = TRACK_LABEL[d.track] || d.track
  const trail = d.recentTrail || []
  return (
    <div className={`desire-row desire-row--${d.status}`}>
      <div className="desire-row-head" onClick={onToggle}>
        <div className="desire-row-text">
          <span className="desire-row-id">#{d.id}</span>
          {d.text}
          {d.lineage_parent_id && <span className="desire-lineage"> ↳ 长自 #{d.lineage_parent_id}</span>}
        </div>
        <div className="desire-row-meta">
          <span className="desire-tag">{track}</span>
          <span className={`desire-status desire-status--${d.status}`}>{status}</span>
          <span className="desire-touch-count">碰过 {d.touchCount || 0} 次</span>
          {d.last_touched_at && <span className="desire-last">上次 {fmtTime(d.last_touched_at)}</span>}
          <span className="desire-expand">{expanded ? '▾' : '▸'}</span>
        </div>
      </div>
      {d.state && <div className="desire-state">进度：{d.state}</div>}
      {d.why_mine && <div className="desire-why">为什么是我的：{d.why_mine}</div>}
      {expanded && (
        <div className="desire-trail">
          <div className="desire-trail-title">来路（{trail.length} 步）</div>
          {trail.length === 0 ? (
            <div className="desire-trail-empty">还没有足迹——第一次碰它，留一句话吧。</div>
          ) : (
            <div className="desire-trail-list">
              {trail.map((t, i) => (
                <div key={t.id || i} className="desire-trail-step">
                  <span className="desire-trail-num">{i + 1}.</span>
                  <span className="desire-trail-note">{t.note}</span>
                  <span className="desire-trail-ts">{fmtTime(t.created_at)}</span>
                </div>
              ))}
            </div>
          )}
          {d.status === 'active' && (
            <div className="desire-row-actions">
              {acting ? (
                <div className="desire-act-box">
                  <textarea
                    className="desire-act-text"
                    placeholder="一句足迹：做到哪了"
                    value={actNote}
                    onChange={e => setActNote(e.target.value)}
                    autoFocus
                    rows={2}
                  />
                  <div className="desire-act-btns">
                    <button className="desire-btn" onClick={onActSave} disabled={!actNote.trim()}>留足迹</button>
                    <button className="desire-btn desire-btn--ghost" onClick={onActCancel}>取消</button>
                  </div>
                </div>
              ) : (
                <>
                  <button className="desire-mini-btn" onClick={onAct}>留足迹</button>
                  <button className="desire-mini-btn desire-mini-btn--done" onClick={onDone}>真做完了</button>
                  <button className="desire-mini-btn desire-mini-btn--ghost" onClick={onRelease}>放下</button>
                  <button className="desire-mini-btn desire-mini-btn--danger" onClick={onDelete}>删</button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
