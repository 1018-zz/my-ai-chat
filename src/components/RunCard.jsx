// src/components/RunCard.jsx
// P0.7a：一次 assistant run 的容器——思考 + 工具组 + 回答
// 运行中：思考卡/工具卡实时展开，像翻开工作台
// 完成：自动归档成摘要卡（🧠 思考 Xs · 🛠 用了 N 个工具），点击展开细节
// 回答始终可见——折叠只收过程，不收结果
//
// 设计原则（Chat v1.2）：
// 工具过程可见，但完成后归档。像翻开工作台，而不是看服务器日志。

import Markdown from './Markdown'
import { splitTextByPunct, splitSentences } from '../utils/splitText'
import { ThinkingCard, ToolCard, glassCard } from './Cards'
import DiaryConfirmCard from './DiaryConfirmCard'
import { fmtMsgTime } from '../utils/time'
import { TOOL_META, buildToolSummary } from './ToolGroupCard'

// 心声标记（借鉴 AionsHome 的"心里嘀咕"思路——正文里穿插心声，像真人说着说着心里嘀咕一句）：
// 新格式 [心里嘀咕：...]（纯文本，模型更容易输出）；兼容旧格式 <!-- 心声：... -->
const VOICE_RE = /<!--\s*心声[：:]\s*([\s\S]*?)\s*-->|\[\s*心里嘀咕[：:]\s*([^\]]+?)\s*\]/g

// 把消息拆成多段：气泡 ↔ 心声便签交替（一条消息可穿插多个心声）
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

// 抽出日记草稿标记 <!-- diary-draft: {...} -->（晚安彩蛋：待用户确认的日记，渲染成确认卡）
function extractDiaryDraft(text) {
  const m = String(text || '').match(/<!--\s*diary-draft:\s*(\{[\s\S]*?\})\s*-->/)
  if (!m) return { draft: null, text: text || '' }
  try {
    const draft = JSON.parse(m[1])
    return { draft, text: String(text).replace(m[0], '').trim() }
  } catch (_) { return { draft: null, text: text || '' } }
}

export default function RunCard({ msg, showThinking, expanded, onToggle }) {
  const tools = msg.toolCalls || []
  const { draft, text: textNoDraft } = extractDiaryDraft(msg.text)
  const parts = splitVoiceParts(textNoDraft)
  const fullText = parts.map(p => p.text).join('').trim()
  const hasThinking = !!(msg.thinking && showThinking)
  const hasTools = tools.length > 0
  const running = !!msg.loading || tools.some(t => t.result === undefined || t.result === '')
  const canFold = hasThinking || hasTools
  const isCollapsed = canFold && !running && !expanded
  const summary = buildToolSummary(tools)
  const durText = msg.thinkingDur ? `${(msg.thinkingDur / 1000).toFixed(1)}s` : ''
  // 过程注脚：工具轮里的短过渡语（"继续翻页："）不当气泡，低存在感
  const isTinyProcess = !!fullText && hasTools && !running && fullText.length <= 24 && !draft

  return (
    // .msg-left 在 theme.css 是 display:flex（单气泡时代遗留），内联覆盖为垂直流：
    // 状态行 / 归档条 / 展开区 / 回答 四个子元素必须纵向排列，否则会被横排成左右分栏
    <div className="msg-left" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
      {/* 运行中：轻量工作台状态行（一行，不堆卡片墙）——像翻开工作台，不是看服务器日志 */}
      {running && (hasThinking || hasTools) && (
        <div
          style={{
            ...glassCard,
            maxWidth: '75%',
            marginBottom: 6,
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 14px', fontSize: 12,
            color: 'var(--color-text-gray)', userSelect: 'none',
          }}
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
          style={{
            ...glassCard,
            maxWidth: '75%',
            marginBottom: 6,
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 14px', cursor: 'pointer', fontSize: 12,
            color: 'var(--color-text-gray)', userSelect: 'none',
          }}
        >
          <span style={{ opacity: 0.9, lineHeight: 1.6 }}>
            {hasThinking && `🧠 思考 ${durText || '…'}`}
            {hasThinking && hasTools && <span style={{ opacity: 0.5 }}> · </span>}
            {hasTools && `🛠 ${summary}`}
          </span>
          <span style={{ marginLeft: 'auto', fontSize: 10, opacity: 0.6 }}>{isCollapsed ? '▸' : '▾'}</span>
        </div>
      )}
      {/* 展开区：思考卡 + 工具卡（仅完成态、用户点击后展开；运行中只显示上面的状态行） */}
      {!running && !isCollapsed && (hasThinking || hasTools) && (
        <div>
          {hasThinking && <ThinkingCard text={msg.thinking} done={!!msg.thinkingDone} dur={msg.thinkingDur || 0} />}
          {tools.map((tc, i) => <ToolCard key={i} tool={tc} result={tc.result} />)}
        </div>
      )}
      {/* 晚安彩蛋：待确认的日记草稿（用户有最终决定权） */}
      {draft && <DiaryConfirmCard draft={draft} msgId={msg.id} />}
      {/* 回答始终可见——心声穿插正文，多段交替渲染（像真人说着说着心里嘀咕一句） */}
      {msg.loading && !fullText
        ? <div className="msg-typing"><span className="dot"/><span className="dot"/><span className="dot"/></div>
        : isTinyProcess
          ? <div className="chat-process-note">{fullText}</div>
          : parts.length > 0
            ? parts.map((p, i) => p.type === 'voice'
              ? <div key={i} className="inner-thought">{p.text}</div>
              : splitSentences(p.text).map((s, j) => <div key={`${i}-${j}`} className="msg-bubble"><Markdown>{s}</Markdown></div>))
            : null}
      {msg.ts && !msg.loading && <div className="msg-meta">{fmtMsgTime(msg.ts)}</div>}
    </div>
  )
}
