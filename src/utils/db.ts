// ============================================================
// wandou v0.6 — 豌豆星际漂流 · IndexedDB 存储
// 仿 yijiekkk 的 IndexedDB 封装模式
// ============================================================

const DB_NAME = 'WandouDB'
const DB_VERSION = 1

const STORES = {
  SAVES: 'saves',   // keyPath: 'id'
  GLOBAL: 'global', // keyPath: 'key'
} as const

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = (event) => {
      console.error('[DB] 打开数据库失败:', (event.target as IDBRequest).error)
      reject((event.target as IDBRequest).error)
    }

    request.onsuccess = (event) => {
      resolve((event.target as IDBRequest).result as IDBDatabase)
    }

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBRequest).result as IDBDatabase
      if (!db.objectStoreNames.contains(STORES.SAVES)) {
        db.createObjectStore(STORES.SAVES, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORES.GLOBAL)) {
        db.createObjectStore(STORES.GLOBAL, { keyPath: 'key' })
      }
    }
  })
}

// ---- 类型安全封装 ----

export const db = {
  // ============ Save ============

  async getSave(id: string): Promise<any | undefined> {
    const database = await openDB()
    return new Promise((resolve, reject) => {
      const tx = database.transaction([STORES.SAVES], 'readonly')
      const store = tx.objectStore(STORES.SAVES)
      const req = store.get(id)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  },

  async getAllSaves(): Promise<any[]> {
    const database = await openDB()
    return new Promise((resolve, reject) => {
      const tx = database.transaction([STORES.SAVES], 'readonly')
      const store = tx.objectStore(STORES.SAVES)
      const req = store.getAll()
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  },

  async putSave(saveData: any): Promise<IDBValidKey> {
    const database = await openDB()
    return new Promise((resolve, reject) => {
      const tx = database.transaction([STORES.SAVES], 'readwrite')
      const store = tx.objectStore(STORES.SAVES)
      const req = store.put(saveData)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  },

  async deleteSave(id: string): Promise<void> {
    const database = await openDB()
    return new Promise((resolve, reject) => {
      const tx = database.transaction([STORES.SAVES], 'readwrite')
      const store = tx.objectStore(STORES.SAVES)
      const req = store.delete(id)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  },

  // ============ Global (key-value) ============

  async getGlobal(key: string): Promise<any | undefined> {
    const database = await openDB()
    return new Promise((resolve, reject) => {
      const tx = database.transaction([STORES.GLOBAL], 'readonly')
      const store = tx.objectStore(STORES.GLOBAL)
      const req = store.get(key)
      req.onsuccess = () => resolve(req.result?.value)
      req.onerror = () => reject(req.error)
    })
  },

  async putGlobal(key: string, value: any): Promise<IDBValidKey> {
    const database = await openDB()
    return new Promise((resolve, reject) => {
      const tx = database.transaction([STORES.GLOBAL], 'readwrite')
      const store = tx.objectStore(STORES.GLOBAL)
      const req = store.put({ key, value })
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  },

  async deleteGlobal(key: string): Promise<void> {
    const database = await openDB()
    return new Promise((resolve, reject) => {
      const tx = database.transaction([STORES.GLOBAL], 'readwrite')
      const store = tx.objectStore(STORES.GLOBAL)
      const req = store.delete(key)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  },
}
