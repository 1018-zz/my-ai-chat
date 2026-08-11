import { fetchConversations, createConversation, deleteConversation, fetchMessages, searchMemories, githubFile } from './utils/api'
import { buildSystemPrompt } from './project/instructions'
import { getProjectMemories, addProjectMemory, deleteProjectMemory } from './project/memories'
import Markdown from './components/Markdown'
import { useState, useEffect, useRef } from 'react'
import './styles/theme.css'

const API_BASE = 'https://my-ai-chat-4zy.pages.dev'
const MCP_URL = `${API_BASE}/api/mcp`
const systemPrompt = buildSystemPrompt()
const MAX_TOOL_ROUNDS = 16
const TOOL_OUTPUT_LIMIT = 3000

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

const DiaryPanel = () => {
  const [form, setForm] = useState({ date: '', breakfast: '', lunch: '', dinner: '', wake_time: '', sleep_time: '', note: '' })
  const [records, setRecords] = useState([])
  const [saving, setSaving] = useState(false)
  const [diaries, setDiaries] = useState([])
  const [myDiary, setMyDiary] = useState('')
  const [aiDiary, setAiDiary] = useState('')
  const [aiWriting, setAiWriting] = useState(false)
  const [aiError, setAiError] = useState('')
  const todayStr = fmtDate(new Date())

  const loadCheckin = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/daily`)
      const data = await res.json()
      const list = data.records || []
      setRecords(list)
      const t = list.find(r => r.date === todayStr)
      setForm({ date: todayStr, breakfast: t?.breakfast || '', lunch: t?.lunch || '', dinner: t?.dinner || '', wake_time: t?.wake_time || '', sleep_time: t?.sleep_time || '', note: t?.note || '' })
    } catch (_) {}
  }
  const loadDiaries = async (skipAuto) => {
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
      else if (!skipAuto) ensureAiDiary()
    } catch (_) {}
  }
  const ensureAiDiary = async () => {
    setAiWriting(true); setAiError('')
    try {
      const res = await fetch(`${API_BASE}/api/diaries/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: todayStr }) })
      const data = await res.json()
      if (data.content) { setAiDiary(data.content); loadDiaries(true) }
      else setAiError('今天还没对话，钟泽写不出来…先去聊两句？')
    } catch (_) { setAiError('生成失败，稍后再试试') } finally { setAiWriting(false) }
  }
  useEffect(() => { loadCheckin(); loadDiaries() }, [])

  const saveCheckin = async () => {
    if (saving) return
    setSaving(true)
    try {
      await fetch(`${API_BASE}/api/daily`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      await loadCheckin()
    } catch (_) {} finally { setSaving(false) }
  }
  const saveMyDiary = async () => {
    if (saving || !myDiary.trim()) return
    setSaving(true)
    try {
      await fetch(`${API_BASE}/api/diaries`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: todayStr, content: myDiary }) })
      await loadDiaries(true)
    } catch (_) {} finally { setSaving(false) }
  }

  const timeInput = (key) => (
    <input type="time" value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--color-border-glass)', background: 'var(--color-card-glass)', color: 'inherit' }} />
  )
  const textInput = (key, ph) => (
    <input className="input" placeholder={ph} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--color-border-glass)', background: 'var(--color-card-glass)', color: 'inherit' }} />
  )

  const groups = []
  diaries.forEach(d => {
    const g = groups.find(x => x.date === d.date)
    if (g) g.entries.push(d); else groups.push({ date: d.date, entries: [d] })
  })

  const cardStyle = { background: 'var(--color-card-glass)', backdropFilter: 'blur(20px) saturate(1.6)', WebkitBackdropFilter: 'blur(20px) saturate(1.6)', border: '1px solid var(--color-border-glass)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-soft)', padding: 12, marginTop: 10 }

  return (
    <div style={{ marginTop: 16 }}>
      <p style={{ color: 'var(--color-text-gray)', fontSize: 13 }}>每日打卡 · 吃了什么、几点睡，钟泽都会知道</p>
      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {timeInput('wake_time')}
          {timeInput('sleep_time')}
        </div>
        {textInput('breakfast', '早餐吃了什么')}
        {textInput('lunch', '午餐吃了什么')}
        {textInput('dinner', '晚餐吃了什么')}
        <textarea className="input" placeholder="备注（今天的心情、发生的事…）" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} rows={2} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--color-border-glass)', background: 'var(--color-card-glass)', color: 'inherit', resize: 'vertical' }} />
        <button className="btn" onClick={saveCheckin} disabled={saving}>💾 打卡</button>
      </div>
      {records.length > 0 && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {records.filter(r => r.date !== todayStr).slice(0, 4).map(r => (
            <div key={r.id} style={{ background: 'var(--color-card-glass)', backdropFilter: 'blur(20px) saturate(1.6)', border: '1px solid var(--color-border-glass)', borderRadius: 'var(--radius-md)', padding: 10, fontSize: 12, color: 'var(--color-text-gray)' }}>
              <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>{r.date}</span>
              {(r.wake_time || r.sleep_time) && ` · ${r.wake_time || ''}${r.sleep_time ? ` → ${r.sleep_time}` : ''}`}
              {(r.breakfast || r.lunch || r.dinner) && ` · ${[r.breakfast, r.lunch, r.dinner].filter(Boolean).join(' / ')}`}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 26, paddingTop: 18, borderTop: '1px solid var(--color-border-glass)' }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-primary)' }}>📖 双人日记 · {todayStr}</div>

        <div style={cardStyle}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>钟泽 ✍️</div>
          {aiWriting
            ? <div style={{ marginTop: 8, color: 'var(--color-text-gray)', fontSize: 13 }}>钟泽正在写今天的日记…</div>
            : aiDiary
              ? <div style={{ marginTop: 6, fontSize: 13, color: 'var(--color-text-gray)', lineHeight: 1.7 }}><Markdown>{aiDiary}</Markdown></div>
              : <div style={{ marginTop: 6, fontSize: 13, color: 'var(--color-text-gray)' }}>{aiError || '钟泽今天还没写…'}</div>}
        </div>

        <div style={cardStyle}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>泠泠 ✍️</div>
          <textarea className="input" placeholder="写下今天想对钟泽说的话…" value={myDiary} onChange={e => setMyDiary(e.target.value)} rows={4} style={{ marginTop: 8, padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border-glass)', background: 'var(--color-card-glass)', color: 'inherit', resize: 'vertical', width: '100%', boxSizing: 'border-box' }} />
          <button className="btn" onClick={saveMyDiary} disabled={saving || !myDiary.trim()} style={{ marginTop: 8 }}>💾 保存日记</button>
        </div>

        {groups.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-gray)' }}>往日的日记</div>
            {groups.filter(g => g.date !== todayStr).slice(0, 5).map(g => (
              <div key={g.date} style={cardStyle}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-primary)' }}>{g.date}</div>
                {g.entries.map((e, i) => (
                  <div key={i} style={{ marginTop: 8, fontSize: 13, lineHeight: 1.7, color: 'var(--color-text-gray)' }}>
                    <span style={{ fontWeight: 600, color: 'var(--color-text-dark)' }}>{e.author === 'user' ? '泠泠' : '钟泽'}：</span>
                    <Markdown>{e.content.slice(0, 300)}{e.content.length > 300 ? '…' : ''}</Markdown>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const SettingsPanel = () => {
  const [showThinking, setShowThinking] = useState(() => { try { return localStorage.getItem('show_thinking') !== 'false' } catch { return true } })
  const toggle = () => {
    const n = !showThinking
    setShowThinking(n)
    try { localStorage.setItem('show_thinking', String(n)) } catch (_) {}
  }
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ background: 'var(--color-card-glass)', backdropFilter: 'blur(20px) saturate(1.6)', border: '1px solid var(--color-border-glass)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-soft)', padding: 14 }}>
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
    </div>
  )
}

const LifePage = () => {
  const [sub, setSub] = useState('mem')
  const subTabs = [
    { key: 'mem', label: '🧠 记忆' },
    { key: 'diary', label: '📖 日记' },
    { key: 'settings', label: '⚙️ 设置' },
  ]
  const subStyle = (k) => ({
    padding: '6px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
    background: sub === k ? 'var(--color-primary)' : 'transparent',
    color: sub === k ? '#fff' : 'var(--color-text-gray)',
    border: 'none', transition: 'all 0.2s',
  })
  return (
    <div style={{ padding: 20 }}>
      <h3 style={{ color: 'var(--color-primary)' }}>📋 LIFE</h3>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        {subTabs.map(t => <button key={t.key} style={subStyle(t.key)} onClick={() => setSub(t.key)}>{t.label}</button>)}
      </div>
      {sub === 'mem' && <MemPanel />}
      {sub === 'diary' && <DiaryPanel />}
      {sub === 'settings' && <SettingsPanel />}
    </div>
  )
}

const ChatListPage = ({ onOpenChat, refreshTrigger }) => {
  const [conversations, setConversations] = useState([])
  useEffect(() => { fetchConversations().then(setConversations).catch(() => {}) }, [refreshTrigger])
  const handleCreate = async () => {
    try { const { id } = await createConversation('新对话'); fetchConversations().then(setConversations); onOpenChat({ id, title: '新对话' }) } catch (e) { console.error(e) }
  }
  const handleDelete = async (e, convId) => { e.stopPropagation(); await deleteConversation(convId); fetchConversations().then(setConversations) }
  const formatTime = (ts) => {
    if (!ts) return ''; const d = new Date(ts), diff = Date.now() - d
    if (diff < 60000) return '刚刚'; if (diff < 3600000) return `${Math.floor(diff/60000)}分钟前`
    if (diff < 86400000) return d.toLocaleTimeString('zh-CN', { hour:'2-digit', minute:'2-digit' })
    return d.toLocaleDateString('zh-CN', { month:'short', day:'numeric' })
  }
  return (
    <div className="chat-page">
      <div className="chat-header"><div className="chat-header-title">💬 对话</div><button className="btn" onClick={handleCreate} style={{ padding: '6px 14px', fontSize: 13 }}>＋ 新建</button></div>
      <div className="chat-list">
        {conversations.length === 0 ? <div className="chat-empty">💬 暂无会话<br/>点「新建」开始第一条对话吧</div> : conversations.map(conv => (
          <div key={conv.id} className="chat-item" onClick={() => onOpenChat(conv)}>
            <div className="chat-avatar">❤️</div>
            <div className="chat-info"><div className="chat-name">{conv.title || '新对话'}</div><div className="chat-last-msg">{conv.last_message || ''}</div></div>
            <div className="chat-right"><div className="chat-time">{formatTime(conv.updated_at)}</div><button className="chat-item-delete" onClick={(e) => handleDelete(e, conv.id)}>✕</button></div>
          </div>
        ))}
      </div>
    </div>
  )
}

// —— 思考卡片（暖白饱和玻璃）：思考中渐变预览，完成后收起成一行，点击展开 ——
const ThinkingCard = ({ text, done, dur }) => {
  const [open, setOpen] = useState(false)
  useEffect(() => { if (done) setOpen(false) }, [done])
  const showBody = open || !done
  const isPreview = !done
  return (
    <div style={glassCard} className="tool-card status-thinking">
      <div onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', cursor: 'pointer', fontSize: 12, color: 'var(--color-text-gray)', userSelect: 'none' }}>
        <span style={{ fontSize: 13 }}>💡</span>
        <span>{done ? (dur ? `深度思考 · ${(dur / 1000).toFixed(1)}s` : '深度思考') : '思考中…'}</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, opacity: 0.7 }}>{done ? (open ? '▲' : '▼') : ''}</span>
      </div>
      {showBody && (
        <div style={{
          padding: '0 14px 10px', maxHeight: isPreview ? 120 : 320, overflowY: 'auto', fontSize: 12, lineHeight: 1.7,
          color: 'var(--color-text-gray)', whiteSpace: 'pre-wrap',
          borderTop: '1px solid var(--color-border-glass)',
          maskImage: isPreview ? 'linear-gradient(to bottom, black 55%, transparent 100%)' : 'none',
          WebkitMaskImage: isPreview ? 'linear-gradient(to bottom, black 55%, transparent 100%)' : 'none',
        }}>{text}</div>
      )}
    </div>
  )
}

// —— 工具卡片（暖白饱和玻璃）：执行中展开，完成后自动折叠，点击展开详情 ——
const ToolCard = ({ tool, result }) => {
  const [open, setOpen] = useState(false)
  const isError = !!result && String(result).startsWith('执行失败')
  const isRunning = result === undefined
  const icon = tool.name === 'read_file' ? '📖' : tool.name === 'write_file' ? '✏️' : tool.name === 'list_files' ? '📁' : tool.name === 'read_memories' ? '🧠' : tool.name === 'write_memory' ? '📝' : '⚙️'
  const showBody = open || isRunning
  return (
    <div style={{ ...glassCard, marginBottom: 6 }} className={`tool-card ${isRunning ? 'status-thinking' : isError ? 'status-err' : 'status-ok'}`}>
      <div onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', cursor: 'pointer', fontSize: 12, userSelect: 'none' }}>
        <span className="tool-icon" style={{ fontSize: 13 }}>{icon}</span>
        <span style={{ color: 'var(--color-text-dark)', fontWeight: 600 }}>{tool.name}</span>
        {tool.arguments?.path && <span style={{ color: 'var(--color-text-gray)', fontSize: 11 }}>{tool.arguments.path}</span>}
        <span style={{ marginLeft: 'auto', fontSize: 12 }}>
          {isRunning ? <span style={{ color: '#C08B5E' }}>⏳</span> : isError ? <span style={{ color: '#D97777' }}>❌</span> : <span style={{ color: '#7D9B76' }}>✅</span>}
        </span>
      </div>
      {showBody && (
        <div style={{
          padding: '0 14px 10px', maxHeight: 220, overflowY: 'auto', fontSize: 11, lineHeight: 1.7,
          color: isError ? 'var(--color-danger)' : 'var(--color-text-gray)', whiteSpace: 'pre-wrap',
          borderTop: '1px solid var(--color-border-glass)', opacity: isRunning ? 0.7 : 1,
        }}>{result || '执行中…'}</div>
      )}
    </div>
  )
}

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
  const [inputText, setInputText] = useState('')
  const [loading, setLoading] = useState(false)
  const [mcpEnabled, setMcpEnabled] = useState(() => { try { return localStorage.getItem('mcp_enabled') === 'true' } catch { return false } })
  const [termOpen, setTermOpen] = useState(false)
  const [showThinking, setShowThinking] = useState(() => { try { return localStorage.getItem('show_thinking') !== 'false' } catch { return true } })
  const messagesEndRef = useRef(null)
  let nextId = useRef(Date.now())

  useEffect(() => {
    if (chatInfo?.id) fetchMessages(chatInfo.id).then(msgs => setMsgList(msgs.map(m => {
      let tc = null
      if (m.tool_calls) { try { tc = JSON.parse(m.tool_calls) } catch { tc = null } }
      const base = { id: m.id || m.created_at, text: m.content, isSelf: m.role === 'user' }
      if (m.role === 'assistant') {
        if (m.thinking) { base.thinking = m.thinking; base.thinkingDone = true; base.thinkingDur = 0 }
        if (Array.isArray(tc) && tc.length > 0) base.toolCalls = tc.map(t => ({ ...t, result: '' }))
      }
      return base
    }))).catch(() => {})
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
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 120
    setStickBottom(near)
    if (near) el.scrollTop = el.scrollHeight
  }, [msgList])
  const toggleMcp = () => { const n = !mcpEnabled; setMcpEnabled(n); try { localStorage.setItem('mcp_enabled', n) } catch (_) {} }
  const uid = () => { nextId.current += 1; return nextId.current }

  const executeMcp = async (tc) => {
    const r = await fetch(MCP_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', params: { name: tc.name, arguments: tc.arguments || {} }, id: 1 }) })
    const d = await r.json(); return d.result?.content?.[0]?.text || JSON.stringify(d)
  }

  const streamChat = async (msgs, aiId, onText, onThinking, skipSave = false) => {
    const res = await fetch(`${API_BASE}/api/chat/stream`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: msgs, model: 'deepseek-v4-flash', conversationId: chatInfo?.id || null, skipSave }) })
    const reader = res.body.getReader(); const decoder = new TextDecoder()
    let ft = '', buf = '', tcs = [], th = ''
    const thStart = Date.now(); let thDur = null
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n'); buf = lines.pop() || ''
      for (const l of lines) {
        if (!l.startsWith('data: ')) continue
        try {
          const d = JSON.parse(l.slice(6))
          if (d.content) { ft += d.content; onText(ft) }
          if (d.thinking) { th += d.thinking; onThinking?.(th) }
          if (d.thinking_done) { thDur = Date.now() - thStart }
          if (d.tool_calls) tcs = d.tool_calls
          if (d.done && d.conversationId && !chatInfo?.id) { chatInfo.id = d.conversationId }
        } catch (_) {}
      }
    }
    return { ft, tcs, th, thDur }
  }

  const runChatTurn = async (msgsForCtx, aiMsgId) => {
    const lastUserMsg = [...msgsForCtx].reverse().find(m => m.isSelf)
    const userText = lastUserMsg?.text || ''
    let mc = ''
    if (userText.length > 2) { try { const { memories, relatedMessages } = await searchMemories(userText); const parts = []; if (memories?.length > 0) parts.push('【记忆卡片】\n' + memories.slice(0, 2).map(m => m.summary).join('\n')); if (relatedMessages?.length > 0) parts.push('【历史对话】\n' + relatedMessages.slice(0, 3).map(m => `[${m.role==='user'?'泠泠':'钟泽'}] ${m.content.slice(0,150)}`).join('\n')); mc = parts.join('\n\n') } catch (_) {} }
    let pc = ''
    try { const [mems, inf] = await Promise.all([getProjectMemories(), githubFile('src/project/instructions.js')]); const parts = []; if (mems.length > 0) parts.push('【不能丢的时刻】\n' + mems.slice(0, 3).map(m => `[${m.title}] ${m.content.slice(0, 120)}`).join('\n')); if (inf.content) { const cap = inf.content.match(/const capabilities = `([\s\S]*?)`/); if (cap) parts.push('【当前能力】\n' + cap[1].slice(0, 2500)) } pc = parts.join('\n\n') } catch (_) {}
    // 本会话工具调用历史（刷新后也不瞎猜路径）：取最近 5 条带工具记录的 assistant 消息
    const toolHistory = msgsForCtx.filter(m => !m.isSelf && Array.isArray(m.toolCalls) && m.toolCalls.length > 0).slice(-5).map(m => m.toolCalls.map(t => `${t.name}${t.arguments?.path ? ` ${t.arguments.path}` : ''}`).join(', ')).join('；')
    const cms = [{ role: 'system', content: systemPrompt + (mc ? '\n\n' + mc : '') + (pc ? '\n\n' + pc : '') + (toolHistory ? '\n\n【本会话工具调用记录】你之前已经调用过这些工具（路径已确认，无需重新探索）：\n' + toolHistory : '') }, ...msgsForCtx.filter(m => !m.loading).slice(-40).map(m => ({ role: m.isSelf ? 'user' : 'assistant', content: m.text }))]
    cms.push({ role: 'system', content: '【工具调用提醒】如果需要查看项目代码、目录或修改文件来回答泠泠，请立即调用 read_file / list_files / write_file 工具（会自动执行并把结果注入回来）。不要只输出"我去看看"之类的文字却不调用工具，也不要用文字描述 GET 请求。不确定路径时先 list_files，然后 read_file。' })
    let curMsgs = cms, curFt = '', curTcs = [], curAiId = aiMsgId, rounds = 0
    const first = await streamChat(curMsgs, curAiId,
      (t) => setMsgList(p => p.map(m => m.id === curAiId ? { ...m, text: t, loading: false } : m)),
      (th) => setMsgList(p => p.map(m => m.id === curAiId ? { ...m, thinking: th, thinkingDone: false } : m)))
    curFt = first.ft; curTcs = first.tcs
    if (first.thDur) setMsgList(p => p.map(m => m.id === curAiId ? { ...m, thinkingDone: true, thinkingDur: first.thDur } : m))
    while (curTcs.length > 0 && rounds < MAX_TOOL_ROUNDS) {
      rounds++
      const results = []
      setMsgList(p => p.map(m => m.id === curAiId ? { ...m, text: curFt || '🔧 调用工具…', loading: false, toolCalls: curTcs.map(tc => ({ ...tc, result: '' })) } : m))
      for (const tc of curTcs) {
        let r
        try { r = await executeMcp(tc) } catch (e) { r = `执行失败: ${e.message}` }
        results.push({ tool: tc.name, result: r })
        setMsgList(p => p.map(m => m.id === curAiId ? { ...m, toolCalls: curTcs.map((t, i) => i <= results.length - 1 ? { ...t, result: results[i]?.result } : t) } : m))
      }
      const nid = uid(); setMsgList(p => [...p, { id: nid, text: '', isSelf: false, loading: true }])
      const toolText = results.map((r, i) => {
        const out = r.result
        const truncated = out.length > TOOL_OUTPUT_LIMIT
        return `[工具: ${r.tool}]\n${truncated ? out.slice(0, TOOL_OUTPUT_LIMIT) + `\n[工具输出已截断：共 ${out.length} 字符，仅显示前 ${TOOL_OUTPUT_LIMIT} 字符。如需要完整内容，请用 read_file 读取相关文件]` : out}`
      }).join('\n\n')
      const fms = [...curMsgs, { role: 'assistant', content: curFt || '' }, { role: 'user', content: `[工具结果]\n${toolText}\n\n请根据以上工具结果继续回答。` }]
      const nxt = await streamChat(fms, nid,
        (t) => setMsgList(p => p.map(m => m.id === nid ? { ...m, text: t, loading: false } : m)),
        (th) => setMsgList(p => p.map(m => m.id === nid ? { ...m, thinking: th, thinkingDone: false } : m)),
        true)
      if (nxt.thDur) setMsgList(p => p.map(m => m.id === nid ? { ...m, thinkingDone: true, thinkingDur: nxt.thDur } : m))
      curMsgs = fms; curFt = nxt.ft; curTcs = nxt.tcs; curAiId = nid
    }
  }

  const handleSend = async () => { if (!inputText.trim() || loading) return; const ut = inputText.trim(); setInputText(''); setLoading(true); const uidU = uid(), uidA = uid(); const um = { id: uidU, text: ut, isSelf: true }; setMsgList(p => [...p, um, { id: uidA, text: '', isSelf: false, loading: true }]); try { await runChatTurn([...msgList, um], uidA) } catch (e) { setMsgList(p => p.map(m => m.id === uidA ? { ...m, text: '出错啦，请重试', loading: false } : m)) } finally { setLoading(false) } }
  const handleKeyDown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }

  return (
    <div className="chat-detail-page">
      <Terminal open={termOpen} onClose={() => setTermOpen(false)} />
      <div className="chat-detail-header">
        <span className="chat-back" onClick={onBack}>←</span>
        <span className="chat-detail-title">{chatInfo?.title || '新对话'}</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <span onClick={() => setTermOpen(true)} style={{ cursor: 'pointer', fontSize: 18, padding: '4px 8px', borderRadius: 8, background: termOpen ? '#050607' : 'transparent', color: termOpen ? '#9dffbc' : 'var(--color-text-gray)', transition: 'all 0.2s', userSelect: 'none' }} title="Terminal">💻</span>
          <span onClick={toggleMcp} style={{ cursor: 'pointer', fontSize: 20, padding: '4px 8px', borderRadius: 8, background: mcpEnabled ? 'var(--color-primary)' : 'transparent', color: mcpEnabled ? '#fff' : 'var(--color-text-gray)', transition: 'all 0.2s', userSelect: 'none' }} title={mcpEnabled ? 'MCP 已开启' : 'MCP 已关闭'}>🔧</span>
        </div>
      </div>
      <div className="chat-message-list" onScroll={handleMsgScroll}>
        {msgList.map(msg => (
          <div key={msg.id} className="msg-enter">
            {/* 思考独立成行（RikkaHub 风格：思考/工具/文本各自独立块） */}
            {!msg.isSelf && msg.thinking && showThinking && (
              <div className="msg-left"><ThinkingCard text={msg.thinking} done={!!msg.thinkingDone} dur={msg.thinkingDur || 0} /></div>
            )}
            {msg.toolCalls && msg.toolCalls.map((tc, i) => (
              <div key={i} className="msg-left"><ToolCard tool={tc} result={tc.result} /></div>
            ))}
            <div className={msg.isSelf ? 'msg-right' : 'msg-left'}>
              {msg.loading ? <div className="msg-typing"><span className="dot"/><span className="dot"/><span className="dot"/></div> : <div className="msg-bubble"><Markdown>{msg.text}</Markdown></div>}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef}/>
      </div>
      <div className="chat-input-bar">
        <input className="input" placeholder={mcpEnabled ? "MCP 已开启，AI 可调用工具…" : "写点什么..."} value={inputText} onChange={e => setInputText(e.target.value)} onKeyDown={handleKeyDown} disabled={loading}/>
        <button className="btn" onClick={handleSend} disabled={loading || !inputText.trim()}>发送</button>
      </div>
    </div>
  )
}

export default function App() {
  const [activeTab, setActiveTab] = useState('chat')
  const [currentChat, setCurrentChat] = useState(() => {
    try { return JSON.parse(localStorage.getItem('current_chat') || 'null') } catch { return null }
  })
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  const handleOpenChat = (chat) => {
    setCurrentChat(chat)
    try { localStorage.setItem('current_chat', JSON.stringify(chat)) } catch (_) {}
  }

  const handleBack = () => {
    setCurrentChat(null)
    try { localStorage.removeItem('current_chat') } catch (_) {}
    setRefreshTrigger(t => t + 1)
  }

  return (
    <div className="page-wrap">
      <div style={{ display: activeTab === 'lair' ? 'block' : 'none' }}><LairPage/></div>
      <div style={{ display: activeTab === 'chat' ? 'block' : 'none' }}>
        {currentChat
          ? <ChatDetailPage chatInfo={currentChat} onBack={handleBack}/>
          : <ChatListPage onOpenChat={handleOpenChat} refreshTrigger={refreshTrigger}/>
        }
      </div>
      <div style={{ display: activeTab === 'life' ? 'block' : 'none' }}><LifePage/></div>
      <TabNav activeTab={activeTab} onChangeTab={setActiveTab}/>
    </div>
  )
}
