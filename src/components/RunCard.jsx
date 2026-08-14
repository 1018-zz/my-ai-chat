// src/components/RunCard.jsx
// 一次 AI 回复（可能跨多个工具轮）统一渲染成一张卡片：
// 运行中显示轻量工作台状态；完成后折叠成归档条；展开看思考 + 工具时间线；
// 正文始终可见——每条 assistant 消息按标点拆成多个气泡（一句一泡，像连发几句），心声单独成便签。
import { Fragment, useEffect, useRef, useState } from 'react'
import Markdown from './Markdown'
import { splitSentences } from '../utils/splitText'
import { ThinkingCard, ToolCard, paperCard } from './Cards'
import DiaryConfirmCard from './DiaryConfirmCard'
import { fmtMsgTime } from '../utils/time'
import { buildToolSummary } from './ToolGroupCard'

// 心声标记（[心里嘀咕：...] 或 <!-- 心声：... -->）
const VOICE_RE = /<!--\s*心声[：:]\s*([\s\S]*?)\s*-->|\[\s*心里嘀咕[：:]\s*([^\]]+?)\s*\]/g

// 逐句浮现：本次生成的消息按节奏一句一句冒出来（像真人连发消息），
// 流式再快也不怕——生成完仍按 180ms/句 继续冒完；历史消息（挂载时未在流式）直接全显示
function RevealItems({ items, live }) {
  const [shown, setShown] = useState(() => (live ? 0 : items.length))
  const totalRef = useRef(items.length)
  totalRef.current = items.length
  const liveRef = useRef(live)
  useEffect(() => {
    if (!liveRef.current) return
    let timer = setInterval(() => {
      setShown(prev => {
        if (prev >= totalRef.current) { clearInterval(timer); return prev }
        return prev + 1
      })
    }, 180)
    return () => clearInterval(timer)
  }, [])
  const visible = live ? items.slice(0, shown) : items
  return visible.map(it => it.kind === 'voice'
    ? <div key={it.key} className="inner-thought">{it.text}</div>
    : <div key={it.key} className="msg-bubble"><Markdown>{it.text}</Markdown></div>)
}

// 把 parts（心声 + 正文混排）展开成统一渲染序列：心声一项，正文每句一项
function buildItems(parts) {
  const items = []
  parts.forEach((p, i) => {
    if (p.type === 'voice') items.push({ kind: 'voice', key: `v${i}`, text: p.text })
    else splitSentences(p.text).forEach((s, j) => items.push({ kind: 'bubble', key: `${i}-${j}`, text: s }))
  })
  return items
}

function splitVoiceParts(text) {
  const src = String(text || '')
  const items = []
  let last = 0, m
  VOICE_RE.lastIndex = 0
  while ((m = VOICE_RE.exec(src)) !== null) {
    const before = src.slice(last, m.index).trim()
    if (before) items.push({ type: 'bubble', text: before })
    const v = (m[1] || m[2] || '').trim()
    if (v) items.push({ type: 'voice', text: v })
    last = VOICE_RE.lastIndex
  }
  const tail = src.slice(last).trim()
  if (tail) items.push({ type: 'bubble', text: tail })
  return items
}

function extractDiaryDraft(text) {
  const m = String(text || '').match(/<!--\s*diary-draft:\s*(\{[\s\S]*?\})\s*-->/)
  if (!m) return { draft: null, text: text || '' }
  try {
    const draft = JSON.parse(m[1])
    return { draft, text: String(text).replace(m[0], '').trim() }
  } catch (_) { return { draft: null, text: text || '' } }
}

