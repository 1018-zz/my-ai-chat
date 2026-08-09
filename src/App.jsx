import { fetchConversations, createConversation, deleteConversation, fetchMessages, searchMemories, githubFile } from './utils/api'
import { buildSystemPrompt } from './project/instructions'
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
const LifePage = () => (<div style={{ padding: 20 }}><h3 style={{ color: 'var(--color-primary)' }}>📋 LIFE</h3><p style={{ color: 'var(--color-text-gray)', marginTop: 8 }}>日记 · 设置 · 记忆管理</p></div>)

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

// ==================== Tool Call Card ====================
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

// ==================== Terminal ====================
const Terminal = ({ open, onClose }) => {
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('term_history') || '[]') } catch { return [] }
  })
  const [input, setInput] = useState('')
  const inputRef = useRef(null)
  const logRef = useRef(null)

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 200) }, [open])
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' }); try { localStorage.setItem('term_history', JSON.stringify(history.slice(-100))) } catch (_) {} }, [history])

  const addLog = (entry) => setHistory(prev => [...prev, { ...entry, id: Date.now() }])

  const parseCommand = (raw) => {
    const trimmed = raw.trim()
    if (!trimmed) return null
    const m = trimmed.match(/^([rlw])\s+(.+)$/)
    if (m) {
      const [, c, rest] = m
      if (c === 'r') { const [p, r = 'my-ai-chat'] = rest.split(/\s+/, 2); return { name: 'read_file', path: p, repo: r } }
      if (c === 'l') { const [p, r = 'my-ai-chat'] = rest.split(/\s+/, 2); return { name: 'list_files', path: p || '', repo: r } }
    }
    if (trimmed.startsWith('{')) { try { return JSON.parse(trimmed) } catch { return null } }
    return null
  }

  const execute = async (raw) => {
    if (!raw.trim()) return
    addLog({ type: 'cmd', text: raw }); setInput('')
    const cmd = parseCommand(raw)
    if (!cmd) { addLog({ type: 'err', text: '格式: r path [repo] / l path [repo] / JSON' }); return }
    addLog({ type: 'info', text: `${cmd.name} ${cmd.path || ''}` })
    try {
      const { name, raw: _, ...args } = cmd
      const res = await fetch(MCP_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', params: { name, arguments: args }, id: 1 }) })
      const data = await res.json()
      addLog({ type: 'result', text: data.result?.content?.[0]?.text || JSON.stringify(data) })
    } catch (e) { addLog({ type: 'err', text: `失败: ${e.message}` }) }
  }

  if (!open) return null
  return (
    <div className="term-panel">
      <div className="term-top"><button className="term-back" onClick={onClose}>✕</button><div className="term-title"><strong>Terminal</strong><span>MCP · r/l 快捷指令</span></div></div>
      <div className="term-log" ref={logRef}>
        {history.length === 0 && <div className="term-entry term-info">💡 r path — 读文件 · l path — 列目录</div>}
        {history.map(h => <div key={h.id} className={`term-entry ${h.type === 'cmd' ? 'term-user' : h.type === 'err' ? 'term-err' : h.type === 'info' ? 'term-info' : ''}`}>{h.type === 'cmd' ? `> ${h.text}` : h.text}</div>)}
      </div>
      <div className="term-form"><span className="term-prompt">&gt;</span><textarea className="term-input" ref={inputRef} placeholder="r src/App.jsx" value={input} onChange={e => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); execute(input) } }} rows={1} /><button className="term-send" onClick={() => execute(input)}>↵</button></div>
    </div>
  )
}

