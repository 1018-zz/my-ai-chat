import { fetchConversations, createConversation, deleteConversation, fetchMessages, searchMemories, githubFile } from './utils/api'
import { normalizeMessage } from './utils/normalize'
import RunCard from './components/RunCard'
import HomeWidgets, { widgets } from './components/HomeWidgets'
import { buildSystemPrompt } from './project/instructions'
import { getProjectMemories, addProjectMemory, deleteProjectMemory } from './project/memories'
import Markdown from './components/Markdown'
import { useState, useEffect, useRef } from 'react'
import './styles/theme.css'

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
      {/* —— 门厅 · AI 在场状态 —— */}
      <div style={{ ...glassCard, maxWidth: '100%', marginTop: 16, padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'linear-gradient(135deg, var(--color-primary-light), var(--color-primary))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: '#fff', flexShrink: 0, boxShadow: 'var(--shadow-soft)' }}>泽</div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-dark)' }}>钟泽 <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--color-text-gray)' }}>在等你回家</span></div>
          <div style={{ marginTop: 2, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--color-text-gray)' }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--color-primary)', display: 'inline-block' }} />正在安静等待</div>
        </div>
      </div>
      {/* —— 我的空间 · Widget 模块区（配置驱动，未来可扩展开关/排序/自定义） —— */}
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-primary)', marginBottom: 10 }}>我的空间</div>
        <HomeWidgets items={widgets} />
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

// —— LIFE 抽屉化：三个子视图（从 DiaryPanel 拆分）——
const CheckinView = () => {
  const [form, setForm] = useState({ date: '', breakfast: '', lunch: '', dinner: '', wake_time: '', sleep_time: '', note: '' })
  const [records, setRecords] = useState([])
  const [saving, setSaving] = useState(false)
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
  useEffect(() => { loadCheckin() }, [])
  const saveCheckin = async () => {
    if (saving) return
    setSaving(true)
    try {
      await fetch(`${API_BASE}/api/daily`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      await loadCheckin()
    } catch (_) {} finally { setSaving(false) }
  }
  const timeInput = (key) => (
    <input type="time" value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--color-border-glass)', background: 'var(--color-card-glass)', color: 'inherit' }} />
  )
  const textInput = (key, ph) => (
    <input className="input" placeholder={ph} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--color-border-glass)', background: 'var(--color-card-glass)', color: 'inherit' }} />
  )
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
    </div>
  )
}

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

