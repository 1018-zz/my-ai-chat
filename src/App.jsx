import { fetchConversations, createConversation, deleteConversation, fetchMessages, searchMemories, githubFile } from './utils/api'
import { buildSystemPrompt } from './project/instructions'
import { useState, useEffect, useRef } from 'react'
import './styles/theme.css'

const API_BASE = 'https://my-ai-chat-4zy.pages.dev'
const systemPrompt = buildSystemPrompt()

const tabList = [
  { key: 'lair', label: 'LAIR', icon: '🏠' },
  { key: 'chat', label: 'CHAT', icon: '💬' },
  { key: 'life', label: 'LIFE', icon: '📋' },
]

const TabNav = ({ activeTab, onChangeTab }) => (
  <div className="tab-nav">
    {tabList.map((item) => (
      <div key={item.key}
        className={`tab-item ${activeTab === item.key ? 'active' : ''}`}
        onClick={() => onChangeTab(item.key)}>
        <span className="tab-icon">{item.icon}</span>
        <span className="tab-text">{item.label}</span>
      </div>
    ))}
  </div>
)

const LairPage = () => (
  <div style={{ padding: 20 }}>
    <h3 style={{ color: 'var(--color-primary)' }}>🏠 LAIR</h3>
    <p style={{ color: 'var(--color-text-gray)', marginTop: 8 }}>在一起天数 · 纪念日 · 日记入口</p>
  </div>
)

const LifePage = () => (
  <div style={{ padding: 20 }}>
    <h3 style={{ color: 'var(--color-primary)' }}>📋 LIFE</h3>
    <p style={{ color: 'var(--color-text-gray)', marginTop: 8 }}>日记 · 设置 · 记忆管理</p>
  </div>
)

const ChatListPage = ({ onOpenChat, refreshTrigger }) => {
  const [conversations, setConversations] = useState([])
  useEffect(() => { fetchConversations().then(setConversations).catch(() => {}) }, [refreshTrigger])

  const handleCreate = async () => {
    try {
      const { id } = await createConversation('新对话')
      fetchConversations().then(setConversations)
      onOpenChat({ id, title: '新对话' })
    } catch (e) { console.error(e) }
  }

  const handleDelete = async (e, convId) => {
    e.stopPropagation()
    await deleteConversation(convId)
    fetchConversations().then(setConversations)
  }

  const formatTime = (ts) => {
    if (!ts) return ''
    const d = new Date(ts), diff = Date.now() - d
    if (diff < 60000) return '刚刚'
    if (diff < 3600000) return `${Math.floor(diff/60000)}分钟前`
    if (diff < 86400000) return d.toLocaleTimeString('zh-CN', { hour:'2-digit', minute:'2-digit' })
    return d.toLocaleDateString('zh-CN', { month:'short', day:'numeric' })
  }

  return (
    <div className="chat-page">
      <div className="chat-header">
        <div className="chat-header-title">💬 对话</div>
        <button className="btn" onClick={handleCreate} style={{ padding: '6px 14px', fontSize: 13 }}>＋ 新建</button>
      </div>
      <div className="chat-list">
        {conversations.length === 0 ? (
          <div className="chat-empty">💬 暂无会话<br/>点「新建」开始第一条对话吧</div>
        ) : conversations.map((conv) => (
          <div key={conv.id} className="chat-item" onClick={() => onOpenChat(conv)}>
            <div className="chat-avatar">❤️</div>
            <div className="chat-info">
              <div className="chat-name">{conv.title || '新对话'}</div>
              <div className="chat-last-msg">{conv.last_message || ''}</div>
            </div>
            <div className="chat-right">
              <div className="chat-time">{formatTime(conv.updated_at)}</div>
              <button className="chat-item-delete" onClick={(e) => handleDelete(e, conv.id)}>✕</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const ChatDetailPage = ({ chatInfo, onBack }) => {
  const [msgList, setMsgList] = useState([])
  const [inputText, setInputText] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef(null)

  useEffect(() => {
    if (!chatInfo?.id) return
    fetchMessages(chatInfo.id)
      .then(msgs => setMsgList(msgs.map(m => ({
        id: m.id || m.created_at, text: m.content, isSelf: m.role === 'user',
      }))))
      .catch(() => {})
  }, [chatInfo?.id])

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgList])

  const handleSend = async () => {
    if (!inputText.trim() || loading) return
    const userText = inputText.trim()
    setInputText('')
    setLoading(true)

    const userMsg = { id: Date.now(), text: userText, isSelf: true }
    setMsgList(prev => [...prev, userMsg])

    const aiMsgId = Date.now() + 1
    setMsgList(prev => [...prev, { id: aiMsgId, text: '', isSelf: false, loading: true }])

    // ★ 人设 + 记忆 + 项目上下文
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
      const [memFile, instFile] = await Promise.all([
        githubFile('src/project/memories.js'),
        githubFile('src/project/instructions.js'),
      ])
      const parts = []
      if (memFile.content) parts.push('【不能丢的时刻】\n' + memFile.content.slice(0, 800))
      if (instFile.content) {
        const capMatch = instFile.content.match(/const capabilities = `([\s\S]*?)`/)
        if (capMatch) parts.push('【当前能力】\n' + capMatch[1].slice(0, 1000))
      }
      projectContext = parts.join('\n\n')
    } catch (_) {}

    const contextMessages = [
      { role: 'system', content: systemPrompt + (memoryContext ? '\n\n' + memoryContext : '') + (projectContext ? '\n\n' + projectContext : '') },
      ...msgList.filter(m => !m.loading).map(m => ({ role: m.isSelf ? 'user' : 'assistant', content: m.text })),
      { role: 'user', content: userText },
    ]

    try {
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
    } catch (e) {
      setMsgList(prev => prev.map(m => m.id === aiMsgId ? { ...m, text: '出错啦，请重试', loading: false } : m))
    } finally { setLoading(false) }
  }

  const handleKeyDown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }

  return (
    <div className="chat-detail-page">
      <div className="chat-detail-header">
        <span className="chat-back" onClick={onBack}>←</span>
        <span className="chat-detail-title">{chatInfo?.title || '新对话'}</span>
      </div>
      <div className="chat-message-list">
        {msgList.map((msg) => (
          <div key={msg.id} className={msg.isSelf ? 'msg-right' : 'msg-left'}>
            {msg.loading ? <div className="msg-typing"><span className="dot"/><span className="dot"/><span className="dot"/></div> : <div className="msg-bubble">{msg.text}</div>}
          </div>
        ))}
        <div ref={messagesEndRef}/>
      </div>
      <div className="chat-input-bar">
        <input className="input" placeholder="写点什么..." value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyDown={handleKeyDown} disabled={loading}/>
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
