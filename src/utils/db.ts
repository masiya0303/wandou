// ============================================================
// wandou v0.7 — 豌豆星际漂流 · IndexedDB 存储 v2
// stores: worlds (多世界) + global (key-value)
// ============================================================

const DB_NAME = 'WandouDB'
const DB_VERSION = 2

const STORES = {
  WORLDS: 'worlds', // keyPath: 'id' — 每个 World 一条
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
      // v1 → v2: 如果旧 saves store 存在，保留不删; 新加 worlds
      if (!db.objectStoreNames.contains(STORES.WORLDS)) {
        db.createObjectStore(STORES.WORLDS, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORES.GLOBAL)) {
        db.createObjectStore(STORES.GLOBAL, { keyPath: 'key' })
      }
    }
  })
}

export const db = {
  // ============ Worlds ============

  async getWorld(id: string): Promise<any | undefined> {
    const database = await openDB()
    return new Promise((resolve, reject) => {
      const tx = database.transaction([STORES.WORLDS], 'readonly')
      const store = tx.objectStore(STORES.WORLDS)
      const req = store.get(id)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  },

  async getAllWorlds(): Promise<any[]> {
    const database = await openDB()
    return new Promise((resolve, reject) => {
      const tx = database.transaction([STORES.WORLDS], 'readonly')
      const store = tx.objectStore(STORES.WORLDS)
      const req = store.getAll()
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  },

  async putWorld(worldData: any): Promise<IDBValidKey> {
    const database = await openDB()
    return new Promise((resolve, reject) => {
      const tx = database.transaction([STORES.WORLDS], 'readwrite')
      const store = tx.objectStore(STORES.WORLDS)
      const req = store.put(worldData)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  },

  async deleteWorld(id: string): Promise<void> {
    const database = await openDB()
    return new Promise((resolve, reject) => {
      const tx = database.transaction([STORES.WORLDS], 'readwrite')
      const store = tx.objectStore(STORES.WORLDS)
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
}
