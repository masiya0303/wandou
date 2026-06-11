// ============================================================
// wandou v1.0 — 豌豆星际漂流 · 状态管理
// 纯 localStorage 持久化 + 主题 + 导出
// ============================================================
import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { ApiConfig, GameMessage, CharacterInfo } from '../types/game'
import type { WorldBookEntry } from '../types/worldBook'
import type { World, WorldMeta } from '../types/world'
import type { NpcEntry } from '../types/npc'
import { chatStream } from '../utils/api'
import { scanAndCollect, extractRecentText, PRESET_WORLD_BOOK } from '../utils/worldBookEngine'
import { scanNpcs, importNpcJson } from '../utils/npcEngine'
import { storage } from '../utils/storage'

export type GamePhase = 'start' | 'worldList' | 'worldDetail' | 'playing'

type Theme = 'dark' | 'light'

const DEFAULT_API: ApiConfig = { baseUrl: 'https://api.openai.com', apiKey: '', model: 'gpt-4o-mini', temperature: 0.8, maxTokens: 4096 }
const DEFAULT_CHAR: CharacterInfo = { name: '', age: 25, gender: '', background: '' }
const DEFAULT_PROMPT = `你是《豌豆星际漂流》的 AI 叙事引擎。
根据下方「当前世界」的设定，以生动、沉浸的文字叙述玩家的冒险故事。
扮演出现的 NPC，描述场景、氛围、科技细节。
在关键时刻给玩家选择分支。
叙述用普通文字，NPC 对话用「」包裹，系统提示用【】包裹，重要选择用 >>> 开头。`

