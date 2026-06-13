// ============================================================
// wandou · 游戏编排 Store（初始化、持久化、导出）
// ============================================================
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { World } from '@/types/world'
import { storage } from '@/utils/storage'
import { bus } from '@/utils/events'
import { useThemeStore } from './themeStore'
import { useApiStore } from './apiStore'
import { useWorldStore } from './worldStore'
import { usePlayerStore } from './playerStore'
import { useNpcStore } from './npcStore'
import { useWorldBookStore } from './worldBookStore'
import { useChatStore } from './chatStore'
import { useStateStore } from './stateStore'

export const useGameStore = defineStore('game', () => {
  const storeReady = ref(false)

  // ---- 便捷 computed ----
  const canStart = computed(() => {
    const api = useApiStore()
    const player = usePlayerStore()
    return api.isApiReady && player.isCharacterReady
  })

  // ---- 初始化 ----
  function initStore() {
    const theme = useThemeStore()
    const wbs = useWorldBookStore()
    const ws = useWorldStore()

    wbs.repairGlobalBook()
    ws.initWorldList()

    // 默认粉色主题已在 style.css 中，这里只恢复用户导入的自定义主题
    theme.loadCustomTheme()

    storeReady.value = true
  }

  // ---- 进入世界 ----
  async function enterWorld(id: string): Promise<boolean> {
    const ws = useWorldStore()
    const ps = usePlayerStore()
    const ns = useNpcStore()
    const wbs = useWorldBookStore()
    const cs = useChatStore()
    const ss = useStateStore()

    const data = storage.getWorld(id)
    if (!data?.world) return false

    const w = data.world
    ws.currentWorldId = w.id
    ws.worldName = w.name
    ws.worldDescription = w.description
    ws.currentWorldTraits = w.worldTraits || []
    ps.restore({ character: w.character, inventory: w.inventory || [], quests: w.quests || [] })
    ns.restore(w.npcs || [])
    cs.restore(w.messages || [])
    wbs.restoreWorldBook({ entries: w.worldBook || [], enabled: w.worldBookEnabled !== false })
    if (w.stateData) ss.restore(w.stateData)

    // 恢复该世界关联的 API 配置
    if (data.apiConfig?.apiKey) {
      const api = useApiStore()
      api.updateApiConfig(data.apiConfig)
    }

    bus.emit('world:loaded', w)
    return true
  }

  // ---- 持久化 ----
  function syncSave() {
    const ws = useWorldStore()
    if (!ws.currentWorldId) return

    const api = useApiStore()
    const ps = usePlayerStore()
    const ns = useNpcStore()
    const wbs = useWorldBookStore()
    const cs = useChatStore()
    const ss = useStateStore()

    const world: World = {
      id: ws.currentWorldId,
      name: ws.worldName,
      description: ws.worldDescription,
      createdAt: 0,
      updatedAt: Date.now(),
      character: ps.character,
      npcs: ns.npcs,
      inventory: ps.inventory,
      quests: ps.quests,
      messages: cs.messages,
      worldBook: wbs.worldBook,
      worldBookEnabled: wbs.worldBookEnabled,
      worldTraits: ws.currentWorldTraits,
      stateData: ss.snapshot(),
    }

    storage.saveWorld(ws.currentWorldId, { world, apiConfig: api.apiConfig })

    // 更新列表 meta
    ws.updateMeta(ws.currentWorldId, ps.character.name, cs.messages.length)
  }

  async function autoSave() { syncSave() }

  function hasSave() {
    const ws = useWorldStore()
    return ws.worldList.length > 0
  }

  // ---- 重置世界数据（保留世界设定，清空游戏进度） ----
  function resetWorldData() {
    const ps = usePlayerStore()
    const ns = useNpcStore()
    const cs = useChatStore()
    const ss = useStateStore()

    // 清空但不删角色名（保留角色身份）
    // 注意: Pinia store 从外部访问时 ref 自动解包，不能用 .value
    ps.inventory.splice(0, ps.inventory.length)
    ps.quests.splice(0, ps.quests.length)
    const char = ps.character
    char.gold = 100
    char.attributes = { HP: 100, MP: 50, ATK: 10, DEF: 5 }
    ns.resetNpcs()
    cs.clearMessages()
    ss.resetState()
    syncSave()
  }

  // ---- 启程 ----
  async function startPlaying() {
    const api = useApiStore()
    const ps = usePlayerStore()
    const ws = useWorldStore()
    const cs = useChatStore()

    if (!api.isApiReady || !ps.character.name.trim()) return

    syncSave()

    cs.addMessage({
      id: `sys-${Date.now()}`, role: 'assistant',
      content: `【世界「${ws.worldName}」加载完成】\n\n${ws.worldDescription ? ws.worldDescription.slice(0, 200) + '...' : ''}\n\n玩家${ps.character.name}，冒险开始了。`,
      timestamp: Date.now(),
    })

    syncSave()
  }

  // ---- 导出 ----
  function exportWorld(id?: string): string {
    const ws = useWorldStore()
    const targetId = id || ws.currentWorldId
    if (!targetId) return ''
    const data = storage.getWorld(targetId)
    if (!data) return ''
    return JSON.stringify(data, null, 2)
  }

  function exportAllWorlds(): string {
    const ws = useWorldStore()
    const all = ws.worldList.map(m => ({ meta: m, data: storage.getWorld(m.id) })).filter(x => x.data)
    return JSON.stringify(all, null, 2)
  }

  return {
    storeReady, canStart,
    initStore, enterWorld, startPlaying,
    syncSave, autoSave, hasSave, resetWorldData,
    exportWorld, exportAllWorlds,
  }
})
