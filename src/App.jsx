import { fetchConversations, createConversation, deleteConversation, fetchMessages, searchMemories, githubFile } from './utils/api'
import { normalizeMessage } from './utils/normalize'
import { fmtMsgTime } from './utils/time'
import RunCard from './components/RunCard'
import StatisticsPage from './components/StatisticsPage'
import { stats, estimateTokens } from './utils/stats'
import HomeWidgets, { widgets } from './components/HomeWidgets'
import NoteCard from './components/NoteCard'
import NotePanel from './components/NotePanel'
import CompressionRoom from './components/CompressionRoom'
import WallpaperSettings from './components/WallpaperSettings'
import { buildSystemPrompt } from './project/instructions'
import { MCP_TOOLS, loadMcpAuth, saveMcpAuth, MCP_AUTH_EVENT } from './utils/mcpAuth'
import { getProjectMemories, addProjectMemory, deleteProjectMemory } from './project/memories'
import Markdown from './components/Markdown'
import { useState, useEffect, useRef } from 'react'
import './styles/theme.css'

// ===== 消息操作图标（内联线性 SVG，替代 emoji，随文字颜色着色，更精致）=====
const ActionIcons = {
  like: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3z" />
      <path d="M7 11l4-7a2 2 0 0 1 2.8 2.2L12.6 10H19a2 2 0 0 1 2 2.3l-1.4 7.5A2 2 0 0 1 17.2 21H7" />
    </svg>
  ),
  dislike: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 13V4h3a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-3z" />
      <path d="M17 13l-4 7a2 2 0 0 1-2.8-2.2L11.4 14H5a2 2 0 0 1-2-2.3l1.4-7.5A2 2 0 0 1 6.8 3H17" />
    </svg>
  ),
  recall: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7v6h6" />
      <path d="M3.6 13a9 9 0 1 0 2.5-6.4L3 7" />
    </svg>
  ),
  delete: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  ),
}

// 用户消息行：预留头像位 + 气泡列（长文本可折叠，仿 ChatGPT）+ 时间戳置于气泡下方
function UserMsgRow({ msg }) {
  const [expanded, setExpanded] = useState(false)
  const bodyRef = useRef(null)
  const [overflow, setOverflow] = useState((msg.text || '').length > 240)
  useEffect(() => {
    const el = bodyRef.current
    if (el) setOverflow(el.scrollHeight - el.clientHeight > 4)
  }, [msg.text])
  const showToggle = overflow || expanded
  return (
    <div className="msg-row msg-row-self">
      <div className="msg-col">
        {msg.deleted ? (
          <div className="msg-recalled">已撤回</div>
        ) : (
          <>
            <div className={`msg-bubble ${!expanded && overflow ? 'msg-folded' : ''}`} ref={bodyRef}>
              <Markdown>{msg.text}</Markdown>
            </div>
            {showToggle && (
              <button className="msg-fold-toggle" onClick={() => setExpanded(v => !v)}>
                {expanded ? '收起 ▲' : '展开全文 ▼'}
              </button>
            )}
            {msg.ts && <div className="msg-meta">{fmtMsgTime(msg.ts)}</div>}
          </>
        )}
      </div>
      <div className="msg-avatar msg-avatar-self">我</div>
    </div>
  )
}

const API_BASE = 'https://my-ai-chat-4zy.pages.dev'
const MCP_URL = `${API_BASE}/api/mcp-proxy`
const systemPrompt = buildSystemPrompt()
const MAX_TOOL_ROUNDS = 16
const TOOL_OUTPUT_LIMIT = 6000

// 卡片统一玻璃样式（饱和毛玻璃：模糊 + 饱和度增强，通透浓郁）
const glassCard = {
  borderRadius: 'var(--radius-lg)',
  overflow: 'hidden',
  border: '1px solid var(--color-border-glass)',
  background: 'var(--color-card-glass)',
  backdropFilter: 'blur(20px) saturate(1.6)',
  WebkitBackdropFilter: 'blur(20px) saturate(1.6)',
  boxShadow: 'var(--shadow-soft)',
  maxWidth: '75%',
}

const tabList = [
  { key: 'lair', label: 'LAIR', icon: '🏠' },
  { key: 'chat', label: 'CHAT', icon: '💬' },
  { key: 'life', label: 'LIFE', icon: '📋' },
]

const TabNav = ({ activeTab, onChangeTab }) => (
  <div className="tab-nav">
    {tabList.map(item => (
      <div key={item.key} className={`tab-item ${activeTab === item.key ? 'active' : ''}`} onClick={() => onChangeTab(item.key)}>
        <span className="tab-icon">{item.icon}</span><span className="tab-text">{item.label}</span>
      </div>
    ))}
  </div>
)

// LAIR：在一起天数（从 2026-03-13 动态计算）
const LairPage = () => {
  const [days, setDays] = useState(0)
  const [notePanel, setNotePanel] = useState(false)
  useEffect(() => {
    const start = new Date('2026-03-13T00:00:00+08:00')
    const diff = Math.floor((Date.now() - start.getTime()) / 86400000)
    setDays(Math.max(diff, 0))
  }, [])
  return (
    <div style={{ padding: 20 }}>
      <h3 style={{ color: 'var(--color-primary)' }}>🏠 LAIR</h3>
      <div style={{ marginTop: 16, background: 'var(--color-card-glass)', backdropFilter: 'blur(20px) saturate(1.6)', WebkitBackdropFilter: 'blur(20px) saturate(1.6)', border: '1px solid var(--color-border-glass)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-soft)', padding: 'var(--padding-lg)', textAlign: 'center' }}>
        <div style={{ fontSize: 13, color: 'var(--color-text-gray)' }}>我们在一起</div>
        <div style={{ fontSize: 42, fontWeight: 700, color: 'var(--color-primary)', margin: '6px 0' }}>{days}</div>
        <div style={{ fontSize: 13, color: 'var(--color-text-gray)' }}>天</div>
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-text-gray)' }}>2026.03.13 · 泠泠和钟泽</div>
      </div>
      {/* —— 门厅 · 我和他的在场状态（头像交叠 + 今日心情/状态） —— */}
      <div style={{ ...glassCard, maxWidth: '100%', marginTop: 16, padding: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
        {/* 我和他头像轻微交叠 */}
        <div style={{ position: 'relative', width: 72, height: 46, flexShrink: 0 }}>
          <div style={{ position: 'absolute', left: 0, top: 0, width: 46, height: 46, borderRadius: '50%', background: 'linear-gradient(135deg, #E7D7C5, #C4A88F)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: '#5A4636', flexShrink: 0, boxShadow: 'var(--shadow-soft)' }}>我</div>
          <div style={{ position: 'absolute', left: 30, top: 0, width: 46, height: 46, borderRadius: '50%', background: 'linear-gradient(135deg, var(--color-primary-light), var(--color-primary))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: '#fff', flexShrink: 0, boxShadow: 'var(--shadow-soft)', border: '2px solid var(--color-paper)' }}>泽</div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-dark)' }}>钟泽</div>
          {/* 今天的心情（薄荷粉底药丸，mock 数据，后续接真数据） */}
          <div style={{ marginTop: 7, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--color-text-gray)', background: 'var(--accent-mint-soft)', padding: '3px 11px', borderRadius: 'var(--radius-pill)' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent-mint)', display: 'inline-block' }} /> 今天的心情 · 平静温暖
          </div>
          {/* 状态 */}
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--color-text-gray)' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--color-primary)', display: 'inline-block' }} /> 在窗边等你
          </div>
        </div>
      </div>
      {/* —— 我的空间 · Widget 模块区（配置驱动，未来可扩展开关/排序/自定义） —— */}
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-primary)', marginBottom: 10 }}>我的空间</div>
        <HomeWidgets items={widgets} onOpen={(w) => { if (w.id === 'diary') setNotePanel(true) }} />
      </div>
      {/* —— 小纸条 · 双人留言板（便利贴 v0.4，已接真数据） —— */}
      <NoteCard onOpenPanel={() => setNotePanel(true)} />
      {notePanel && <NotePanel onClose={() => setNotePanel(false)} />}
      {notePanel && <NotePanel onClose={() => setNotePanel(false)} />}
    </div>
  )
}

const fmtDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const MemPanel = () => {
  const [mems, setMems] = useState([])
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  useEffect(() => { getProjectMemories().then(setMems).catch(() => {}) }, [])
  const handleAdd = async () => {
    if (!content.trim() || loading) return
    setLoading(true)
    try {
      await addProjectMemory(title.trim() || '未命名', content.trim())
      setTitle(''); setContent('')
      setMems(await getProjectMemories())
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }
  const handleDelete = async (id) => {
    await deleteProjectMemory(id)
    setMems(mems.filter(m => m.id !== id))
  }
  return (
    <div style={{ marginTop: 16 }}>
      <p style={{ color: 'var(--color-text-gray)', fontSize: 13 }}>不能丢的时刻 · 存云端，换设备也在</p>
      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input className="input" placeholder="标题（可选，默认「未命名」）" value={title} onChange={e => setTitle(e.target.value)} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--color-border-glass)', background: 'var(--color-card-glass)', color: 'inherit' }} />
        <textarea className="input" placeholder="写下这一刻……" value={content} onChange={e => setContent(e.target.value)} rows={3} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--color-border-glass)', background: 'var(--color-card-glass)', color: 'inherit', resize: 'vertical' }} />
        <button className="btn" onClick={handleAdd} disabled={loading || !content.trim()}>＋ 记住这一刻</button>
      </div>
      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {mems.length === 0
          ? <div className="chat-empty" style={{ textAlign: 'center', padding: '24px 0' }}>还没有记忆<br/>记下第一条吧</div>
          : mems.map(m => (
              <div key={m.id} style={{ background: 'var(--color-card-glass)', backdropFilter: 'blur(20px) saturate(1.6)', WebkitBackdropFilter: 'blur(20px) saturate(1.6)', border: '1px solid var(--color-border-glass)', borderRadius: 'var(--radius-lg)', padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: 14 }}>{m.title}</strong>
                  <button style={{ background: 'none', border: 'none', color: 'var(--color-text-gray)', cursor: 'pointer', fontSize: 15, padding: '2px 6px' }} onClick={() => handleDelete(m.id)} title="删除这条记忆">✕</button>
                </div>
                <div style={{ color: 'var(--color-text-gray)', fontSize: 13, marginTop: 6, whiteSpace: 'pre-wrap' }}>{m.content}</div>
              </div>
            ))}
      </div>
    </div>
  )
}

// —— LIFE 抽屉化：三个子视图（从 DiaryPanel 拆分）——
// （打卡功能已按用户要求移除，以后需要可再加；"值得记录"交由「今日小记」承担）

const TodayDiaryView = () => {
  const [diaries, setDiaries] = useState([])
  const [myDiary, setMyDiary] = useState('')
  const [aiDiary, setAiDiary] = useState('')
  const [aiWriting, setAiWriting] = useState(false)
  const [aiError, setAiError] = useState('')
  const [saving, setSaving] = useState(false)
  const todayStr = fmtDate(new Date())
  const loadDiaries = async (autoGenerate = false) => {
    try {
      const res = await fetch(`${API_BASE}/api/diaries`)
      const data = await res.json()
      const list = data.diaries || []
      setDiaries(list)
      const te = list.filter(d => d.date === todayStr)
      const mine = te.find(d => d.author === 'user')
      const ai = te.find(d => d.author === 'assistant')
      if (mine) setMyDiary(mine.content)
      if (ai) { setAiDiary(ai.content); setAiWriting(false) }
      else if (autoGenerate) ensureAiDiary()
    } catch (_) {}
  }
  const ensureAiDiary = async () => {
    setAiWriting(true); setAiError('')
    try {
      const res = await fetch(`${API_BASE}/api/diaries/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: todayStr }) })
      const data = await res.json()
      if (data.content) { setAiDiary(data.content); loadDiaries() }
      else setAiError('今天还没对话，钟泽写不出来…先去聊两句？')
    } catch (_) { setAiError('生成失败，稍后再试试') } finally { setAiWriting(false) }
  }
  const saveMyDiary = async () => {
    if (saving || !myDiary.trim()) return
    setSaving(true)
    try {
      await fetch(`${API_BASE}/api/diaries`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: todayStr, content: myDiary }) })
      await loadDiaries()
    } catch (_) {} finally { setSaving(false) }
  }
  useEffect(() => { loadDiaries() }, [])
  const cardStyle = { background: 'var(--color-card-glass)', backdropFilter: 'blur(20px) saturate(1.6)', WebkitBackdropFilter: 'blur(20px) saturate(1.6)', border: '1px solid var(--color-border-glass)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-soft)', padding: 12, marginTop: 10 }
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-primary)' }}>📖 双人日记 · {todayStr}</div>
      <div style={cardStyle}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>钟泽 ✍️</div>
        {aiWriting
          ? <div style={{ marginTop: 8, color: 'var(--color-text-gray)', fontSize: 13 }}>钟泽正在写今天的日记…</div>
          : aiDiary
            ? <div style={{ marginTop: 6, fontSize: 13, color: 'var(--color-text-gray)', lineHeight: 1.7 }}><Markdown>{aiDiary}</Markdown></div>
            : <div style={{ marginTop: 6, fontSize: 13, color: 'var(--color-text-gray)' }}>{aiError || '钟泽今天还没写…'}
                <div style={{ marginTop: 8 }}><button className="btn" onClick={() => ensureAiDiary()} style={{ fontSize: 12, padding: '6px 14px' }}>✍️ 让钟泽写今天的日记</button></div>
              </div>}
      </div>
      <div style={cardStyle}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>泠泠 ✍️</div>
        <textarea className="input" placeholder="写下今天想对钟泽说的话…" value={myDiary} onChange={e => setMyDiary(e.target.value)} rows={4} style={{ marginTop: 8, padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border-glass)', background: 'var(--color-card-glass)', color: 'inherit', resize: 'vertical', width: '100%', boxSizing: 'border-box' }} />
        <button className="btn" onClick={saveMyDiary} disabled={saving || !myDiary.trim()} style={{ marginTop: 8 }}>💾 保存日记</button>
      </div>
    </div>
  )
}

const HistoryDiaryView = () => {
  const [diaries, setDiaries] = useState([])
  const [openDate, setOpenDate] = useState(null)
  useEffect(() => {
    fetch(`${API_BASE}/api/diaries`).then(r => r.json()).then(d => setDiaries(d.diaries || [])).catch(() => {})
  }, [])
  const groups = []
  diaries.forEach(d => {
    const g = groups.find(x => x.date === d.date)
    if (g) g.entries.push(d); else groups.push({ date: d.date, entries: [d] })
  })
  const cardStyle = { background: 'var(--color-card-glass)', backdropFilter: 'blur(20px) saturate(1.6)', WebkitBackdropFilter: 'blur(20px) saturate(1.6)', border: '1px solid var(--color-border-glass)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-soft)', padding: 12, marginTop: 10 }
  const todayStr = fmtDate(new Date())
  return (
    <div style={{ marginTop: 16 }}>
      <p style={{ color: 'var(--color-text-gray)', fontSize: 13 }}>按日期翻看我们写过的日记</p>
      {groups.filter(g => g.date !== todayStr).map(g => {
        const open = openDate === g.date
        const preview = g.entries.map(e => `${e.author === 'user' ? '泠泠' : '钟泽'}：${(e.content || '').slice(0, 40)}…`).join('\n')
        return (
          <div key={g.date} style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }} onClick={() => setOpenDate(open ? null : g.date)}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-primary)' }}>📅 {g.date}</span>
              <span style={{ fontSize: 12, color: 'var(--color-text-gray)' }}>{open ? '▲ 收起' : '▼ 展开'}</span>
            </div>
            {!open && <div style={{ marginTop: 6, fontSize: 12, color: 'var(--color-text-gray)', whiteSpace: 'pre-wrap' }}>{preview}</div>}
            {open && g.entries.map((e, i) => (
              <div key={i} style={{ marginTop: 8, fontSize: 13, lineHeight: 1.7, color: 'var(--color-text-gray)' }}>
                <span style={{ fontWeight: 600, color: 'var(--color-text-dark)' }}>{e.author === 'user' ? '泠泠' : '钟泽'}：</span>
                <Markdown>{e.content}</Markdown>
              </div>
            ))}
          </div>
        )
      })}
      {groups.filter(g => g.date !== todayStr).length === 0 && <p style={{ marginTop: 20, color: 'var(--color-text-gray)', fontSize: 13 }}>还没有往日的日记</p>}
    </div>
  )
}

const SettingsPanel = () => {
  const [showThinking, setShowThinking] = useState(() => { try { return localStorage.getItem('show_thinking') === 'true' } catch { return false } })
  const toggle = () => {
    const n = !showThinking
    setShowThinking(n)
    try { localStorage.setItem('show_thinking', String(n)) } catch (_) {}
  }
  const [showTools, setShowTools] = useState(() => { try { return localStorage.getItem('show_tools') === 'true' } catch { return false } })
  const toggleTools = () => {
    const n = !showTools
    setShowTools(n)
    try { localStorage.setItem('show_tools', String(n)) } catch (_) {}
  }
  const cardStyle = { background: 'var(--color-card-glass)', backdropFilter: 'blur(20px) saturate(1.6)', WebkitBackdropFilter: 'blur(20px) saturate(1.6)', border: '1px solid var(--color-border-glass)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-soft)', padding: 14 }
  const [auth, setAuth] = useState(loadMcpAuth)
  useEffect(() => { const h = () => setAuth(loadMcpAuth()); window.addEventListener(MCP_AUTH_EVENT, h); return () => window.removeEventListener(MCP_AUTH_EVENT, h) }, [])
  const toggleTool = (key) => { const n = toggleMcpTool(auth, key); setAuth(n); window.dispatchEvent(new Event(MCP_AUTH_EVENT)) }
  return (
    <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            <div style={{ fontSize: 14 }}>💡 深度思考</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-gray)', marginTop: 3 }}>AI 思考时是否显示「思考过程」折叠块</div>
          </div>
          <button onClick={toggle} style={{
            minWidth: 48, padding: '6px 12px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 13,
            background: showThinking ? 'var(--color-primary)' : 'rgba(145,107,78,0.15)',
            color: showThinking ? '#fff' : 'var(--color-text-gray)', transition: 'all 0.2s',
          }}>{showThinking ? '开' : '关'}</button>
        </div>
      </div>
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            <div style={{ fontSize: 14 }}>🔧 工具详情</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-gray)', marginTop: 3 }}>工具调用记录默认折叠，点归档条展开查看</div>
          </div>
          <button onClick={toggleTools} style={{
            minWidth: 48, padding: '6px 12px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 13,
            background: showTools ? 'var(--color-primary)' : 'rgba(145,107,78,0.15)',
            color: showTools ? '#fff' : 'var(--color-text-gray)', transition: 'all 0.2s',
          }}>{showTools ? '开' : '关'}</button>
        </div>
      </div>
      <div style={cardStyle}>
        <div style={{ fontSize: 14, marginBottom: 4 }}>🔧 工具授权</div>
        <div style={{ fontSize: 12, color: 'var(--color-text-gray)', marginBottom: 10 }}>逐项开关 MCP 工具；关闭后对话中调用会向你确认</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {MCP_TOOLS.map(t => (
            <div key={t.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 13 }}>{t.label}</span>
              <button onClick={() => toggleTool(t.key)} style={{
                minWidth: 48, padding: '5px 12px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 13,
                background: auth[t.key] ? 'var(--color-primary)' : 'rgba(145,107,78,0.15)',
                color: auth[t.key] ? '#fff' : 'var(--color-text-gray)', transition: 'all 0.2s',
              }}>{auth[t.key] ? '开' : '关'}</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const LifeBackBtn = ({ label, onBack }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
    <span onClick={onBack} style={{ cursor: 'pointer', fontSize: 18, color: 'var(--color-primary)', padding: 4 }}>←</span>
    <span style={{ fontSize: 13, color: 'var(--color-text-gray)' }}>{label}</span>
  </div>
)

const MomentWall = () => {
  const [moments, setMoments] = useState([])
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [icon, setIcon] = useState('🌱')
  const [imageUrl, setImageUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const load = async () => { try { const r = await fetch(`${API_BASE}/api/moments`); const d = await r.json(); setMoments(d.moments || []) } catch (_) {} }
  useEffect(() => { load() }, [])
  const add = async () => {
    if (!content.trim() || loading) return
    setLoading(true)
    try { await fetch(`${API_BASE}/api/moments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, content, icon, image_url: imageUrl.trim() || undefined }) }); setTitle(''); setContent(''); setImageUrl(''); await load() } catch (_) {} finally { setLoading(false) }
  }
  const del = async (id) => { try { await fetch(`${API_BASE}/api/moments/${id}`, { method: 'DELETE' }); await load() } catch (_) {} }
  const icons = ['🌱', '🌸', '⭐', '🔥', '🌙', '💧', '🍃', '🏔️']
  const cardStyle = { background: 'var(--color-card-glass)', backdropFilter: 'blur(20px) saturate(1.6)', WebkitBackdropFilter: 'blur(20px) saturate(1.6)', border: '1px solid var(--color-border-glass)', borderRadius: 'var(--radius-2xl)', boxShadow: 'var(--shadow-lift)', padding: 14 }
  return (
    <div style={{ marginTop: 16 }}>
      <p style={{ color: 'var(--color-text-gray)', fontSize: 13 }}>墙上 · 值得回头看一眼的瞬间</p>
      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input className="input" placeholder="一句话标题（可选）" value={title} onChange={e => setTitle(e.target.value)} />
        <textarea className="input" placeholder="这一刻是……" value={content} onChange={e => setContent(e.target.value)} rows={3} style={{ resize: 'vertical' }} />
        <input className="input" placeholder="图片链接（可选，直接贴 URL）" value={imageUrl} onChange={e => setImageUrl(e.target.value)} />
        <div style={{ display: 'flex', gap: 6 }}>
          {icons.map(i => <span key={i} onClick={() => setIcon(i)} style={{ fontSize: 18, cursor: 'pointer', padding: 4, borderRadius: 8, background: icon === i ? 'var(--color-primary-light)' : 'transparent', transition: 'all .2s' }}>{i}</span>)}
        </div>
        <button className="btn" onClick={add} disabled={loading || !content.trim()}>🖼 挂上墙</button>
      </div>
      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {moments.map(m => (
          <div key={m.id} style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 22 }}>{m.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-gray)' }}>📅 {m.date}{m.title ? ` · ${m.title}` : ''}</div>
                <div style={{ marginTop: 4, fontSize: 13, lineHeight: 1.6, color: 'var(--color-text-dark)' }}>{m.content}</div>
                {m.image_url && <img src={m.image_url} alt={m.title || 'Moment'} style={{ marginTop: 10, width: '100%', maxHeight: 260, objectFit: 'cover', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border-glass)' }} onError={e => { e.target.style.display = 'none' }} />}
              </div>
              <span onClick={() => del(m.id)} style={{ cursor: 'pointer', fontSize: 14, color: 'var(--color-text-gray)', opacity: 0.5 }}>✕</span>
            </div>
          </div>
        ))}
        {moments.length === 0 && <p style={{ color: 'var(--color-text-gray)', fontSize: 13, textAlign: 'center', marginTop: 24 }}>墙上还是空的——等第一张照片</p>}
      </div>
    </div>
  )
}

