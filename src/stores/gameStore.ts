// ============================================================
// wandou v0.2 — 豌豆星际漂流 · 游戏状态管理
// ============================================================

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ApiConfig, GameMessage, CharacterInfo, GameSave, GamePhase, SettingsTab } from '../types/game'
import type { WorldBookEntry, ImportResult } from '../types/worldBook'
import { chatStream } from '../utils/api'
import { scanAndCollect, extractRecentText, importWorldBook, PRESET_WORLD_BOOK } from '../utils/worldBookEngine'

const SAVE_KEY = 'wandou_save_v0.2'

// ---------- 默认值 ----------

const DEFAULT_API: ApiConfig = {
  baseUrl: 'https://api.openai.com',
  apiKey: '',
  model: 'gpt-4o-mini',
  temperature: 0.8,
  maxTokens: 4096,
}

const DEFAULT_CHARACTER: CharacterInfo = {
  name: '',
  age: 25,
  gender: '',
  background: '',
}

const DEFAULT_SYSTEM_PROMPT = `你是《豌豆星际漂流》的 AI 叙事引擎。

## 世界观
公元 2847 年，人类已遍布银河系。你是一艘星际飞船「豌豆号」上的舰载 AI「豆豆」。
玩家是飞船的船长，正在广袤的宇宙中冒险。

## 你的职责
- 以生动、沉浸的文字叙述玩家在星际间的冒险故事
- 扮演 NPC（船员、外星人、AI 等）与玩家互动
- 描述场景、氛围、科技细节
- 在关键时刻给玩家选择分支

## 风格要求
- 科幻风格，适度使用硬科幻术语
- 紧凑有力的叙述，每次回复控制在 2-4 段
- 遇到战斗/危机时采用紧张刺激的描写
- 保持故事连贯性，记住之前的剧情发展
- 偶尔加入幽默元素，缓解紧张气氛

## 格式
- 叙述用普通文字
- NPC 对话用「」包裹
- 系统提示用【】包裹
- 重要选择用 >>> 开头`

