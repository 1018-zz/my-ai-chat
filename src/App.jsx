// ★ App — 始终挂载，刷新自动恢复上次聊天
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