// ============================================================
// wandou v1.0 — localStorage 持久化（纯同步，proot 可靠）
// ============================================================
import type { World, WorldMeta } from '../types/world'
import type { WorldBookEntry } from '../types/worldBook'

const PREFIX = 'wandou_'
const WORLD_LIST = PREFIX + 'worldList'
const GLOBAL_WB = PREFIX + 'globalWorldBook'

/** 带类型防御的 JSON 读取：如果 fallback 是数组但存储值不是数组，返回 fallback */
function json<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    if (!v) return fallback
    const parsed = JSON.parse(v)
    // 类型防御：如果期望数组但存储的不是数组，忽略损坏数据
    if (Array.isArray(fallback) && !Array.isArray(parsed)) {
      console.warn(`[wandou] 存储数据损坏，已重置: ${key}`, typeof parsed)
      localStorage.removeItem(key)
      return fallback
    }
    // 类型防御：如果期望对象但存储的不是对象（排除 null 和数组）
    if (fallback !== null && typeof fallback === 'object' && !Array.isArray(fallback)) {
      if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
        console.warn(`[wandou] 存储数据损坏，已重置: ${key}`, typeof parsed)
        localStorage.removeItem(key)
        return fallback
      }
    }
    return parsed
  } catch {
    // 解析失败，清除损坏数据
    try { localStorage.removeItem(key) } catch {}
    return fallback
  }
}
function save(key: string, val: unknown) { try { localStorage.setItem(key, JSON.stringify(val)) } catch {} }

/** 槽位读取 */
function slotGet(id: string, slotName: string): { world: World; apiConfig: any } | null {
  return json(PREFIX + id + '_slot_' + slotName, null)
}
/** 槽位写入 */
function slotSave(id: string, slotName: string, data: { world: World; apiConfig: any }) {
  save(PREFIX + id + '_slot_' + slotName, data)
}
/** 列出某个世界的所有槽位 */
function slotList(id: string): { name: string; timestamp: number; preview: string }[] {
  const prefix = PREFIX + id + '_slot_'
  const slots: { name: string; timestamp: number; preview: string }[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (!k?.startsWith(prefix)) continue
    const slotName = k.slice(prefix.length)
    const v = localStorage.getItem(k)
    if (!v) continue
    try {
      const data = JSON.parse(v)
      const ts = data?.world?.updatedAt || 0
      const charName = data?.world?.character?.name || ''
      const msgCount = data?.world?.messages?.length || 0
      slots.push({ name: slotName, timestamp: ts, preview: `${charName} · ${msgCount}轮` })
    } catch { /* skip broken */ }
  }
  slots.sort((a, b) => b.timestamp - a.timestamp)
  return slots
}

export const storage = {
  // ---- 世界列表 ----
  getWorldList(): WorldMeta[] { return json(WORLD_LIST, []) },
  saveWorldList(list: WorldMeta[]) { save(WORLD_LIST, list) },

  // ---- 全局世界书 ----
  getGlobalWorldBook(): WorldBookEntry[] { return json(GLOBAL_WB, []) },
  saveGlobalWorldBook(entries: WorldBookEntry[]) { save(GLOBAL_WB, entries) },

  // ---- 单个世界（向下兼容：优先读槽位，不存在则读旧 key） ----
  // slot 方法在此之下定义，通过闭包引用 storage 对象（避免 this 绑定问题）
  getWorld(id: string): { world: World; apiConfig: any } | null {
    const autoSlot = slotGet(id, 'auto')
    if (autoSlot) return autoSlot
    return json(PREFIX + id, null)
  },
  saveWorld(id: string, data: { world: World; apiConfig: any }) {
    slotSave(id, 'auto', data)
  },
  deleteWorld(id: string) {
    for (const s of slotList(id)) {
      try { localStorage.removeItem(PREFIX + id + '_slot_' + s.name) } catch {}
    }
    try { localStorage.removeItem(PREFIX + id) } catch {}
  },

  // ---- 多存档槽位 ----
  getWorldSlot(id: string, slotName: string) { return slotGet(id, slotName) },
  saveWorldSlot(id: string, slotName: string, data: { world: World; apiConfig: any }) { slotSave(id, slotName, data) },
  deleteWorldSlot(id: string, slotName: string) { try { localStorage.removeItem(PREFIX + id + '_slot_' + slotName) } catch {} },
  listSlots(id: string) { return slotList(id) },

  // ---- 全局配置 ----
  getConfig<T>(key: string, fallback: T): T { return json(PREFIX + key, fallback) },
  saveConfig(key: string, val: unknown) { save(PREFIX + key, val) },

  // ---- 调试/修复 ----
  /** 清除所有 wandou 相关存储 */
  clearAll() {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith(PREFIX)) keys.push(k)
    }
    for (const k of keys) {
      try { localStorage.removeItem(k) } catch {}
    }
    return keys.length
  },
  /** 列出所有 wandou 存储的 key */
  listKeys() {
    const keys: { key: string; size: number; type: string }[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith(PREFIX)) {
        const v = localStorage.getItem(k) || ''
        const parsed = (() => { try { return JSON.parse(v) } catch { return v } })()
        keys.push({ key: k, size: v.length, type: Array.isArray(parsed) ? 'array' : typeof parsed })
      }
    }
    return keys
  },
}
