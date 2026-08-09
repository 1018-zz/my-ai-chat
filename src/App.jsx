import { fetchConversations, createConversation, deleteConversation, fetchMessages } from './utils/api'
import { useState, useEffect, useRef } from 'react'
import './styles/theme.css'

const API_BASE = 'https://my-ai-chat-4zy.pages.dev'

const tabList = [
  { key: 'lair', label: 'LAIR', icon: '🏠' },
  { key: 'chat', label: 'CHAT', icon: '💬' },
  { key: 'life', label: 'LIFE', icon: '📋' },
]

// ==================== TabNav ====================
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

// ==================== LairPage ====================
const LairPage = () => (
  <div style={{ padding: 20 }}>
    <h3 style={{ color: 'var(--color-primary)' }}>🏠 LAIR</h3>
    <p style={{ color: 'var(--color-text-gray)', marginTop: 8 }}>在一起天数 · 纪念日 · 日记入口</p>
  </div>
)

// ==================== LifePage ====================
const LifePage = () => (
  <div style={{ padding: 20 }}>
    <h3 style={{ color: 'var(--color-primary)' }}>📋 LIFE</h3>
    <p style={{ color: 'var(--color-text-gray)', marginTop: 8 }}>日记 · 设置 · 记忆管理</p>
  </div>
)

// ==================== ChatListPage ====================
const ChatListPage = ({ onOpenChat, refreshTrigger }) => {
  const [conversations, setConversations] = useState([])

  useEffect(() => {
    fetchConversations().then(setConversations).catch(() => {})
  }, [refreshTrigger])

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
    const d = new Date(ts)
    const now = new Date()
    const diff = now - d
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

// ==================== ChatDetailPage ====================
const ChatDetailPage = ({ chatInfo, onBack }) => {
  const [msgList, setMsgList] = useState([])
  const [inputText, setInputText] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef(null)

  // 加载历史消息
  useEffect(() => {
    if (!chatInfo?.id) return
    fetchMessages(chatInfo.id)
      .then(msgs => setMsgList(msgs.map(m => ({
        id: m.id || m.created_at,
        text: m.content,
        isSelf: m.role === 'user',
      }))))
      .catch(() => {})
  }, [chatInfo?.id])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgList])

  const handleSend = async () => {
    if (!inputText.trim() || loading) return
    const userText = inputText.trim()
    setInputText('')
    setLoading(true)

    // 添加用户消息
    const userMsg = { id: Date.now(), text: userText, isSelf: true }
    setMsgList(prev => [...prev, userMsg])

    // 添加 AI 占位
    const aiMsgId = Date.now() + 1
    setMsgList(prev => [...prev, { id: aiMsgId, text: '', isSelf: false, loading: true }])

    try {
      const res = await fetch(`${API_BASE}/api/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: userText }],
          model: 'deepseek-v4-flash',
          conversationId: chatInfo?.id || null,
        }),
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
              setMsgList(prev => prev.map(m =>
                m.id === aiMsgId ? { ...m, text: fullText, loading: false } : m
              ))
            }
            if (d.done && d.conversationId && !chatInfo?.id) {
              chatInfo.id = d.conversationId
              chatInfo.title = userText.slice(0, 20)
            }
          } catch (_) {}
        }
      }
    } catch (e) {
      setMsgList(prev => prev.map(m =>
        m.id === aiMsgId ? { ...m, text: '出错啦，请重试', loading: false } : m
      ))
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="chat-detail-page">
      <div className="chat-detail-header">
        <span className="chat-back" onClick={onBack}>←</span>
        <span className="chat-detail-title">{chatInfo?.title || '新对话'}</span>
      </div>
      <div className="chat-message-list">
        {msgList.map((msg) => (
          <div key={msg.id} className={msg.isSelf ? 'msg-right' : 'msg-left'}>
            {msg.loading ? (
              <div className="msg-typing">
                <span className="dot" />
                <span className="dot" />
                <span className="dot" />
              </div>
            ) : (
              <div className="msg-bubble">{msg.text}</div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <div className="chat-input-bar">
        <input
          className="input"
          placeholder="写点什么..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
        />
        <button className="btn" onClick={handleSend} disabled={loading || !inputText.trim()}>发送</button>
      </div>
    </div>
  )
}

// ==================== App ====================
export default function App() {
  const [activeTab, setActiveTab] = useState('chat')
  const [currentChat, setCurrentChat] = useState(null)
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  const handleOpenChat = (chat) => {
    setCurrentChat(chat)
  }

  const handleBack = () => {
    setCurrentChat(null)
    setRefreshTrigger(t => t + 1) // 刷新会话列表
  }

  return (
    <div className="page-wrap">
      {activeTab === 'lair' && <LairPage />}
      {activeTab === 'chat' && (
        currentChat
          ? <ChatDetailPage chatInfo={currentChat} onBack={handleBack} />
          : <ChatListPage onOpenChat={handleOpenChat} refreshTrigger={refreshTrigger} />
      )}
      {activeTab === 'life' && <LifePage />}
      <TabNav activeTab={activeTab} onChangeTab={setActiveTab} />
    </div>
  )
}
