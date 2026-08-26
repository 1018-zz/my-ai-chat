// src/components/ChatInputBar.jsx —— 输入框 + 5 工具按钮（参考图重做）
// 数据流保持不变：图片压缩 → onSend(t, quote, imgs) 由父组件持久化到 IndexedDB
// 视觉改造（v2）：底部一行 [相册][拍照][语音][陪伴][更多] → 输入框 → 麦克风
// 装饰清零：所有 emoji/贴纸换 inline SVG（icons 内嵌）
import { useRef, useState } from 'react'
import { getEnabledModels, getDefaultEnabledModelId, findModel } from '../utils/models'

const MCP_URL = (import.meta.env.VITE_API_BASE || '') + '/api/mcp-proxy'
const NL = String.fromCharCode(10)

// 模型库由设置页「模型管理」维护（localStorage xiaojia.models）；这里只读取启用的项做选择。
export const DEFAULT_MODEL = getDefaultEnabledModelId()

// —— 内嵌 SVG 工具栏图标（1em，跟着按钮文字走） ——
const svgBase = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  width: 20,
  height: 20,
  display: 'inline-block',
}
const AlbumIcon = (p) => <svg {...svgBase} {...p}><path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><circle cx="9" cy="11" r="1.4"/><path d="M4 16l4-4 3 3 3-3 4 4 2-2"/></svg>
const CameraIcon = (p) => <svg {...svgBase} {...p}><path d="M4 7h3l1.5-2h7L17 7h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.6"/></svg>
const PhoneIcon = (p) => <svg {...svgBase} {...p}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
const MoonIcon = (p) => <svg {...svgBase} {...p}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
const MoreIcon = (p) => <svg {...svgBase} {...p}><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>
const MicIcon = (p) => <svg {...svgBase} {...p}><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/></svg>
const QuoteIcon = (p) => <svg {...svgBase} {...p}><path d="M7 7h4v4H8c-.6 0-1 .4-1 1v2H5v-3c0-2.2 1-4 2-4z"/><path d="M14 7h4v4h-3c-.6 0-1 .4-1 1v2h-2v-3c0-2.2 1-4 2-4z"/></svg>
const ModelIcon = (p) => <svg {...svgBase} {...p}><path d="M12 3 4 7v5c0 5 3.6 9.4 8 10 4.4-.6 8-5 8-10V7z"/><path d="M9 12l2 2 4-4"/></svg>
const BrainIcon = (p) => <svg {...svgBase} {...p}><path d="M12 5.5a2.5 2.5 0 0 0-5 0 2.5 2.5 0 0 0-1 4 2.5 2.5 0 0 0 1 4 2.5 2.5 0 0 0 5 .5"/><path d="M12 5.5a2.5 2.5 0 0 1 5 0 2.5 2.5 0 0 1 1 4 2.5 2.5 0 0 1-1 4 2.5 2.5 0 0 1-5 .5"/><path d="M12 5.5v13"/></svg>

