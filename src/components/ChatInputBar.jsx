// src/components/ChatInputBar.jsx — 输入框独立组件
// 打字卡顿的根治：inputText 状态内聚在本组件，敲字只重渲染自己，
// 不再触发父组件（ChatDetailPage）连带重渲染整个消息列表
// 图片识别（小家眼睛）也在这里：选图 → 压缩 → MCP describe_image → 描述进输入框
import { useRef, useState } from 'react'

const MCP_URL = 'https://my-ai-chat-4zy.pages.dev/api/mcp-proxy'
const NL = String.fromCharCode(10)

export default function ChatInputBar({ loading, mcpEnabled, onSend, onStop }) {
  const [text, setText] = useState('')
  const [attachOpen, setAttachOpen] = useState(false)
  const [attaching, setAttaching] = useState(false)
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)

  // 输入框随内容自动增高（上限后内部滚动），避免长文本横向一条过去
  const resize = (el) => {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }

  // 图片压缩：最大边 512px，quality 0.7——识图够用，base64 不会太大
  const compressImage = (file, maxSize = 512, quality = 0.7) => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = ev => {
      const img = new Image()
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(img.width * scale))
        canvas.height = Math.max(1, Math.round(img.height * scale))
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.onerror = () => reject(new Error('img load failed'))
      img.src = ev.target.result
    }
    reader.onerror = () => reject(new Error('read failed'))
    reader.readAsDataURL(file)
  })

  const pickImage = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || attaching) return
    setAttachOpen(false); setAttaching(true)
    try {
      const b64 = await compressImage(file)
      const res = await fetch(MCP_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', params: { name: 'describe_image', arguments: { image: b64 } }, id: 1 }) })
      const d = await res.json()
      const desc = d.result?.content?.[0]?.text || d.error?.message || '（识图失败）'
      setText(p => (p ? p + NL : '') + `[图片] ${desc}`)
    } catch (_) { setText(p => (p ? p + NL : '') + '[图片]（识别失败：网络或眼睛没配好）') } finally { setAttaching(false) }
  }

  const send = () => {
    const t = text.trim()
    if (!t || loading) return
    onSend(t)
    setText('')
    if (inputRef.current) inputRef.current.style.height = 'auto'
  }

  return (
    <div className="chat-input-bar" style={{ alignItems: 'flex-end' }}>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <button className="btn-attach" onClick={() => setAttachOpen(o => !o)} disabled={loading || attaching} title="添加图片">{attaching ? '⏳' : '＋'}</button>
        {attachOpen && (
          <div className="attach-menu">
            <div className="attach-item" onClick={() => fileInputRef.current?.click()}>📷 图片</div>
            <div className="attach-item attach-disabled">📎 文件（开发中）</div>
          </div>
        )}
        <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={pickImage} />
      </div>
      <textarea
        ref={inputRef}
        className="input chat-input"
        rows={1}
        placeholder={mcpEnabled ? "MCP 已开启，AI 可调用工具…" : "写点什么..."}
        value={text}
        onChange={(e) => { setText(e.target.value); resize(e.target) }}
        disabled={loading}
        style={{ resize: 'none', overflowY: 'auto', lineHeight: 1.5, maxHeight: 120, width: '100%', boxSizing: 'border-box', wordBreak: 'break-word', fontFamily: 'inherit' }}
      />
      {loading
        ? <button className="btn" onClick={onStop} style={{ background: 'var(--color-danger)', whiteSpace: 'nowrap' }}>⏹ 停止</button>
        : <button className="btn" onClick={send} disabled={loading || !text.trim()}>发送</button>}
    </div>
  )
}
