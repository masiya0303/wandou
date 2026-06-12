// ============================================================
// wandou · 正则替换 Store（全局）
// ============================================================
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { RegexEntry } from '@/types/regex'
import { importRegexJson } from '@/utils/regexEngine'
import { storage } from '@/utils/storage'

const REGEX_KEY = 'wandou_regex'

export const useRegexStore = defineStore('regex', () => {
  const entries = ref<RegexEntry[]>(storage.getConfig(REGEX_KEY, []))
  const enabled = ref(true)  // 总开关

  const enabledCount = computed(() => entries.value.filter(e => !e.disabled).length)
  const totalCount = computed(() => entries.value.length)

  function _save() { storage.saveConfig(REGEX_KEY, entries.value) }

  // ---- CRUD ----
  function add(newEntries: RegexEntry[]) {
    const ids = new Set(entries.value.map(e => e.id))
    for (const e of newEntries) {
      if (!ids.has(e.id)) entries.value.push(e)
    }
    _save()
  }

  function remove(id: string) {
    entries.value = entries.value.filter(e => e.id !== id)
    _save()
  }

  function toggle(id: string) {
    const e = entries.value.find(x => x.id === id)
    if (e) { e.disabled = !e.disabled; _save() }
  }

  function reset() {
    entries.value = []
    _save()
  }

  // ---- 导入 ----
  function importFromJson(jsonStr: string) {
    const result = importRegexJson(jsonStr)
    if (result.success && result.entries.length > 0) {
      add(result.entries)
    }
    return result
  }

  // ---- 获取活跃规则 ----
  function activeEntries(): RegexEntry[] {
    if (!enabled.value) return []
    return entries.value.filter(e => !e.disabled)
  }

  return {
    entries, enabled, enabledCount, totalCount,
    add, remove, toggle, reset, importFromJson, activeEntries,
  }
})
