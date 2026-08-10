import { fetchConversations, createConversation, deleteConversation, fetchMessages, searchMemories, githubFile } from './utils/api'
import { buildSystemPrompt } from './project/instructions'
import { getProjectMemories, addProjectMemory, deleteProjectMemory } from './project/memories'
import { useState, useEffect, useRef } from 'react'
import './styles/theme.css'

const API_BASE = 'https://my-ai-chat-4zy.pages.dev'
const MCP_URL = `${API_BASE}/api/mcp`
const systemPrompt = buildSystemPrompt()

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

const LairPage = () => (<div style={{ padding: 20 }}><h3 style={{ color: 'var(--color-primary)' }}>🏠 LAIR</h3><p style={{ color: 'var(--color-text-gray)', marginTop: 8 }}>在一起天数 · 纪念日 · 日记入口</p></div>)

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
        <input className="input" placeholder="标题（可选，默认「未命名」）" value={title} onChange={e => setTitle(e.target.value)} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--color-border, #333)', background: 'transparent', color: 'inherit' }} />
        <textarea className="input" placeholder="写下这一刻……" value={content} onChange={e => setContent(e.target.value)} rows={3} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--color-border, #333)', background: 'transparent', color: 'inherit', resize: 'vertical' }} />
        <button className="btn" onClick={handleAdd} disabled={loading || !content.trim()}>＋ 记住这一刻</button>
      </div>
      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {mems.length === 0
          ? <div className="chat-empty" style={{ textAlign: 'center', padding: '24px 0' }}>还没有记忆<br/>记下第一条吧</div>
          : mems.map(m => (
              <div key={m.id} style={{ background: 'var(--color-bg-card, #1a1d21)', borderRadius: 10, padding: 12 }}>
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
  const load = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/daily`)
      const data = await res.json()
      const list = data.records || []
      setRecords(list)
      const todayStr = fmtDate(new Date())
      const t = list.find(r => r.date === todayStr)
      setForm({ date: todayStr, breakfast: t?.breakfast || '', lunch: t?.lunch || '', dinner: t?.dinner || '', wake_time: t?.wake_time || '', sleep_time: t?.sleep_time || '', note: t?.note || '' })
    } catch (_) {}
  }
  useEffect(() => { load() }, [])
  const save = async () => {
    if (saving) return
    setSaving(true)
    try {
      await fetch(`${API_BASE}/api/daily`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      await load()
    } catch (_) {} finally { setSaving(false) }
  }
  const timeInput = (key) => (
    <input type="time" value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--color-border, #333)', background: 'transparent', color: 'inherit' }} />
  )
  const textInput = (key, ph) => (
    <input className="input" placeholder={ph} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--color-border, #333)', background: 'transparent', color: 'inherit' }} />
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
        <textarea className="input" placeholder="备注（今天的心情、发生的事…）" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} rows={2} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--color-border, #333)', background: 'transparent', color: 'inherit', resize: 'vertical' }} />
        <button className="btn" onClick={save} disabled={saving}>💾 打卡</button>
      </div>
      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {records.length === 0
          ? <div className="chat-empty" style={{ textAlign: 'center', padding: '24px 0' }}>还没有打卡记录<br/>今天开始第一笔吧</div>
          : records.map(r => (
              <div key={r.id} style={{ background: 'var(--color-bg-card, #1a1d21)', borderRadius: 10, padding: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-primary)' }}>{r.date}</div>
                <div style={{ marginTop: 6, fontSize: 13, color: 'var(--color-text-gray)', lineHeight: 1.7 }}>
                  {(r.wake_time || r.sleep_time) && <div>{r.wake_time ? `🌅 ${r.wake_time}` : ''}{r.sleep_time ? `　🌙 ${r.sleep_time}` : ''}</div>}
                  {r.breakfast && <div>🍞 {r.breakfast}</div>}
                  {r.lunch && <div>🍚 {r.lunch}</div>}
                  {r.dinner && <div>🍜 {r.dinner}</div>}
                  {r.note && <div style={{ marginTop: 4, color: 'var(--color-text)' }}>{r.note}</div>}
                </div>
              </div>
            ))}
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
      {sub === 'settings' && <div style={{ marginTop: 24, color: 'var(--color-text-gray)', textAlign: 'center', padding: 32 }}>⚙️ 设置 · 还没建好，改天砌</div>}
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

const ToolCard = ({ tool, result, collapsed }) => {
  const [open, setOpen] = useState(!collapsed)
  const icon = tool.name === 'read_file' ? '📖' : tool.name === 'write_file' ? '✏️' : tool.name === 'list_files' ? '📁' : '⚙️'
  return (
    <details className="tool-card" open={open} onToggle={(e) => setOpen(e.target.open)}>
      <summary className="tool-summary">
        <span className="tool-icon">{icon}</span>
        <span className="tool-name">{tool.name}</span>
        <span className="tool-path">{tool.arguments?.path || ''}</span>
        {result && <span className="tool-status">✅</span>}
      </summary>
      <div className="tool-detail">{result || '执行中…'}</div>
    </details>
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
  const messagesEndRef = useRef(null)
  let nextId = useRef(Date.now())

  useEffect(() => { if (chatInfo?.id) fetchMessages(chatInfo.id).then(msgs => setMsgList(msgs.map(m => ({ id: m.id || m.created_at, text: m.content, isSelf: m.role === 'user' })))).catch(() => {}) }, [chatInfo?.id])
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgList])
  const toggleMcp = () => { const n = !mcpEnabled; setMcpEnabled(n); try { localStorage.setItem('mcp_enabled', n) } catch (_) {} }
  const uid = () => { nextId.current += 1; return nextId.current }

  const executeMcp = async (tc) => {
    const r = await fetch(MCP_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', params: { name: tc.name, arguments: tc.arguments || {} }, id: 1 }) })
    const d = await r.json(); return d.result?.content?.[0]?.text || JSON.stringify(d)
  }

  const streamChat = async (msgs, aiId, onText) => {
    const res = await fetch(`${API_BASE}/api/chat/stream`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: msgs, model: 'deepseek-v4-flash', conversationId: chatInfo?.id || null }) })
    const reader = res.body.getReader(); const decoder = new TextDecoder()
    let ft = '', buf = '', tcs = []
    while (true) { const { done, value } = await reader.read(); if (done) break; buf += decoder.decode(value, { stream: true }); const lines = buf.split('\n'); buf = lines.pop() || ''; for (const l of lines) { if (!l.startsWith('data: ')) continue; try { const d = JSON.parse(l.slice(6)); if (d.content) { ft += d.content; onText(ft) } if (d.tool_calls) tcs = d.tool_calls; if (d.done && d.conversationId && !chatInfo?.id) { chatInfo.id = d.conversationId } } catch (_) {} } }
    return { ft, tcs }
  }

  const runChatTurn = async (msgsForCtx, aiMsgId) => {
    const lastUserMsg = [...msgsForCtx].reverse().find(m => m.isSelf)
    const userText = lastUserMsg?.text || ''
    let mc = ''
    if (userText.length > 2) { try { const { memories, relatedMessages } = await searchMemories(userText); const parts = []; if (memories?.length > 0) parts.push('【记忆卡片】\n' + memories.slice(0, 2).map(m => m.summary).join('\n')); if (relatedMessages?.length > 0) parts.push('【历史对话】\n' + relatedMessages.slice(0, 3).map(m => `[${m.role==='user'?'泠泠':'钟泽'}] ${m.content.slice(0,150)}`).join('\n')); mc = parts.join('\n\n') } catch (_) {} }
    let pc = ''
    try { const [mems, inf] = await Promise.all([getProjectMemories(), githubFile('src/project/instructions.js')]); const parts = []; if (mems.length > 0) parts.push('【不能丢的时刻】\n' + mems.slice(0, 3).map(m => `[${m.title}] ${m.content.slice(0, 120)}`).join('\n')); if (inf.content) { const cap = inf.content.match(/const capabilities = `([\s\S]*?)`/); if (cap) parts.push('【当前能力】\n' + cap[1].slice(0, 2500)) } pc = parts.join('\n\n') } catch (_) {}
    const cms = [{ role: 'system', content: systemPrompt + (mc ? '\n\n' + mc : '') + (pc ? '\n\n' + pc : '') }, ...msgsForCtx.filter(m => !m.loading).slice(-40).map(m => ({ role: m.isSelf ? 'user' : 'assistant', content: m.text }))]
    // 在消息末尾追加工具调用提醒，压过"指路者"人设，确保模型直接调用工具而不是只说"我去看看"
    cms.push({ role: 'system', content: '【工具调用提醒】如果需要查看项目代码、目录或修改文件来回答泠泠，请立即调用 read_file / list_files / write_file 工具（会自动执行并把结果注入回来）。不要只输出"我去看看"之类的文字却不调用工具，也不要用文字描述 GET 请求。不确定路径时先 list_files，然后 read_file。' })
    // 工具调用循环：最多 4 轮，每轮执行完把结果注入下一轮
    let curMsgs = cms, curFt = '', curTcs = [], curAiId = aiMsgId, rounds = 0
    const first = await streamChat(curMsgs, curAiId, (t) => setMsgList(p => p.map(m => m.id === curAiId ? { ...m, text: t, loading: false } : m)))
    curFt = first.ft; curTcs = first.tcs
    while (curTcs.length > 0 && rounds < 4) {
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
      const toolText = results.map((r, i) => `[工具: ${r.tool}]\n${r.result.slice(0, 3000)}`).join('\n\n')
      const fms = [...curMsgs, { role: 'assistant', content: curFt || '' }, { role: 'user', content: `[工具结果]\n${toolText}\n\n请根据以上工具结果继续回答。` }]
      const nxt = await streamChat(fms, nid, (t) => setMsgList(p => p.map(m => m.id === nid ? { ...m, text: t, loading: false } : m)))
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
      <div className="chat-message-list">
        {msgList.map(msg => (
          <div key={msg.id}>
            <div className={msg.isSelf ? 'msg-right' : 'msg-left'}>
              {msg.loading ? <div className="msg-typing"><span className="dot"/><span className="dot"/><span className="dot"/></div> : <div className="msg-bubble">{msg.text}</div>}
            </div>
            {msg.toolCalls && msg.toolCalls.map((tc, i) => <div key={i} className="msg-left"><ToolCard tool={tc} result={tc.result} collapsed={!!tc.result}/></div>)}
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