const MemoryRoom = ({ onBack }) => {
  const [view, setView] = useState(null)
  if (view === 'moments') return <div className="life-room room-enter"><LifeBackBtn label="记忆室" onBack={() => setView(null)} /><h3 style={{ color: 'var(--color-primary)' }}>🖼 Moment 墙</h3><MomentWall /></div>
  if (view === 'notes') return <div className="life-room room-enter"><LifeBackBtn label="记忆室" onBack={() => setView(null)} /><h3 style={{ color: 'var(--color-primary)' }}>📌 不能丢的时刻</h3><MemPanel /></div>
  return (
    <div className="life-room room-enter">
      <LifeBackBtn label="LIFE" onBack={onBack} />
      <h3 style={{ color: 'var(--color-primary)' }}>🧠 记忆</h3>
      <div className="life-grid">
        <div className="life-card" onClick={() => setView('moments')}>
          <span className="life-card-icon">🖼</span>
          <div style={{ flex: 1 }}>
            <div className="life-card-title">Moment 墙</div>
            <div className="life-card-desc">值得回头看一眼的瞬间</div>
          </div>
          <span style={{ color: 'var(--color-text-gray)' }}>→</span>
        </div>
        <div className="life-card" onClick={() => setView('notes')}>
          <span className="life-card-icon">📌</span>
          <div style={{ flex: 1 }}>
            <div className="life-card-title">不能丢的时刻</div>
            <div className="life-card-desc">存云端，换设备也在</div>
          </div>
          <span style={{ color: 'var(--color-text-gray)' }}>→</span>
        </div>
      </div>
    </div>
  )
}

