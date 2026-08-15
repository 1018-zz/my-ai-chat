// src/components/ChatInputBar.jsx — 输入框独立组件
// 打字卡顿的根治：inputText 状态内聚在本组件，敲字只重渲染自己，
// 不再触发父组件（ChatDetailPage）连带重渲染整个消息列表
// 图片：选图阶段只压缩+预览；点发送后才并行调 MCP describe_image 识图，全部完成再组装发出
import { useRef, useState, useEffect } from 'react'

const MCP_URL = 'https://my-ai-chat-4zy.pages.dev/api/mcp-proxy'
const NL = String.fromCharCode(10)

export default function ChatInputBar({ loading, mcpEnabled, onSend, onStop, quote, onClearQuote }) {
  const [text, setText] = useState('')
  const [attachOpen, setAttachOpen] = useState(false)
  const [attaching, setAttaching] = useState(false)
  const [pendingImages, setPendingImages] = useState([]) // 待发图片数组：[{ dataUrl, desc? }]
  const [sending, setSending] = useState(false) // 发送中（并行识图阶段）loading 提示
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)

  // 引用回复：出现引用时自动聚焦输入框，方便接着写
  useEffect(() => { if (quote && inputRef.current) inputRef.current.focus() }, [quote])

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

  // 选图阶段只压缩+预览，不调用 describe_image（识图移到发送时）
  const pickImage = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length || attaching) return
    setAttachOpen(false); setAttaching(true)
    try {
      const results = await Promise.all(files.map(async (file) => {
        try {
          const b64 = await compressImage(file)
          return { dataUrl: b64 }
        } catch (_) { return null }
      }))
      setPendingImages(p => [...p, ...results.filter(Boolean)])
    } finally { setAttaching(false) }
  }

  // 点发送后才并行识图；等所有图识图完成再组装消息发出
  const send = async () => {
    const t = text.trim()
    if ((!t && pendingImages.length === 0) || loading || sending) return
    const imgsToSend = pendingImages
    const hasImgs = imgsToSend.length > 0
    if (!t && !hasImgs) return
    setSending(true)
    try {
      const imgs = hasImgs
        ? await Promise.all(imgsToSend.map(async (it) => {
            let desc = ''
            try {
              const res = await fetch(MCP_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', params: { name: 'describe_image', arguments: { image: it.dataUrl } }, id: 1 }) })
              const d = await res.json()
              desc = d.result?.content?.[0]?.text || d.error?.message || ''
            } catch (_) { desc = '' }
            return { dataUrl: it.dataUrl, desc: desc || '（这张图我可能看不太清）' }
          }))
        : []
      onSend(t, quote, imgs)
      setText('')
      setPendingImages([])
      onClearQuote?.()
      if (inputRef.current) inputRef.current.style.height = 'auto'
    } finally { setSending(false) }
  }

  return (
    <div className="chat-input-bar" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
      {quote && (
        <div className="chat-quote-preview">
          <span className="chat-quote-preview__bar" />
          <div className="chat-quote-preview__body">
            <div className="chat-quote-preview__who">{quote.isSelf ? '泠泠' : '钟泽'}</div>
            <div className="chat-quote-preview__text">{quote.text}</div>
          </div>
          <button className="chat-quote-preview__close" onClick={onClearQuote} aria-label="取消引用">×</button>
        </div>
      )}
      {pendingImages.map((img, i) => (
        <div className="chat-img-preview" key={i}>
          <img className="chat-img-preview__thumb" src={img.dataUrl} alt="待发送图片" />
          <span className="chat-img-preview__tag">{pendingImages.length > 1 ? `图片 ${i + 1}/${pendingImages.length}` : '图片'}</span>
          <button className="chat-img-preview__close" onClick={() => setPendingImages(p => p.filter((_, j) => j !== i))} aria-label="移除图片">×</button>
        </div>
      ))}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <button className="btn-attach" onClick={() => setAttachOpen(o => !o)} disabled={loading || attaching} title="添加图片">{attaching ? '⏳' : '＋'}</button>
        {attachOpen && (
          <div className="attach-menu">
            <div className="attach-item" onClick={() => fileInputRef.current?.click()}>📷 图片</div>
            <div className="attach-item attach-disabled">📎 文件（开发中）</div>
          </div>
        )}
        <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={pickImage} />
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
        ? <button className="chat-stop-btn" onClick={onStop} aria-label="停止生成"><span className="chat-stop-icon" /><span>停止</span></button>
        : sending
          ? <button className="btn" disabled aria-label="正在处理图片">处理图片…</button>
          : <button className="btn" onClick={send} disabled={!text.trim() && pendingImages.length === 0}>发送</button>}
    </div>
  )
}
