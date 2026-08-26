// src/components/UserMsgRow.jsx — 用户消息气泡行（长文本折叠 + 引用 + 图片 + 内联修改）
// 从 App.jsx 抽离（行为不变）：依赖已有 Markdown 组件与 fmtMsgTime，未引入新依赖
import { useEffect, useRef, useState } from 'react'
import Markdown from './Markdown'
import { fmtMsgTime } from '../utils/time'
import { getImageMap } from '../utils/imageStore'

export default function UserMsgRow({ msg, avatar, onAvatarClick, editing, onEdit, onSaveEdit, onCancelEdit, imageLookup }) {
  const [expanded, setExpanded] = useState(false)
  const bodyRef = useRef(null)
  const editRef = useRef(null)
  const [overflow, setOverflow] = useState((msg.text || '').length > 240)
  // 异步把 imageIds 解析成 dataURL；查不到的 id 自动忽略
  const [resolved, setResolved] = useState([])
  useEffect(() => {
    const ids = msg.imageIds || []
    if (!ids.length) { setResolved([]); return }
    let cancelled = false
    if (imageLookup) {
      // 父组件给同步查表 → 直接用
      setResolved(ids.map(id => ({ id, src: imageLookup[id] })).filter(x => x.src))
      return () => { cancelled = true }
    }
    // 兜底：异步从 IndexedDB 取
    (async () => {
      const map = await getImageMap(ids)
      if (cancelled) return
      setResolved(ids.map(id => ({ id, src: map[id] })).filter(x => x.src))
    })()
    return () => { cancelled = true }
  }, [msg.imageIds, imageLookup])
  useEffect(() => {
    const el = bodyRef.current
    if (el) setOverflow(el.scrollHeight - el.clientHeight > 4)
  }, [msg.text])
  const showToggle = overflow || expanded
  const isEditing = editing && editing.id === msg.id
  return (
    <div className="msg-row msg-row-self">
      <div className="msg-col">
        {msg.deleted ? (
          <div className="msg-recalled">已撤回</div>
        ) : isEditing ? (
          // 内联修改：直接改这条消息，保存后重生成钟泽的回复
          <div className="msg-edit-box">
            <textarea
              ref={editRef}
              className="msg-edit-area"
              defaultValue={editing.text}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onSaveEdit(editRef.current.value) }
                if (e.key === 'Escape') { e.preventDefault(); onCancelEdit() }
              }}
            />
            <div className="msg-edit-actions">
              <button className="msg-edit-btn" onClick={() => onSaveEdit(editRef.current.value)}>保存</button>
              <button className="msg-edit-btn msg-edit-btn--ghost" onClick={onCancelEdit}>取消</button>
              <span className="msg-edit-hint">⌘/Ctrl+Enter 保存</span>
            </div>
          </div>
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
            {(() => {
              // 渲染顺序：imageIds 解析结果（持久化路径） → 兜底 msg.images (base64 / URL)
              const a = (resolved || []).filter(x => x.src).map(x => ({ src: x.src, key: x.id }))
              const b = (msg.images || (msg.image ? [msg.image] : [])).map((src, i) => ({ src, key: `legacy-${i}` }))
              const all = a.length ? a : b
              return all.length ? <div className="msg-images">{all.map(({ src, key }) => <img key={key} className="msg-image" src={src} alt="" />)}</div> : null
            })()}
            {showToggle && (
              <button className="msg-fold-toggle" onClick={() => setExpanded(v => !v)}>
                {expanded ? '收起 ▲' : '展开全文 ▼'}
              </button>
            )}
            {msg.ts && (
              <div className="msg-meta">
                <span className="msg-edit-mark" title="修改这条消息" onClick={() => onEdit(msg)}>✎</span>
                {fmtMsgTime(msg.ts)}
              </div>
            )}
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
