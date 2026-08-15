// src/components/RunCard.jsx
// 一次 AI 回复（可能跨多个工具轮）统一渲染成一张卡片：
// 运行中显示轻量工作台状态；完成后折叠成归档条；展开看思考 + 工具时间线；
// 正文始终可见——每条 assistant 消息按 \n\n 拆成段落，在单卡片内错落浮现（段落呼吸），心声单独成便签。
import { Fragment, memo, useEffect, useMemo, useRef, useState } from 'react'
import Markdown from './Markdown'
import { ThinkingCard, ToolCard, paperCard } from './Cards'
import DiaryConfirmCard from './DiaryConfirmCard'
import { fmtMsgTime } from '../utils/time'
import { buildToolSummary } from './ToolGroupCard'

// 心声标记（[心里嘀咕：...] 或 <!-- 心声：... -->）
const VOICE_RE = /<!--\s*心声[：:]\s*([\s\S]*?)\s*-->|\[\s*心里嘀咕[：:]\s*([^\]]+?)\s*\]/g

// 段落呼吸：单卡片内按 \n\n 切成段落，逐段错落浮现（像一个人慢慢说），不再拆成多个气泡。
// 流式再快也不怕——生成完仍按呼吸节奏把剩余段落补冒完；历史消息（挂载时未在流式）直接全显示。
function delayFor(t) {
  const n = (t || '').length
  if (n < 12) return 480 + Math.random() * 520
  if (n < 40) return 720 + Math.random() * 680
  return 920 + Math.min(n, 120) * 22
}
// 把 parts（心声 + 正文混排）展开成分段序列：心声一项，正文按 \n\n 分成段落（单气泡内多段）
function buildSegs(parts) {
  const segs = []
  let buf = []
  const flush = () => { if (buf.length) { segs.push({ kind: 'bubble', paras: buf }); buf = [] } }
  for (const p of parts) {
    if (p.type === 'voice') { flush(); segs.push({ kind: 'voice', text: p.text }) }
    else String(p.text).split(/\n\n+/).map(s => s.trim()).filter(Boolean).forEach(t => buf.push(t))
  }
  flush()
  return segs
}

function RevealCard({ parts, live }) {
  const segs = useMemo(() => buildSegs(parts), [parts])
  const units = useMemo(() => {
    const u = []
    segs.forEach((s, si) => {
      if (s.kind === 'voice') u.push({ seg: si, kind: 'voice' })
      else s.paras.forEach((text, pi) => u.push({ seg: si, kind: 'para', pi, text }))
    })
    return u
  }, [segs])
  const [shown, setShown] = useState(() => (live ? 0 : units.length))
  const totalRef = useRef(units.length); totalRef.current = units.length
  const liveRef = useRef(live)
  useEffect(() => {
    if (!liveRef.current) return
    let timer
    const tick = () => {
      setShown(prev => {
        if (prev >= totalRef.current) return prev
        const next = prev + 1
        const u = units[next - 1]
        timer = setTimeout(tick, delayFor(u?.text))
        return next
      })
    }
    timer = setTimeout(tick, 520)
    return () => clearTimeout(timer)
  }, [])
  const visibleCount = live ? shown : units.length
  let gi = 0
  return segs.map((s, si) => {
    if (s.kind === 'voice') {
      const idx = gi; gi += 1
      return (!live || idx < visibleCount) ? <div key={si} className="inner-thought">{s.text}</div> : null
    }
    const start = gi; gi += s.paras.length
    const paras = s.paras.filter((_, pi) => { const idx = start + pi; return !live || idx < visibleCount })
    if (!paras.length) return null
    return (
      <div key={si} className="msg-bubble">
        {paras.map((t, pi) => <p key={pi} className="breath-para"><Markdown>{t}</Markdown></p>)}
      </div>
    )
  })
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

function RunCard({ msgs, showThinking, expanded, onToggle }) {
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
          onClick={() => onToggle(msgs[0]?.id)}
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
      {/* 正文：每条 assistant 消息在单卡片内按 \n\n 分段落呼吸浮现，心声单独成便签 */}
      {msgs.map((m) => {
        const { draft, text: textNoDraft } = extractDiaryDraft(m.text)
        const parts = splitVoiceParts(textNoDraft)
        const fullText = parts.map(p => p.text).join('').trim()
        return (
          <Fragment key={m.id}>
            {m.loading && !fullText
              ? <div className="msg-typing"><span className="dot" /><span className="dot" /><span className="dot" /></div>
              : parts.length > 0
                ? <RevealCard parts={parts} live={live} />
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

// memo + 自定义比较：run 切片数组每次渲染都是新引用（默认浅比较必失效），
// 改为逐条比较消息元素引用——元素没变就是真没变，打字/loading 切换/菜单开关都跳过重渲染
export default memo(RunCard, (prev, next) => {
  if (prev.showThinking !== next.showThinking || prev.expanded !== next.expanded || prev.onToggle !== next.onToggle) return false
  const a = prev.msgs, b = next.msgs
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
})
