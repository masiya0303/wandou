// ============================================================
// wandou · 世界书 Store（全局 + 当前世界 + 浏览用）
//
// 系统协议已从世界书剥离，由 contextBuilder 动态生成。
// 全局世界书只保留用户自己添加的条目。
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

  function repairGlobalBook() {
    // 防御：如果不是数组，重置（存储损坏时可能发生）
    if (!Array.isArray(globalWorldBook.value)) {
      console.warn('[wandou] 全局世界书数据异常，已自动修复')
      globalWorldBook.value = []
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

  /** 手动保存全局世界书（编辑条目后调用） */
  function saveGlobalBook() { _saveGlobalWb() }
  /** 手动保存浏览中的世界书 */
  function saveBrowsingBook() { _saveBrowsingBook() }

  return {
    globalWorldBook, globalWorldBookEnabled, worldBook, worldBookEnabled,
    browsingBook, browsingBookEnabled, browsingWorldId, browsingWorldName,
    globalEnabledEntries, worldEnabledEntries,
    repairGlobalBook,
    addGlobalEntries, removeGlobalEntry, toggleGlobalEntry, resetGlobalBook,
    addWorldEntries, removeWorldEntry, toggleWorldEntry, resetWorldBook,
    loadForBrowse, clearBrowse,
    addBrowsingEntries, removeBrowsingEntry, toggleBrowsingEntry, resetBrowsingBook,
    snapshotWorldBook, restoreWorldBook,
    saveGlobalBook, saveBrowsingBook,
  }
})
