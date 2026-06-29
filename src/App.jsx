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

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 3500)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    fetchConversations()
      .then(setConversations)
      .catch(console.error)
  }, [])

  const handleNewConversation = async () => {
    const { id } = await createConversation('新对话')
    const updatedList = await fetchConversations()
    setConversations(updatedList)
    setActiveConversationId(id)
  }

  const handleSelectConversation = (id) => {
    setActiveConversationId(id)
    fetchConversations().then(setConversations).catch(console.error)
  }

  if (showSplash) {
    return <SplashScreen />
  }

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <aside style={{
        width: '260px',
        flexShrink: 0,
        backgroundColor: 'var(--bg-sidebar)',
        backgroundColor: 'var(--bg-sidebar)',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        borderRight: '1px solid var(--bubble-yours-border)',
      }}>
        <h3 style={{ fontFamily: 'var(--font-serif)', color: 'var(--text-primary)', margin: 0 }}>🤖 对话</h3>

        <div style={{ marginBottom: '4px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-sans)', cursor: 'pointer', userSelect: 'none' }}>
            <input type="checkbox" checked={showThinking} onChange={(e) => setShowThinking(e.target.checked)} style={{ cursor: 'pointer', accentColor: 'var(--accent)' }} />
            💭 显示思考过程
          </label>
        </div>

        <button onClick={handleNewConversation} style={{ width: '100%', padding: '10px', borderRadius: '12px', border: '1px solid var(--bubble-yours-border)', backgroundColor: 'var(--bg-warm)', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)', transition: 'background-color 0.2s' }}
          onMouseEnter={(e) => e.target.style.backgroundColor = 'var(--accent-soft)'}
          onMouseLeave={(e) => e.target.style.backgroundColor = 'var(--bg-warm)'}
        >＋ 新建对话</button>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {conversations.length === 0 && (
            <p style={{ color: 'var(--timestamp)', fontSize: '0.8rem', textAlign: 'center', marginTop: '20px' }}>暂无对话</p>
          )}
          {conversations.map(conv => (
            <div key={conv.id} onClick={() => handleSelectConversation(conv.id)}
              style={{ padding: '10px 12px', borderRadius: '10px', cursor: 'pointer', backgroundColor: activeConversationId === conv.id ? 'var(--accent-soft)' : 'transparent', fontSize: '0.85rem', color: activeConversationId === conv.id ? 'var(--accent)' : 'var(--text-primary)', fontFamily: 'var(--font-sans)', marginBottom: '4px', transition: 'background-color 0.2s', wordBreak: 'break-word', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              onMouseEnter={(e) => { if (activeConversationId !== conv.id) e.target.style.backgroundColor = 'var(--bubble-yours)' }}
              onMouseLeave={(e) => { if (activeConversationId !== conv.id) e.target.style.backgroundColor = 'transparent' }}
            >
              <span style={{ flex: 1 }}>{conv.title || '新对话'}</span>
              <button onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id).then(() => { if (activeConversationId === conv.id) setActiveConversationId(null); fetchConversations().then(setConversations) }) }}
                style={{ background: 'none', border: 'none', color: 'var(--timestamp)', fontSize: '0.7rem', cursor: 'pointer', padding: '2px 4px', opacity: 0.5 }} title="删除会话">✕</button>
            </div>
          ))}
        </div>

        <div>
          <label style={{ fontSize: '0.75rem', color: 'var(--timestamp)', fontFamily: 'var(--font-sans)' }}>系统提示词</label>
          <textarea style={{ width: '100%', marginTop: '4px', borderRadius: '12px', border: '1px solid var(--bubble-yours-border)', padding: '8px 12px', fontSize: '0.8rem', fontFamily: 'var(--font-sans)', resize: 'vertical', backgroundColor: 'var(--bg-warm)', color: 'var(--text-primary)', boxSizing: 'border-box' }}
            rows={4} value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} />
        </div>
      </aside>

      <main style={{ flex: 1 }}>
        <ChatArea systemPrompt={systemPrompt} conversationId={activeConversationId} showThinking={showThinking} />
      </main>
    </div>
  )
}

export default App