import './JournalPaper.css'

// 手账纸张组件 —— 设计系统第九节「视觉手账化」
// 三态 mode：
//   today  = 桌面当前纸（胶带 + 微旋 + 签名，代表"还放在桌上"）
//   full   = 阅读态（无胶带、不旋转，完整一页）
//   preview= 折叠摘要（更薄更小，用于时间轴/列表的纸感）
// 颜色 paper：note=暖灰米(纸条) / journal=旧米白(手账) / inner=亚麻白(内页) / memory=淡绿 / record=微灰
export default function JournalPaper({
  date,
  title,
  signature,
  paper = 'note',
  mode = 'today',
  className = '',
  onDelete,
  children,
}) {
  const cls = [
    'journal-paper',
    `journal-paper--${paper}`,
    `journal-paper--mode-${mode}`,
    className,
  ].join(' ')

  const showTape = mode === 'today'

  return (
    <article className={cls}>
      {onDelete && (
        <button
          type="button"
          className="journal-paper__del"
          aria-label="删除这张纸条"
          title="删除这张纸条"
          onClick={(e) => { e.stopPropagation(); onDelete() }}
        >
          ×
        </button>
      )}
      {showTape && <div className="journal-paper__tape" />}
      {date && <div className="journal-paper__date">{date}</div>}
      {title && <h2 className="journal-paper__title">{title}</h2>}
      <div className="journal-paper__body">{children}</div>
      {signature && <div className="journal-paper__signature">{signature}</div>}
    </article>
  )
}
