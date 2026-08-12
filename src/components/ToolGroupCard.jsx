import { useState } from 'react'
import { ThinkingCard, ToolCard, glassCard } from './Cards'

// 工具组卡片 v2（TaskTimeline 雏形——"钟泽完成了一件事"，不是服务器日志）
// 连续多轮工具调用（纯工具、无正文的 assistant 消息）打包成一个可折叠条目：
// 折叠态：🤖 钟泽思考完成 · N 个小步骤 ▸（人味文案）；副行保留技术细节（🛠 读取 8 次）
// 运行中：🌱 钟泽正在忙 · 第 N 步（动态进度感）
// 展开：每轮 = 步骤行（🔎 查找信息 之类的语义化描述）+ 思考卡 + 工具卡
export const TOOL_META = {
  read_file: { icon: '📖', label: '读取' },
  write_file: { icon: '✏️', label: '写入' },
  list_files: { icon: '📁', label: '列目录' },
  read_memories: { icon: '🧠', label: '回忆' },
  write_memory: { icon: '📝', label: '记忆' },
}

// 语义化步骤名：工具是后台发生的事，用户看到的是"钟泽做了什么"
const STEP_META = {
  read_file: { icon: '🔎', label: '查找信息' },
  write_file: { icon: '✏️', label: '写入改动' },
  list_files: { icon: '📁', label: '翻看目录' },
  read_memories: { icon: '🧠', label: '翻了一下记忆' },
  write_memory: { icon: '📝', label: '记下来' },
  describe_image: { icon: '👁️', label: '看这张图' },
  decide_note: { icon: '📎', label: '看纸条' },
  leave_note: { icon: '📎', label: '留纸条' },
  default: { icon: '🛠', label: '处理一下' },
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
  const running = msgs.some(m => m.loading || (m.toolCalls || []).some(t => t.result === undefined || t.result === ''))

  return (
    <div className="msg-left" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
      {/* 折叠条：人味文案——"钟泽完成了一件事"，不是日志 */}
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
          {running
            ? <span>🌱 钟泽正在忙 · <span className="thinking-dot" /></span>
            : <span>🤖 钟泽思考完成 · {rounds} 个小步骤</span>}
          <span style={{ opacity: 0.55, fontSize: 11 }}>　{summary}</span>
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 10, opacity: 0.6 }}>
          {running ? '…' : (open ? '收起 ▾' : '展开看看 ▸')}
        </span>
      </div>

      {/* 展开区：每轮 = 语义化步骤行 + 思考卡 + 工具卡 */}
      {open && !running && (
        <div style={{ width: '100%' }}>
          {msgs.map(m => {
            const stepTools = (m.toolCalls || []).filter(t => t.name)
            if (stepTools.length === 0 && !m.thinking) return null
            return (
              <div key={m.id} style={{ marginBottom: 8 }}>
                {/* 步骤行：语义化描述（人话） */}
                {stepTools.map((tc, i) => {
                  const meta = STEP_META[tc.name] || STEP_META.default
                  return (
                    <div key={i} style={{ fontSize: 12, color: 'var(--color-text-dark)', padding: '4px 2px', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>{meta.icon}</span>
                      <span>{meta.label}</span>
                      <span style={{ marginLeft: 'auto', fontSize: 11, opacity: 0.5 }}>{TOOL_META[tc.name]?.label || tc.name}</span>
                    </div>
                  )
                })}
                {showThinking && m.thinking && <ThinkingCard text={m.thinking} done={!!m.thinkingDone} dur={m.thinkingDur || 0} />}
                {stepTools.map((tc, i) => <ToolCard key={i} tool={tc} result={tc.result} />)}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
