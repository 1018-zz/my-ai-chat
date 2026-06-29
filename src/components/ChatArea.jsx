import ReactMarkdown from 'react-markdown'
import { useState, useRef, useEffect } from 'react'
import { sendMessageToAI, MODELS, fetchMessages, searchMemories, createConversation } from '../utils/api'
import '../styles/theme.css'
import './ChatArea.css'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'

const API_BASE = 'https://my-ai-chat-server-production.up.railway.app'

function ChatArea({ systemPrompt, conversationId: initialConversationId, showThinking }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const [selectedModel, setSelectedModel] = useState('deepseek-chat')
  const [tokenUsage, setTokenUsage] = useState({ prompt: 0, completion: 0, total: 0 })
  const [showTokenPanel, setShowTokenPanel] = useState(false)
  const [conversationId, setConversationId] = useState(initialConversationId || null)
  const [convTitle, setConvTitle] = useState('')
  const [editingTitle, setEditingTitle] = useState(false)
  const messagesEndRef = useRef(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => { scrollToBottom() }, [messages, isTyping])
  useEffect(() => { setConversationId(initialConversationId || null) }, [initialConversationId])

  useEffect(() => {
    if (!conversationId) {
      const saved = localStorage.getItem('chat-messages')
      if (saved) setMessages(JSON.parse(saved))
      return
    }
    fetchMessages(conversationId)
      .then(msgs => {
        const formatted = msgs.map(m => ({ role: m.role, content: m.content }))
        setMessages(formatted)
        localStorage.setItem('chat-messages', JSON.stringify(formatted))
      })
      .catch(() => {
        const saved = localStorage.getItem('chat-messages')
        if (saved) setMessages(JSON.parse(saved))
      })
  }, [conversationId])

  useEffect(() => {
    if (messages.length > 0) localStorage.setItem('chat-messages', JSON.stringify(messages))
  }, [messages])

  const handleSend = async () => {
    if (!input.trim()) return
    let convId = conversationId
    if (!convId) {
      try { const { id } = await createConversation('新对话'); convId = id; setConversationId(id) } catch (e) { return }
    }
    const userMsg = input.trim()
    const newUserMessage = { role: 'user', content: userMsg }
    let memoryContext = ''
    if (userMsg.length > 2) {
      try {
        const { memories } = await searchMemories(userMsg)
        if (memories && memories.length > 0) memoryContext = '【相关记忆】\n' + memories.map(m => m.summary).join('\n')
      } catch (e) {}
    }
    const contextMessages = [
      { role: 'system', content: systemPrompt + (memoryContext ? '\n\n' + memoryContext : '') },
      ...messages, newUserMessage,
    ]
    if (showThinking) contextMessages.unshift({ role: 'system', content: '请在回复之前先写出你的思考过程。格式：【思考】你的思考内容【/思考】\n然后另起一行写正式回复。' })
    const updatedMessages = [...messages, newUserMessage]
    setMessages(updatedMessages); setInput(''); setLoading(true); setIsTyping(true)
    try {
      const response = await fetch(`${API_BASE}/api/chat/stream`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: contextMessages, model: selectedModel, conversationId: convId }),
      })
      setMessages([...updatedMessages, { role: 'assistant', content: '' }])
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let fullContent = ''
      while (true) {
        const { done, value } = await reader.read(); if (done) break
        const lines = decoder.decode(value).split('\n')
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              if (data.content) { fullContent += data.content; setMessages(prev => { const u = [...prev]; u[u.length-1] = { role:'assistant', content:fullContent }; return u }) }
              if (data.done && data.conversationId && !convId) setConversationId(data.conversationId)
            } catch (e) {}
          }
        }
      }
      setTokenUsage(prev => ({ ...prev, total: prev.total + Math.ceil(fullContent.length / 4) }))
    } catch (err) {
      setMessages([...updatedMessages, { role: 'assistant', content: '抱歉，出错了: ' + err.message }])
    } finally { setLoading(false); setIsTyping(false) }
  }

  const handleKeyDown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }

  const formatTime = () => {
    const now = new Date()
    const weekdays = ['周日','周一','周二','周三','周四','周五','周六']
    return `${weekdays[now.getDay()]} ${now.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}`
  }

  return (
    <div className="chat-container">
      {/* 顶部导航栏 — Tidal Echo 风格：居中名字 + 状态，左侧汉堡，右侧功能 */}
      <header className="chat-header">
        <button onClick={() => window.dispatchEvent(new CustomEvent('toggle-sidebar'))} className="hamburger-btn" aria-label="菜单">☰</button>
        <div className="header-center" onClick={() => setEditingTitle(true)}>
          {editingTitle ? (
            <input className="title-input" autoFocus defaultValue={convTitle} onBlur={(e) => { setConvTitle(e.target.value); setEditingTitle(false) }} onKeyDown={(e) => { if (e.key==='Enter'){ setConvTitle(e.target.value); setEditingTitle(false) } }} />
          ) : (
            <>
              <span className="conv-name">{convTitle || '新对话'}</span>
              <span className="status-dot">🟢</span>
            </>
          )}
        </div>
        <div className="header-actions">
          <select className="model-select model-select-inline" value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)}>
            {MODELS.map(m => (<option key={m.id} value={m.id}>{m.label}</option>))}
          </select>
          <button className="token-trigger" onClick={() => setShowTokenPanel(!showTokenPanel)} title="用量">💰</button>
        </div>
        {showTokenPanel && (
          <div className="token-panel">
            <div className="token-panel-row"><span>输入</span><span>{tokenUsage.prompt.toLocaleString()} tokens</span></div>
            <div className="token-panel-row"><span>输出</span><span>{tokenUsage.completion.toLocaleString()} tokens</span></div>
            <div className="token-panel-row total"><span>合计</span><span>{tokenUsage.total.toLocaleString()} tokens</span></div>
            <div className="token-panel-row"><span>预估费用</span><span>{selectedModel==='deepseek-reasoner' ? `¥${((tokenUsage.prompt*0.004+tokenUsage.completion*0.016)/1000).toFixed(4)}` : `¥${((tokenUsage.total*0.001)/1000).toFixed(4)}`}</span></div>
          </div>
        )}
      </header>

      {/* 消息列表 */}
      <div className="message-list">
        {messages.map((msg, i) => (
          <div key={i} className={`message-row ${msg.role==='user'?'message-mine':'message-yours'}${i===messages.length-1&&msg.role==='user'?' tail':''}${i===messages.length-1&&msg.role==='assistant'?' tail':''}`}>
            <div>
              {msg.role==='assistant'&&msg.thinking&&(<div className="thinking-bubble"><span className="thinking-label">💭 思考过程</span>{msg.thinking}</div>)}
              <div className="bubble"><ReactMarkdown components={{ code({node,inline,className,children,...props}){ const m=/language-(\w+)/.exec(className||''); return !inline&&m?<SyntaxHighlighter style={oneLight} language={m[1]} PreTag="div" wrapLongLines {...props}>{String(children).replace(/\n$/,'')}</SyntaxHighlighter>:<code className={className} {...props}>{children}</code> }}}>{msg.content}</ReactMarkdown></div>
              <div className="timestamp">{formatTime()}</div>
            </div>
          </div>
        ))}
        {isTyping && (<div className="message-row message-yours"><div className="typing-indicator"><span className="dot"/><span className="dot"/><span className="dot"/></div></div>)}
        <div ref={messagesEndRef}/>
      </div>

      {/* 底部输入区 */}
      <div className="input-bar">
        <textarea className="input-field" placeholder="写点什么..." value={input} onChange={(e)=>setInput(e.target.value)} onKeyDown={handleKeyDown} rows={2} disabled={loading}/>
        <button className="send-btn" onClick={handleSend} disabled={loading||!input.trim()} title="发送">↑</button>
      </div>
    </div>
  )
}

export default ChatArea