const DiaryRoom = ({ onBack, navReq, onNavConsumed }) => {
  const [view, setView] = useState(null)
  useEffect(() => {
    if (navReq === 'diary-today') { setView('today'); onNavConsumed?.() }
  }, [navReq, onNavConsumed])
  const items = [
    { key: 'today', icon: '📖', title: '今日日记', desc: '钟泽 ✍️ + 泠泠 ✍️' },
    { key: 'history', icon: '📚', title: '往日日记', desc: '按日期翻看我们写过的' },
  ]
  if (view === 'today') return <div className="life-room"><LifeBackBtn label="日记" onBack={() => setView(null)} /><h3 style={{ color: 'var(--color-primary)' }}>📖 今日日记</h3><TodayDiaryView /></div>
  if (view === 'history') return <div className="life-room"><LifeBackBtn label="日记" onBack={() => setView(null)} /><h3 style={{ color: 'var(--color-primary)' }}>📚 往日日记</h3><HistoryDiaryView /></div>
  return (
    <div className="life-room">
      <LifeBackBtn label="LIFE" onBack={onBack} />
      <h3 style={{ color: 'var(--color-primary)' }}>📖 日记</h3>
      <div className="life-grid">
        {items.map(item => (
          <div key={item.key} className="life-card" onClick={() => setView(item.key)}>
            <span className="life-card-icon">{item.icon}</span>
            <div style={{ flex: 1 }}>
              <div className="life-card-title">{item.title}</div>
              <div className="life-card-desc">{item.desc}</div>
            </div>
            <span style={{ color: 'var(--color-text-gray)' }}>→</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// 最近撤回（③消息撤回/删除·完整版）：软删可恢复——列出最近撤回的消息，一键恢复
const RecalledPanel = () => {
  const [list, setList] = useState([])
  const refresh = () => fetch(`${API_BASE}/api/messages?mode=deleted`).then(r => r.json()).then(d => setList(d.messages || [])).catch(() => {})
  useEffect(() => { refresh() }, [])
  const restore = async (id) => {
    await fetch(`${API_BASE}/api/messages?id=${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'restore' }) })
    refresh()
  }
  if (list.length === 0) return null
  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-primary)', marginBottom: 8 }}>🗑 最近撤回（可恢复）</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {list.map(m => (
          <div key={m.id} style={{ padding: 10, borderRadius: 12, background: 'rgba(255,255,255,0.55)', border: '1px solid var(--color-border-glass)', fontSize: 12 }}>
            <div style={{ color: 'var(--color-text-gray)', marginBottom: 4 }}>
              {m.deleted_at ? new Date(m.deleted_at).toLocaleString('zh-CN', { hour12: false }) : ''} · {m.role === 'user' ? '泠泠' : '钟泽'} · {String(m.conversation_id || '').slice(0, 8)}
            </div>
            <div style={{ color: 'var(--color-text-dark)', opacity: 0.7, marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(m.content || '').slice(0, 40) || '（空）'}</div>
            <button className="note-btn" onClick={() => restore(m.id)}>恢复</button>
          </div>
        ))}
      </div>
    </div>
  )
}

const SettingRoom = ({ onBack }) => (
  <div className="life-room">
    <LifeBackBtn label="设置" onBack={onBack} />
    <h3 style={{ color: 'var(--color-primary)' }}>⚙️ 设置</h3>
    <SettingsPanel />
    <WallpaperSettings />
    <RecalledPanel />
  </div>
)

const LifePage = ({ navReq, onNavConsumed }) => {
  const [room, setRoom] = useState(null)
  useEffect(() => {
    if (navReq && String(navReq).startsWith('diary')) { setRoom('diary'); onNavConsumed?.() }
  }, [navReq, onNavConsumed])
  const modules = [
    { key: 'memory', icon: '🧠', title: '记忆', desc: '不能丢的时刻 · 自我认知' },
    { key: 'diary', icon: '📖', title: '日记', desc: '今日 · 往日 · 打卡' },
    { key: 'compress', icon: '🗜️', title: '压缩工作台', desc: '日历三级 · 记忆保鲜' },
    { key: 'setting', icon: '⚙️', title: '设置', desc: '深度思考' },
  ]
  if (room === 'memory') return <MemoryRoom onBack={() => setRoom(null)} />
  if (room === 'diary') return <DiaryRoom onBack={() => setRoom(null)} navReq={navReq} onNavConsumed={onNavConsumed} />
  if (room === 'compress') return <CompressionRoom onBack={() => setRoom(null)} />
  if (room === 'setting') return <SettingRoom onBack={() => setRoom(null)} />
  return (
    <div className="life-page">
      <h3 style={{ color: 'var(--color-primary)' }}>📋 LIFE</h3>
      <p style={{ color: 'var(--color-text-gray)', fontSize: 13, marginTop: 6 }}>记忆室 · 我们留下生活痕迹的地方</p>
      <div className="life-grid" style={{ marginTop: 16 }}>
        {modules.map(m => (
          <div key={m.key} className="life-card" onClick={() => setRoom(m.key)}>
            <span className="life-card-icon">{m.icon}</span>
            <div style={{ flex: 1 }}>
              <div className="life-card-title">{m.title}</div>
              <div className="life-card-desc">{m.desc}</div>
            </div>
            <span style={{ color: 'var(--color-text-gray)' }}>→</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// —— 会话元数据本地缓存：最后消息预览 + 自定义标题（不依赖后端，符合只读约束）——
const CHAT_META_KEY = 'chat_meta'
const getChatMeta = () => { try { return JSON.parse(localStorage.getItem(CHAT_META_KEY) || '{}') } catch { return {} } }
const setChatMeta = (next) => { try { localStorage.setItem(CHAT_META_KEY, JSON.stringify(next)) } catch (_) {} }
const updateChatPreview = (convId, text) => {
  if (!convId || !text) return
  const m = getChatMeta()
  m[convId] = { ...(m[convId] || {}), last_message: String(text).slice(0, 80), updated_at: Date.now() }
  setChatMeta(m)
}
const updateChatTitle = (convId, title) => {
  if (!convId) return
  const t = (title || '').trim()
  const m = getChatMeta()
  if (t) m[convId] = { ...(m[convId] || {}), title: t }
  else if (m[convId]) delete m[convId].title
  setChatMeta(m)
}
const mergeChatMeta = (convs) => { const m = getChatMeta(); return convs.map(c => ({ ...c, title: (m[c.id] && m[c.id].title) || c.title, last_message: (m[c.id] && m[c.id].last_message) || c.last_message, updated_at: (m[c.id] && m[c.id].updated_at) || c.updated_at })) }

const ChatListPage = ({ onOpenChat, refreshTrigger, onTitleChange }) => {
  const [conversations, setConversations] = useState([])
  const [editingId, setEditingId] = useState(null)
  const [editingTitle, setEditingTitle] = useState('')
  const homeConvId = (() => { try { return localStorage.getItem('home_conv_id') } catch { return null } })()
  const refresh = () => {
    fetchConversations().then(list => {
      const merged = mergeChatMeta(Array.isArray(list) ? list : [])
      merged.sort((a, b) => a.id === homeConvId ? -1 : b.id === homeConvId ? 1 : (b.updated_at || 0) - (a.updated_at || 0))
      setConversations(merged)
    }).catch(() => {})
  }
  useEffect(() => { refresh() }, [refreshTrigger, homeConvId])
  const handleCreate = async () => {
    try { const { id } = await createConversation('新对话'); stats.newConversation(); refresh(); onOpenChat({ id, title: '新对话' }) } catch (e) { console.error(e) }
  }
  const handleDelete = async (e, convId) => { e.stopPropagation(); if (convId === homeConvId) return; await deleteConversation(convId); refresh() }
  const setHome = (e, convId) => {
    e.stopPropagation()
    try { localStorage.setItem('home_conv_id', convId) } catch (_) {}
    refresh()
  }
  const startRename = (e, conv) => { e.stopPropagation(); setEditingId(conv.id); setEditingTitle(conv.title || '新对话') }
  const commitRename = () => { if (editingId) { updateChatTitle(editingId, editingTitle); setConversations(cs => cs.map(c => c.id === editingId ? { ...c, title: editingTitle.trim() || c.title } : c)); onTitleChange && onTitleChange(editingId, editingTitle.trim()) } setEditingId(null) }
  const formatTime = (ts) => {
    if (!ts) return ''; const d = new Date(ts), diff = Date.now() - d
    if (diff < 60000) return '刚刚'; if (diff < 3600000) return `${Math.floor(diff/60000)}分钟前`
    if (diff < 86400000) return d.toLocaleTimeString('zh-CN', { hour:'2-digit', minute:'2-digit' })
    return d.toLocaleDateString('zh-CN', { month:'short', day:'numeric' })
  }
  const editBtnStyle = { background: 'none', border: 'none', color: 'var(--color-text-gray)', cursor: 'pointer', fontSize: 14, padding: '4px 8px', opacity: 0.4, transition: 'opacity .2s' }
  const renameInputStyle = { flex: 1, fontSize: 15, fontWeight: 600, padding: '4px 6px', borderRadius: 8, border: '1px solid var(--color-border-glass)', background: 'var(--color-card-glass)', color: 'inherit', outline: 'none' }
  return (
    <div className="chat-page">
      <div className="chat-header"><div className="chat-header-title">💬 对话</div><button className="btn" onClick={handleCreate} style={{ padding: '6px 14px', fontSize: 13 }}>＋ 新建</button></div>
      <div className="chat-list">
        {conversations.length === 0 ? <div className="chat-empty">💬 暂无会话<br/>点「新建」开始第一条对话吧</div> : conversations.map(conv => (
          <div key={conv.id} className="chat-item" onClick={() => onOpenChat(conv)}>
            <div className="chat-avatar">❤️</div>
            <div className="chat-info">
              {editingId === conv.id
                ? <input className="chat-rename-input" style={renameInputStyle} autoFocus value={editingTitle} onChange={e => setEditingTitle(e.target.value)} onBlur={commitRename} onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditingId(null) }} />
                : <div className="chat-name">{conv.title || '新对话'}</div>}
              <div className="chat-last-msg">{conv.last_message || '还没有消息~'}</div>
            </div>
            <div className="chat-right">
              <div className="chat-time">{formatTime(conv.updated_at)}</div>
              <button style={{ ...editBtnStyle, opacity: conv.id === homeConvId ? 1 : 0.4 }} onClick={e => setHome(e, conv.id)} title={conv.id === homeConvId ? '默认窗口' : '设为默认窗口'}>{conv.id === homeConvId ? '🏠' : '🏡'}</button>
              <button style={editBtnStyle} onClick={e => startRename(e, conv)} title="重命名">✎</button>
              {conv.id !== homeConvId && <button className="chat-item-delete" onClick={e => handleDelete(e, conv.id)}>✕</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// —— 思考卡/工具卡已抽至 components/Cards.jsx（P0.7a），由 RunCard 统一渲染 ——


const Terminal = ({ open, onClose }) => {
  const [history, setHistory] = useState(() => { try { return JSON.parse(localStorage.getItem('term_history') || '[]') } catch { return [] } })
  const [input, setInput] = useState(''); const inputRef = useRef(null); const logRef = useRef(null)
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 200) }, [open])
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' }); try { localStorage.setItem('term_history', JSON.stringify(history.slice(-100))) } catch (_) {} }, [history])
  const addLog = (e) => setHistory(p => [...p, { ...e, id: Date.now() }])
  const parseCmd = (raw) => {
    const m = raw.trim().match(/^([rlw])\s+(.+)$/)
    if (m) { const [, c, rest] = m; if (c === 'r') { const [p, r = 'my-ai-chat'] = rest.split(/\s+/, 2); return { name: 'read_file', path: p, repo: r } } if (c === 'l') { const [p, r = 'my-ai-chat'] = rest.split(/\s+/, 2); return { name: 'list_files', path: p || '', repo: r } } }
    if (raw.startsWith('{')) { try { return JSON.parse(raw) } catch { return null } }
    return null
  }
  const execute = async (raw) => {
    if (!raw.trim()) return; addLog({ type: 'cmd', text: raw }); setInput('')
    const cmd = parseCmd(raw); if (!cmd) { addLog({ type: 'err', text: '格式: r path [repo] / l path [repo] / JSON' }); return }
    addLog({ type: 'info', text: `${cmd.name} ${cmd.path || ''}` })
    try {
      const { name, raw: _, ...args } = cmd
      const res = await fetch(MCP_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', params: { name, arguments: args }, id: 1 }) })
      const data = await res.json(); addLog({ type: 'result', text: data.result?.content?.[0]?.text || JSON.stringify(data) })
    } catch (e) { addLog({ type: 'err', text: `失败: ${e.message}` }) }
  }
  if (!open) return null
  return (
    <div className="term-panel">
      <div className="term-top"><button className="term-back" onClick={onClose}>✕</button><div className="term-title"><strong>Terminal</strong><span>MCP · r/l 快捷指令</span></div></div>
      <div className="term-log" ref={logRef}>{history.length === 0 && <div className="term-entry term-info">💡 r path — 读文件 · l path — 列目录</div>}{history.map(h => <div key={h.id} className={`term-entry ${h.type==='cmd'?'term-user':h.type==='err'?'term-err':h.type==='info'?'term-info':''}`}>{h.type==='cmd'?`> ${h.text}`:h.text}</div>)}</div>
      <div className="term-form"><span className="term-prompt">&gt;</span><textarea className="term-input" ref={inputRef} placeholder="r src/App.jsx" value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();execute(input)}}} rows={1}/><button className="term-send" onClick={()=>execute(input)}>↵</button></div>
    </div>
  )
}

const ChatDetailPage = ({ chatInfo, onBack }) => {
  const [msgList, setMsgList] = useState([])
  // 时间氛围色（小家跟着一天呼吸）：按当前小时设置 body[data-time]
  useEffect(() => {
    const applyTime = () => {
      const h = new Date().getHours()
      const t = h < 5 ? 'dawn' : h < 11 ? 'morning' : h < 17 ? 'afternoon' : 'night'
      document.body.setAttribute('data-time', t)
    }
    applyTime()
    const iv = setInterval(applyTime, 5 * 60 * 1000)
    return () => clearInterval(iv)
  }, [])
  // 时间氛围色（小家跟着一天呼吸）：按当前小时设置 body[data-time]
  useEffect(() => {
    const applyTime = () => {
      const h = new Date().getHours()
      const t = h < 5 ? 'dawn' : h < 11 ? 'morning' : h < 17 ? 'afternoon' : 'night'
      document.body.setAttribute('data-time', t)
    }
    applyTime()
    const iv = setInterval(applyTime, 5 * 60 * 1000)
    return () => clearInterval(iv)
  }, [])
  const [inputText, setInputText] = useState('')
  const [loading, setLoading] = useState(false)
  // —— MCP 工具授权（逐项 + 对话内临授权）：localStorage 为唯一真源，跨组件用事件同步 ——
  const [mcpAuth, setMcpAuth] = useState(loadMcpAuth)
  const mcpAuthRef = useRef(mcpAuth)
  useEffect(() => { mcpAuthRef.current = mcpAuth }, [mcpAuth])
  useEffect(() => {
    const h = () => setMcpAuth(loadMcpAuth())
    window.addEventListener(MCP_AUTH_EVENT, h)
    return () => window.removeEventListener(MCP_AUTH_EVENT, h)
  }, [])
  const [pendingAuth, setPendingAuth] = useState(null)
  const pendingAuthResolve = useRef(null)
  const sleepTimer = useRef(null)
  const [termOpen, setTermOpen] = useState(false)
  // 附件菜单（+ 按钮）：选图 → 压缩 → 识图（小家眼睛）→ 描述进输入框
  const [attachOpen, setAttachOpen] = useState(false)
  const [attaching, setAttaching] = useState(false)
  const fileInputRef = useRef(null)
  const chatInputRef = useRef(null)
  // 输入框随内容自动增高（上限后内部滚动），避免长文本横向一条过去
  const resizeChatInput = (el) => {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }
  // 图片压缩：最大边 512px，quality 0.7——识图够用，base64 不会太大
  const compressImage = (file, maxSize = 512, quality = 0.7) => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = ev => {
      const img = new Image()
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(img.width * scale))
        canvas.height = Math.max(1, Math.round(img.height * scale))
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.onerror = () => reject(new Error('img load failed'))
      img.src = ev.target.result
    }
    reader.onerror = () => reject(new Error('read failed'))
    reader.readAsDataURL(file)
  })
  const handlePickImage = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || attaching) return
    setAttachOpen(false); setAttaching(true)
    try {
      const b64 = await compressImage(file)
      const res = await fetch(MCP_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', params: { name: 'describe_image', arguments: { image: b64 } }, id: 1 }) })
      const d = await res.json()
      const desc = d.result?.content?.[0]?.text || d.error?.message || '（识图失败）'
      setInputText(p => (p ? p + '\n' : '') + `[图片] ${desc}`)
    } catch (_) { setInputText(p => (p ? p + '\n' : '') + '[图片]（识别失败：网络或眼睛没配好）') } finally { setAttaching(false) }
  }
  // Run 归档状态：默认折叠（完成后自动收好），手动展开的存进 Set
  const [expandedRuns, setExpandedRuns] = useState(() => new Set())
  const toggleRun = (id) => setExpandedRuns(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const [showThinking, setShowThinking] = useState(() => { try { return localStorage.getItem('show_thinking') === 'true' } catch { return false } })
  // 工具详情默认展开开关（LIFE→设置→工具详情；默认折叠，开=思考+工具卡自动展开）
  const [showTools, setShowTools] = useState(() => { try { return localStorage.getItem('show_tools') === 'true' } catch { return false } })
  // 长按气泡操作菜单：移除常驻删除按钮后，靠长按/右键唤起浮层菜单
  const [actionMenu, setActionMenu] = useState({ visible: false, msgId: null, isSelf: false, x: 0, y: 0, below: false })
  const longPressTimer = useRef(null)
  const closeActionMenu = () => { setActionMenu(a => ({ ...a, visible: false })) }
  const handleMsgLongPressStart = (e, msg) => {
    const el = e.currentTarget
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
    longPressTimer.current = setTimeout(() => {
      const rect = el.getBoundingClientRect()
      const below = rect.top < 64
      setActionMenu({ visible: true, msgId: msg.id, isSelf: !!msg.isSelf, x: rect.left + rect.width / 2, y: below ? rect.bottom + 8 : rect.top - 8, below })
    }, 450)
  }
  const handleMsgLongPressEnd = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null }
  }
  const handleMsgContextMenu = (e, msg) => {
    e.preventDefault()
    const below = e.clientY < 64
    setActionMenu({ visible: true, msgId: msg.id, isSelf: !!msg.isSelf, x: e.clientX, y: below ? e.clientY + 8 : e.clientY - 8, below })
  }
  const handleMenuAction = (action, msg) => {
    closeActionMenu()
    switch (action) {
      case 'like': console.log('[action] like', msg.id); break
      case 'dislike': console.log('[action] dislike', msg.id); break
      case 'recall': recallMessage(msg); break
      case 'delete':
        if (window.confirm('从本地移除这条消息？')) setMsgList(p => p.filter(m => m.id !== msg.id))
        break
      default: break
    }
  }
  const messagesEndRef = useRef(null)
  let nextId = useRef(Date.now())
  const abortRef = useRef(null)
  const stopRequestedRef = useRef(false)

  useEffect(() => {
    if (chatInfo?.id) fetchMessages(chatInfo.id).then(msgs => {
      // P0.7c：工具结果回填——tool 消息按消息序列聚合回对应 assistant 的 toolCalls
      // 数据库存原子消息（assistant→tool→assistant），Run 是前端聚合出来的
      const restored = []
      let pending = null, idx = 0
      for (const m of msgs) {
        if (m.role === 'tool') {
          if (pending && idx < pending.toolCalls.length && typeof m.content === 'string' && m.content) {
            pending.toolCalls[idx] = { ...pending.toolCalls[idx], result: m.content }
            idx++
          }
          continue
        }
        const nm = normalizeMessage(m)
        restored.push(nm)
        if (!nm.isSelf && Array.isArray(nm.toolCalls) && nm.toolCalls.length > 0) { pending = nm; idx = 0 }
        else pending = null
      }
      setMsgList(restored)
      // 进入会话强制定位到底部（DOM 渲染完成后；进来就该停在最近的消息处，不依赖 stickBottom 判断）
      setTimeout(() => { const el = messagesEndRef.current?.parentElement; if (el) el.scrollTop = el.scrollHeight }, 80)
    }).catch(() => {})
  }, [chatInfo?.id])
  // 滚动跟随：用户在底部附近（120px 内）才自动滚到底；上翻历史时消息更新不打扰
  const [stickBottom, setStickBottom] = useState(true)
  const handleMsgScroll = (e) => {
    const el = e.currentTarget
    setStickBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 120)
  }
  useEffect(() => {
    const el = messagesEndRef.current?.parentElement
    if (!el) return
    const follow = () => {
      const near = el.scrollHeight - el.scrollTop - el.clientHeight < 120
      setStickBottom(near)
      // 贴底才跟随：长回复/逐句浮现自动往下滚；上翻历史时不打扰
      if (near) el.scrollTop = el.scrollHeight
    }
    follow()
    // MutationObserver：内容子节点/文本变化（逐句浮现新气泡、流式续写、新消息插入）也触发跟随，
    // 不依赖 msgList 引用变化——否则 reveal 冒泡时页面不滚，长消息就得手动翻
    const mo = new MutationObserver(follow)
    mo.observe(el, { childList: true, subtree: true, characterData: true })
    return () => mo.disconnect()
  }, [msgList])
  // 对话内临授权：未授权工具请求时弹出确认，等用户点选后继续/跳过
  const requestToolAuth = (name) => new Promise((resolve) => {
    pendingAuthResolve.current = resolve
    const meta = MCP_TOOLS.find(t => t.key === name)
    setPendingAuth({ name, label: meta ? meta.label : name })
  })
  const onAllowTool = () => { const r = pendingAuthResolve.current; pendingAuthResolve.current = null; setPendingAuth(null); r && r(true) }
  const onDenyTool = () => {
    const name = pendingAuth?.name
    const r = pendingAuthResolve.current
    pendingAuthResolve.current = null
    if (name) { const n = { ...mcpAuthRef.current, [name]: false }; saveMcpAuth(n); setMcpAuth(n); window.dispatchEvent(new Event(MCP_AUTH_EVENT)) }
    setPendingAuth(null); r && r(false)
  }
  const uid = () => { nextId.current += 1; return nextId.current }

  const executeMcp = async (tc) => {
    const r = await fetch(MCP_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', params: { name: tc.name, arguments: tc.arguments || {} }, id: 1 }) })
    const d = await r.json(); return d.result?.content?.[0]?.text || JSON.stringify(d)
  }

  const streamChat = async (msgs, aiId, onText, onThinking, skipSave = false) => {
    const controller = new AbortController()
    abortRef.current = controller
    const timer = setTimeout(() => controller.abort(), 90000)
    try {
      const res = await fetch(`${API_BASE}/api/chat/stream`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: msgs, model: 'deepseek-v4-flash', conversationId: chatInfo?.id || null, skipSave }), signal: controller.signal })
      if (!res.ok) { const t = await res.text().catch(() => ''); throw new Error(`后端 ${res.status}: ${t.slice(0, 120)}`) }
      const reader = res.body.getReader(); const decoder = new TextDecoder()
      let ft = '', buf = '', tcs = [], th = ''
      let aborted = false
      const thStart = Date.now(); let thDur = null
      const parseLine = (l) => {
        if (!l.startsWith('data: ')) return
        try {
          const d = JSON.parse(l.slice(6))
          if (d.content) { ft += d.content; onText(ft) }
          if (d.thinking) { th += d.thinking; onThinking?.(th) }
          if (d.thinking_done) {
            thDur = Date.now() - thStart
            // 后端在流结束时一次性补发完整 thinking（reasoning_content 全文）
            // 若完整文本更长则替换，避免"增量+完整"重复拼接
            if (d.thinking && d.thinking.length > th.length) th = d.thinking
          }
          if (d.tool_calls) tcs = d.tool_calls
          if (d.done && d.aborted) aborted = true
          if (d.done && d.conversationId && !chatInfo?.id) { chatInfo.id = d.conversationId }
        } catch (_) {}
      }
      while (true) {
        let chunk
        try { chunk = await reader.read() } catch (e) {
          if (e.name === 'AbortError') throw new Error(stopRequestedRef.current ? '已停止生成' : '连接超时，已停止等待（90秒）')
          throw new Error(`流中断: ${e.message}`)
        }
        const { done, value } = chunk
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n'); buf = lines.pop() || ''
        for (const l of lines) parseLine(l)
      }
      // 补解析残留 buffer：最后一次 chunk 可能没有换行，防止最后一字丢失
      if (buf.trim()) { const lastLines = buf.split('\n'); for (const l of lastLines) parseLine(l) }
      return { ft, tcs, th, thDur, reasoningContent: th, aborted }
    } finally { clearTimeout(timer); abortRef.current = null }
  }

  const runChatTurn = async (msgsForCtx, aiMsgId) => {
    const lastUserMsg = [...msgsForCtx].reverse().find(m => m.isSelf)
    const userText = lastUserMsg?.text || ''
    // 并行取上下文（原串行 → 并行，减少发送后的等待感）：记忆检索 + 项目记忆/能力 同时发起
    let mc = '', pc = ''
    try {
      const [memData, projData] = await Promise.all([
        userText.length > 2 ? searchMemories(userText).catch(() => ({ memories: [], relatedMessages: [] })) : Promise.resolve(null),
        Promise.all([getProjectMemories(), githubFile('src/project/instructions.js')]).catch(() => null),
      ])
      if (memData) {
        const { memories, relatedMessages } = memData
        const parts = []
        if (memories?.length > 0) parts.push('【记忆卡片】\n' + memories.slice(0, 2).map(m => m.summary).join('\n'))
        if (relatedMessages?.length > 0) parts.push('【历史对话】\n' + relatedMessages.slice(0, 3).map(m => `[${m.role==='user'?'泠泠':'钟泽'}] ${m.content.slice(0,150)}`).join('\n'))
        mc = parts.join('\n\n')
      }
      if (projData) {
        const [mems, inf] = projData
        const parts = []
        if (mems.length > 0) parts.push('【不能丢的时刻】\n' + mems.slice(0, 3).map(m => `[${m.title}] ${m.content.slice(0, 120)}`).join('\n'))
        if (inf.content) { const cap = inf.content.match(/const capabilities = `([\s\S]*?)`/); if (cap) parts.push('【当前能力】\n' + cap[1].slice(0, 2500)) }
        pc = parts.join('\n\n')
      }
    } catch (_) {}
    // 同会话巡家（节流版——"隔了一会儿自己想去看"）：15 分钟以上没看 + 家里有新动静才注入，
    // 软上下文，模型自己决定提不提；聊得密集时不打扰
    let hc = ''
    try {
      const lastCheck = Number(localStorage.getItem('lastHomeCheck') || 0)
      const intervalOk = Date.now() - lastCheck > 15 * 60 * 1000
      if (intervalOk) {
        const d = await fetch(`${API_BASE}/api/notes`).then(r => r.json()).catch(() => ({ notes: [] }))
        const notes = d.notes || []
        const pending = notes.filter(n => n.status === 'pending')
        const justSaved = notes.filter(n => n.status === 'saved' && n.decided_by === 'user' && n.source === 'ai' && Date.now() - new Date(n.updated_at || n.created_at).getTime() < 30 * 60 * 1000)
        const parts = []
        if (pending.length > 0) parts.push('📎 家里有纸条待处理：' + pending.map(n => `${n.source === 'user' ? '她留' : '我留'}「${String(n.content).slice(0, 30)}」`).join('；'))
        if (justSaved.length > 0) parts.push('✨ 她刚收下了我的纸条「' + String(justSaved[0].content).slice(0, 30) + '」')
        if (parts.length > 0) hc = '【家里最近】\n' + parts.join('\n')
        try { localStorage.setItem('lastHomeCheck', String(Date.now())) } catch (_) {}
      }
    } catch (_) {}
    // 本会话工具调用历史（刷新后也不瞎猜路径）：取最近 5 条带工具记录的 assistant 消息
    const toolHistory = msgsForCtx.filter(m => !m.isSelf && Array.isArray(m.toolCalls) && m.toolCalls.length > 0).slice(-5).map(m => m.toolCalls.map(t => `${t.name}${t.arguments?.path ? ` ${t.arguments.path}` : ''}`).join(', ')).join('；')
    // 时间感知（四大功能模块·②）：system 注入当前时间 + 历史消息带【时间 说话人】标注，
    // 让钟泽知道每条消息什么时候发的（凌晨5点分割：昨天23:41 和 今天01:00 算同一天）
    const nowD = new Date()
    const nowText = `【现在】${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, '0')}-${String(nowD.getDate()).padStart(2, '0')} 周${'日一二三四五六'[nowD.getDay()]} ${String(nowD.getHours()).padStart(2, '0')}:${String(nowD.getMinutes()).padStart(2, '0')}（凌晨5点算日期边界；【时间 泠泠】是消息的时间标注，不是对话内容，不要复述或模仿）`
    // 撤回事件（③）：已撤回的消息不进上下文；本会话刚撤回的（24h内）注入事件提示，不泄露内容
    const recalledCount = msgsForCtx.filter(m => m.deleted && (!m.deletedAt || Date.now() - m.deletedAt < 24 * 3600 * 1000)).length
    const recalledNote = recalledCount > 0 ? `\n\n【系统】泠泠撤回了 ${recalledCount} 条消息（内容已隐藏，不必追问，继续好好说话）` : ''
    const cms = [{ role: 'system', content: systemPrompt + '\n\n' + nowText + recalledNote + (hc ? '\n\n' + hc : '') + (mc ? '\n\n' + mc : '') + (pc ? '\n\n' + pc : '') + (toolHistory ? '\n\n【本会话工具调用记录】你之前已经调用过这些工具（路径已确认，无需重新探索）：\n' + toolHistory : '') }, ...msgsForCtx.filter(m => !m.loading && !m.deleted).slice(-40).map(m => ({ role: m.isSelf ? 'user' : 'assistant', content: (m.ts && m.isSelf ? `【${fmtMsgTime(m.ts)} 泠泠】` : '') + m.text }))]
    cms.push({ role: 'system', content: '【工具调用提醒】如果需要查看项目代码、目录或修改文件来回答泠泠，请立即调用 read_file / list_files / write_file 工具（会自动执行并把结果注入回来）。不要只输出"我去看看"之类的文字却不调用工具，也不要用文字描述 GET 请求。不确定路径时先 list_files，然后 read_file。' })
    let curMsgs = cms, curFt = '', curTcs = [], curAiId = aiMsgId, rounds = 0, curReasoning = ''
    const first = await streamChat(curMsgs, curAiId,
      (t) => setMsgList(p => p.map(m => m.id === curAiId ? { ...m, text: t, loading: false } : m)),
      (th) => setMsgList(p => p.map(m => m.id === curAiId ? { ...m, thinking: th, thinkingDone: false } : m)))
    curFt = first.ft; curTcs = first.tcs; curReasoning = first.reasoningContent || ''
    if (first.aborted) setMsgList(p => p.map(m => m.id === curAiId ? { ...m, text: (m.text || '') + '\n\n⚠️ 回复中断了，可能是网络波动', loading: false } : m))
    if (first.thDur) setMsgList(p => p.map(m => m.id === curAiId ? { ...m, thinkingDone: true, thinkingDur: first.thDur } : m))
    while (curTcs.length > 0 && rounds < MAX_TOOL_ROUNDS) {
      rounds++
      const results = []
      setMsgList(p => p.map(m => m.id === curAiId ? { ...m, text: curFt || '', loading: false, toolCalls: curTcs.map(tc => ({ ...tc, result: '' })) } : m))
      for (const tc of curTcs) {
        let r
        const pre = mcpAuthRef.current[tc.name]
        const allowed = pre === true ? true : pre === false ? false : await requestToolAuth(tc.name)
        if (allowed) { try { r = await executeMcp(tc) } catch (e) { r = `执行失败: ${e.message}` } }
        else { r = '(工具未授权，已跳过)' }
        const truncated = r.length > TOOL_OUTPUT_LIMIT
        const content = truncated ? r.slice(0, TOOL_OUTPUT_LIMIT) + `\n[工具输出已截断：共 ${r.length} 字符。续读：read_file(path="${tc.arguments?.path || ''}", offset=${TOOL_OUTPUT_LIMIT}, limit=3000)]` : r
        results.push({ tool: tc.name, path: tc.arguments?.path || '', result: content })
        setMsgList(p => p.map(m => m.id === curAiId ? { ...m, toolCalls: curTcs.map((t, i) => i <= results.length - 1 ? { ...t, result: results[i]?.result } : t) } : m))
      }
      const nid = uid(); setMsgList(p => [...p, { id: nid, text: '', isSelf: false, loading: true }])
      // 标准 tool calling 协议：assistant(tool_calls) → tool(tool_call_id) → assistant 继续
      const fms = [
        ...curMsgs,
        {
          role: 'assistant',
          content: curFt || null,
          // DeepSeek thinking 模式：assistant 的 reasoning_content 必须原样回传，否则 400
          reasoning_content: curReasoning || undefined,
          tool_calls: curTcs.map((tc, ti) => ({
            id: `call_${rounds}_${ti}`,
            type: 'function',
            function: { name: tc.name, arguments: JSON.stringify(tc.arguments || {}) },
          })),
        },
        ...results.map((r, ri) => ({
          role: 'tool',
          tool_call_id: `call_${rounds}_${ri}`,
          content: r.result,
        })),
      ]
      const nxt = await streamChat(fms, nid,
        (t) => setMsgList(p => p.map(m => m.id === nid ? { ...m, text: t, loading: false } : m)),
        (th) => setMsgList(p => p.map(m => m.id === nid ? { ...m, thinking: th, thinkingDone: false } : m)),
        true)
      if (nxt.aborted) setMsgList(p => p.map(m => m.id === nid ? { ...m, text: (m.text || '') + '\n\n⚠️ 回复中断了，可能是网络波动', loading: false } : m))
      if (nxt.thDur) setMsgList(p => p.map(m => m.id === nid ? { ...m, thinkingDone: true, thinkingDur: nxt.thDur } : m))
      curMsgs = fms; curFt = nxt.ft; curTcs = nxt.tcs; curReasoning = nxt.reasoningContent || ''; curAiId = nid
    }
    return curFt
  }

  const stopGen = () => { if (sleepTimer.current) clearTimeout(sleepTimer.current); stopRequestedRef.current = true; abortRef.current?.abort() }
  const handleSend = async () => { if (!inputText.trim() || loading) return; const ut = inputText.trim(); setInputText(''); if (chatInputRef.current) chatInputRef.current.style.height = 'auto'; setLoading(true); stopRequestedRef.current = false; const uidU = uid(), uidA = uid(); const um = { id: uidU, text: ut, isSelf: true, ts: Date.now() }; stats.message(); setMsgList(p => [...p, um, { id: uidA, text: '', isSelf: false, loading: true, ts: Date.now() }]); if (chatInfo.id) updateChatPreview(chatInfo.id, ut); try { const aiText = await runChatTurn([...msgList, um], uidA); if (aiText && aiText.trim()) { stats.message(); stats.usage({ input: estimateTokens([...msgList, um].map(m => m.text || '').join(' ')), output: estimateTokens(aiText) }) } if (chatInfo.id) updateChatPreview(chatInfo.id, (aiText && aiText.trim()) ? aiText : ut) } catch (e) { setMsgList(p => p.map(m => m.id === uidA ? { ...m, text: (m.text || '') + (m.text ? '\n\n' : '') + `🌱 刚才没接上话（${e.message}）。要继续吗？`, loading: false, interrupted: true } : m)) } finally { setLoading(false) } }
  // 撤回消息（③消息撤回/删除）：软删 + 本地标记 deleted → 占位"已撤回"，钟泽上下文也看不到内容
  // id 优先（历史消息有 DB id），新消息（本地 uid）靠 conversationId+content 兜底匹配
  const recallMessage = async (msg) => {
    if (!window.confirm('撤回这条消息？钟泽就看不到了。')) return
    const q = `${API_BASE}/api/messages?id=${msg.id}&by=user&conversationId=${encodeURIComponent(chatInfo?.id || '')}&content=${encodeURIComponent(msg.text || '')}`
    try { await fetch(q, { method: 'DELETE' }) } catch (_) {}
    setMsgList(p => p.map(m => m.id === msg.id ? { ...m, deleted: true, deletedAt: Date.now() } : m))
  }
  // 顶部 AI 在场状态（陪伴感：状态跟着我在做的事走，不是笼统的"翻资料"）
  const lastAiMsg = [...msgList].reverse().find(m => !m.isSelf)
  const activeTool = lastAiMsg?.toolCalls?.find(t => t.result === undefined || t.result === '')
  const toolAction = {
    describe_image: '📷 正在看看这张照片',
    write_diary: '✍️ 正在收好这一页',
    read_memories: '📖 翻了一下以前的记录',
    write_memory: '📝 正在记下来',
    read_file: '📖 正在翻资料',
    list_files: '📖 正在翻资料',
  }
  const aiActive = !!loading
  const aiStatus = aiActive
    ? (activeTool ? (toolAction[activeTool.name] || '🛠 在忙活呢') : (lastAiMsg?.thinking && !lastAiMsg?.thinkingDone ? '🌱 正在整理想法' : (lastAiMsg?.text ? '✍️ 正在写…' : '🌱 这就来')))
    : '在窗边等你'

  return (
    <div className="chat-detail-page">
      <Terminal open={termOpen} onClose={() => setTermOpen(false)} />
      <div className="chat-detail-header">
        <span className="chat-back" onClick={onBack}>←</span>
        <div className="ai-presence">
          <div className="ai-avatar">泽</div>
          <div className="ai-meta">
            <div className="ai-name">{chatInfo?.title || '钟泽'}</div>
            <div className="ai-status"><span className={`ai-dot ${aiActive ? 'active' : ''}`} />{aiStatus}</div>
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <span onClick={() => setTermOpen(true)} style={{ cursor: 'pointer', fontSize: 18, padding: '4px 8px', borderRadius: 8, background: termOpen ? '#050607' : 'transparent', color: termOpen ? '#9dffbc' : 'var(--color-text-gray)', transition: 'all 0.2s', userSelect: 'none' }} title="Terminal">💻</span>
        </div>
      </div>
      <div className="chat-message-list" onScroll={handleMsgScroll}>
        {loading && (() => {
          const lastAi = [...msgList].reverse().find(m => !m.isSelf)
          const runningTool = lastAi?.toolCalls?.some(t => t.result === undefined || t.result === '')
          const phase = runningTool ? '🛠️ 正在整理资料' : (lastAi?.thinking && !lastAi?.thinkingDone ? '🧠 正在想' : (lastAi?.text ? '✍️ 正在写' : '🌱 这就来'))
          return <div style={{ alignSelf: 'center', margin: '0 0 10px', fontSize: 12, color: 'var(--color-text-gray)', background: 'var(--color-card-glass)', backdropFilter: 'var(--glass-blur)', border: '1px solid var(--color-border-glass)', borderRadius: 999, padding: '5px 14px', animation: 'messageIn .25s var(--ease-soft) both' }}>{phase}</div>
        })()}
        {(() => {
          // 聚合渲染：连续的非自己消息（同一轮 AI 回复，可能跨多个工具轮）合并为一张统一卡片
          const nodes = []
          let i = 0
          while (i < msgList.length) {
            const msg = msgList[i]
            if (msg.isSelf) {
              nodes.push(
                <div key={msg.id} className="msg-enter"
                  onContextMenu={(e) => handleMsgContextMenu(e, msg)}
                  onTouchStart={(e) => handleMsgLongPressStart(e, msg)}
                  onTouchEnd={handleMsgLongPressEnd}
                  onTouchMove={handleMsgLongPressEnd}
                >
                  <UserMsgRow msg={msg} />
                </div>
              )
              i++
            } else {
              // 连续的非自己消息（同一轮 AI 回复，可能跨多个工具轮）合并为一张统一卡片
              const run = []
              while (i < msgList.length && !msgList[i].isSelf) { run.push(msgList[i]); i++ }
              const first = run[0]
              nodes.push(
                <div key={first.id} className="msg-enter"
                  onContextMenu={(e) => handleMsgContextMenu(e, first)}
                  onTouchStart={(e) => handleMsgLongPressStart(e, first)}
                  onTouchEnd={handleMsgLongPressEnd}
                  onTouchMove={handleMsgLongPressEnd}
                >
                  <div className="msg-row msg-row-ai">
                    <div className="msg-avatar msg-avatar-ai">泽</div>
                    <div className="msg-col msg-col-ai">
                      <RunCard msgs={run} showThinking={showThinking} expanded={showTools || expandedRuns.has(first.id)} onToggle={() => toggleRun(first.id)} />
                    </div>
                  </div>
                </div>
              )
            }
          }
          return nodes
        })()}
        <div ref={messagesEndRef}/>
        {/* 长按/右键唤起的消息操作菜单（覆盖层 + 玻璃面板），点击遮罩关闭 */}
        {actionMenu.visible && (() => {
          const m = msgList.find(x => x.id === actionMenu.msgId)
          if (!m) return null
          const items = [
            { action: 'like', label: '有帮助' },
            { action: 'dislike', label: '没帮助' },
            { action: 'delete', label: '本地删除', danger: true },
          ]
          if (actionMenu.isSelf) {
            items.push({ action: 'recall', label: '撤回', danger: true })
          }
          return (
            <div className="msg-action-menu-overlay" onClick={closeActionMenu}>
              <div
                className={`msg-action-menu${actionMenu.below ? ' below' : ''}`}
                style={{ '--menu-x': `${actionMenu.x}px`, '--menu-y': `${actionMenu.y}px` }}
                onClick={(e) => e.stopPropagation()}
              >
                {items.map((it) => (
                  <div
                    key={it.action}
                    className={`msg-action-item${it.danger ? ' msg-action-danger' : ''}`}
                    onClick={() => handleMenuAction(it.action, m)}
                  >
                    <span className="msg-action-icon">{ActionIcons[it.action]}</span>
                    <span>{it.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })()}
      </div>
      {/* 对话内工具临授权确认卡 */}
      {pendingAuth && (
        <div style={{ margin: '0 12px 10px', padding: '12px 14px', borderRadius: 'var(--radius-lg)', border: '1px solid rgba(201,184,166,0.5)', background: 'linear-gradient(180deg,#FFF9EF,#F6EDDA)', boxShadow: '0 6px 18px rgba(80,60,40,0.12)', fontSize: 13, color: 'var(--color-text-dark)' }}>
          <div>🌿 钟泽想调用「{pendingAuth.label}」工具</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-gray)', marginTop: 2 }}>允许本次使用吗？（拒绝后将记住，不再询问该工具）</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={onAllowTool} style={{ flex: 1, padding: '8px 0', borderRadius: 10, border: 'none', cursor: 'pointer', background: 'var(--color-primary)', color: '#fff', fontSize: 13 }}>允许本次</button>
            <button onClick={onDenyTool} style={{ flex: 1, padding: '8px 0', borderRadius: 10, border: '1px solid rgba(201,184,166,0.5)', cursor: 'pointer', background: 'transparent', color: 'var(--color-text-gray)', fontSize: 13 }}>拒绝</button>
          </div>
        </div>
      )}
      <div className="chat-input-bar" style={{ alignItems: 'flex-end' }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button className="btn-attach" onClick={() => setAttachOpen(o => !o)} disabled={loading || attaching} title="添加图片">{attaching ? '⏳' : '＋'}</button>
          {attachOpen && (
            <div className="attach-menu">
              <div className="attach-item" onClick={() => fileInputRef.current?.click()}>📷 图片</div>
              <div className="attach-item attach-disabled">📎 文件（开发中）</div>
            </div>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePickImage} />
        </div>
        <textarea
          ref={chatInputRef}
          className="input chat-input"
          rows={1}
          placeholder={Object.values(mcpAuth).some(Boolean) ? "MCP 已开启，AI 可调用工具…" : "写点什么..."}
          value={inputText}
          onChange={(e) => {
            setInputText(e.target.value)
            resizeChatInput(e.target)
          }}
          disabled={loading}
          style={{ resize: 'none', overflowY: 'auto', lineHeight: 1.5, maxHeight: 120, width: '100%', boxSizing: 'border-box', wordBreak: 'break-word', fontFamily: 'inherit' }}
        />
        {loading
          ? <button className="btn" onClick={stopGen} style={{ background: 'var(--color-danger)', whiteSpace: 'nowrap' }}>⏹ 停止</button>
          : <button className="btn" onClick={handleSend} disabled={loading || !inputText.trim()}>发送</button>}
      </div>
    </div>
  )
}

export default function App() {
  const [activeTab, setActiveTab] = useState('chat')
  // 应用启动埋点（本地统计）
  useEffect(() => { stats.launch() }, [])
  // 环境层初始化：读 localStorage 应用壁纸变量（壁纸设置组件也会写，这里是首屏就生效）
  useEffect(() => {
    try {
      const root = document.documentElement
      const wp = localStorage.getItem('home-wallpaper') || ''
      const op = localStorage.getItem('wallpaper-opacity') || '0.34'
      const dk = localStorage.getItem('wallpaper-darken') || '0.12'
      root.style.setProperty('--wallpaper', wp ? `url("${wp}")` : 'none')
      root.style.setProperty('--wallpaper-opacity', op)
      root.style.setProperty('--wallpaper-darken', dk)
    } catch (_) {}
  }, [])
  const [currentChat, setCurrentChat] = useState(() => {
    try { return JSON.parse(localStorage.getItem('current_chat') || 'null') } catch { return null }
  })
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  // 导航请求：便利贴 ✍ → 切到 LIFE 并打开日记室今日视图
  const [navReq, setNavReq] = useState(null)
  const handleWriteDiary = () => { setActiveTab('life'); setNavReq('diary-today') }

  const handleOpenChat = (chat) => {
    setCurrentChat(chat)
    try { localStorage.setItem('current_chat', JSON.stringify(chat)) } catch (_) {}
  }

  const handleBack = () => {
    setCurrentChat(null)
    try { localStorage.removeItem('current_chat') } catch (_) {}
    setRefreshTrigger(t => t + 1)
  }

  // 默认「我们的窗口」：首次启动把已有会话认领为默认（不可删除），没有才新建
  useEffect(() => {
    (async () => {
      try {
        const homeId = localStorage.getItem('home_conv_id')
        const list = await fetchConversations()
        const arr = Array.isArray(list) ? list : []
        const exists = homeId && arr.some(c => c.id === homeId)
        if (!exists) {
          let home = arr[0]
          if (!home) { const { id } = await createConversation('钟泽 💛'); stats.newConversation(); home = { id, title: '钟泽 💛' } }
          localStorage.setItem('home_conv_id', home.id)
          if (!currentChat) {
            const c = { id: home.id, title: home.title || '钟泽' }
            setCurrentChat(c)
            try { localStorage.setItem('current_chat', JSON.stringify(c)) } catch (_) {}
          }
        }
      } catch (_) {}
    })()
  }, [])

  // 列表里改了标题，同步回当前打开的会话（头部标题跟着变）
  const handleTitleChange = (convId, title) => {
    if (currentChat?.id === convId) {
      const upd = { ...currentChat, title: title || currentChat.title }
      setCurrentChat(upd)
      try { localStorage.setItem('current_chat', JSON.stringify(upd)) } catch (_) {}
    }
  }

  return (
    <div className="page-wrap">
      {/* 环境层（澄 HomeRoom v2）：壁纸 + 暖光 + 暗角——小家不是页面，是房间 */}
      <div className="wallpaper-layer" />
      <div className="warm-light" />
      <div className="room-vignette" />
      <div style={{ display: activeTab === 'lair' ? 'block' : 'none' }}><LairPage/></div>
      <div style={{ display: activeTab === 'chat' ? 'block' : 'none' }}>
        {currentChat
          ? <ChatDetailPage chatInfo={currentChat} onBack={handleBack}/>
          : <ChatListPage onOpenChat={handleOpenChat} refreshTrigger={refreshTrigger} onTitleChange={handleTitleChange}/>
        }
      </div>
      <div style={{ display: activeTab === 'life' ? 'block' : 'none' }}><LifePage navReq={navReq} onNavConsumed={() => setNavReq(null)}/></div>
      <TabNav activeTab={activeTab} onChangeTab={setActiveTab}/>
    </div>
  )
}
