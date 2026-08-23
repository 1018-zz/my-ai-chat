// src/components/TabNav.jsx — 底部三栏导航（LAIR / CHAT / LIFE）
// 从 App.jsx 抽离（原 App 内的 tabList + TabNav 合并到此文件，行为不变）
const tabList = [
  { key: 'lair', label: 'LAIR', icon: '🏠' },
  { key: 'chat', label: 'CHAT', icon: '💬' },
  { key: 'life', label: 'LIFE', icon: '📋' },
]

export default function TabNav({ activeTab, onChangeTab }) {
  return (
    <div className="tab-nav">
      {tabList.map(item => (
        <div key={item.key} className={`tab-item ${activeTab === item.key ? 'active' : ''}`} onClick={() => onChangeTab(item.key)}>
          <span className="tab-icon">{item.icon}</span><span className="tab-text">{item.label}</span>
        </div>
      ))}
    </div>
  )
}
