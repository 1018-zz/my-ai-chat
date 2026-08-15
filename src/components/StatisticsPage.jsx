// src/components/StatisticsPage.jsx — 小家【统计】页
// 只在进入本页时读取 localStorage 并计算汇总/图表；聊天页面不碰这些逻辑
// 布局：热力图（近 180 天日历网格）→ 指标卡片（2 列）→ 预留：Token 消耗趋势柱状图
import { readStats } from '../utils/stats'

// 热力图取色：消息数越多越深（奶油色系，0 为极浅底）
function heatColor(n) {
  if (!n) return 'rgba(184,132,90,0.07)'
  if (n < 3) return 'rgba(184,132,90,0.28)'
  if (n < 7) return 'rgba(184,132,90,0.52)'
  if (n < 15) return 'rgba(184,132,90,0.76)'
  return 'rgba(184,132,90,0.95)'
}
const fmtNum = (n) => (n >= 10000 ? `${(n / 1000).toFixed(1)}k` : n.toLocaleString())
const fmtFull = (n) => n.toLocaleString()

// 近 180 天日历网格：每列一周（周一开头），对齐到含今天
function buildHeatmap(daily) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const start = new Date(today)
  start.setDate(start.getDate() - (180 - 1))
  const realStart = new Date(start)
  while (start.getDay() !== 1) start.setDate(start.getDate() - 1) // 对齐周一
  const cols = []
  const cursor = new Date(start)
  while (cursor <= today) {
    const col = []
    for (let d = 0; d < 7; d++) {
      const date = new Date(cursor)
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      const valid = date >= realStart && date <= today
      col.push({ key, n: valid ? (daily[key] || 0) : null })
      cursor.setDate(cursor.getDate() + 1)
    }
    cols.push(col)
    cursor.setDate(cursor.getDate() - 7 + 7) // 对齐到列尾后自然进入下一行
  }
  return cols
}

export default function StatisticsPage() {
  // 只在挂载（进入统计页）时读一次并计算
  const s = readStats()
  const heat = buildHeatmap(s.daily)
  const cards = [
    { label: '总对话数', value: fmtNum(s.conversations), icon: '💬' },
    { label: '总消息数', value: fmtNum(s.messages), icon: '✉️' },
    { label: '输入 Token', value: fmtNum(s.inputTokens), icon: '📥' },
    { label: '输出 Token', value: fmtNum(s.outputTokens), icon: '📤' },
    { label: '缓存节省 Token', value: fmtNum(s.cacheTokens), icon: '⚡' },
    { label: '应用启动次数', value: fmtNum(s.launches), icon: '🚀' },
  ]
  return (
    <div className="stat-page">
      {/* 聊天热力图 */}
      <div className="stat-heatmap">
        <div className="stat-heat-title">
          <span>🔥 聊天热力图</span>
          <span>最近 180 天</span>
        </div>
        <div className="stat-heat-grid">
          {heat.map((col, ci) => (
            <div key={ci} className="stat-heat-col">
              {col.map((cell, ri) => (
                <div key={ri} className="stat-heat-cell" style={{ background: cell.n === null ? 'transparent' : heatColor(cell.n) }} title={cell.n ? `${cell.key} · ${cell.n} 条` : cell.key} />
              ))}
            </div>
          ))}
        </div>
        <div className="stat-heat-legend">
          <span>少</span>
          {[0, 1, 2, 3, 4].map(i => (
            <span key={i} className="stat-heat-cell" style={{ background: heatColor(i === 0 ? 0 : i * 5) }} />
          ))}
          <span>多</span>
        </div>
      </div>

      {/* 指标卡片 */}
      <div className="stat-grid">
        {cards.map(c => (
          <div key={c.label} className="stat-card">
            <div className="stat-card-label">{c.icon} {c.label}</div>
            <div className="stat-card-num">{c.value}</div>
          </div>
        ))}
      </div>

      {/* 预留：Token 消耗趋势柱状图（后续迭代） */}
      <div className="stat-placeholder">
        📈 Token 消耗趋势
        <div style={{ marginTop: 6, fontSize: 11, opacity: 0.6 }}>后续迭代：按日柱状图，看看我们哪天话最多</div>
      </div>

      {/* 明细说明 */}
      <div style={{ marginTop: 14, fontSize: 11, color: 'var(--color-text-gray)', opacity: 0.7, lineHeight: 1.7, textAlign: 'center' }}>
        Token 为估算值（接口暂未返回 usage）<br />数据存本地，仅在你打开统计页时计算 ✨
      </div>
    </div>
  )
}