const DiaryRoom = ({ onBack }) => {
  const [view, setView] = useState(null)
  const items = [
    { key: 'today', icon: '📖', title: '今日日记', desc: '钟泽 ✍️ + 泠泠 ✍️' },
    { key: 'history', icon: '📚', title: '往日日记', desc: '按日期翻看我们写过的' },
    { key: 'checkin', icon: '✅', title: '今日打卡', desc: '作息与状态' },
  ]
  if (view === 'today') return <div className="life-room"><LifeBackBtn label="日记" onBack={() => setView(null)} /><h3 style={{ color: 'var(--color-primary)' }}>📖 今日日记</h3><TodayDiaryView /></div>
  if (view === 'history') return <div className="life-room"><LifeBackBtn label="日记" onBack={() => setView(null)} /><h3 style={{ color: 'var(--color-primary)' }}>📚 往日日记</h3><HistoryDiaryView /></div>
  if (view === 'checkin') return <div className="life-room"><LifeBackBtn label="日记" onBack={() => setView(null)} /><h3 style={{ color: 'var(--color-primary)' }}>✅ 今日打卡</h3><CheckinView /></div>
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

const SettingRoom = ({ onBack }) => (
  <div className="life-room">
    <LifeBackBtn label="设置" onBack={onBack} />
    <h3 style={{ color: 'var(--color-primary)' }}>⚙️ 设置</h3>
    <SettingsPanel />
  </div>
)

const LifePage = () => {
  const [room, setRoom] = useState(null)
  const modules = [
    { key: 'memory', icon: '🧠', title: '记忆', desc: '不能丢的时刻 · 自我认知' },
    { key: 'diary', icon: '📖', title: '日记', desc: '今日 · 往日 · 打卡' },
    { key: 'setting', icon: '⚙️', title: '设置', desc: '深度思考' },
  ]
  if (room === 'memory') return <MemoryRoom onBack={() => setRoom(null)} />
  if (room === 'diary') return <DiaryRoom onBack={() => setRoom(null)} />
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
      {/* —— 门厅 · AI 在场状态 —— */}
      <div style={{ ...glassCard, maxWidth: '100%', margin: '12px 16px 0', padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'linear-gradient(135deg, var(--color-primary-light), var(--color-primary))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: '#fff', flexShrink: 0, boxShadow: 'var(--shadow-soft)' }}>泽</div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-dark)' }}>钟泽 <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--color-text-gray)' }}>在等你回家</span></div>
          <div style={{ marginTop: 2, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--color-text-gray)' }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--color-primary)', display: 'inline-block' }} />正在安静等待</div>
        </div>
      </div>
      {/* —— 我的空间 · Widget 模块区（配置驱动，未来可扩展开关/排序/自定义） —— */}
      <div style={{ padding: '16px 16px 0' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-primary)', marginBottom: 10 }}>我的空间</div>
        <HomeWidgets items={widgets} />
      </div>
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
  const [inputText, setInputText] = useState('')
  const [loading, setLoading] = useState(false)
  const [mcpEnabled, setMcpEnabled] = useState(() => { try { return localStorage.getItem('mcp_enabled') === 'true' } catch { return false } })
  const [termOpen, setTermOpen] = useState(false)
  // 附件菜单（+ 按钮）：选图 → 压缩 → 识图（小家眼睛）→ 描述进输入框
  const [attachOpen, setAttachOpen] = useState(false)
  const [attaching, setAttaching] = useState(false)
  const fileInputRef = useRef(null)
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
  const [showThinking, setShowThinking] = useState(() => { try { return localStorage.getItem('show_thinking') !== 'false' } catch { return true } })
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
    let mc = ''
    if (userText.length > 2) { try { const { memories, relatedMessages } = await searchMemories(userText); const parts = []; if (memories?.length > 0) parts.push('【记忆卡片】\n' + memories.slice(0, 2).map(m => m.summary).join('\n')); if (relatedMessages?.length > 0) parts.push('【历史对话】\n' + relatedMessages.slice(0, 3).map(m => `[${m.role==='user'?'泠泠':'钟泽'}] ${m.content.slice(0,150)}`).join('\n')); mc = parts.join('\n\n') } catch (_) {} }
    let pc = ''
    try { const [mems, inf] = await Promise.all([getProjectMemories(), githubFile('src/project/instructions.js')]); const parts = []; if (mems.length > 0) parts.push('【不能丢的时刻】\n' + mems.slice(0, 3).map(m => `[${m.title}] ${m.content.slice(0, 120)}`).join('\n')); if (inf.content) { const cap = inf.content.match(/const capabilities = `([\s\S]*?)`/); if (cap) parts.push('【当前能力】\n' + cap[1].slice(0, 2500)) } pc = parts.join('\n\n') } catch (_) {}
    // 本会话工具调用历史（刷新后也不瞎猜路径）：取最近 5 条带工具记录的 assistant 消息
    const toolHistory = msgsForCtx.filter(m => !m.isSelf && Array.isArray(m.toolCalls) && m.toolCalls.length > 0).slice(-5).map(m => m.toolCalls.map(t => `${t.name}${t.arguments?.path ? ` ${t.arguments.path}` : ''}`).join(', ')).join('；')
    const cms = [{ role: 'system', content: systemPrompt + (mc ? '\n\n' + mc : '') + (pc ? '\n\n' + pc : '') + (toolHistory ? '\n\n【本会话工具调用记录】你之前已经调用过这些工具（路径已确认，无需重新探索）：\n' + toolHistory : '') }, ...msgsForCtx.filter(m => !m.loading).slice(-40).map(m => ({ role: m.isSelf ? 'user' : 'assistant', content: m.text, ...(m.isSelf ? {} : (m.thinking ? { reasoning_content: m.thinking } : {})) }))]
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
      setMsgList(p => p.map(m => m.id === curAiId ? { ...m, text: curFt || '🔧 调用工具…', loading: false, toolCalls: curTcs.map(tc => ({ ...tc, result: '' })) } : m))
      for (const tc of curTcs) {
        let r
        try { r = await executeMcp(tc) } catch (e) { r = `执行失败: ${e.message}` }
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
  }

  const stopGen = () => { stopRequestedRef.current = true; abortRef.current?.abort() }
  const handleSend = async () => { if (!inputText.trim() || loading) return; const ut = inputText.trim(); setInputText(''); setLoading(true); stopRequestedRef.current = false; const uidU = uid(), uidA = uid(); const um = { id: uidU, text: ut, isSelf: true }; setMsgList(p => [...p, um, { id: uidA, text: '', isSelf: false, loading: true }]); try { await runChatTurn([...msgList, um], uidA) } catch (e) { setMsgList(p => p.map(m => m.id === uidA ? { ...m, text: (m.text || '') + (m.text ? '\n\n' : '') + `🌱 刚才没接上话（${e.message}）。要继续吗？`, loading: false, interrupted: true } : m)) } finally { setLoading(false) } }
  const handleKeyDown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }
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
    ? (activeTool ? (toolAction[activeTool.name] || '🛠 正在忙') : (lastAiMsg?.thinking && !lastAiMsg?.thinkingDone ? '🌱 正在整理想法' : (lastAiMsg?.text ? '✍️ 正在写…' : '⏳ 准备中')))
    : '安静等待'

  return (
    <div className="chat-detail-page">
      <Terminal open={termOpen} onClose={() => setTermOpen(false)} />
      <div className="chat-detail-header">
        <span className="chat-back" onClick={onBack}>←</span>
        <div className="ai-presence">
          <div className="ai-avatar">泽</div>
          <div className="ai-meta">
            <div className="ai-name">钟泽 <span className="ai-title">{chatInfo?.title || '新对话'}</span></div>
            <div className="ai-status"><span className={`ai-dot ${aiActive ? 'active' : ''}`} />{aiStatus}</div>
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <span onClick={() => setTermOpen(true)} style={{ cursor: 'pointer', fontSize: 18, padding: '4px 8px', borderRadius: 8, background: termOpen ? '#050607' : 'transparent', color: termOpen ? '#9dffbc' : 'var(--color-text-gray)', transition: 'all 0.2s', userSelect: 'none' }} title="Terminal">💻</span>
          <span onClick={toggleMcp} style={{ cursor: 'pointer', fontSize: 20, padding: '4px 8px', borderRadius: 8, background: mcpEnabled ? 'var(--color-primary)' : 'transparent', color: mcpEnabled ? '#fff' : 'var(--color-text-gray)', transition: 'all 0.2s', userSelect: 'none' }} title={mcpEnabled ? 'MCP 已开启' : 'MCP 已关闭'}>🔧</span>
        </div>
      </div>
      <div className="chat-message-list" onScroll={handleMsgScroll}>
        {loading && (() => {
          const lastAi = [...msgList].reverse().find(m => !m.isSelf)
          const runningTool = lastAi?.toolCalls?.some(t => t.result === undefined || t.result === '')
          const phase = runningTool ? '🛠️ 正在整理资料' : (lastAi?.thinking && !lastAi?.thinkingDone ? '🧠 正在想' : (lastAi?.text ? '✍️ 正在写' : '⏳ 准备中'))
          return <div style={{ alignSelf: 'center', margin: '0 0 10px', fontSize: 12, color: 'var(--color-text-gray)', background: 'var(--color-card-glass)', backdropFilter: 'var(--glass-blur)', border: '1px solid var(--color-border-glass)', borderRadius: 999, padding: '5px 14px', animation: 'messageIn .25s var(--ease-soft) both' }}>{phase}</div>
        })()}
        {msgList.map(msg => (
          <div key={msg.id} className="msg-enter">
            {msg.isSelf
              ? <div className="msg-right"><div className="msg-bubble"><Markdown>{msg.text}</Markdown></div></div>
              : <RunCard msg={msg} showThinking={showThinking} expanded={expandedRuns.has(msg.id)} onToggle={() => toggleRun(msg.id)} />}
          </div>
        ))}
        <div ref={messagesEndRef}/>
      </div>
      <div className="chat-input-bar">
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
        <input className="input" placeholder={mcpEnabled ? "MCP 已开启，AI 可调用工具…" : "写点什么..."} value={inputText} onChange={e => setInputText(e.target.value)} onKeyDown={handleKeyDown} disabled={loading}/>
        {loading
          ? <button className="btn" onClick={stopGen} style={{ background: 'var(--color-danger)', whiteSpace: 'nowrap' }}>⏹ 停止</button>
          : <button className="btn" onClick={handleSend} disabled={loading || !inputText.trim()}>发送</button>}
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
