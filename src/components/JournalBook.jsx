import { useState, useEffect, useMemo, useRef } from 'react'
import JournalPaper from './JournalPaper'
import './JournalBook.css'

const API_BASE = 'https://my-ai-chat-4zy.pages.dev'

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

const fmtDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function getDow(dateStr) {
  try {
    const d = new Date(dateStr + 'T00:00:00')
    return WEEKDAYS[d.getDay() === 0 ? 6 : d.getDay() - 1]
  } catch {
    return ''
  }
}

/* Adapter：只把 saved 纸条整理成手账结构 */
function buildJournal(notes) {
  const kept = notes.filter(n => n.status === 'saved')
  const map = {}

  for (const n of kept) {
    const m = (n.date || '').slice(0, 7)
    if (!m) continue

    if (!map[m]) map[m] = []

    const d = n.date
    let g = map[m].find(x => x.date === d)

    if (!g) {
      g = { date: d, notes: [] }
      map[m].push(g)
    }

    g.notes.push(n)
  }

  const months = Object.keys(map)
    .sort()
    .reverse()
    .map(m => {
      const [y, mo] = m.split('-')

      const days = map[m].sort((a, b) =>
        (b.date || '').localeCompare(a.date || '')
      )

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

function makePreview(content) {
  return (content || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
}

export default function JournalBook({ onClose, initialView = 'cover' }) {
  const [view, setView] = useState('cover')
  const [selMonth, setSelMonth] = useState(null)
  const [selDate, setSelDate] = useState(null)

  const [notes, setNotes] = useState([])

  /*
   * 页面方向：
   * forward = 往手账里面翻
   * back = 往外翻
   */
  const [pageDirection, setPageDirection] = useState('forward')
  const [pageKey, setPageKey] = useState(0)
  const [showMenu, setShowMenu] = useState(false)
  const didInitToday = useRef(false)

  const refresh = () =>
    fetch(`${API_BASE}/api/notes`)
      .then(r => r.json())
      .then(d => setNotes(d.notes || []))
      .catch(() => {})

  useEffect(() => {
    refresh()
  }, [])

  /* 月份归档：必须早于下方 initialView effect —— 否则 effect 依赖数组读取 months 会触发 TDZ（Cannot access 'months' before initialization） */
  const months = useMemo(
    () => buildJournal(notes),
    [notes]
  )

  /* initialView === 'today'：数据加载后自动导航到今日（只跳一次，绝不卡死） */
  useEffect(() => {
    if (initialView !== 'today') return
    if (didInitToday.current) return
    if (notes.length === 0) return

    didInitToday.current = true

    const today = fmtDate(new Date())
    const kept = notes.filter(n => n.status === 'saved')

    /* 找今天是否有已收下的纸条 */
    const todayNote = kept.find(n => (n.date || '').slice(0, 10) === today)

    if (todayNote) {
      /* 有 → 直达今日日期页 */
      const m = (todayNote.date || '').slice(0, 7)
      const monthData = months.find(x => x.key === m)
      if (monthData) {
        setSelMonth(monthData)
        setSelDate(today)
        changePage('day', 'forward')
        return
      }
    }

    /* 没有 → 留在封面（空手账或今天没写），不卡 loading */
  }, [notes, months, initialView])

  /* Drawer 打开时锁底层滚动 */
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  const totalKept = useMemo(
    () => months.reduce((s, m) => s + m.count, 0),
    [months]
  )

  /*
   * 每次换页都重新生成 animation key。
   * 不改业务状态，只负责视觉。
   */
  const changePage = (nextView, direction = 'forward') => {
    setPageDirection(direction)
    setPageKey(k => k + 1)
    setView(nextView)
  }

  const goMonth = (m) => {
    setSelMonth(m)
    changePage('month', 'forward')
  }

  const goDay = (d) => {
    setSelDate(d)
    changePage('day', 'forward')
  }

  const goCover = () => {
    setSelMonth(null)
    setSelDate(null)
    changePage('cover', 'back')
  }

  const goBackFromMonth = () => {
    goCover()
  }

  const goBackFromDay = () => {
    setSelDate(null)
    changePage('month', 'back')
  }

  /* 菜单操作 */
  const unsaveDay = async () => {
    if (!selDate) return
    const dayData = selMonth?.days.find(d => d.date === selDate)
    if (!dayData) return
    for (const n of dayData.notes) {
      if (n.status === 'saved') {
        await fetch(`${API_BASE}/api/notes`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: n.id, status: 'pending' })
        }).catch(() => {})
      }
    }
    setShowMenu(false)
    refresh()
  }

  /* 彻底删除（物理删除，不可恢复）：删除当天所有纸条 */
  const deleteDay = async () => {
    if (!selDate) return
    const dayData = selMonth?.days.find(d => d.date === selDate)
    if (!dayData) return
    for (const n of dayData.notes) {
      await fetch(`${API_BASE}/api/notes?id=${n.id}`, { method: 'DELETE' }).catch(() => {})
    }
    setShowMenu(false)
    refresh()
  }

  const closeMenu = () => setShowMenu(false)

  /* ====== 封面 ====== */
  if (view === 'cover') {
    return (
      <div className="note-mask note-mask--journal" onClick={onClose}>
        <div
          className={`journal-book-page journal-view journal-view--${pageDirection}`}
          key={pageKey}
          onClick={e => e.stopPropagation()}
          style={{ background: 'var(--journal-bg)' }}
        >
          <header className="journal-header">
            <button
              className="journal-back"
              onClick={onClose}
              aria-label="返回"
              type="button"
            >
              ‹
            </button>

            <h1>我们的手账</h1>

            <button
              className="journal-more"
              aria-label="更多"
              type="button"
            >
              ···
            </button>
          </header>

          <section className="journal-cover">
            <div className="journal-tape" />

            <div
              className="journal-binding"
              aria-hidden="true"
            >
              <span />
              <span />
              <span />
            </div>

            <div className="journal-cover-inner">
              <p className="journal-kicker">
                OUR LITTLE JOURNAL
              </p>

              <h2>我们的手账</h2>

              <div className="journal-line" />

              <p className="journal-year">2026</p>

              <p className="journal-names">
                泠泠 × 钟泽
              </p>
            </div>
          </section>

          {totalKept > 0 && (
            <div className="journal-hint">
              已经收好了 {totalKept} 张小记
            </div>
          )}

          {months.length === 0 ? (
            <div className="journal-cover__empty">
              <div className="journal-empty-mark" aria-hidden="true">
                ✦
              </div>

              <p>
                手账还是空的。
                <br />
                等你们开始收下纸条，
                <br />
                就会在这里慢慢攒成一本。
              </p>
            </div>
          ) : (
            <section className="journal-months">
              {months.map(m => (
                <button
                  key={m.key}
                  className="journal-month"
                  onClick={() => goMonth(m)}
                  type="button"
                >
                  <div>
                    <strong>{m.label}</strong>
                    <span>
                      本月 {m.count} 张小记
                    </span>
                  </div>

                  <span className="journal-arrow">
                    ›
                  </span>
                </button>
              ))}
            </section>
          )}
        </div>
      </div>
    )
  }

  /* ====== 月份：时间轴 ====== */
  if (view === 'month' && selMonth) {
    const days = selMonth.days

    return (
      <div className="note-mask note-mask--journal" onClick={onClose}>
        <div
          className={`journal-timeline-page journal-view journal-view--${pageDirection}`}
          key={pageKey}
          onClick={e => e.stopPropagation()}
          style={{ background: 'var(--journal-bg)' }}
        >
          <header className="journal-header">
            <button
              className="journal-back"
              onClick={goBackFromMonth}
              aria-label="返回"
              type="button"
            >
              ‹
            </button>

            <div className="journal-month-title">
              <span>{selMonth.year}</span>
              <strong>{selMonth.month} 月</strong>
            </div>

            <button
              className="journal-more"
              aria-label="更多"
              type="button"
            >
              ···
            </button>
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
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      goDay(day.date)
                    }
                  }}
                >
                  <div className="journal-date">
                    <strong>
                      {(day.date || '').slice(8, 10)}
                    </strong>

                    <span>
                      {getDow(day.date)}
                    </span>
                  </div>

                  <div className="journal-dot" />

                  <div className="journal-entry-content">
                    <div className="journal-entry-meta">
                      {first.source === 'user'
                        ? '泠泠写的'
                        : '钟泽留的'}
                    </div>

                    <p>
                      {makePreview(first.content)}
                    </p>

                    {rest > 0 && (
                      <span className="journal-entry-count">
                        还有 {rest} 张纸条
                      </span>
                    )}

                    <span className="journal-entry-arrow">
                      ›
                    </span>
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
    const dayData = selMonth.days.find(
      d => d.date === selDate
    )

    const dayNotes = dayData
      ? dayData.notes
      : []

    return (
      <div className="note-mask note-mask--journal" onClick={onClose}>
        <div
          className={`journal-book-page journal-view journal-view--${pageDirection}`}
          key={pageKey}
          onClick={e => { e.stopPropagation(); if (showMenu) setShowMenu(false) }}
          style={{ background: 'var(--journal-bg)' }}
        >
          <header className="journal-header">
            <button
              className="journal-back"
              onClick={goBackFromDay}
              aria-label="返回"
              type="button"
            >
              ‹
            </button>

            <h1>{selDate}</h1>

            <button
              className="journal-more"
              aria-label="更多"
              type="button"
              onClick={(e) => { e.stopPropagation(); setShowMenu(s => !s) }}
            >
              ···
            </button>
          </header>

          {showMenu && (
            <div className="journal-menu" onClick={e => e.stopPropagation()}>
              {dayNotes.some(n => n.status === 'saved') && (
                <button className="journal-menu__item" onClick={unsaveDay} type="button">
                  移出收藏夹
                </button>
              )}
              {dayNotes.length > 0 && (
                <button
                  className="journal-menu__item journal-menu__item--danger"
                  onClick={() => {
                    if (window.confirm('确定彻底删除这一天的全部纸条？此操作不可恢复。')) {
                      deleteDay()
                    }
                  }}
                  type="button"
                >
                  彻底删除
                </button>
              )}
              <button className="journal-menu__item" onClick={closeMenu} type="button">
                取消
              </button>
            </div>
          )}

          {dayNotes.length === 0 ? (
            <div className="journal-cover__empty">
              这一天还没有纸条。
            </div>
          ) : (
            <div className="journal-papers-stack">
              {dayNotes.map((n, i) => (
                <JournalPaper
                  key={n.id}
                  date={n.date}
                  title={
                    i === 0
                      ? '今天的小记'
                      : `纸条 ${i + 1}`
                  }
                  signature={`—— ${
                    n.source === 'user'
                      ? '泠泠'
                      : '钟泽'
                  }`}
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
