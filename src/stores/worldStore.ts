// ============================================================
// wandou · 世界 CRUD Store
// ============================================================
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ApiConfig } from '@/types/game'
import type { World, WorldMeta } from '@/types/world'
import { storage } from '@/utils/storage'
import { bus } from '@/utils/events'
import { usePlayerStore } from './playerStore'
import { useNpcStore } from './npcStore'
import { useWorldBookStore } from './worldBookStore'
import { useChatStore } from './chatStore'
import { useStateStore } from './stateStore'

export const useWorldStore = defineStore('world', () => {
  const worldList = ref<WorldMeta[]>([])
  const currentWorldId = ref<string | null>(null)
  const worldName = ref('')
  const worldDescription = ref('')

  // ---- 初始化 ----
  function initWorldList() {
    worldList.value = storage.getWorldList()
  }

  // ---- CRUD ----
  function createWorld(name: string, description: string): string {
    const id = 'world-' + Date.now()
    currentWorldId.value = id
    worldName.value = name || '新世界'
    worldDescription.value = description || ''

    // 重置所有游戏 store（防止旧世界数据污染新世界）
    usePlayerStore().resetPlayer()
    useNpcStore().resetNpcs()
    useWorldBookStore().resetWorldBook()
    useChatStore().clearMessages()
    useStateStore().resetState()

    const meta: WorldMeta = {
      id, name: worldName.value, description: worldDescription.value,
      characterName: '', messageCount: 0,
      createdAt: Date.now(), updatedAt: Date.now(),
    }
    worldList.value.unshift(meta)
    storage.saveWorldList(worldList.value)
    bus.emit('world:created', { id, name: worldName.value })
    return id
  }

  function updateWorldInfo(name: string, desc: string) {
    worldName.value = name
    worldDescription.value = desc
  }

  function deleteWorld(id: string) {
    storage.deleteWorld(id)
    worldList.value = worldList.value.filter(w => w.id !== id)
    storage.saveWorldList(worldList.value)
    if (currentWorldId.value === id) {
      currentWorldId.value = null
      worldName.value = ''
      worldDescription.value = ''
    }
    bus.emit('world:deleted', id)
  }

  // 更新 worldList 中的 meta（由 gameStore 在 syncSave 后调用）
  function updateMeta(id: string, characterName: string, messageCount: number) {
    const idx = worldList.value.findIndex(x => x.id === id)
    if (idx >= 0) {
      worldList.value[idx] = {
        ...worldList.value[idx],
        characterName,
        messageCount,
        updatedAt: Date.now(),
      }
    }
    storage.saveWorldList(worldList.value)
  }

  // ---- 持久化（委托 gameStore 组装完整对象） ----
  function saveWorldMeta() {
    storage.saveWorldList(worldList.value)
  }

  function getWorldSave(id: string): { world: World; apiConfig: ApiConfig } | null {
    return storage.getWorld(id)
  }

  // 重置当前世界指针
  function resetCurrent() {
    currentWorldId.value = null
    worldName.value = ''
    worldDescription.value = ''
  }

  return {
    worldList, currentWorldId, worldName, worldDescription,
    initWorldList, createWorld, updateWorldInfo, deleteWorld,
    updateMeta, saveWorldMeta, getWorldSave, resetCurrent,
  }
})
