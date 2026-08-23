// src/hooks/useTimeOfDay.js
// 从 App.jsx 与 ChatDetailPage 抽离的「时间光」逻辑：让小家跟着一天呼吸（body[data-time]），每 5 分钟刷新。
// 合并原两处重复的 applyTime + setInterval effect，输出行为不变。
import { useEffect } from 'react'

export function useTimeOfDay() {
  useEffect(() => {
    const applyTime = () => {
      const h = new Date().getHours()
      const t = h < 5 ? 'dawn' : h < 11 ? 'morning' : h < 17 ? 'afternoon' : 'night'
      document.body.setAttribute('data-time', t)
    }
    applyTime()
    const iv = setInterval(applyTime, 5 * 60 * 1000)
    return () => clearInterval(iv)
  }, [])
}
