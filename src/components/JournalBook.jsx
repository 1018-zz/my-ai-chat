import { useState, useEffect, useMemo } from 'react'
import JournalPaper from './JournalPaper'
import './JournalBook.css'

const API_BASE = 'https://my-ai-chat-4zy.pages.dev'

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']
const MONTHS = ['01','02','03','04','05','06','07','08','09','10','11','12']

/* 把 notes[] 按年月归档 → { "2026-08": [{ date:"2026-08-15", notes:[...] }] } */
function archiveByMonth(notes) {
  const map = {}
  for (const n of notes) {
    const m = (n.date || '').slice(0, 7) // "2026-08"
    if (!m) continue
    if (!map[m]) map[m] = []
    // 按日期再分组
    const d = n.date
    let dayGroup = map[m].find(g => g.date === d)
    if (!dayGroup) {
      dayGroup = { date: d, notes: [] }
      map[m].push(dayGroup)
    }
    dayGroup.notes.push(n)
  }
  // 每月内按日期倒序（最近在前）
  for (const m of Object.keys(map)) {
    map[m].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  }
  return map
}

/* 从日期取星期几中文简称 */
function getDow(dateStr) {
  try {
    const d = new Date(dateStr + 'T00:00:00')
    return WEEKDAYS[d.getDay() === 0 ? 6 : d.getDay() - 1]
  } catch { return '' }
}

/* 月份标签：2026·08 → "8月" */
function monthLabel(yMo) {
  const [, m] = yMo.split('-')
  return `${parseInt(m, 10)} 月`
}

export default function JournalBook({ onClose }) {
  /* 视图层级：'cover' | 'month'(+selectedMonth) | 'day'(+selectedDate) */
  const [view, setView] = useState('cover')
  const [selMonth, setSelMonth] = useState(null)   // e.g. "2026-08"
  const [selDate, setSelDate] = useState(null)     // e.g. "2026-08-15"
  const [notes, setNotes] = useState([])

  const refresh = () =>
    fetch(`${API_BASE}/api/notes`)
      .then(r => r.json())
      .then(d => setNotes(d.notes || []))
      .catch(() => {})

  useEffect(() => { refresh() }, [])

  /* 归档数据 */
  const archive = useMemo(() => archiveByMonth(notes), [notes])

  /* 月份列表（倒序，最近在前） */
  const months = useMemo(
    () => Object.keys(archive).sort().reverse(),
    [archive]
  )

  /* ====== 导航动作 ====== */
  const goMonth = (m) => { setSelMonth(m); setView('month') }
  const goDay = (d) => { setSelDate(d); setView('day') }
  const goCover = () => { setView('cover'); setSelMonth(null); setSelDate(null) }
  const goBackFromMonth = () => goCover()
  const goBackFromDay = () => { setView('month'); setSelDate(null) }

  /* ====== 渲染：封面（月份入口） ====== */
  if (view === 'cover') {
    return (
      <div className="note-mask" onClick={onClose}>
        <div className="journal-book journal-cover" onClick={e => e.stopPropagation()}>
          <div className="journal-cover__tape" />

          <div className="journal-cover__header">
            <div className="journal-cover__title">我们的手账</div>
            <div className="journal-cover__subtitle">小记 × 钟泽</div>
          </div>

          {months.length === 0 ? (
            <div className="journal-cover__empty">
              手账还是空的。<br />
              等你们开始留下纸条，<br />
              就会在这里慢慢攒成一本。
            </div>
          ) : (
            <div className="journal-months">
              {months.map(m => {
                const days = archive[m]
                const totalNotes = days.reduce((s, d) => s + d.notes.length, 0)
                return (
                  <button
                    key={m}
                    className="journal-month-card"
                    onClick={() => goMonth(m)}
                  >
                    <span className="journal-month-card__label">
                      <span className="journal-month-card__yearmo">{m.replace('-', ' · ')}</span>
                      <span className="journal-month-card__count">本月 {totalNotes} 张小记</span>
                    </span>
                    <span className="journal-month-card__arrow">›</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    )
  }

  /* ====== 渲染：月份时间轴 ====== */
  if (view === 'month' && selMonth && archive[selMonth]) {
    const days = archive[selMonth]

    return (
      <div className="note-mask" onClick={onClose}>
        <div className="journal-book journal-timeline" onClick={e => e.stopPropagation()}>
          <div className="journal-timeline__header">
            <span className="journal-timeline__month-label">{selMonth.replace('-', ' · ')}</span>
            <button className="journal-timeline__back" onClick={goBackFromMonth}>‹ 封面</button>
          </div>

          {/* 星期头 */}
          <div className="journal-timeline__weekdays">
            {WEEKDAYS.map(w => <span key={w} className="journal-timeline__weekday">{w}</span>)}
          </div>

          {/* 日期列表 */}
          <div className="journal-day-list">
            {days.map(day => {
              const first = day.notes[0]
              const restCount = day.notes.length - 1
              const preview = (first.content || '').slice(0, 60)

              return (
                <button
                  key={day.date}
                  className="journal-day-item"
                  onClick={() => goDay(day.date)}
                >
                  {/* 日期 */}
                  <div className="journal-day-item__date">
                    <span className="journal-day-item__num">{(day.date || '').slice(8, 10)}</span>
                    <span className="journal-day-item__dow">{getDow(day.date)}</span>
                  </div>

                  {/* 摘要 */}
                  <div className="journal-day-item__body">
                    <span className="journal-day-item__tag">
                      {first.source === 'user' ? '你写的' : '钟泽留的'}
                    </span>
                    <span className="journal-day-item__preview">{preview}</span>
                    <span className="journal-day-item__signature">
                      —— {first.source === 'user' ? '泠泠' : '钟泽'}
                    </span>
                    {restCount > 0 && (
                      <span className="journal-day-item__more">还有 {restCount} 张纸条</span>
                    )}
                  </div>

                  {/* 箭头 */}
                  <span className="journal-day-item__arrow">›</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  /* ====== 渲染：日期详情（完整纸张） ====== */
  if (view === 'day' && selMonth && selDate) {
    const days = archive[selMonth] || []
    const dayData = days.find(d => d.date === selDate)
    const dayNotes = dayData ? dayData.notes : []

    return (
      <div className="note-mask" onClick={onClose}>
        <div className="journal-book journal-day-detail" onClick={e => e.stopPropagation()}>
          <button className="journal-day-detail__back" onClick={goBackFromDay}>‹ 返回 {selMonth.slice(5,7)} 月</button>

          {dayNotes.length === 0 ? (
            <div style={{ color: 'var(--ink-faint)', fontSize: 13, textAlign: 'center', padding: '30px 0' }}>
              这一天还没有纸条。
            </div>
          ) : (
            <div className="journal-papers-stack">
              {dayNotes.map((n, i) => {
                const isLatest = i === 0
                return (
                  <JournalPaper
                    key={n.id}
                    date={n.date}
                    title={isLatest ? '今天的小记' : `纸条 ${i + 1}`}
                    signature={`—— ${n.source === 'user' ? '泠泠' : '钟泽'}`}
                    variant="inner"
                  >
                    {n.content}
                  </JournalPaper>
                )
              })}
            </div>
          )}
        </div>
      </div>
    )
  }

  return null
}
