// ============================================================
// wandou · NPC 角色书 Store
// ============================================================
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { NpcEntry } from '@/types/npc'
import { importNpcJson } from '@/utils/npcEngine'

export const useNpcStore = defineStore('npc', () => {
  const npcs = ref<NpcEntry[]>([])

  const enabledNpcs = computed(() => npcs.value.filter(n => n.enabled).length)

  function addEntries(entries: NpcEntry[]) {
    const ids = new Set(npcs.value.map(n => n.id))
    for (const e of entries) { if (!ids.has(e.id)) npcs.value.push(e) }
  }

  function remove(id: string) { npcs.value = npcs.value.filter(n => n.id !== id) }

  function toggle(id: string) {
    const n = npcs.value.find(x => x.id === id)
    if (n) n.enabled = !n.enabled
  }

  function importFromJson(s: string) {
    return importNpcJson(s)
  }

  // ---- 快照 / 恢复 ----
  function snapshot(): NpcEntry[] { return [...npcs.value] }
  function restore(data: NpcEntry[]) { npcs.value = data || [] }
  function resetNpcs() { npcs.value = [] }

  return { npcs, enabledNpcs, addEntries, remove, toggle, importFromJson, snapshot, restore, resetNpcs }
})
