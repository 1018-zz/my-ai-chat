import { fetchConversations, createConversation } from './utils/api'
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

  // 开屏页定时
  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 3500)
    return () => clearTimeout(timer)
  }, [])

  // 加载会话列表
  useEffect(() => {
    fetchConversations()
      .then(setConversations)
      .catch(console.error)
  }, [])

  // 新建对话后刷新列表
 const handleNewConversation = async () => {
  // 调用后端创建新会话
  const { id } = await createConversation('新对话')
  // 刷新侧边栏列表
  const updatedList = await fetchConversations()
  setConversations(updatedList)
  // 切换到新会话
  setActiveConversationId(id)
}

  // 选中会话后刷新列表（确保标题是最新的）
  const handleSelectConversation = (id) => {
    setActiveConversationId(id)
    // 可选：重新拉取列表更新标题
    fetchConversations().then(setConversations).catch(console.error)
  }

  if (showSplash) {
    return <SplashScreen />
  }

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      {/* 侧边栏 */}
      <aside style={{
        width: '260px',
        backgroundColor: 'var(--bg-sidebar)',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        borderRight: '1px solid var(--bubble-yours-border)',
      }}>
        <h3 style={{
          fontFamily: 'var(--font-serif)',
          color: 'var(--text-primary)',
          margin: 0,
        }}>
          🤖 对话
        </h3>

        {/* 新建对话按钮 */}
        <button
          onClick={handleNewConversation}
          style={{
            width: '100%',
            padding: '10px',
            borderRadius: '12px',
            border: '1px solid var(--bubble-yours-border)',
            backgroundColor: 'var(--bg-warm)',
            cursor: 'pointer',
            fontSize: '0.85rem',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-sans)',
            transition: 'background-color 0.2s',
          }}
          onMouseEnter={(e) => e.target.style.backgroundColor = 'var(--accent-soft)'}
          onMouseLeave={(e) => e.target.style.backgroundColor = 'var(--bg-warm)'}
        >
          ＋ 新建对话
        </button>

        {/* 会话列表 */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {conversations.length === 0 && (
            <p style={{
              color: 'var(--timestamp)',
              fontSize: '0.8rem',
              textAlign: 'center',
              marginTop: '20px',
            }}>
              暂无对话
            </p>
          )}
          {conversations.map(conv => (
            <div
              key={conv.id}
              onClick={() => handleSelectConversation(conv.id)}
              style={{
                padding: '10px 12px',
                borderRadius: '10px',
                cursor: 'pointer',
                backgroundColor: activeConversationId === conv.id ? 'var(--accent-soft)' : 'transparent',
                fontSize: '0.85rem',
                color: activeConversationId === conv.id ? 'var(--accent)' : 'var(--text-primary)',
                fontFamily: 'var(--font-sans)',
                marginBottom: '4px',
                transition: 'background-color 0.2s',
                wordBreak: 'break-word',
              }}
              onMouseEnter={(e) => {
                if (activeConversationId !== conv.id) {
                  e.target.style.backgroundColor = 'var(--bubble-yours)'
                }
              }}
              onMouseLeave={(e) => {
                if (activeConversationId !== conv.id) {
                  e.target.style.backgroundColor = 'transparent'
                }
              }}
            >
              {conv.title || '新对话'}
            </div>
          ))}
        </div>

        {/* 系统提示词编辑区 */}
        <div>
          <label style={{
            fontSize: '0.75rem',
            color: 'var(--timestamp)',
            fontFamily: 'var(--font-sans)',
          }}>
            系统提示词
          </label>
          <textarea
            style={{
              width: '100%',
              marginTop: '4px',
              borderRadius: '12px',
              border: '1px solid var(--bubble-yours-border)',
              padding: '8px 12px',
              fontSize: '0.8rem',
              fontFamily: 'var(--font-sans)',
              resize: 'vertical',
              backgroundColor: 'var(--bg-warm)',
              color: 'var(--text-primary)',
              boxSizing: 'border-box',
            }}
            rows={4}
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
          />
        </div>
      </aside>

      {/* 主对话区 */}
      <main style={{ flex: 1 }}>
        <ChatArea
          systemPrompt={systemPrompt}
          conversationId={activeConversationId}
        />
      </main>
    </div>
  )
}

export default App