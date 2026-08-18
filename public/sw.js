// public/sw.js — 极简 Service Worker：只负责接收 Web Push 并弹通知
// 不做离线缓存，避免干扰前端 no-cache 策略
self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = { title: '小家', body: '' }
  try {
    if (event.data) data = event.data.json()
  } catch (_) {}
  const title = data.title || '小家'
  const options = {
    body: data.body || '',
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    tag: 'xiaojia-wake',
    renotify: true,
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if ('focus' in c) return c.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow('/')
    })
  )
})
