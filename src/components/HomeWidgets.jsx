// 小家首页模块系统 v0.2 —— 配置驱动，可扩展
// 表现层：横向可滑动的「软件图标」网格（仅模块区横向滚动，其余页面正常竖向滚动）
// 以后加新模块：往 widgets 数组里加一项（id/icon/title/desc/tint/enabled），不用改任何结构
// 未来路线：开关、排序、拖动、自定义 —— 小家是空间系统，不是页面
// 数据先模拟，不接后端；onOpen 先 console.log 占位，之后接真实功能页

import './HomeWidgets.css'

export const widgets = [
  { id: 'music', icon: '🎵', title: '一起听歌', desc: '还没有播放歌曲', tint: '--accent-peach', enabled: true },
  { id: 'health', icon: '🌸', title: '健康记录', desc: '点击查看', tint: '--accent-rose', enabled: true },
  { id: 'diary', icon: '📖', title: '今日小记', desc: '今天还没写', tint: '--accent-mint', enabled: true },
]

// 单个软件图标（圆角方 tile + 下方标题），仅在本模块内横向排列
const AppIcon = ({ icon, title, tint, onClick }) => (
  <div className="app-icon" onClick={onClick}>
    <div
      className="app-icon-tile"
      style={{ background: tint ? `var(${tint})` : 'var(--accent-peach)' }}
    >
      <span className="app-icon-glyph">{icon}</span>
    </div>
    <div className="app-icon-label">{title}</div>
  </div>
)

export default function HomeWidgets({ items = widgets, onOpen }) {
  const handleOpen = (item) => {
    // 占位：以后接真实功能页 —— music → 音乐页 / health → 健康页 / diary → 日记页
    console.log(`open ${item.id}`)
    onOpen?.(item)
  }
  const visible = items.filter(w => w.enabled !== false)
  if (visible.length === 0) return null
  return (
    <div className="app-grid">
      {visible.map(item => (
        <AppIcon key={item.id} {...item} onClick={() => handleOpen(item)} />
      ))}
    </div>
  )
}
