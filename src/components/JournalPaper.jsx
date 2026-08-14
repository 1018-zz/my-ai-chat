import './JournalPaper.css'

// 手账纸张组件 —— 设计系统第九节「视觉手账化」
// 用法：<JournalPaper date title signature paper="note|diary|memory|record">
//       纸面内容（children）
//      </JournalPaper>
// 纸张语义：note=淡黄(纸条) / diary=米白(日记) / memory=淡绿(记忆) / record=微灰(工具记录)
export default function JournalPaper({
  date,
  title,
  signature,
  paper = 'note',
  showTape = true,
  className = '',
  children,
}) {
  return (
    <article className={`journal-paper journal-paper--${paper} ${className}`}>
      {showTape && <div className="journal-paper__tape" />}
      {date && <div className="journal-paper__date">{date}</div>}
      {title && <h2 className="journal-paper__title">{title}</h2>}
      <div className="journal-paper__body">{children}</div>
      {signature && <div className="journal-paper__signature">{signature}</div>}
    </article>
  )
}
