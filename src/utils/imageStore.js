// src/utils/imageStore.js —— 图片库（IndexedDB 持久化 + 内存缓存）
// 用途：用户上传的图片存这里，消息只引用 imageId，渲染时按 id 取 dataURL。
// 持久化：刷新页面/重开浏览器不丢；IndexedDB 不可用时降级到内存（仅供 demo）。
const DB_NAME = 'xiaojia-images'
const STORE = 'images'
const DB_VERSION = 1

let _dbPromise = null
let _memoryStore = null  // IndexedDB 失败时 fallback：{ [id]: { dataUrl, ... } }

// 打开/复用 IndexedDB（失败则启用内存 fallback）
function openDB() {
  if (_memoryStore) return Promise.resolve(null)
  if (_dbPromise) return _dbPromise
  _dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') { _memoryStore = {}; resolve(null); return }
    let req
    try { req = indexedDB.open(DB_NAME, DB_VERSION) }
    catch (_) { _memoryStore = {}; resolve(null); return }
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => { _memoryStore = {}; resolve(null) }
  })
  return _dbPromise
}

// 生成短 id（时间戳 + 随机）
function genId() {
  return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7)
}

// 保存图片：dataUrl → { id, ... }；IndexedDB 不可用时只存内存
export async function putImage(dataUrl, meta = {}) {
  const id = genId()
  const record = { id, dataUrl, mime: meta.mime || '', addedAt: Date.now() }
  const db = await openDB()
  if (db) {
    await new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(record)
      tx.oncomplete = res
      tx.onerror = () => rej(tx.error)
    }).catch(() => { _memoryStore = _memoryStore || {}; _memoryStore[id] = record })
  } else {
    _memoryStore[id] = record
  }
  return { id, dataUrl, mime: record.mime, addedAt: record.addedAt }
}

// 读取：id → record（无则 null）
export async function getImage(id) {
  if (!id) return null
  const db = await openDB()
  if (db) {
    const rec = await new Promise((res) => {
      const tx = db.transaction(STORE, 'readonly')
      const r = tx.objectStore(STORE).get(id)
      r.onsuccess = () => res(r.result || null)
      r.onerror = () => res(null)
    })
    return rec
  }
  return _memoryStore?.[id] || null
}

// 删除
export async function deleteImage(id) {
  if (!id) return
  const db = await openDB()
  if (db) {
    await new Promise((res) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(id)
      tx.oncomplete = res
      tx.onerror = res
    })
  }
  if (_memoryStore) delete _memoryStore[id]
}

// 批量读：避免每个 <img> 单独查询；输入 [id,id,id...]，输出 {id: dataUrl|null}
export async function getImageMap(ids) {
  const out = {}
  if (!ids || !ids.length) return out
  const db = await openDB()
  if (db) {
    await new Promise((res) => {
      const tx = db.transaction(STORE, 'readonly')
      const store = tx.objectStore(STORE)
      ids.forEach((id) => {
        const r = store.get(id)
        r.onsuccess = () => { if (r.result) out[id] = r.result.dataUrl }
      })
      tx.oncomplete = res
      tx.onerror = res
    })
  } else if (_memoryStore) {
    ids.forEach((id) => { if (_memoryStore[id]) out[id] = _memoryStore[id].dataUrl })
  }
  return out
}

// 全部清空（设置里"清理图片库"时调）
export async function clearAll() {
  const db = await openDB()
  if (db) {
    await new Promise((res) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).clear()
      tx.oncomplete = res
      tx.onerror = res
    })
  }
  if (_memoryStore) _memoryStore = {}
}

// 仅检测 IndexedDB 是否真的可用（启动期用，决定是否启用图片库）
export async function isImageStoreAvailable() {
  const db = await openDB()
  return !!db
}