export const useGameStore = defineStore('game', () => {
  const storeReady = ref(false)
  const phase = ref<GamePhase>('start')
  const previousPhase = ref<GamePhase>('start')
  const apiConfig = ref<ApiConfig>({ ...DEFAULT_API })
  const systemPrompt = ref(DEFAULT_PROMPT)
  const theme = ref<Theme>((storage.getConfig('theme', 'dark')) as Theme)
  const searchQuery = ref('')

  // 世界
  const worldList = ref<WorldMeta[]>([])
  const currentWorldId = ref<string | null>(null)
  const worldName = ref(''); const worldDescription = ref('')
  const character = ref<CharacterInfo>({ ...DEFAULT_CHAR })
  const messages = ref<GameMessage[]>([])
  const npcs = ref<NpcEntry[]>([])
  const worldBook = ref<WorldBookEntry[]>([])
  const worldBookEnabled = ref(true)

  // 全局世界书
  const globalWorldBook = ref<WorldBookEntry[]>(storage.getGlobalWorldBook())
  const globalWorldBookEnabled = ref(true)

  // 运行时
  const isGenerating = ref(false); const error = ref('')

  // 计算
  const isApiReady = computed(() => !!apiConfig.value.apiKey && !!apiConfig.value.baseUrl)
  const isCharacterReady = computed(() => !!character.value.name.trim())
  const canStart = computed(() => isApiReady.value && isCharacterReady.value)
  const messageCount = computed(() => messages.value.length)
  const globalEnabledEntries = computed(() => globalWorldBook.value.filter(e => e.enabled).length)
  const worldEnabledEntries = computed(() => worldBook.value.filter(e => e.enabled).length)
  const enabledNpcs = computed(() => npcs.value.filter(n => n.enabled).length)

  // 主题应用
  watch(theme, t => {
    document.documentElement.setAttribute('data-theme', t)
    storage.saveConfig('theme', t)
  }, { immediate: true })

  // ---- 初始化 ----
  async function initStore() {
    globalWorldBook.value = storage.getGlobalWorldBook().length > 0 ? storage.getGlobalWorldBook() : structuredClone(PRESET_WORLD_BOOK)
    worldList.value = storage.getWorldList()
    storeReady.value = true
  }

  // ---- 世界书 ----
  function _saveGlobalWb() { storage.saveGlobalWorldBook(globalWorldBook.value) }
  function addGlobalWorldBookEntries(entries: WorldBookEntry[]) {
    const ids = new Set(globalWorldBook.value.map(e => e.id))
    for (const e of entries) { if (!ids.has(e.id)) globalWorldBook.value.push(e) }
    _saveGlobalWb()
  }
  function removeGlobalWorldBookEntry(id: string) { globalWorldBook.value = globalWorldBook.value.filter(e => e.id !== id); _saveGlobalWb() }
  function toggleGlobalWorldBookEntry(id: string) { const e = globalWorldBook.value.find(x => x.id === id); if (e) { e.enabled = !e.enabled; _saveGlobalWb() } }
  function resetGlobalWorldBook() { globalWorldBook.value = structuredClone(PRESET_WORLD_BOOK); _saveGlobalWb() }
  function addWorldBookEntries(entries: WorldBookEntry[]) { const ids = new Set(worldBook.value.map(e => e.id)); for (const e of entries) { if (!ids.has(e.id)) worldBook.value.push(e) } }
  function removeWorldBookEntry(id: string) { worldBook.value = worldBook.value.filter(e => e.id !== id) }
  function toggleWorldBookEntry(id: string) { const e = worldBook.value.find(x => x.id === id); if (e) e.enabled = !e.enabled }
  function resetWorldBook() { worldBook.value = [] }

  // ---- 世界 CRUD ----
  async function createWorld(name: string, description: string): Promise<string> {
    const id = 'world-' + Date.now(); currentWorldId.value = id
    worldName.value = name || '新世界'; worldDescription.value = description || ''
    character.value = { ...DEFAULT_CHAR }; npcs.value = []; messages.value = []; worldBook.value = []; error.value = ''
    const meta: WorldMeta = { id, name: worldName.value, description: worldDescription.value, characterName: '', messageCount: 0, createdAt: Date.now(), updatedAt: Date.now() }
    worldList.value.unshift(meta); storage.saveWorldList(worldList.value)
    await _saveWorld(); return id
  }

  async function _saveWorld() {
    if (!currentWorldId.value) return
    const w: World = { id: currentWorldId.value, name: worldName.value, description: worldDescription.value, createdAt: 0, updatedAt: Date.now(), character: { ...character.value }, npcs: [...npcs.value], messages: [...messages.value], worldBook: [...worldBook.value], worldBookEnabled: worldBookEnabled.value }
    storage.saveWorld(currentWorldId.value, { world: w, apiConfig: { ...apiConfig.value } })
    const idx = worldList.value.findIndex(x => x.id === w.id)
    const meta: WorldMeta = { id: w.id, name: w.name, description: w.description, characterName: w.character.name, messageCount: w.messages.length, createdAt: w.createdAt || Date.now(), updatedAt: w.updatedAt }
    if (idx >= 0) worldList.value[idx] = meta; else worldList.value.unshift(meta)
    storage.saveWorldList(worldList.value)
  }

  async function _loadWorld(id: string): Promise<boolean> {
    const data = storage.getWorld(id); if (!data?.world) return false
    const w = data.world
    currentWorldId.value = w.id; worldName.value = w.name; worldDescription.value = w.description
    character.value = w.character; npcs.value = w.npcs || []; messages.value = w.messages || []; worldBook.value = w.worldBook || []; worldBookEnabled.value = w.worldBookEnabled !== false
    if (data.apiConfig?.apiKey) apiConfig.value = data.apiConfig
    return true
  }

  async function openWorldDetailFromList(id: string): Promise<boolean> { previousPhase.value = phase.value; return _loadWorld(id) }
  function goToWorldDetail() { previousPhase.value = phase.value; phase.value = 'worldDetail' }

  async function enterWorld(id: string): Promise<boolean> { const ok = await _loadWorld(id); if (ok) { phase.value = 'playing'; previousPhase.value = 'worldList' } return ok }
  async function deleteWorld(id: string) { storage.deleteWorld(id); worldList.value = worldList.value.filter(w => w.id !== id); storage.saveWorldList(worldList.value); if (currentWorldId.value === id) { currentWorldId.value = null; _resetCurrent() } }
  function _resetCurrent() { worldName.value = ''; worldDescription.value = ''; character.value = { ...DEFAULT_CHAR }; npcs.value = []; messages.value = []; worldBook.value = []; error.value = ''; isGenerating.value = false }
  function updateWorldInfo(name: string, desc: string) { worldName.value = name; worldDescription.value = desc }

  // ---- NPC ----
  function addNpcEntries(entries: NpcEntry[]) { const ids = new Set(npcs.value.map(n => n.id)); for (const e of entries) { if (!ids.has(e.id)) npcs.value.push(e) } }
  function removeNpc(id: string) { npcs.value = npcs.value.filter(n => n.id !== id) }
  function toggleNpc(id: string) { const n = npcs.value.find(x => x.id === id); if (n) n.enabled = !n.enabled }
  function importNpcsFromJson(s: string) { return importNpcJson(s) }

  // ---- Prompt ----
  function buildFullSystemPrompt(): string {
    const parts: string[] = []
    if (worldDescription.value.trim()) parts.push(`## 当前世界：${worldName.value || '未知世界'}\n${worldDescription.value.trim()}`)
    const texts = extractRecentText(messages.value, 10)
    if (globalWorldBookEnabled.value && globalWorldBook.value.length > 0) { const ctx = scanAndCollect(globalWorldBook.value, texts, 1500); if (ctx) parts.push(ctx.replace('【世界书·背景参考】', '【全局世界书】')) }
    if (worldBookEnabled.value && worldBook.value.length > 0) { const ctx = scanAndCollect(worldBook.value, texts, 1500); if (ctx) parts.push(ctx.replace('【世界书·背景参考】', `【${worldName.value || '当前'}世界书】`)) }
    const npcCtx = scanNpcs(npcs.value, texts, 1500); if (npcCtx) parts.push(npcCtx)
    const context = parts.join('\n'); return context ? systemPrompt.value + '\n\n' + context : systemPrompt.value
  }

  // ---- 消息 ----
  function addMessage(msg: GameMessage) { messages.value.push(msg) }
  function clearMessages() { messages.value = [] }

  async function sendMessage(userInput: string) {
    if (isGenerating.value || !userInput.trim()) return
    error.value = ''
    addMessage({ id: `user-${Date.now()}`, role: 'user', content: userInput.trim(), timestamp: Date.now() })
    const aiMsg: GameMessage = { id: `assistant-${Date.now()}`, role: 'assistant', content: '', timestamp: Date.now() }
    addMessage(aiMsg); isGenerating.value = true
    try { aiMsg.content = await chatStream(apiConfig.value, buildFullSystemPrompt(), messages.value.slice(0, -1), (c) => { aiMsg.content += c }); syncSave(); _saveWorld() }
    catch (e: any) { error.value = e.message || '请求失败'; messages.value = messages.value.filter(m => m.id !== aiMsg.id) }
    finally { isGenerating.value = false }
  }

  async function regenerate() {
    if (isGenerating.value) return
    const last = messages.value[messages.value.length - 1]; if (last?.role === 'assistant') messages.value.pop()
    const u = messages.value[messages.value.length - 1]; if (u?.role === 'user') { const c = u.content; messages.value.pop(); await sendMessage(c) }
  }

  // ---- 持久化 ----
  function syncSave() { if (currentWorldId.value) storage.saveWorld(currentWorldId.value, { world: { id: currentWorldId.value, name: worldName.value, description: worldDescription.value, createdAt: 0, updatedAt: Date.now(), character: character.value, npcs: npcs.value, messages: messages.value, worldBook: worldBook.value, worldBookEnabled: worldBookEnabled.value }, apiConfig: apiConfig.value }) }
  async function autoSave() { await _saveWorld() }
  function hasSave() { return worldList.value.length > 0 }

  // ---- 开始 ----
  async function startPlaying() {
    if (!isApiReady.value || !character.value.name.trim()) return
    phase.value = 'playing'
    syncSave()
    addMessage({ id: `sys-${Date.now()}`, role: 'assistant', content: `【世界「${worldName.value}」加载完成】\n\n${worldDescription.value ? worldDescription.value.slice(0,200)+'...' : ''}\n\n舰长${character.value.name}，冒险开始了。`, timestamp: Date.now() })
    _saveWorld()
  }

  // ---- 导出 ----
  function exportWorld(id?: string): string {
    const targetId = id || currentWorldId.value
    if (!targetId) return ''
    const data = storage.getWorld(targetId)
    if (!data) return ''
    return JSON.stringify(data, null, 2)
  }

  function exportAllWorlds(): string {
    const all = worldList.value.map(m => ({ meta: m, data: storage.getWorld(m.id) })).filter(x => x.data)
    return JSON.stringify(all, null, 2)
  }

  // ---- 设置 ----
  function updateApiConfig(c: Partial<ApiConfig>) { if (c.apiKey !== undefined) c.apiKey = c.apiKey.trim(); if (c.baseUrl !== undefined) c.baseUrl = c.baseUrl.trim(); if (c.model !== undefined) c.model = c.model.trim(); Object.assign(apiConfig.value, c) }
  function updateCharacter(c: Partial<CharacterInfo>) { Object.assign(character.value, c) }
  function updateSystemPrompt(p: string) { systemPrompt.value = p }
  function toggleTheme() { theme.value = theme.value === 'dark' ? 'light' : 'dark' }
  async function loadWorldBookOnly(id: string): Promise<boolean> { const data = storage.getWorld(id); if (!data?.world) return false; worldBook.value = data.world.worldBook || []; worldBookEnabled.value = data.world.worldBookEnabled !== false; worldName.value = data.world.name || ''; currentWorldId.value = id; return true }

  return {
    storeReady, phase, previousPhase, apiConfig, systemPrompt, theme, searchQuery,
    worldList, currentWorldId, worldName, worldDescription, character, messages, npcs,
    globalWorldBook, globalWorldBookEnabled, worldBook, worldBookEnabled,
    isGenerating, error,
    isApiReady, isCharacterReady, canStart, messageCount, globalEnabledEntries, worldEnabledEntries, enabledNpcs,
    initStore, toggleTheme,
    createWorld, openWorldDetailFromList, goToWorldDetail, enterWorld, deleteWorld, updateWorldInfo,
    addNpcEntries, removeNpc, toggleNpc, importNpcsFromJson,
    addGlobalWorldBookEntries, removeGlobalWorldBookEntry, toggleGlobalWorldBookEntry, resetGlobalWorldBook,
    addWorldBookEntries, removeWorldBookEntry, toggleWorldBookEntry, resetWorldBook, loadWorldBookOnly,
    sendMessage, regenerate, clearMessages, syncSave, autoSave, hasSave,
    startPlaying, exportWorld, exportAllWorlds,
    updateApiConfig, updateCharacter, updateSystemPrompt,
  }
})
