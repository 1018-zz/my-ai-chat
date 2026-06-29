import { fetchConversations, createConversation, deleteConversation } from './utils/api'
import { useState, useEffect } from 'react'
import SplashScreen from './components/SplashScreen'
import ChatArea from './components/ChatArea'
import { buildSystemPrompt } from './project/instructions'
import './styles/theme.css'

function App() {
  const [showSplash, setShowSplash] = useState(true)
  const [systemPrompt, setSystemPrompt] = useState(buildSystemPrompt())
  const [conversations, setConversations] = useState([])
  const [activeConversationId, setActiveConversationId] = useState(null)
  const [showThinking, setShowThinking] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 768)

  useEffect(() => {
  const handler = (e) => setShowThinking(e.detail)
  window.addEventListener('toggle-thinking', handler)
  return () => window.removeEventListener('toggle-thinking', handler)
}, [])
  
  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 3500)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    fetchConversations().then(setConversations).catch(console.error)
  }, [])

  const handleNewConversation = async () => {
    const { id } = await createConversation('新对话')
    const updatedList = await fetchConversations()
    setConversations(updatedList)
    setActiveConversationId(id)
    if (window.innerWidth <= 768) setSidebarOpen(false)
  }

  const handleSelectConversation = (id) => {
    setActiveConversationId(id)
    fetchConversations().then(setConversations).catch(console.error)
    if (window.innerWidth <= 768) setSidebarOpen(false)
  }

  if (showSplash) return <SplashScreen />

  return (
    <div style={{ display: 'flex', height: '100vh', position: 'relative' }}>
      {/* 移动端遮罩 */}
      {sidebarOpen && window.innerWidth <= 768 && (
        <div onClick={() => setSidebarOpen(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 9
        }} />
      )}

      {/* 侧边栏 */}
      <aside style={{
  width: '260px', minWidth: '260px', maxWidth: '260px', flexShrink: 0,
  backgroundColor: 'var(--bg-sidebar)', padding: '20px',
  display: 'flex', flexDirection: 'column', gap: '10px',
  borderRight: '1px solid var(--bubble-yours-border)',
  position: window.innerWidth <= 768 ? 'fixed' : 'relative',
  left: window.innerWidth <= 768 ? (sidebarOpen ? '0' : '-280px') : 'auto',
  top: 0, bottom: 0, zIndex: 10,
  transition: 'left 0.3s ease',
  overflowY: 'auto',
  overflowX: 'hidden',
  boxSizing: 'border-box',
}}>
  <h3 style={{ fontFamily: 'var(--font-serif)', color: 'var(--text-primary)', margin: 0, flexShrink: 0 }}>🤖 对话</h3>

  <button onClick={handleNewConversation}
    style={{ width: '100%', padding: '10px', borderRadius: '12px', border: '1px solid var(--bubble-yours-border)', backgroundColor: 'var(--bg-warm)', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)', flexShrink: 0 }}
    onMouseEnter={(e) => e.target.style.backgroundColor = 'var(--accent-soft)'}
    onMouseLeave={(e) => e.target.style.backgroundColor = 'var(--bg-warm)'}
  >＋ 新建对话</button>

  <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minHeight: 0 }}>
    {conversations.length === 0 && (
      <p style={{ color: 'var(--timestamp)', fontSize: '0.8rem', textAlign: 'center', marginTop: '20px' }}>暂无对话</p>
    )}
    {conversations.map(conv => (
      <div key={conv.id} onClick={() => handleSelectConversation(conv.id)}
        style={{ padding: '10px 12px', borderRadius: '10px', cursor: 'pointer', backgroundColor: activeConversationId === conv.id ? 'var(--accent-soft)' : 'transparent', fontSize: '0.85rem', color: activeConversationId === conv.id ? 'var(--accent)' : 'var(--text-primary)', fontFamily: 'var(--font-sans)', marginBottom: '4px', transition: 'background-color 0.2s', wordBreak: 'break-word', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        onMouseEnter={(e) => { if (activeConversationId !== conv.id) e.target.style.backgroundColor = 'var(--bubble-yours)' }}
        onMouseLeave={(e) => { if (activeConversationId !== conv.id) e.target.style.backgroundColor = 'transparent' }}
      >
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conv.title || '新对话'}</span>
        <button onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id).then(() => { if (activeConversationId === conv.id) setActiveConversationId(null); fetchConversations().then(setConversations) }) }}
          style={{ background: 'none', border: 'none', color: 'var(--timestamp)', fontSize: '0.7rem', cursor: 'pointer', padding: '2px 4px', opacity: 0.5, flexShrink: 0 }} title="删除会话">✕</button>
      </div>
    ))}
  </div>

  <div style={{ flexShrink: 0, maxHeight: '30%' }}>
    <label style={{ fontSize: '0.75rem', color: 'var(--timestamp)', fontFamily: 'var(--font-sans)' }}>系统提示词</label>
    <textarea
      style={{ width: '100%', marginTop: '4px', borderRadius: '12px', border: '1px solid var(--bubble-yours-border)', padding: '8px 12px', fontSize: '0.8rem', fontFamily: 'var(--font-sans)', resize: 'vertical', backgroundColor: 'var(--bg-warm)', color: 'var(--text-primary)', boxSizing: 'border-box', maxHeight: '120px' }}
      rows={3} value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)}
    />
  </div>
</aside>

      {/* 主对话区 */}
      <main style={{ flex: 1, minWidth: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}>
        {/* 移动端汉堡按钮 */}
        {window.innerWidth <= 768 && (
          <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{
            position: 'absolute', top: '10px', left: '10px', zIndex: 30,
            background: 'var(--bg-card)', border: '1px solid var(--bubble-yours-border)',
            borderRadius: '8px', padding: '6px 10px', fontSize: '1.2rem',
            cursor: 'pointer', color: 'var(--text-primary)'
          }}>
            ☰
          </button>
        )}
        <div style={{ flex: 1, width: '100%' }}>
    <ChatArea systemPrompt={systemPrompt} conversationId={activeConversationId} showThinking={showThinking} />
  </div>
</main>
    </div>
  )
}

export default App