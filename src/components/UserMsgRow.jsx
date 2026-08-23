// src/components/UserMsgRow.jsx — 用户消息气泡行（长文本折叠 + 引用 + 图片）
// 从 App.jsx 抽离（行为不变）：依赖已有 Markdown 组件与 fmtMsgTime，未引入新依赖
import { useEffect, useRef, useState } from 'react'
import Markdown from './Markdown'
import { fmtMsgTime } from '../utils/time'

export default function UserMsgRow({ msg, avatar, onAvatarClick }) {
  const [expanded, setExpanded] = useState(false)
  const bodyRef = useRef(null)
  const [overflow, setOverflow] = useState((msg.text || '').length > 240)
  useEffect(() => {
    const el = bodyRef.current
    if (el) setOverflow(el.scrollHeight - el.clientHeight > 4)
  }, [msg.text])
  const showToggle = overflow || expanded
  return (
    <div className="msg-row msg-row-self">
      <div className="msg-col">
        {msg.deleted ? (
          <div className="msg-recalled">已撤回</div>
        ) : (
          <>
            {msg.quote && (
              <div className="msg-quote">
                <span className="msg-quote__who">{msg.quote.isSelf ? '泠泠' : '钟泽'}</span>
                <span className="msg-quote__text">{msg.quote.text}</span>
              </div>
            )}
            <div className={`msg-bubble ${!expanded && overflow ? 'msg-folded' : ''}`} ref={bodyRef}>
              <Markdown>{String(msg.text || '').replace(/^【时间 [^】]*】\s*/, '')}</Markdown>
            </div>
            {(() => { const imgs = msg.images || (msg.image ? [msg.image] : []); return imgs.length ? <div className="msg-images">{imgs.map((src, i) => <img key={i} className="msg-image" src={src} alt="" />)}</div> : null })()}
            {showToggle && (
              <button className="msg-fold-toggle" onClick={() => setExpanded(v => !v)}>
                {expanded ? '收起 ▲' : '展开全文 ▼'}
              </button>
            )}
            {msg.ts && <div className="msg-meta">{fmtMsgTime(msg.ts)}</div>}
          </>
        )}
      </div>
      <div
        className="msg-avatar msg-avatar-self"
        style={avatar?.startsWith('http') ? { backgroundImage: `url(${avatar})`, backgroundSize: 'cover', color: 'transparent' } : {}}
        onClick={onAvatarClick}
        title="点击换头像"
      >{avatar?.startsWith('http') ? '' : (avatar || '我')}</div>
    </div>
  )
}
