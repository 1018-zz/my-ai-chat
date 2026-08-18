// src/utils/push.js — PWA 推送前端工具（注册 SW / 订阅 / 退订）
// 零依赖，只走浏览器原生 Push API + /api/push

export function pushSupported() {
  return typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
}

// 注册 Service Worker（不弹权限请求，仅让 SW 接管，用于接收推送）
export async function registerServiceWorker() {
  if (!pushSupported()) return null
  const reg = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready
  return reg
}

// 订阅：请求通知权限 → 拿 VAPID 公钥 → pushManager.subscribe → 上报后端
export async function subscribePush(reg) {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return { granted: false, permission }

  const res = await fetch('/api/push')
  const { publicKey } = await res.json()

  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: publicKey,
    })
  }
  await fetch('/api/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'subscribe', subscription: sub }),
  })
  return { granted: true, endpoint: sub.endpoint }
}

// 退订：后端删除 + 本地 unsubscribe
export async function unsubscribePush(reg) {
  const sub = await reg.pushManager.getSubscription()
  if (sub) {
  await fetch('/api/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'unsubscribe', endpoint: sub.endpoint }),
  })
  await sub.unsubscribe()
  }
  return { ok: true }
}

// 发送一条测试通知（验收用）：后端推给所有已订阅设备
export async function sendTestPush(title = '小家', body = '推送测试成功 ✅') {
  const res = await fetch('/api/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'test', title, body }),
  })
  return res.json()
}
