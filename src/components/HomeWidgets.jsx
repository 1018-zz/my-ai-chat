// 小家首页模块系统 v0.1 —— 配置驱动，可扩展
// 以后加新模块：往 widgets 数组里加一项（id/icon/title/desc/enabled），不用改任何结构
// 未来路线：开关、排序、拖动、自定义 —— 小家是空间系统，不是页面
// 数据先模拟，不接后端；onOpen 先 console.log 占位，之后接真实功能页

export const widgets = [
  { id: 'music', icon: '🎵', title: '一起听歌', desc: '还没有播放歌曲', enabled: true },
  { id: 'health', icon: '🌸', title: '健康记录', desc: '点击查看', enabled: true },
  { id: 'diary', icon: '📖', title: '今日小记', desc: '今天还没写', enabled: true },
]

const cardStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '14px 16px',
  borderRadius: 'var(--radius-lg)',
  background: 'rgba(255,255,255,0.6)',
  backdropFilter: 'blur(16px) saturate(1.4)',
  WebkitBackdropFilter: 'blur(16px) saturate(1.4)',
  border: '1px solid rgba(255,255,255,0.4)',
  boxShadow: 'var(--shadow-soft)',
  cursor: 'pointer',
  transition: 'transform .2s var(--ease-soft), box-shadow .2s var(--ease-soft)',
  userSelect: 'none',
}

export const WidgetCard = ({ icon, title, desc, onClick }) => (
  <div style={cardStyle} onClick={onClick}>
    <span style={{ fontSize: 22, width: 36, textAlign: 'center', flexShrink: 0 }}>{icon}</span>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-dark)' }}>{title}</div>
      <div style={{ fontSize: 12, color: 'var(--color-text-gray)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{desc}</div>
    </div>
    <span style={{ color: 'var(--color-text-gray)', fontSize: 14, flexShrink: 0 }}>→</span>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {visible.map(item => (
        <WidgetCard key={item.id} {...item} onClick={() => handleOpen(item)} />
      ))}
    </div>
  )
}