export const useGameStore = defineStore('game', () => {
  // ---------- 状态 ----------
  const phase = ref<GamePhase>('start')
  const apiConfig = ref<ApiConfig>({ ...DEFAULT_API })
  const character = ref<CharacterInfo>({ ...DEFAULT_CHARACTER })
  const systemPrompt = ref(DEFAULT_SYSTEM_PROMPT)
  const messages = ref<GameMessage[]>([])
  const isGenerating = ref(false)
  const settingsTab = ref<SettingsTab>('api')
  const error = ref('')

  // --- v0.2: 世界书 ---
  const worldBook = ref<WorldBookEntry[]>(structuredClone(PRESET_WORLD_BOOK))
  const worldBookEnabled = ref(true)

  // ---------- 计算属性 ----------
  const isApiReady = computed(() => !!apiConfig.value.apiKey && !!apiConfig.value.baseUrl)
  const isCharacterReady = computed(() => !!character.value.name.trim())
  const canStart = computed(() => isApiReady.value && isCharacterReady.value)
  const messageCount = computed(() => messages.value.length)
  const enabledEntries = computed(() => worldBook.value.filter(e => e.enabled).length)

  // ---------- 世界书 Prompt 注入 ----------
  function buildWorldBookContext(): string {
    if (!worldBookEnabled.value) return ''
    const texts = extractRecentText(messages.value, 10)
    return scanAndCollect(worldBook.value, texts, 2000)
  }

  // ---------- 世界书管理 ----------
  function importWorldBookFromJson(jsonStr: string): ImportResult & { entries: WorldBookEntry[] } {
    return importWorldBook(jsonStr)
  }

  function addWorldBookEntries(entries: WorldBookEntry[]) {
    const existingIds = new Set(worldBook.value.map(e => e.id))
    for (const entry of entries) {
      if (!existingIds.has(entry.id)) {
        worldBook.value.push(entry)
      }
    }
  }

  function removeWorldBookEntry(id: string) {
    worldBook.value = worldBook.value.filter(e => e.id !== id)
  }

  function toggleWorldBookEntry(id: string) {
    const entry = worldBook.value.find(e => e.id === id)
    if (entry) entry.enabled = !entry.enabled
  }

  function resetWorldBook() {
    worldBook.value = structuredClone(PRESET_WORLD_BOOK)
  }

  // ---------- 消息操作 ----------
  function addMessage(msg: GameMessage) {
    messages.value.push(msg)
  }

  function clearMessages() {
    messages.value = []
  }

  // ---------- 发送消息（流式）----------
  async function sendMessage(userInput: string) {
    if (isGenerating.value || !userInput.trim()) return

    error.value = ''

    // 添加用户消息
    const userMsg: GameMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: userInput.trim(),
      timestamp: Date.now(),
    }
    addMessage(userMsg)

    // 创建 AI 回复占位
    const aiMsg: GameMessage = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    }
    addMessage(aiMsg)

    isGenerating.value = true

    try {
      // v0.2: 注入世界书上下文
      const wbContext = buildWorldBookContext()
      const effectiveSystemPrompt = wbContext
        ? systemPrompt.value + wbContext
        : systemPrompt.value

      const fullContent = await chatStream(
        apiConfig.value,
        effectiveSystemPrompt,
        messages.value.slice(0, -1), // 不包含空的 AI 占位
        (chunk) => {
          aiMsg.content += chunk
        },
      )
      aiMsg.content = fullContent
    } catch (e: any) {
      error.value = e.message || '请求失败，请检查 API 配置'
      messages.value = messages.value.filter(m => m.id !== aiMsg.id)
    } finally {
      isGenerating.value = false
    }
  }

  // ---------- 重新生成最后一条 AI 回复 ----------
  async function regenerate() {
    if (isGenerating.value) return

    const lastMsg = messages.value[messages.value.length - 1]
    if (lastMsg?.role === 'assistant') {
      messages.value.pop()
    }

    const lastUserMsg = messages.value[messages.value.length - 1]
    if (lastUserMsg?.role === 'user') {
      const userContent = lastUserMsg.content
      messages.value.pop()
      await sendMessage(userContent)
    }
  }

  // ---------- 存档 ----------
  function saveToLocal(): boolean {
    try {
      const save: GameSave = {
        version: '0.2',
        timestamp: Date.now(),
        character: { ...character.value },
        messages: [...messages.value],
        systemPrompt: systemPrompt.value,
        apiConfig: { ...apiConfig.value },
        worldBook: [...worldBook.value],
        worldBookEnabled: worldBookEnabled.value,
      }
      localStorage.setItem(SAVE_KEY, JSON.stringify(save))
      return true
    } catch {
      return false
    }
  }

  function loadFromLocal(): boolean {
    try {
      const raw = localStorage.getItem(SAVE_KEY)
      if (!raw) return false
      const save: GameSave = JSON.parse(raw)
      character.value = save.character
      messages.value = save.messages
      systemPrompt.value = save.systemPrompt
      apiConfig.value = save.apiConfig
      if (save.worldBook) {
        worldBook.value = save.worldBook
      }
      if (typeof save.worldBookEnabled === 'boolean') {
        worldBookEnabled.value = save.worldBookEnabled
      }
      return true
    } catch {
      return false
    }
  }

  function hasSave(): boolean {
    return !!localStorage.getItem(SAVE_KEY)
  }

  function deleteSave() {
    localStorage.removeItem(SAVE_KEY)
    resetGame()
  }

  // ---------- 重置 ----------
  function resetGame() {
    messages.value = []
    character.value = { ...DEFAULT_CHARACTER }
    systemPrompt.value = DEFAULT_SYSTEM_PROMPT
    worldBook.value = structuredClone(PRESET_WORLD_BOOK)
    worldBookEnabled.value = true
    error.value = ''
    isGenerating.value = false
  }

  function startNewGame() {
    resetGame()
    phase.value = 'setup'
  }

  function startPlaying() {
    if (!canStart.value) return
    phase.value = 'playing'
    const welcomeMsg: GameMessage = {
      id: `system-${Date.now()}`,
      role: 'assistant',
      content: `【「豌豆号」舰载 AI 豆豆已启动】

舰长${character.value.name || '阁下'}，欢迎回到舰桥。星图已更新，曲速引擎预热完毕。

当前坐标：开普勒-186f 星系外围 · 第三悬臂

请下达指令，舰长。`,
      timestamp: Date.now(),
    }
    addMessage(welcomeMsg)
  }

  // ---------- 设置 ----------
  function updateApiConfig(config: Partial<ApiConfig>) {
    Object.assign(apiConfig.value, config)
  }

  function updateCharacter(info: Partial<CharacterInfo>) {
    Object.assign(character.value, info)
  }

  function updateSystemPrompt(prompt: string) {
    systemPrompt.value = prompt
  }

  return {
    // state
    phase,
    apiConfig,
    character,
    systemPrompt,
    messages,
    isGenerating,
    settingsTab,
    error,
    worldBook,
    worldBookEnabled,

    // computed
    isApiReady,
    isCharacterReady,
    canStart,
    messageCount,
    enabledEntries,

    // actions
    sendMessage,
    regenerate,
    clearMessages,
    buildWorldBookContext,
    importWorldBookFromJson,
    addWorldBookEntries,
    removeWorldBookEntry,
    toggleWorldBookEntry,
    resetWorldBook,
    saveToLocal,
    loadFromLocal,
    hasSave,
    deleteSave,
    resetGame,
    startNewGame,
    startPlaying,
    updateApiConfig,
    updateCharacter,
    updateSystemPrompt,
  }
})
