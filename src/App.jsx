import React, { useState } from 'react';
import './styles/theme.css';

const tabList = [
  { key: 'lair', label: 'LAIR', icon: '🏠' },
  { key: 'chat', label: 'CHAT', icon: '💬' },
  { key: 'life', label: 'LIFE', icon: '📋' },
];

const mockChatList = [
  { id: 1, name: '专属双人对话', lastMsg: '今天也要好好生活呀✨', time: '刚刚', unread: 1, avatar: '❤️' },
  { id: 2, name: '日常碎碎念', lastMsg: '待会儿一起看看计划吗', time: '10:20', unread: 0, avatar: '📝' },
  { id: 3, name: '纪念日提醒', lastMsg: '距离下一个纪念日还有 7 天', time: '昨天', unread: 0, avatar: '🎀' }
];

const TabNav = ({ activeTab, onChangeTab }) => (
  <div className="tab-nav">
    {tabList.map((item) => (
      <div key={item.key} className={`tab-item ${activeTab === item.key ? 'active' : ''}`} onClick={() => onChangeTab(item.key)}>
        <span className="tab-icon">{item.icon}</span>
        <span className="tab-text">{item.label}</span>
      </div>
    ))}
  </div>
);

const LairPage = () => (
  <div style={{ padding: 20 }}>
    <h3 style={{ color: 'var(--color-primary)' }}>🏠 LAIR 首页</h3>
    <p>在一起天数、纪念日、生理周期、日记入口</p>
  </div>
);

const LifePage = () => (
  <div style={{ padding: 20 }}>
    <h3 style={{ color: 'var(--color-primary)' }}>📋 LIFE 更多</h3>
    <p>日记、设置、个人拓展功能</p>
  </div>
);

const ChatListPage = ({ onOpenChat }) => (
  <div className="chat-page">
    <div className="chat-header"><div className="chat-header-title">CHAT 对话列表</div><div>⋮</div></div>
    <div className="chat-list">
      {mockChatList.length > 0 ? mockChatList.map((item) => (
        <div key={item.id} className="chat-item" onClick={() => onOpenChat(item)}>
          <div className="chat-avatar">{item.avatar}</div>
          <div className="chat-info"><div className="chat-name">{item.name}</div><div className="chat-last-msg">{item.lastMsg}</div></div>
          <div className="chat-right"><div className="chat-time">{item.time}</div>{item.unread > 0 && <div className="chat-badge">{item.unread}</div>}</div>
        </div>
      )) : <div className="chat-empty">💬 暂无聊天会话<br/>快去开启第一条对话吧</div>}
    </div>
  </div>
);

const ChatDetailPage = ({ chatInfo, onBack }) => {
  const [msgList, setMsgList] = useState([
    { id: 1, text: '哈喽呀😊', isSelf: false },
    { id: 2, text: '今天的计划准备好了吗', isSelf: false },
    { id: 3, text: '已经整理好啦✨', isSelf: true },
  ]);
  const [inputText, setInputText] = useState('');

  const handleSend = () => {
    if (!inputText.trim()) return;
    setMsgList([...msgList, { id: Date.now(), text: inputText, isSelf: true }]);
    setInputText('');
  };

  return (
    <div className="chat-detail-page">
      <div className="chat-detail-header">
        <span className="chat-back" onClick={onBack}>←</span>
        <span className="chat-detail-title">{chatInfo.name}</span>
      </div>
      <div className="chat-message-list">
        {msgList.map((msg) => (
          <div key={msg.id} className={msg.isSelf ? 'msg-right' : 'msg-left'}>
            <div className="msg-bubble">{msg.text}</div>
          </div>
        ))}
      </div>
      <div className="chat-input-bar">
        <input className="input" placeholder="输入消息..." value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleSend()} />
        <button className="btn" onClick={handleSend}>发送</button>
      </div>
    </div>
  );
};

export default function App() {
  const [activeTab, setActiveTab] = useState('lair');
  const [currentChat, setCurrentChat] = useState(null);

  return (
    <div className="page-wrap">
      {activeTab === 'lair' && <LairPage />}
      {activeTab === 'chat' && (currentChat ? <ChatDetailPage chatInfo={currentChat} onBack={() => setCurrentChat(null)} /> : <ChatListPage onOpenChat={setCurrentChat} />)}
      {activeTab === 'life' && <LifePage />}
      <div className="float-note-btn">+</div>
      <TabNav activeTab={activeTab} onChangeTab={setActiveTab} />
    </div>
  );
}