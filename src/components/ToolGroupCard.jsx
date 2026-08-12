import { useState } from 'react'
import { ThinkingCard, ToolCard, glassCard } from './Cards'

// 工具组卡片 v3（时间线圆点 · 小家语言——"钟泽整理完成"，不是任务日志）
// 折叠条：◌ 钟泽整理完成 · 4 个步骤 · 12秒（无工具 emoji，纯人话）
// 运行中：◌ 钟泽正在整理…（脉冲点）
// 展开：圆点时间线——◦ 理解想法 → ◦ 查找信息 → ◦ 写下回复（每步可看思考+工具详情）
export const TOOL_META = {
  read_file: { icon: '📖', label: '读取' },
  write_file: { icon: '✏️', label: '写入' },
  list_files: { icon: '📁', label: '列目录' },
  read_memories: { icon: '🧠', label: '回忆' },
  write_memory: { icon: '📝', label: '记忆' },
}

// 语义化步骤名（小家语言——用户看到的是"钟泽做了什么"，不是工具名）
const STEP_META = {
  read_file: '查找信息',
  write_file: '写入改动',
  list_files: '翻看目录',
  read_memories: '翻了一下记忆',
  write_memory: '记下来',
  describe_image: '看这张图',
  decide_note: '看纸条',
  leave_note: '留纸条',
  default: '处理了一下',
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

// 纯文字副行（无 emoji）："查找信息 3 次 · 翻记忆 2 次"
function textSummary(tools) {
  const counts = {}
  for (const t of tools) counts[t.name] = (counts[t.name] || 0) + 1
  return Object.entries(counts).map(([name, n]) => {
    const label = STEP_META[name] || STEP_META.default
    return n > 1 ? `${label} ${n} 次` : label
  }).join(' · ')
}

export default function ToolGroupCard({ msgs, showThinking }) {
  const [open, setOpen] = useState(false)
  const tools = msgs.flatMap(m => (m.toolCalls || []).filter(t => t.name))
  const rounds = msgs.length
  const running = msgs.some(m => m.loading || (m.toolCalls || []).some(t => t.result === undefined || t.result === ''))
  const durMs = msgs.reduce((s, m) => s + (m.thinkingDur || 0), 0)
  const durText = durMs > 0 ? ` · ${(durMs / 1000).toFixed(1)}秒` : ''
  const subText = textSummary(tools)

  return (
    <div className="msg-left" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
      {/* 折叠条：小家语言——"钟泽整理完成"，无工具 emoji */}
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
        <span className="ze-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-primary)', opacity: 0.6, flexShrink: 0 }} />
        <span style={{ lineHeight: 1.6 }}>
          {running
            ? <span>钟泽正在整理…<span className="thinking-dot" /></span>
            : <span>钟泽整理完成 · {rounds} 个步骤{durText}</span>}
          {subText && !running && <span style={{ opacity: 0.5, fontSize: 11, marginLeft: 8 }}>{subText}</span>}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 10, opacity: 0.6 }}>
          {running ? '…' : (open ? '收起 ▾' : '展开过程 ▸')}
        </span>
      </div>

      {/* 展开区：圆点时间线——每一步是"钟泽做的一件事" */}
      {open && !running && (
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
                {/* 步骤内容：语义化步骤行 + 思考卡 + 工具卡 */}
                <div style={{ flex: 1, minWidth: 0, paddingBottom: 10 }}>
                  {stepTools.map((tc, i) => (
                    <div key={i} style={{ fontSize: 12, color: 'var(--color-text-dark)', padding: '3px 0', lineHeight: 1.5 }}>
                      {STEP_META[tc.name] || STEP_META.default}
                    </div>
                  ))}
                  {showThinking && m.thinking && <ThinkingCard text={m.thinking} done={!!m.thinkingDone} dur={m.thinkingDur || 0} />}
                  {stepTools.map((tc, i) => <ToolCard key={i} tool={tc} result={tc.result} />)}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
