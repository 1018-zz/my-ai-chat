import { fetchConversations, createConversation, deleteConversation, fetchMessages, searchMemories, githubFile } from './utils/api'
import { buildSystemPrompt } from './project/instructions'
import { useState, useEffect, useRef } from 'react'
import './styles/theme.css'

const API_BASE = 'https://my-ai-chat-4zy.pages.dev'
const MCP_URL = `${API_BASE}/api/mcp`
const systemPrompt = buildSystemPrompt()

const MCP_SYSTEM_PROMPT = `
【MCP 工具模式已启用】
你可以使用以下工具操作项目代码。需要时在回复末尾输出工具调用块：

\`\`\`tool
{"name":"read_file","path":"src/App.jsx","repo":"my-ai-chat"}
\`\`\`

可用工具：
- read_file(path, repo?) → 读取代码
- list_files(path, repo?) → 列目录  
- write_file(path, content, message, repo?) → 修改代码（需要3个参数）

支持 owner/repo 格式查阅第三方仓库。工具结果会自动注入，无需等待确认。`

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

// ==================== ChatDetailPage ====================
const ChatDetailPage = ({ chatInfo, onBack }) => {
  const [msgList, setMsgList] = useState([])
  const [inputText, setInputText] = useState('')
  const [loading, setLoading] = useState(false)
  const [mcpEnabled, setMcpEnabled] = useState(() => { try { return localStorage.getItem('mcp_enabled') === 'true' } catch { return false } })
  const messagesEndRef = useRef(null)
  const autoTriggerRef = useRef(null)
  let nextId = useRef(Date.now())

  useEffect(() => {
    if (!chatInfo?.id) return
    fetchMessages(chatInfo.id).then(msgs => setMsgList(msgs.map(m => ({
      id: m.id || m.created_at, text: m.content, isSelf: m.role === 'user',
    })))).catch(() => {})
  }, [chatInfo?.id])

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgList])

  const toggleMcp = () => {
    const next = !mcpEnabled
    setMcpEnabled(next)
    try { localStorage.setItem('mcp_enabled', next) } catch (_) {}
  }

  const uid = () => { nextId.current += 1; return nextId.current }

  // ★ 执行一次完整对话轮次
  const runChatTurn = async (messagesForContext, aiMsgId) => {
    // 构建记忆 + 项目上下文
    const lastUserMsg = [...messagesForContext].reverse().find(m => m.isSelf)
    const userText = lastUserMsg?.text || ''

    let memoryContext = ''
    if (userText.length > 2) {
      try {
        const { memories, relatedMessages } = await searchMemories(userText)
        const parts = []
        if (memories?.length > 0) parts.push('【记忆卡片】\n' + memories.slice(0, 2).map(m => m.summary).join('\n'))
        if (relatedMessages?.length > 0) {
          parts.push('【历史对话】\n' + relatedMessages.slice(0, 3).map(m =>
            `[${m.role === 'user' ? '泠泠' : '钟泽'}] ${m.content.slice(0, 150)}`
          ).join('\n'))
        }
        memoryContext = parts.join('\n\n')
      } catch (_) {}
    }

    let projectContext = ''
    try {
      const [memFile, instFile] = await Promise.all([githubFile('src/project/memories.js'), githubFile('src/project/instructions.js')])
      const parts = []
      if (memFile.content) parts.push('【不能丢的时刻】\n' + memFile.content.slice(0, 800))
      if (instFile.content) {
        const capMatch = instFile.content.match(/const capabilities = `([\s\S]*?)`/)
        if (capMatch) parts.push('【当前能力】\n' + capMatch[1].slice(0, 1000))
      }
      projectContext = parts.join('\n\n')
    } catch (_) {}

    const mcpPrompt = mcpEnabled ? '\n\n' + MCP_SYSTEM_PROMPT : ''
    const contextMessages = [
      { role: 'system', content: systemPrompt + (memoryContext ? '\n\n' + memoryContext : '') + (projectContext ? '\n\n' + projectContext : '') + mcpPrompt },
      ...messagesForContext.filter(m => !m.loading).slice(-40).map(m => ({ role: m.isSelf ? 'user' : 'assistant', content: m.text })),
    ]

    const res = await fetch(`${API_BASE}/api/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: contextMessages, model: 'deepseek-v4-flash', conversationId: chatInfo?.id || null }),
    })
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let fullText = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const text = decoder.decode(value, { stream: true })
      for (const line of text.split('\n')) {
        if (!line.startsWith('data: ')) continue
        try {
          const d = JSON.parse(line.slice(6))
          if (d.content) {
            fullText += d.content
            setMsgList(prev => prev.map(m => m.id === aiMsgId ? { ...m, text: fullText, loading: false } : m))
          }
          if (d.done && d.conversationId && !chatInfo?.id) { chatInfo.id = d.conversationId; chatInfo.title = userText.slice(0, 20) }
        } catch (_) {}
      }
    }

    // MCP 工具调用检测
    const toolMatch = fullText.match(/```tool\n([\s\S]*?)\n```/)
    if (toolMatch && mcpEnabled) {
      try {
        const toolCall = JSON.parse(toolMatch[1])
        const cleanText = fullText.replace(/```tool\n[\s\S]*?\n```/, `\n🔧 调用工具: ${toolCall.name}...`)
        setMsgList(prev => prev.map(m => m.id === aiMsgId ? { ...m, text: cleanText } : m))

        // 执行 MCP
        const { name, ...args } = toolCall
        const mcpRes = await fetch(MCP_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', params: { name, arguments: args }, id: 1 }),
        })
        const mcpData = await mcpRes.json()
        const toolResult = mcpData.result?.content?.[0]?.text || JSON.stringify(mcpData)

        // 注入结果，自动继续
        const newAiMsgId = uid()
        setMsgList(prev => [...prev, { id: newAiMsgId, text: '', isSelf: false, loading: true }])

        const followContext = [
          ...messagesForContext.filter(m => !m.loading),
          { id: uid(), text: cleanText, isSelf: false },
        ]
        const followMessages = [
          { role: 'system', content: systemPrompt + MCP_SYSTEM_PROMPT },
          ...followContext.slice(-30).map(m => ({ role: m.isSelf ? 'user' : 'assistant', content: m.text })),
          { role: 'system', content: `[工具结果]\n${toolResult.slice(0, 3000)}\n\n请根据工具结果继续回答。` },
        ]

        const followRes = await fetch(`${API_BASE}/api/chat/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: followMessages, model: 'deepseek-v4-flash', conversationId: chatInfo?.id || null }),
        })
        const fReader = followRes.body.getReader()
        let fText = ''
        while (true) {
          const { done, value } = await fReader.read()
          if (done) break
          const text = new TextDecoder().decode(value, { stream: true })
          for (const line of text.split('\n')) {
            if (!line.startsWith('data: ')) continue
            try {
              const d = JSON.parse(line.slice(6))
              if (d.content) {
                fText += d.content
                setMsgList(prev => prev.map(m => m.id === newAiMsgId ? { ...m, text: fText, loading: false } : m))
              }
            } catch (_) {}
          }
        }
      } catch (_) {}
    }
  }

  const handleSend = async () => {
    if (!inputText.trim() || loading) return
    const userText = inputText.trim()
    setInputText('')
    setLoading(true)

    const userMsgId = uid()
    const aiMsgId = uid()
    const newUserMsg = { id: userMsgId, text: userText, isSelf: true }
    setMsgList(prev => [...prev, newUserMsg, { id: aiMsgId, text: '', isSelf: false, loading: true }])

    try {
      await runChatTurn([...msgList, newUserMsg], aiMsgId)
    } catch (e) {
      setMsgList(prev => prev.map(m => m.id === aiMsgId ? { ...m, text: '出错啦，请重试', loading: false } : m))
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }

  return (
    <div className="chat-detail-page">
      <div className="chat-detail-header">
        <span className="chat-back" onClick={onBack}>←</span>
        <span className="chat-detail-title">{chatInfo?.title || '新对话'}</span>
        <span onClick={toggleMcp} style={{ cursor: 'pointer', fontSize: 20, padding: '4px 8px', borderRadius: 8, background: mcpEnabled ? 'var(--color-primary)' : 'transparent', color: mcpEnabled ? '#fff' : 'var(--color-text-gray)', transition: 'all 0.2s', userSelect: 'none' }} title={mcpEnabled ? 'MCP 已开启' : 'MCP 已关闭'}>🔧</span>
      </div>
      <div className="chat-message-list">
        {msgList.map(msg => (
          <div key={msg.id} className={msg.isSelf ? 'msg-right' : 'msg-left'}>
            {msg.loading ? <div className="msg-typing"><span className="dot"/><span className="dot"/><span className="dot"/></div> : <div className="msg-bubble">{msg.text}</div>}
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
