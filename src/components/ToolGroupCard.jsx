import { useState } from 'react'
import { ThinkingCard, ToolCard, glassCard } from './Cards'

// 工具组卡片：连续多轮工具调用（纯工具、无正文的 assistant 消息）打包成一个可折叠条目
// 折叠态：一行 "🛠 📖 读取 8 次 · 4 轮 ▸"——细看才点开每轮详情
export const TOOL_META = {
  read_file: { icon: '📖', label: '读取' },
  write_file: { icon: '✏️', label: '写入' },
  list_files: { icon: '📁', label: '列目录' },
  read_memories: { icon: '🧠', label: '回忆' },
  write_memory: { icon: '📝', label: '记忆' },
}

export function buildToolSummary(tools) {
  const counts = {}
  for (const t of tools) counts[t.name] = (counts[t.name] || 0) + 1
  return Object.entries(counts).map(([name, n]) => {
    const meta = TOOL_META[name]
    const label = meta ? `${meta.icon} ${meta.label}` : `⚙️ ${name}`
    return n > 1 ? `${label} ${n} 次` : label
  }).join(' · ')
}

export default function ToolGroupCard({ msgs, showThinking }) {
  const [open, setOpen] = useState(false)
  const tools = msgs.flatMap(m => (m.toolCalls || []).filter(t => t.name))
  const summary = buildToolSummary(tools)
  const rounds = msgs.length
  const thinkRounds = msgs.filter(m => m.thinking).length

  return (
    <div className="msg-left" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
      {/* 折叠条：工具组总览——细看才点开 */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          ...glassCard,
          maxWidth: '75%',
          marginBottom: 6,
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 14px', cursor: 'pointer', fontSize: 12,
          color: 'var(--color-text-gray)', userSelect: 'none',
        }}
      >
        <span style={{ lineHeight: 1.6 }}>
          {thinkRounds > 0 && `🧠 思考 · `}
          <span>🛠 {summary} · {rounds} 轮</span>
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 10, opacity: 0.6 }}>{open ? '▾' : '▸'}</span>
      </div>
      {/* 展开区：每轮的思考卡 + 工具卡 */}
      {open && (
        <div style={{ width: '100%' }}>
          {msgs.map(m => (
            <div key={m.id} style={{ marginBottom: 8 }}>
              {showThinking && m.thinking && <ThinkingCard text={m.thinking} done={!!m.thinkingDone} dur={m.thinkingDur || 0} />}
              {(m.toolCalls || []).filter(t => t.name).map((tc, i) => <ToolCard key={i} tool={tc} result={tc.result} />)}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