export default function ChatInputBar({ loading, mcpEnabled, onSend, onStop, quote, onClearQuote, model = DEFAULT_MODEL, onSelectModel, thinking = 'high', onSelectThinking, onCompanionMode }) {
  const [text, setText] = useState('')
  const [attaching, setAttaching] = useState(false)
  const [pendingImages, setPendingImages] = useState([]) // [{ dataUrl }]
  const [sending, setSending] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [thinkingMenuOpen, setThinkingMenuOpen] = useState(false)

  const THINKING_LABELS = { low: '浅', high: '标准', max: '深', off: '关' }
  const thinkingLabel = THINKING_LABELS[thinking] || '标准'
  const thinkingOptions = [
    { id: 'low', label: '浅思考', desc: '快，少想' },
    { id: 'high', label: '标准思考', desc: '默认' },
    { id: 'max', label: '深思考', desc: '想最多' },
    { id: 'off', label: '关思考', desc: '不思考，直接答' },
  ]
  const currentModelLabel = (findModel(model) || {}).label || model
  const enabledModels = getEnabledModels()
  const menuModels = enabledModels.some(m => m.id === model)
    ? enabledModels
    : [...enabledModels, { id: model, label: currentModelLabel, desc: '（已停用，切换后生效）', enabled: false }]

  const inputRef = useRef(null)
  const albumRef = useRef(null)         // 相册
  const cameraRef = useRef(null)        // 拍照（摄像头）
  const [recording, setRecording] = useState(false)
  const recogRef = useRef(null)          // 语音识别

  // 自动增高
  const resize = (el) => {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 110) + 'px'
  }

  // 图片压缩：最大边 768px（聊天里看更清楚），quality 0.78
  const compressImage = (file, maxSize = 768, quality = 0.78) => new Promise((resolve, reject) => {
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

  // 共用选图逻辑（相册 / 拍照）
  const handlePick = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length || attaching) return
    setAttaching(true)
    try {
      const compressed = await Promise.all(files.map(f => compressImage(f)))
      setPendingImages(p => [...p, ...compressed.map(d => ({ dataUrl: d }))])
    } catch (_) { /* 单张失败忽略 */ } finally { setAttaching(false) }
  }

  const removePending = (i) => setPendingImages(p => p.filter((_, idx) => idx !== i))

  // 发送
  const send = async () => {
    const t = text.trim()
    if ((!t && pendingImages.length === 0) || loading || sending) return
    setSending(true)
    let imgs = []
    try {
      if (pendingImages.length) {
        const isVision = model === 'deepseek-v4-flash-vision-exp'
        imgs = await Promise.all(pendingImages.map(async (it) => {
          if (isVision) return { dataUrl: it.dataUrl, desc: '', direct: true }
          try {
            const res = await fetch(MCP_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', params: { name: 'describe_image', arguments: { image: it.dataUrl } }, id: 1 })
            })
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
      setMoreOpen(false)
    } finally { setSending(false) }
  }

  // 麦克风：长按录音（语音转文字）；浏览器无 recognition API 时只是切换图标态
  const toggleVoice = () => {
    const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)
    if (!SR) {
      // 退化：仅切换图标态（提示"未支持"）
      setRecording(v => !v)
      if (!recording) setTimeout(() => setRecording(false), 1500)
      return
    }
    if (recording) {
      try { recogRef.current?.stop() } catch (_) {}
      setRecording(false)
      return
    }
    const r = new SR()
    r.lang = 'zh-CN'
    r.continuous = false
    r.interimResults = false
    r.onresult = (e) => {
      const txt = e.results?.[0]?.[0]?.transcript || ''
      if (txt) setText(p => p ? p + txt : txt)
    }
    r.onerror = () => setRecording(false)
    r.onend = () => setRecording(false)
    recogRef.current = r
    try { r.start(); setRecording(true) } catch (_) {}
  }

  // 语音通话/陪伴模式（占位：本轮不实现，提示即可）
  const stubFeature = (name) => {
    if (onCompanionMode) onCompanionMode(name)
  }

  return (
    <div className="chat-input-bar">
      {/* 引用回复 */}
      {quote && (
        <div className="chat-quote-preview">
          <QuoteIcon style={{ marginRight: 6, verticalAlign: -3 }} />
          <div className="chat-quote-preview-text">
            <span className="chat-quote-who">{quote.isSelf ? '泠泠' : '钟泽'}</span>
            <span className="chat-quote-snippet">{quote.text}</span>
          </div>
          <button className="chat-quote-close" onClick={onClearQuote} title="取消引用">×</button>
        </div>
      )}

      {/* 待发图片预览 */}
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

      {/* 5 个工具按钮（参考图主改） */}
      <div className="chat-toolbar">
        <button
          className="chat-tool-btn"
          onClick={() => albumRef.current?.click()}
          disabled={loading || attaching || sending}
          title="从相册选图"
        >
          <AlbumIcon />
          <span className="chat-tool-label">相册</span>
        </button>
        <button
          className="chat-tool-btn"
          onClick={() => cameraRef.current?.click()}
          disabled={loading || attaching || sending}
          title="拍照上传"
        >
          <CameraIcon />
          <span className="chat-tool-label">拍照</span>
        </button>
        <button
          className="chat-tool-btn"
          onClick={() => stubFeature('voiceCall')}
          disabled={loading}
          title="语音通话（开发中）"
        >
          <PhoneIcon />
          <span className="chat-tool-label">语音</span>
        </button>
        <button
          className="chat-tool-btn"
          onClick={() => stubFeature('companion')}
          disabled={loading}
          title="陪伴模式"
        >
          <MoonIcon />
          <span className="chat-tool-label">陪伴</span>
        </button>
        <button
          className={`chat-tool-btn ${moreOpen ? 'chat-tool-btn--active' : ''}`}
          onClick={() => { setMoreOpen(o => !o); setModelMenuOpen(false); setThinkingMenuOpen(false) }}
          disabled={loading}
          title="更多（模型 / 思考 / 引用）"
        >
          <MoreIcon />
          <span className="chat-tool-label">更多</span>
        </button>
        <input ref={albumRef}  type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handlePick} />
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handlePick} />
      </div>

      {/* 输入栏 + 麦克风 */}
      <div className="chat-input-row">
        <textarea
          ref={inputRef}
          className="input chat-input"
          rows={1}
          placeholder={mcpEnabled ? '和泽说点什么…' : '对泽说点什么…'}
          value={text}
          onChange={(e) => { setText(e.target.value); resize(e.target) }}
          onKeyDown={(e) => {
            // Enter 发送、Shift+Enter 换行
            if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send() }
          }}
          disabled={loading || sending}
          style={{ resize: 'none', overflowY: 'auto', lineHeight: 1.5, maxHeight: 110, width: '100%', boxSizing: 'border-box', wordBreak: 'break-word', fontFamily: 'inherit' }}
        />
        {loading ? (
          <button className="chat-stop-btn" onClick={onStop} title="停止生成">
            <span className="chat-stop-icon" />
            <span>停止</span>
          </button>
        ) : (
          <button
            className={`chat-mic-btn ${recording ? 'chat-mic-btn--rec' : ''}`}
            onClick={toggleVoice}
            disabled={sending}
            title={recording ? '点击结束录音' : '点击开始语音输入'}
          >
            <MicIcon />
          </button>
        )}
      </div>

      {/* "更多" 弹层（模型 / 思考） */}
      {moreOpen && (
        <div className="attach-menu" onClick={(e) => e.stopPropagation()}>
          <div
            className="attach-model-item"
            onClick={() => { setThinkingMenuOpen(false); setModelMenuOpen(o => !o) }}
          >
            <ModelIcon style={{ marginRight: 8, verticalAlign: -3 }} />
            <span className="attach-model-label">模型</span>
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
                  onClick={() => { onSelectModel?.(m.id); setModelMenuOpen(false); setMoreOpen(false) }}
                >
                  <span className="model-option-main">
                    <span className="model-option-label">{m.label}</span>
                    {m.desc && <span className="model-option-desc">{m.desc}</span>}
                  </span>
                  {model === m.id && <span className="model-option-check">✓</span>}
                </div>
              ))}
            </div>
          )}
          <div
            className="attach-model-item"
            onClick={() => { setModelMenuOpen(false); setThinkingMenuOpen(o => !o) }}
          >
            <BrainIcon style={{ marginRight: 8, verticalAlign: -3 }} />
            <span className="attach-model-label">思考</span>
            <span className="attach-model-current">{thinkingLabel}</span>
            <span className="attach-caret">{thinkingMenuOpen ? '▴' : '▾'}</span>
          </div>
          {thinkingMenuOpen && (
            <div className="model-submenu">
              {thinkingOptions.map(opt => (
                <div
                  key={opt.id}
                  className={`model-option ${thinking === opt.id ? 'selected' : ''}`}
                  onClick={() => { onSelectThinking?.(opt.id); setThinkingMenuOpen(false) }}
                >
                  <span className="model-option-main">
                    <span className="model-option-label">{opt.label}</span>
                    {opt.desc && <span className="model-option-desc">{opt.desc}</span>}
                  </span>
                  {thinking === opt.id && <span className="model-option-check">✓</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
