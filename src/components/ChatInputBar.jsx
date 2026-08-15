// src/components/ChatInputBar.jsx — 输入框独立组件
// 打字卡顿的根治：inputText 状态内聚在本组件，敲字只重渲染自己，
// 不再触发父组件（ChatDetailPage）连带重渲染整个消息列表
// 图片直发（多选）：选图只压缩进待发，点发送后才并行 MCP describe_image，
// 描述仅注入 AI 上下文（不进气泡）；引用回复也走这里
import { useRef, useState } from 'react'
import { getEnabledModels, getDefaultEnabledModelId, findModel } from '../utils/models'

const MCP_URL = 'https://my-ai-chat-4zy.pages.dev/api/mcp-proxy'
const NL = String.fromCharCode(10)

// 模型库由设置页「模型管理」维护（localStorage xiaojia.models）；这里只读取启用的项做选择。
// DEFAULT_MODEL 动态取「首个启用模型」，保证库被改后仍有合理默认。
export const DEFAULT_MODEL = getDefaultEnabledModelId()

export default function ChatInputBar({ loading, mcpEnabled, onSend, onStop, quote, onClearQuote, model = DEFAULT_MODEL, onSelectModel }) {
  const [text, setText] = useState('')
  const [attachOpen, setAttachOpen] = useState(false)
  const [attaching, setAttaching] = useState(false)
  const [pendingImages, setPendingImages] = useState([]) // [{ dataUrl }]
  const [sending, setSending] = useState(false)
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  // 当前选中模型的展示名：优先库里找，找不到（已停用/历史值）就回退原 id
  const currentModelLabel = (findModel(model) || {}).label || model
  // 菜单项 = 启用的模型；若当前 model 不在启用列表（被停用），额外补一条让其仍可见
  const enabledModels = getEnabledModels()
  const menuModels = enabledModels.some(m => m.id === model)
    ? enabledModels
    : [...enabledModels, { id: model, label: currentModelLabel, desc: '（已停用，切换后生效）', enabled: false }]
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

  // 选图：只压缩进待发，不调识图（识图推迟到发送时并行）
  const pickImage = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length || attaching) return
    setAttachOpen(false); setAttaching(true)
    try {
      const compressed = await Promise.all(files.map(f => compressImage(f)))
      setPendingImages(p => [...p, ...compressed.map(d => ({ dataUrl: d }))])
    } catch (_) { /* 单张失败忽略 */ } finally { setAttaching(false) }
  }

  const removePending = (i) => setPendingImages(p => p.filter((_, idx) => idx !== i))

  // 发送：并行识图 → 组装消息（描述仅给 AI，不进气泡）
  const send = async () => {
    const t = text.trim()
    if ((!t && pendingImages.length === 0) || loading || sending) return
    setSending(true)
    let imgs = []
    try {
      if (pendingImages.length) {
        imgs = await Promise.all(pendingImages.map(async (it) => {
          try {
            const res = await fetch(MCP_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', params: { name: 'describe_image', arguments: { image: it.dataUrl } }, id: 1 }) })
            const d = await res.json()
            const desc = d.result?.content?.[0]?.text || d.error?.message || ''
            return { dataUrl: it.dataUrl, desc }
          } catch (_) { return { dataUrl: it.dataUrl, desc: '' } }
        }))
      }
      onSend(t, quote, imgs)
      setText('')
      setPendingImages([])
      if (onClearQuote) onClearQuote()
      if (inputRef.current) inputRef.current.style.height = 'auto'
    } finally { setSending(false) }
  }

  return (
    <div className="chat-input-bar" style={{ alignItems: 'flex-end' }}>
      {quote && (
        <div className="chat-quote-preview">
          <div className="chat-quote-preview-text">
            <span className="chat-quote-who">{quote.isSelf ? '泠泠' : '钟泽'}</span>
            <span className="chat-quote-snippet">{quote.text}</span>
          </div>
          <button className="chat-quote-close" onClick={onClearQuote} title="取消引用">×</button>
        </div>
      )}
      {pendingImages.length > 0 && (
        <div className="chat-img-previews">
          {pendingImages.map((img, i) => (
            <div className="chat-img-preview" key={i}>
              <img className="chat-img-thumb" src={img.dataUrl} alt="待发图片" />
              <span className="chat-img-tag">图片</span>
              <button className="chat-img-remove" onClick={() => removePending(i)} title="移除">×</button>
            </div>
          ))}
        </div>
      )}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <button className="btn-attach" onClick={() => setAttachOpen(o => !o)} disabled={loading || attaching || sending} title="添加图片">{attaching ? '⏳' : '＋'}</button>
        {attachOpen && (
          <div className="attach-menu">
            <div className="attach-item" onClick={() => fileInputRef.current?.click()}>📷 图片</div>
            <div className="attach-item attach-disabled">📎 文件（开发中）</div>
            <div className="attach-item attach-model-item" onClick={() => setModelMenuOpen(o => !o)}>
              <span className="attach-model-label">✦ 模型</span>
              <span className="attach-model-current">{currentModelLabel}</span>
              <span className="attach-caret">{modelMenuOpen ? '▴' : '▾'}</span>
            </div>
            {modelMenuOpen && (
              <div className="model-submenu">
                {menuModels.length === 0 && (
                  <div className="model-option model-option-empty">去设置里启用模型</div>
                )}
                {menuModels.map(m => (
                  <div
                    key={m.id}
                    className={`model-option ${model === m.id ? 'selected' : ''} ${m.enabled === false ? 'model-option-disabled' : ''}`}
                    onClick={() => { onSelectModel?.(m.id); setModelMenuOpen(false); setAttachOpen(false) }}
                  >
                    <span className="model-option-main">
                      <span className="model-option-label">✦ {m.label}</span>
                      {m.desc && <span className="model-option-desc">{m.desc}</span>}
                    </span>
                    {model === m.id && <span className="model-option-check">✓</span>}
                  </div>
                ))}
              </div>
            )}
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
        disabled={loading || sending}
        style={{ resize: 'none', overflowY: 'auto', lineHeight: 1.5, maxHeight: 120, width: '100%', boxSizing: 'border-box', wordBreak: 'break-word', fontFamily: 'inherit' }}
      />
      {loading
        ? <button className="btn" onClick={onStop} style={{ background: 'var(--color-danger)', whiteSpace: 'nowrap' }}>⏹ 停止</button>
        : <button className="btn" onClick={send} disabled={loading || sending || (!text.trim() && pendingImages.length === 0)}>{sending ? '处理图片…' : '发送'}</button>}
    </div>
  )
}
