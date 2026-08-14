import { useState, useEffect, useMemo } from 'react'
import JournalPaper from './JournalPaper'
import './JournalBook.css'

const API_BASE = 'https://my-ai-chat-4zy.pages.dev'

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

/* 星期中文简称 */
function getDow(dateStr) {
  try {
    const d = new Date(dateStr + 'T00:00:00')
    return WEEKDAYS[d.getDay() === 0 ? 6 : d.getDay() - 1]
  } catch { return '' }
}

/* Adapter：把现有 notes 转成手账数据（不碰后端、不改状态语义）
   - 仅「已收下(saved)」进手账；待处理留桌面、飘走不进
   - 按年月归档 → 月份列表；每月内按日期 → 时间轴 */
function buildJournal(notes) {
  const kept = notes.filter(n => n.status === 'saved')
  const map = {}
  for (const n of kept) {
    const m = (n.date || '').slice(0, 7)
    if (!m) continue
    if (!map[m]) map[m] = []
    const d = n.date
    let g = map[m].find(x => x.date === d)
    if (!g) { g = { date: d, notes: [] }; map[m].push(g) }
    g.notes.push(n)
  }
  const months = Object.keys(map).sort().reverse().map(m => {
    const [y, mo] = m.split('-')
    const days = map[m].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    return {
      key: m,
      label: `${y} · ${mo}`,
      year: y,
      month: mo,
      count: days.reduce((s, d) => s + d.notes.length, 0),
      days,
    }
  })
  return months
}

/* 单条摘要：去空白、截断 60 字 */
function makePreview(content) {
  return (content || '').replace(/\s+/g, ' ').trim().slice(0, 60)
}

export default function JournalBook({ onClose }) {
  const [view, setView] = useState('cover')   // cover | month | day
  const [selMonth, setSelMonth] = useState(null)
  const [selDate, setSelDate] = useState(null)
  const [notes, setNotes] = useState([])

  const refresh = () =>
    fetch(`${API_BASE}/api/notes`)
      .then(r => r.json())
      .then(d => setNotes(d.notes || []))
      .catch(() => {})

  useEffect(() => { refresh() }, [])

  const months = useMemo(() => buildJournal(notes), [notes])
  const totalKept = useMemo(
    () => months.reduce((s, m) => s + m.count, 0),
    [months]
  )

  const goMonth = (m) => { setSelMonth(m); setView('month') }
  const goDay = (d) => { setSelDate(d); setView('day') }
  const goCover = () => { setView('cover'); setSelMonth(null); setSelDate(null) }
  const goBackFromMonth = () => goCover()
  const goBackFromDay = () => { setView('month'); setSelDate(null) }

  /* ====== 封面：书封 + 月份入口 ====== */
  if (view === 'cover') {
    return (
      <div className="note-mask" onClick={onClose}>
        <div className="journal-book-page" onClick={e => e.stopPropagation()} style={{ background: 'var(--journal-bg)' }}>
          <header className="journal-header">
            <button className="journal-back" onClick={onClose} aria-label="返回">‹</button>
            <h1>我们的手账</h1>
            <button className="journal-more">···</button>
          </header>

          <section className="journal-cover">
            <div className="journal-tape" />
            <div className="journal-binding"><span /><span /><span /></div>
            <div className="journal-cover-inner">
              <p className="journal-kicker">OUR LITTLE JOURNAL</p>
              <h2>我们的手账</h2>
              <div className="journal-line" />
              <p className="journal-year">2026</p>
              <p className="journal-names">泠泠 × 钟泽</p>
            </div>
          </section>

          {totalKept > 0 && (
            <div className="journal-hint">已经收好了 {totalKept} 张小记</div>
          )}

          {months.length === 0 ? (
            <div className="journal-cover__empty">
              手账还是空的。<br />
              等你们开始收下纸条，<br />
              就会在这里慢慢攒成一本。
            </div>
          ) : (
            <section className="journal-months">
              {months.map(m => (
                <button key={m.key} className="journal-month" onClick={() => goMonth(m)}>
                  <div>
                    <strong>{m.label}</strong>
                    <span>本月 {m.count} 张小记</span>
                  </div>
                  <span className="journal-arrow">›</span>
                </button>
              ))}
            </section>
          )}
        </div>
      </div>
    )
  }

  /* ====== 月份：时间轴（日期摘要） ====== */
  if (view === 'month' && selMonth) {
    const days = selMonth.days
    return (
      <div className="note-mask" onClick={onClose}>
        <div className="journal-timeline-page" onClick={e => e.stopPropagation()} style={{ background: 'var(--journal-bg)' }}>
          <header className="journal-header">
            <button className="journal-back" onClick={goBackFromMonth}>‹</button>
            <div className="journal-month-title">
              <span>{selMonth.year}</span>
              <strong>{selMonth.month} 月</strong>
            </div>
            <button className="journal-more">···</button>
          </header>

          <div className="journal-timeline">
            {days.map(day => {
              const first = day.notes[0]
              const rest = day.notes.length - 1
              return (
                <article
                  key={day.date}
                  className="journal-entry"
                  onClick={() => goDay(day.date)}
                >
                  <div className="journal-date">
                    <strong>{(day.date || '').slice(8, 10)}</strong>
                    <span>{getDow(day.date)}</span>
                  </div>
                  <div className="journal-dot" />
                  <div className="journal-entry-content">
                    <div className="journal-entry-meta">
                      {first.source === 'user' ? '泠泠写的' : '钟泽留的'}
                    </div>
                    <p>{makePreview(first.content)}</p>
                    {rest > 0 && (
                      <span style={{ fontSize: 10, color: 'var(--journal-faint)', fontStyle: 'italic' }}>
                        还有 {rest} 张纸条
                      </span>
                    )}
                    <span className="journal-entry-arrow">›</span>
                  </div>
                </article>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  /* ====== 日期：完整纸张 ====== */
  if (view === 'day' && selMonth && selDate) {
    const dayData = selMonth.days.find(d => d.date === selDate)
    const dayNotes = dayData ? dayData.notes : []
    return (
      <div className="note-mask" onClick={onClose}>
        <div className="journal-book-page" onClick={e => e.stopPropagation()} style={{ background: 'var(--journal-bg)' }}>
          <header className="journal-header">
            <button className="journal-back" onClick={goBackFromDay}>‹</button>
            <h1>{selDate}</h1>
            <button className="journal-more">···</button>
          </header>

          {dayNotes.length === 0 ? (
            <div className="journal-cover__empty">这一天还没有纸条。</div>
          ) : (
            <div className="journal-papers-stack">
              {dayNotes.map((n, i) => (
                <JournalPaper
                  key={n.id}
                  date={n.date}
                  title={i === 0 ? '今天的小记' : `纸条 ${i + 1}`}
                  signature={`—— ${n.source === 'user' ? '泠泠' : '钟泽'}`}
                  paper="inner"
                  mode="full"
                >
                  {n.content}
                </JournalPaper>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  return null
}