export default function RunCard({ msgs, showThinking, expanded, onToggle }) {
  const tools = msgs.flatMap(m => (m.toolCalls || []).filter(t => t.name))
  // 挂载时是否正在流式生成：本次生成 → 逐句浮现；历史消息 → 直接全显示
  const liveRef = useRef(msgs.some(m => m.loading))
  const live = liveRef.current
  const hasThinking = msgs.some(m => m.thinking && showThinking)
  const hasTools = tools.length > 0
  const running = msgs.some(m => m.loading) || tools.some(t => t.result === undefined || t.result === '')
  const canFold = hasThinking || hasTools
  // 运行中也默认折叠：只留轻量状态条，不铺开思考+工具时间线刷屏；手动点归档条可实时展开
  const isCollapsed = canFold && !expanded
  const summary = buildToolSummary(tools)
  const durMs = msgs.reduce((s, m) => s + (m.thinkingDur || 0), 0)
  const durText = durMs > 0 ? `${(durMs / 1000).toFixed(1)}s` : ''

  return (
    // .msg-left 在 theme.css 是 display:flex（单气泡时代遗留），内联覆盖为垂直流
    <div className="msg-left" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
      {/* 运行中：轻量工作台状态条（像翻开工作台，不是服务器日志） */}
      {running && (hasThinking || hasTools) && (
        <div
          style={{ ...paperCard, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', fontSize: 12, color: 'var(--color-text-gray)', userSelect: 'none' }}
        >
          <span style={{ lineHeight: 1.6 }}>
            {hasThinking && <span>🌱 正在整理想法<span className="thinking-dot" /></span>}
            {hasThinking && hasTools && <span style={{ opacity: 0.5 }}> · </span>}
            {hasTools && <span>🛠 {summary}</span>}
          </span>
          <span style={{ marginLeft: 'auto', fontSize: 10, opacity: 0.5 }}>…</span>
        </div>
      )}
      {/* 完成态归档条：抽屉拉手——点一下翻开工作台 */}
      {canFold && !running && (
        <div
          onClick={onToggle}
          style={{ ...paperCard, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 12, color: 'var(--color-text-gray)', userSelect: 'none' }}
        >
          <span style={{ opacity: 0.9, lineHeight: 1.6 }}>
            {hasThinking && `🧠 思考 ${durText || '…'}`}
            {hasThinking && hasTools && <span style={{ opacity: 0.5 }}> · </span>}
            {hasTools && `🛠 ${summary}`}
          </span>
          <span style={{ marginLeft: 'auto', fontSize: 10, opacity: 0.6 }}>{isCollapsed ? '▸' : '▾'}</span>
        </div>
      )}
      {/* 展开区：思考卡 + 工具时间线（合并同一轮所有消息） */}
      {!running && !isCollapsed && (hasThinking || hasTools) && (
        <div style={{ width: '100%', maxWidth: '75%' }}>
          {msgs.map((m, mi) => {
            const stepTools = (m.toolCalls || []).filter(t => t.name)
            const hasContent = stepTools.length > 0 || m.thinking
            if (!hasContent) return null
            const isLast = mi === msgs.length - 1
            return (
              <div key={m.id} style={{ display: 'flex', gap: 8 }}>
                {/* 时间线：圆点 + 竖线 */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, paddingTop: 4 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'rgba(201,184,166,0.9)', flexShrink: 0 }} />
                  {!isLast && <span style={{ width: 1, flex: 1, background: 'rgba(201,184,166,0.25)', margin: '3px 0' }} />}
                </div>
                {/* 步骤内容 */}
                <div style={{ flex: 1, minWidth: 0, paddingBottom: 10 }}>
                  {showThinking && m.thinking && <ThinkingCard text={m.thinking} done={!!m.thinkingDone} dur={m.thinkingDur || 0} />}
                  {stepTools.map((tc, i) => <ToolCard key={i} tool={tc} result={tc.result} />)}
                </div>
              </div>
            )
          })}
        </div>
      )}
      {/* 正文：每条 assistant 消息一气泡（仅原生换行），心声单独成便签 */}
      {msgs.map((m) => {
        const { draft, text: textNoDraft } = extractDiaryDraft(m.text)
        const parts = splitVoiceParts(textNoDraft)
        const fullText = parts.map(p => p.text).join('').trim()
        const isTiny = !!fullText && !m.loading && fullText.length <= 24 && !draft && !hasTools
        return (
          <Fragment key={m.id}>
            {m.loading && !fullText
              ? <div className="msg-typing"><span className="dot" /><span className="dot" /><span className="dot" /></div>
              : isTiny
                ? <div className="chat-process-note">{fullText}</div>
                : parts.length > 0
                  ? parts.map((p, i) => p.type === 'voice'
                      ? <div key={i} className="inner-thought">{p.text}</div>
                      : splitSentences(p.text).map((s, j) => <div key={`${i}-${j}`} className="msg-bubble"><Markdown>{s}</Markdown></div>))
                  : null}
            {draft && <DiaryConfirmCard draft={draft} msgId={m.id} />}
          </Fragment>
        )
      })}
      {(() => {
        const last = [...msgs].reverse().find(m => m.ts && !m.loading)
        return last ? <div className="msg-meta">{fmtMsgTime(last.ts)}</div> : null
      })()}
    </div>
  )
}
