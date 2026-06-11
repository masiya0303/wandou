// ============================================================
// wandou v0.7 — 豌豆星际漂流 · 多世界 + NPC 系统
// 存储：IndexedDB + localStorage 双保险
// ============================================================

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ApiConfig, GameMessage, CharacterInfo } from '../types/game'
import type { WorldBookEntry } from '../types/worldBook'
import type { World, WorldMeta } from '../types/world'
import type { NpcEntry } from '../types/npc'
import { chatStream } from '../utils/api'
import { scanAndCollect, extractRecentText, PRESET_WORLD_BOOK } from '../utils/worldBookEngine'
import { scanNpcs, importNpcJson } from '../utils/npcEngine'
import { db } from '../utils/db'

const LOCAL_KEY_PREFIX = 'wandou_world_'
const LOCAL_LIST_KEY = 'wandou_world_list'

// ---------- 默认值 ----------

const DEFAULT_API: ApiConfig = {
  baseUrl: 'https://api.openai.com',
  apiKey: '',
  model: 'gpt-4o-mini',
  temperature: 0.8,
  maxTokens: 4096,
}

const DEFAULT_CHARACTER: CharacterInfo = {
  name: '', age: 25, gender: '', background: '',
}

const DEFAULT_SYSTEM_PROMPT = `你是《豌豆星际漂流》的 AI 叙事引擎。
根据下方「当前世界」的设定，以生动、沉浸的文字叙述玩家的冒险故事。
扮演出现的 NPC，描述场景、氛围、科技细节。
在关键时刻给玩家选择分支。
叙述用普通文字，NPC 对话用「」包裹，系统提示用【】包裹，重要选择用 >>> 开头。`

// ---------- Phase 类型 ----------
export type GamePhase = 'start' | 'worldList' | 'createWorld' | 'setup' | 'playing'

