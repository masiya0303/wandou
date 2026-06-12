// ============================================================
// wandou · 世界书 Store（全局 + 当前世界 + 浏览用）
// ============================================================
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { WorldBookEntry } from '@/types/worldBook'
import { storage } from '@/utils/storage'

export const useWorldBookStore = defineStore('worldBook', () => {
  // ---- 全局世界书 ----
  const globalWorldBook = ref<WorldBookEntry[]>(storage.getGlobalWorldBook())
  const globalWorldBookEnabled = ref(true)

  // ---- 当前活跃世界的世界书 ----
  const worldBook = ref<WorldBookEntry[]>([])
  const worldBookEnabled = ref(true)

  // ---- 浏览模式（WorldBookManager 浏览非活跃世界的世界书，不污染活跃状态） ----
  const browsingBook = ref<WorldBookEntry[]>([])
  const browsingBookEnabled = ref(true)
  const browsingWorldId = ref<string | null>(null)
  const browsingWorldName = ref('')

  // ---- 计算 ----
  const globalEnabledEntries = computed(() => globalWorldBook.value.filter(e => e.enabled).length)
  const worldEnabledEntries = computed(() => worldBook.value.filter(e => e.enabled).length)

  // ---- 全局世界书 CRUD ----
  function _saveGlobalWb() { storage.saveGlobalWorldBook(globalWorldBook.value) }

  const PROTOCOL_ENTRIES: WorldBookEntry[] = [
    {
      id: 'sys-protocol-output',
      keys: [],
      comment: '状态输出协议',
      content: '【输出格式强制要求】\n1) 回复末尾必须用 <variables> 标签包裹 RFC 6902 JSON Patch 数组。\n2) 标签外禁止输出任何解释文本。\n3) 若无变量变化，输出 <variables>[]</variables>。\n4) 禁止输出注释、禁止输出伪 JSON。\n\n【最小合法示例】\n<variables>\n[\n  {"op":"replace","path":"/player/gold","value":"-450"},\n  {"op":"add","path":"/player/inventory/-","value":{"name":"护符指环","quantity":1,"type":"key","description":"..."}}\n]\n</variables>',
      enabled: true,
      priority: 100,
      position: 'at_constant',
    },
    {
      id: 'sys-protocol-paths',
      keys: [],
      comment: '路径速查',
      content: '【变量路径】\n/player/gold(金币,+N/-N) /player/inventory/-(add物品) /player/inventory/物品名(remove)\n/player/attributes/HP(生命,+N/-N) /player/attributes/MP(法力)\n/player/quests/-(add任务) /world/time(时间) /world/location(地点)\n/npcs/NPC名/favor(好感,+N/-N)\n\n物品value格式: {"name":"名称","quantity":数量,"type":"weapon|armor|consumable|material|key|other","description":"简述"}',
      enabled: true,
      priority: 99,
      position: 'at_constant',
    },
  ]

  function initGlobalBook() {
    // 确保协议条目始终存在（新增或更新）
    for (const proto of PROTOCOL_ENTRIES) {
      const idx = globalWorldBook.value.findIndex(e => e.id === proto.id)
      if (idx >= 0) {
        // 更新已有条目
        globalWorldBook.value[idx] = { ...proto }
      } else {
        globalWorldBook.value.push({ ...proto })
      }
    }
    _saveGlobalWb()
  }

  function addGlobalEntries(entries: WorldBookEntry[]) {
    const ids = new Set(globalWorldBook.value.map(e => e.id))
    for (const e of entries) { if (!ids.has(e.id)) globalWorldBook.value.push(e) }
    _saveGlobalWb()
  }

  function removeGlobalEntry(id: string) {
    globalWorldBook.value = globalWorldBook.value.filter(e => e.id !== id)
    _saveGlobalWb()
  }

  function toggleGlobalEntry(id: string) {
    const e = globalWorldBook.value.find(x => x.id === id)
    if (e) { e.enabled = !e.enabled; _saveGlobalWb() }
  }

  function resetGlobalBook() {
    globalWorldBook.value = []
    _saveGlobalWb()
  }

  // ---- 当前世界书 CRUD ----
  function addWorldEntries(entries: WorldBookEntry[]) {
    const ids = new Set(worldBook.value.map(e => e.id))
    for (const e of entries) { if (!ids.has(e.id)) worldBook.value.push(e) }
  }

  function removeWorldEntry(id: string) { worldBook.value = worldBook.value.filter(e => e.id !== id) }

  function toggleWorldEntry(id: string) {
    const e = worldBook.value.find(x => x.id === id)
    if (e) e.enabled = !e.enabled
  }

  function resetWorldBook() { worldBook.value = [] }

  // ---- 浏览模式（不污染活跃状态） ----
  function loadForBrowse(id: string): boolean {
    const data = storage.getWorld(id)
    if (!data?.world) return false
    browsingWorldId.value = id
    browsingWorldName.value = data.world.name || ''
    browsingBook.value = data.world.worldBook || []
    browsingBookEnabled.value = data.world.worldBookEnabled !== false
    return true
  }

  function clearBrowse() {
    browsingBook.value = []
    browsingWorldId.value = null
    browsingWorldName.value = ''
  }

  // ---- 浏览模式 CRUD（操作 browsingBook 并回写 storage） ----
  function addBrowsingEntries(entries: WorldBookEntry[]) {
    const ids = new Set(browsingBook.value.map(e => e.id))
    for (const e of entries) { if (!ids.has(e.id)) browsingBook.value.push(e) }
    _saveBrowsingBook()
  }

  function removeBrowsingEntry(id: string) {
    browsingBook.value = browsingBook.value.filter(e => e.id !== id)
    _saveBrowsingBook()
  }

  function toggleBrowsingEntry(id: string) {
    const e = browsingBook.value.find(x => x.id === id)
    if (e) { e.enabled = !e.enabled; _saveBrowsingBook() }
  }

  function resetBrowsingBook() {
    browsingBook.value = []
    _saveBrowsingBook()
  }

  function _saveBrowsingBook() {
    if (!browsingWorldId.value) return
    const data = storage.getWorld(browsingWorldId.value)
    if (!data) return
    data.world.worldBook = [...browsingBook.value]
    data.world.worldBookEnabled = browsingBookEnabled.value
    data.world.updatedAt = Date.now()
    storage.saveWorld(browsingWorldId.value, data)
  }

  // ---- 快照 / 恢复 ----
  function snapshotWorldBook() {
    return { entries: [...worldBook.value], enabled: worldBookEnabled.value }
  }

  function restoreWorldBook(data: { entries: WorldBookEntry[]; enabled: boolean }) {
    worldBook.value = data.entries || []
    worldBookEnabled.value = data.enabled !== false
  }

  return {
    globalWorldBook, globalWorldBookEnabled, worldBook, worldBookEnabled,
    browsingBook, browsingBookEnabled, browsingWorldId, browsingWorldName,
    globalEnabledEntries, worldEnabledEntries,
    initGlobalBook,
    addGlobalEntries, removeGlobalEntry, toggleGlobalEntry, resetGlobalBook,
    addWorldEntries, removeWorldEntry, toggleWorldEntry, resetWorldBook,
    loadForBrowse, clearBrowse,
    addBrowsingEntries, removeBrowsingEntry, toggleBrowsingEntry, resetBrowsingBook,
    snapshotWorldBook, restoreWorldBook,
  }
})
