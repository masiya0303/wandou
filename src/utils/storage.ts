// ============================================================
// wandou v1.0 — localStorage 持久化（纯同步，proot 可靠）
// ============================================================
import type { World, WorldMeta } from '../types/world'
import type { WorldBookEntry } from '../types/worldBook'

const PREFIX = 'wandou_'
const WORLD_LIST = PREFIX + 'worldList'
const GLOBAL_WB = PREFIX + 'globalWorldBook'

function json<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback } catch { return fallback }
}
function save(key: string, val: unknown) { try { localStorage.setItem(key, JSON.stringify(val)) } catch {} }

export const storage = {
  // ---- 世界列表 ----
  getWorldList(): WorldMeta[] { return json(WORLD_LIST, []) },
  saveWorldList(list: WorldMeta[]) { save(WORLD_LIST, list) },

  // ---- 全局世界书 ----
  getGlobalWorldBook(): WorldBookEntry[] { return json(GLOBAL_WB, []) },
  saveGlobalWorldBook(entries: WorldBookEntry[]) { save(GLOBAL_WB, entries) },

  // ---- 单个世界 ----
  getWorld(id: string): { world: World; apiConfig: any } | null {
    return json(PREFIX + id, null)
  },
  saveWorld(id: string, data: { world: World; apiConfig: any }) {
    save(PREFIX + id, data)
  },
  deleteWorld(id: string) {
    try { localStorage.removeItem(PREFIX + id) } catch {}
  },

  // ---- 全局配置 ----
  getConfig<T>(key: string, fallback: T): T { return json(PREFIX + key, fallback) },
  saveConfig(key: string, val: unknown) { save(PREFIX + key, val) },
}