// ==================== ChatDetailPage ====================
const ChatDetailPage = ({ chatInfo, onBack }) => {
  const [msgList, setMsgList] = useState([])
  const [inputText, setInputText] = useState('')
  const [loading, setLoading] = useState(false)
  const [mcpEnabled, setMcpEnabled] = useState(() => { try { return localStorage.getItem('mcp_enabled') === 'true' } catch { return false } })
  const [termOpen, setTermOpen] = useState(false)
  const messagesEndRef = useRef(null)
  let nextId = useRef(Date.now())

  useEffect(() => {
    if (!chatInfo?.id) return
    fetchMessages(chatInfo.id).then(msgs => setMsgList(msgs.map(m => ({
      id: m.id || m.created_at, text: m.content, isSelf: m.role === 'user',
    })))).catch(() => {})
  }, [chatInfo?.id])
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgList])

  const toggleMcp = () => { const next = !mcpEnabled; setMcpEnabled(next); try { localStorage.setItem('mcp_enabled', next) } catch (_) {} }
  const uid = () => { nextId.current += 1; return nextId.current }

  // ★ 执行 MCP 工具
  const executeMcp = async (toolCall) => {
    const { name, arguments: args } = toolCall
    const res = await fetch(MCP_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', params: { name, arguments: args || {} }, id: 1 }),
    })
    const data = await res.json()
    return data.result?.content?.[0]?.text || JSON.stringify(data)
  }

  // ★ 流式调用 + tool calling 处理
  const streamChat = async (contextMessages, aiMsgId, onText, onToolCalls) => {
    const res = await fetch(`${API_BASE}/api/chat/stream`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: contextMessages, model: 'deepseek-v4-flash', conversationId: chatInfo?.id || null, tools: mcpEnabled ? undefined : [] }),
    })
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let fullText = '', buffer = '', toolCalls = []

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n'); buffer = lines.pop() || ''
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        try {
          const d = JSON.parse(line.slice(6))
          if (d.content) { fullText += d.content; onText(fullText) }
          if (d.tool_calls) { toolCalls = d.tool_calls }
          if (d.done && d.conversationId && !chatInfo?.id) { chatInfo.id = d.conversationId; chatInfo.title = '' }
        } catch (_) {}
      }
    }
    return { fullText, toolCalls }
  }

  const runChatTurn = async (messagesForContext, aiMsgId) => {
    const lastUserMsg = [...messagesForContext].reverse().find(m => m.isSelf)
    const userText = lastUserMsg?.text || ''

    let memoryContext = ''
    if (userText.length > 2) {
      try {
        const { memories, relatedMessages } = await searchMemories(userText)
        const parts = []
        if (memories?.length > 0) parts.push('【记忆卡片】\n' + memories.slice(0, 2).map(m => m.summary).join('\n'))
        if (relatedMessages?.length > 0) parts.push('【历史对话】\n' + relatedMessages.slice(0, 3).map(m => `[${m.role === 'user' ? '泠泠' : '钟泽'}] ${m.content.slice(0, 150)}`).join('\n'))
        memoryContext = parts.join('\n\n')
      } catch (_) {}
    }
    let projectContext = ''
    try {
      const [memFile, instFile] = await Promise.all([githubFile('src/project/memories.js'), githubFile('src/project/instructions.js')])
      const parts = []
      if (memFile.content) parts.push('【不能丢的时刻】\n' + memFile.content.slice(0, 800))
      if (instFile.content) { const cap = instFile.content.match(/const capabilities = `([\s\S]*?)`/); if (cap) parts.push('【当前能力】\n' + cap[1].slice(0, 1000)) }
      projectContext = parts.join('\n\n')
    } catch (_) {}

    const contextMessages = [
      { role: 'system', content: systemPrompt + (memoryContext ? '\n\n' + memoryContext : '') + (projectContext ? '\n\n' + projectContext : '') },
      ...messagesForContext.filter(m => !m.loading).slice(-40).map(m => ({ role: m.isSelf ? 'user' : 'assistant', content: m.text })),
    ]

    const { fullText, toolCalls } = await streamChat(contextMessages, aiMsgId,
      (text) => setMsgList(prev => prev.map(m => m.id === aiMsgId ? { ...m, text, loading: false } : m)),
      null
    )

    // ★ tool_calls 处理
    if (toolCalls.length > 0) {
      const toolCardId = uid()
      const results = []
      setMsgList(prev => prev.map(m => m.id === aiMsgId ? { ...m, text: fullText || '🔧 调用工具…', loading: false, toolCalls: toolCalls.map(tc => ({ ...tc, result: '' })) } : m))

      for (const tc of toolCalls) {
        const result = await executeMcp(tc)
        results.push({ tool: tc.name, result })
        setMsgList(prev => prev.map(m => m.id === aiMsgId ? { ...m, toolCalls: toolCalls.map((t, i) => i <= results.length - 1 ? { ...t, result: results[i]?.result } : t) } : m))
      }

      // 继续对话：注入工具结果
      const newAiMsgId = uid()
      setMsgList(prev => [...prev, { id: newAiMsgId, text: '', isSelf: false, loading: true }])
      const toolResultsText = results.map((r, i) => `[工具: ${r.tool}]\n${r.result.slice(0, 3000)}`).join('\n\n')
      const followMessages = [
        ...contextMessages,
        { role: 'assistant', content: fullText || '' },
        { role: 'user', content: `[工具结果]\n${toolResultsText}\n\n请根据以上工具结果继续回答。` },
      ]
      const follow = await streamChat(followMessages, newAiMsgId,
        (text) => setMsgList(prev => prev.map(m => m.id === newAiMsgId ? { ...m, text, loading: false } : m)),
        null
      )
      if (follow.toolCalls.length > 0) {
        // 递归处理第二轮工具调用（最多一层，防止无限循环）
        const r2 = []
        for (const tc of follow.toolCalls) {
          r2.push({ tool: tc.name, result: await executeMcp(tc) })
        }
        const r2Id = uid()
        setMsgList(prev => [...prev, { id: r2Id, text: '', isSelf: false, loading: true }])
        const r2text = r2.map((r, i) => `[工具: ${r.tool}]\n${r.result.slice(0, 3000)}`).join('\n\n')
        const r2Messages = [...followMessages, { role: 'assistant', content: follow.fullText || '' }, { role: 'user', content: `[工具结果]\n${r2text}\n\n继续。` }]
        const r2id = uid()
        setMsgList(prev => [...prev, { id: r2id, text: '', isSelf: false, loading: true }])
        const r2res = await streamChat(r2Messages, r2id, (text) => setMsgList(prev => prev.map(m => m.id === r2id ? { ...m, text, loading: false } : m)), null)
      }
    }
  }

  const handleSend = async () => {
    if (!inputText.trim() || loading) return
    const userText = inputText.trim(); setInputText(''); setLoading(true)
    const userMsgId = uid(), aiMsgId = uid()
    const newUserMsg = { id: userMsgId, text: userText, isSelf: true }
    setMsgList(prev => [...prev, newUserMsg, { id: aiMsgId, text: '', isSelf: false, loading: true }])
    try { await runChatTurn([...msgList, newUserMsg], aiMsgId) }
    catch (e) { setMsgList(prev => prev.map(m => m.id === aiMsgId ? { ...m, text: '出错啦，请重试', loading: false } : m)) }
    finally { setLoading(false) }
  }

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
            {msg.toolCalls && msg.toolCalls.map((tc, i) => (
              <div key={i} className="msg-left"><ToolCard tool={tc} result={tc.result} collapsed={!!tc.result} /></div>
            ))}
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
  const [currentChat, setCurrentChat] = useState(null)
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  return (
    <div className="page-wrap">
      {activeTab === 'lair' && <LairPage/>}
      {activeTab === 'chat' && (currentChat ? <ChatDetailPage chatInfo={currentChat} onBack={() => { setCurrentChat(null); setRefreshTrigger(t => t+1) }}/> : <ChatListPage onOpenChat={setCurrentChat} refreshTrigger={refreshTrigger}/>)}
      {activeTab === 'life' && <LifePage/>}
      <TabNav activeTab={activeTab} onChangeTab={setActiveTab}/>
    </div>
  )
}