export const useGameStore = defineStore('game', () => {
  // ---- 全局状态 ----
  const storeReady = ref(false)
  const phase = ref<GamePhase>('start')
  const apiConfig = ref<ApiConfig>({ ...DEFAULT_API })
  const systemPrompt = ref(DEFAULT_SYSTEM_PROMPT)

  // ---- 世界列表 ----
  const worldList = ref<WorldMeta[]>([])
  const currentWorldId = ref<string | null>(null)

  // ---- 全局世界书（对所有世界生效）----
  const globalWorldBook = ref<WorldBookEntry[]>(structuredClone(PRESET_WORLD_BOOK))
  const globalWorldBookEnabled = ref(true)

  // ---- 当前世界状态 (lazy load) ----
  const worldName = ref('')
  const worldDescription = ref('')
  const character = ref<CharacterInfo>({ ...DEFAULT_CHARACTER })
  const messages = ref<GameMessage[]>([])
  const npcs = ref<NpcEntry[]>([])
  const worldBook = ref<WorldBookEntry[]>([]) // 当前世界的世界书（空数组，不再给默认值）
  const worldBookEnabled = ref(true)

  // ---- 运行时 ----
  const isGenerating = ref(false)
  const error = ref('')

  // ---- 计算 ----
  const isApiReady = computed(() => !!apiConfig.value.apiKey && !!apiConfig.value.baseUrl)
  const isCharacterReady = computed(() => !!character.value.name.trim())
  const canStart = computed(() => isApiReady.value && isCharacterReady.value)
  const messageCount = computed(() => messages.value.length)
  const globalEnabledEntries = computed(() => globalWorldBook.value.filter(e => e.enabled).length)
  const worldEnabledEntries = computed(() => worldBook.value.filter(e => e.enabled).length)
  const enabledNpcs = computed(() => npcs.value.filter(n => n.enabled).length)

  // ============ 初始化 ============

  async function initStore() {
    await _migrateOldSave()
    await _loadGlobalWorldBook()
    worldList.value = await _loadWorldList()
    storeReady.value = true
    console.log(`[Store] 已加载 ${worldList.value.length} 个世界, 全局世界书 ${globalWorldBook.value.length} 条`)
  }

  async function _loadGlobalWorldBook() {
    try {
      const list = await db.getGlobal('globalWorldBook')
      if (list && Array.isArray(list) && list.length > 0) {
        globalWorldBook.value = list
      }
    } catch {}
    // legacy: 从 localStorage 读取
    try {
      const raw = localStorage.getItem('wandou_global_worldbook')
      if (raw) {
        const list = JSON.parse(raw)
        if (Array.isArray(list) && list.length > 0) {
          globalWorldBook.value = list
        }
      }
    } catch {}
  }

  async function _saveGlobalWorldBook() {
    try { await db.putGlobal('globalWorldBook', globalWorldBook.value) } catch {}
    try { localStorage.setItem('wandou_global_worldbook', JSON.stringify(globalWorldBook.value)) } catch {}
  }

  async function _migrateOldSave() {
    try {
      // 尝试旧 saves store
      const oldSave = await db.getWorld('current')
      if (oldSave && oldSave.world && !oldSave.version) return
    } catch { /* no old save */ }
    try {
      const old = localStorage.getItem('wandou_save_v0.6')
      if (!old) return
      const save = JSON.parse(old)
      if (!save.messages?.length) return
      // 迁移为世界
      const world: World = {
        id: 'migrated-' + Date.now(),
        name: save.character?.name ? `${save.character.name}的冒险` : '旧存档',
        description: '从旧版本迁移的存档',
        createdAt: save.timestamp || Date.now(),
        updatedAt: Date.now(),
        character: save.character || { ...DEFAULT_CHARACTER },
        npcs: [],
        messages: save.messages || [],
        worldBook: save.worldBook || [],
        worldBookEnabled: save.worldBookEnabled !== false,
      }
      await db.putWorld({ id: world.id, world, apiConfig: save.apiConfig || DEFAULT_API })
      localStorage.removeItem('wandou_save_v0.6')
      console.log('[Store] 旧存档已迁移为世界:', world.name)
    } catch { /* ignore */ }
  }

  // ============ 世界列表持久化 ============

  async function _loadWorldList(): Promise<WorldMeta[]> {
    try {
      const list = await db.getGlobal('worldList')
      if (list) return list
    } catch {}
    try {
      const raw = localStorage.getItem(LOCAL_LIST_KEY)
      if (raw) return JSON.parse(raw)
    } catch {}
    return []
  }

  async function _saveWorldList() {
    try { await db.putGlobal('worldList', worldList.value) } catch {}
    try { localStorage.setItem(LOCAL_LIST_KEY, JSON.stringify(worldList.value)) } catch {}
  }

  // ============ 世界持久化 ============

  async function _saveWorld(): Promise<boolean> {
    if (!currentWorldId.value) return false
    const world: World = {
      id: currentWorldId.value,
      name: worldName.value,
      description: worldDescription.value,
      createdAt: 0, // will be preserved from existing
      updatedAt: Date.now(),
      character: { ...character.value },
      npcs: [...npcs.value],
      messages: [...messages.value],
      worldBook: [...worldBook.value],
      worldBookEnabled: worldBookEnabled.value,
    }
    try {
      // 保留 createdAt
      const existing = await db.getWorld(currentWorldId.value)
      if (existing?.world?.createdAt) world.createdAt = existing.world.createdAt
      await db.putWorld({ id: world.id, world, apiConfig: { ...apiConfig.value } })
      // 更新世界列表元数据
      const idx = worldList.value.findIndex(w => w.id === world.id)
      const meta: WorldMeta = {
        id: world.id, name: world.name, description: world.description,
        characterName: world.character.name,
        messageCount: world.messages.length,
        createdAt: world.createdAt || Date.now(),
        updatedAt: world.updatedAt,
      }
      if (idx >= 0) worldList.value[idx] = meta
      else worldList.value.unshift(meta)
      await _saveWorldList()

      // localStorage fallback
      try {
        localStorage.setItem(LOCAL_KEY_PREFIX + world.id, JSON.stringify({ world, apiConfig: apiConfig.value }))
      } catch {}
      return true
    } catch (e) {
      console.warn('[Store] 世界保存失败:', e)
      try {
        localStorage.setItem(LOCAL_KEY_PREFIX + world.id, JSON.stringify({ world, apiConfig: apiConfig.value }))
        const idx = worldList.value.findIndex(w => w.id === world.id)
        const meta: WorldMeta = {
          id: world.id, name: world.name, description: world.description,
          characterName: world.character.name,
          messageCount: world.messages.length,
          createdAt: world.createdAt || Date.now(),
          updatedAt: world.updatedAt,
        }
        if (idx >= 0) worldList.value[idx] = meta
        else worldList.value.unshift(meta)
        await _saveWorldList()
        return true
      } catch { return false }
    }
  }

  async function _loadWorld(id: string): Promise<boolean> {
    try {
      let data = await db.getWorld(id)
      if (!data) {
        const raw = localStorage.getItem(LOCAL_KEY_PREFIX + id)
        if (raw) data = JSON.parse(raw)
      }
      if (!data?.world) return false
      const w = data.world as World
      currentWorldId.value = w.id
      worldName.value = w.name
      worldDescription.value = w.description
      character.value = w.character
      npcs.value = w.npcs || []
      messages.value = w.messages || []
      worldBook.value = w.worldBook || []
      worldBookEnabled.value = w.worldBookEnabled !== false
      if (data.apiConfig?.apiKey) apiConfig.value = data.apiConfig
      return true
    } catch { return false }
  }

  // ============ 世界 CRUD ============

  async function createWorld(name: string, description: string): Promise<string> {
    const id = 'world-' + Date.now()
    currentWorldId.value = id
    worldName.value = name
    worldDescription.value = description
    character.value = { ...DEFAULT_CHARACTER }
    npcs.value = []
    messages.value = []
    worldBook.value = []
    worldBookEnabled.value = true
    error.value = ''

    // 先加到列表
    const meta: WorldMeta = {
      id, name, description,
      characterName: '',
      messageCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    worldList.value.unshift(meta)
    await _saveWorldList()
    await _saveWorld()
    return id
  }

  async function enterWorld(id: string): Promise<boolean> {
    const ok = await _loadWorld(id)
    if (ok) {
      phase.value = 'playing'
      console.log(`[Store] 进入世界: ${worldName.value}`)
    }
    return ok
  }

  async function deleteWorld(id: string) {
    try { await db.deleteWorld(id) } catch {}
    try { localStorage.removeItem(LOCAL_KEY_PREFIX + id) } catch {}
    worldList.value = worldList.value.filter(w => w.id !== id)
    await _saveWorldList()
    if (currentWorldId.value === id) {
      currentWorldId.value = null
      _resetCurrent()
    }
  }

  function _resetCurrent() {
    worldName.value = ''
    worldDescription.value = ''
    character.value = { ...DEFAULT_CHARACTER }
    npcs.value = []
    messages.value = []
    worldBook.value = []
    error.value = ''
    isGenerating.value = false
  }

  // ============ NPC 管理 ============

  function addNpcEntries(entries: NpcEntry[]) {
    const existingIds = new Set(npcs.value.map(n => n.id))
    for (const e of entries) {
      if (!existingIds.has(e.id)) npcs.value.push(e)
    }
  }

  function removeNpc(id: string) {
    npcs.value = npcs.value.filter(n => n.id !== id)
  }

  function toggleNpc(id: string) {
    const n = npcs.value.find(x => x.id === id)
    if (n) n.enabled = !n.enabled
  }

  function importNpcsFromJson(jsonStr: string) {
    return importNpcJson(jsonStr)
  }

  // ============ 全局世界书管理 ============

  function addGlobalWorldBookEntries(entries: WorldBookEntry[]) {
    const ids = new Set(globalWorldBook.value.map(e => e.id))
    for (const e of entries) { if (!ids.has(e.id)) globalWorldBook.value.push(e) }
    _saveGlobalWorldBook()
  }
  function removeGlobalWorldBookEntry(id: string) { globalWorldBook.value = globalWorldBook.value.filter(e => e.id !== id); _saveGlobalWorldBook() }
  function toggleGlobalWorldBookEntry(id: string) {
    const e = globalWorldBook.value.find(x => x.id === id)
    if (e) { e.enabled = !e.enabled; _saveGlobalWorldBook() }
  }
  function resetGlobalWorldBook() { globalWorldBook.value = structuredClone(PRESET_WORLD_BOOK); _saveGlobalWorldBook() }

  // ============ 当前世界书管理 ============

  function addWorldBookEntries(entries: WorldBookEntry[]) {
    const ids = new Set(worldBook.value.map(e => e.id))
    for (const e of entries) { if (!ids.has(e.id)) worldBook.value.push(e) }
  }
  function removeWorldBookEntry(id: string) { worldBook.value = worldBook.value.filter(e => e.id !== id) }
  function toggleWorldBookEntry(id: string) {
    const entry = worldBook.value.find(e => e.id === id)
    if (entry) entry.enabled = !entry.enabled
  }
  function resetWorldBook() { worldBook.value = [] }

  // ============ Prompt 注入（三层）============

  function buildFullSystemPrompt(): string {
    const parts: string[] = []

    // 第一层：世界描述
    if (worldDescription.value.trim()) {
      parts.push(`## 当前世界：${worldName.value || '未知世界'}\n${worldDescription.value.trim()}`)
    }

    // 第二层：全局世界书 + 当前世界书
    const texts = extractRecentText(messages.value, 10)
    if (globalWorldBookEnabled.value && globalWorldBook.value.length > 0) {
      const gCtx = scanAndCollect(globalWorldBook.value, texts, 1500)
      if (gCtx) parts.push(gCtx.replace('【世界书·背景参考】', '【全局世界书】'))
    }
    if (worldBookEnabled.value && worldBook.value.length > 0) {
      const wCtx = scanAndCollect(worldBook.value, texts, 1500)
      if (wCtx) parts.push(wCtx.replace('【世界书·背景参考】', `【${worldName.value || '当前'}世界书】`))
    }

    // 第三层：场景 NPC
    const npcCtx = scanNpcs(npcs.value, texts, 1500)
    if (npcCtx) parts.push(npcCtx)

    const context = parts.join('\n')
    return context ? systemPrompt.value + '\n\n' + context : systemPrompt.value
  }

  // ============ 消息操作 ============
  function addMessage(msg: GameMessage) { messages.value.push(msg) }
  function clearMessages() { messages.value = [] }

  // ============ 发送消息 ============
  async function sendMessage(userInput: string) {
    if (isGenerating.value || !userInput.trim()) return
    error.value = ''

    const userMsg: GameMessage = { id: `user-${Date.now()}`, role: 'user', content: userInput.trim(), timestamp: Date.now() }
    addMessage(userMsg)

    const aiMsg: GameMessage = { id: `assistant-${Date.now()}`, role: 'assistant', content: '', timestamp: Date.now() }
    addMessage(aiMsg)

    isGenerating.value = true
    try {
      const fullPrompt = buildFullSystemPrompt()
      const fullContent = await chatStream(apiConfig.value, fullPrompt, messages.value.slice(0, -1), (chunk) => { aiMsg.content += chunk })
      aiMsg.content = fullContent
      autoSave()
    } catch (e: any) {
      error.value = e.message || '请求失败'
      messages.value = messages.value.filter(m => m.id !== aiMsg.id)
    } finally {
      isGenerating.value = false
    }
  }

  async function regenerate() {
    if (isGenerating.value) return
    const lastMsg = messages.value[messages.value.length - 1]
    if (lastMsg?.role === 'assistant') messages.value.pop()
    const lastUser = messages.value[messages.value.length - 1]
    if (lastUser?.role === 'user') {
      const content = lastUser.content
      messages.value.pop()
      await sendMessage(content)
    }
  }

  // ============ 存档 ============
  async function autoSave() {
    const ok = await _saveWorld()
    if (ok) console.log(`[AutoSave] ✅ "${worldName.value}" ${messages.value.length} 条消息`)
  }

  function syncSave() {
    if (!currentWorldId.value) return
    try {
      const data = {
        world: {
          id: currentWorldId.value, name: worldName.value, description: worldDescription.value,
          createdAt: 0, updatedAt: Date.now(),
          character: character.value, npcs: npcs.value, messages: messages.value,
          worldBook: worldBook.value, worldBookEnabled: worldBookEnabled.value,
        },
        apiConfig: apiConfig.value,
      }
      localStorage.setItem(LOCAL_KEY_PREFIX + currentWorldId.value, JSON.stringify(data))
    } catch {}
  }

  // ============ 开始游戏 ============
  function startPlaying() {
    if (!isApiReady.value || !character.value.name.trim()) return
    phase.value = 'playing'
    const welcome: GameMessage = {
      id: `system-${Date.now()}`, role: 'assistant',
      content: `【世界「${worldName.value}」加载完成】

${worldDescription.value ? worldDescription.value.slice(0, 200) + '...' : ''}

舰长${character.value.name || '阁下'}，冒险开始了。请下达指令。`,
      timestamp: Date.now(),
    }
    addMessage(welcome)
    autoSave()
  }

  // ============ 设置 ============
  function updateApiConfig(c: Partial<ApiConfig>) {
    if (c.apiKey !== undefined) c.apiKey = c.apiKey.trim()
    if (c.baseUrl !== undefined) c.baseUrl = c.baseUrl.trim()
    if (c.model !== undefined) c.model = c.model.trim()
    Object.assign(apiConfig.value, c)
  }
  function updateCharacter(c: Partial<CharacterInfo>) { Object.assign(character.value, c) }
  function updateSystemPrompt(p: string) { systemPrompt.value = p }

  // ----导出----
  return {
    storeReady, phase, apiConfig, systemPrompt,
    worldList, currentWorldId,
    worldName, worldDescription, character, messages, npcs,
    globalWorldBook, globalWorldBookEnabled, worldBook, worldBookEnabled,
    isGenerating, error,

    isApiReady, isCharacterReady, canStart, messageCount,
    globalEnabledEntries, worldEnabledEntries, enabledNpcs,

    initStore,
    createWorld, enterWorld, deleteWorld,
    addNpcEntries, removeNpc, toggleNpc, importNpcsFromJson,
    addGlobalWorldBookEntries, removeGlobalWorldBookEntry, toggleGlobalWorldBookEntry, resetGlobalWorldBook,
    addWorldBookEntries, removeWorldBookEntry, toggleWorldBookEntry, resetWorldBook,
    sendMessage, regenerate, clearMessages, autoSave, syncSave,
    startPlaying,
    updateApiConfig, updateCharacter, updateSystemPrompt,
  }
})
