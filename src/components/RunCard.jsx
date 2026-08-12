// src/components/RunCard.jsx
// P0.7a：一次 assistant run 的容器——思考 + 工具组 + 回答
// 运行中：思考卡/工具卡实时展开，像翻开工作台
// 完成：自动归档成摘要卡（🧠 思考 Xs · 🛠 用了 N 个工具），点击展开细节
// 回答始终可见——折叠只收过程，不收结果
//
// 设计原则（Chat v1.2）：
// 工具过程可见，但完成后归档。像翻开工作台，而不是看服务器日志。

import Markdown from './Markdown'
import { ThinkingCard, ToolCard, glassCard } from './Cards'

const TOOL_META = {
  read_file: { icon: '📖', label: '读取' },
  write_file: { icon: '✏️', label: '写入' },
  list_files: { icon: '📁', label: '列目录' },
  read_memories: { icon: '🧠', label: '回忆' },
  write_memory: { icon: '📝', label: '记忆' },
}

// read_file × 3 → "📖 读取 3 次"；混合 → "📖 读取 2 次 · 📁 列目录 1 次"
function buildToolSummary(tools) {
  const counts = {}
  for (const t of tools) counts[t.name] = (counts[t.name] || 0) + 1
  return Object.entries(counts).map(([name, n]) => {
    const meta = TOOL_META[name]
    const label = meta ? `${meta.icon} ${meta.label}` : `⚙️ ${name}`
    return n > 1 ? `${label} ${n} 次` : label
  }).join(' · ')
}

// 抽出心声标记 <!-- 心声：... -->（钟泽有感而发的话，渲染成便签卡，不进入正文气泡）
function extractVoice(text) {
  const m = String(text || '').match(/<!--\s*心声[：:]\s*([\s\S]*?)\s*-->/)
  if (!m) return { voice: null, text: text || '' }
  return { voice: m[1].trim(), text: String(text).replace(m[0], '').trim() }
}

export default function RunCard({ msg, showThinking, expanded, onToggle }) {
  const tools = msg.toolCalls || []
  const { voice, text } = extractVoice(msg.text)
  const hasThinking = !!(msg.thinking && showThinking)
  const hasTools = tools.length > 0
  const running = !!msg.loading || tools.some(t => t.result === undefined || t.result === '')
  const canFold = hasThinking || hasTools
  const isCollapsed = canFold && !running && !expanded
  const summary = buildToolSummary(tools)
  const durText = msg.thinkingDur ? `${(msg.thinkingDur / 1000).toFixed(1)}s` : ''

  return (
    // .msg-left 在 theme.css 是 display:flex（单气泡时代遗留），内联覆盖为垂直流：
    // 归档条 / 展开区 / 回答 三个子元素必须纵向排列，否则会被横排成左右分栏
    <div className="msg-left" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
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
      {/* 展开区：思考卡 + 工具卡（运行中强制展开） */}
      {!isCollapsed && (hasThinking || hasTools) && (
        <div>
          {hasThinking && <ThinkingCard text={msg.thinking} done={!!msg.thinkingDone} dur={msg.thinkingDur || 0} />}
          {tools.map((tc, i) => <ToolCard key={i} tool={tc} result={tc.result} />)}
        </div>
      )}
      {/* 回答始终可见——折叠只收过程，不收结果；空内容（工具轮 assistant）不渲染空气泡 */}
      {msg.loading && !msg.text
        ? <div className="msg-typing"><span className="dot"/><span className="dot"/><span className="dot"/></div>
        : msg.text
          ? <div className="msg-bubble"><Markdown>{msg.text}</Markdown></div>
          : null}
    </div>
  )
}
