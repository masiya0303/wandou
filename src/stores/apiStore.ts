// ============================================================
// wandou · API 配置 Store + 预设模板
// ============================================================
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ApiConfig } from '@/types/game'
import { storage } from '@/utils/storage'

export const DEFAULT_API: ApiConfig = {
  baseUrl: 'https://api.deepseek.com',
  apiKey: '',
  model: 'deepseek-chat',
  temperature: 0.8,
  maxTokens: 8192,
  topP: 0.9,
}

export interface ApiPreset {
  name: string
  apiConfig: ApiConfig
  createdAt: number
}

const PRESETS_KEY = 'wandou_apiPresets'

export const useApiStore = defineStore('api', () => {
  const apiConfig = ref<ApiConfig>({ ...DEFAULT_API })
  const isApiReady = computed(() => !!apiConfig.value.apiKey && !!apiConfig.value.baseUrl)

  function updateApiConfig(c: Partial<ApiConfig>) {
    if (c.apiKey !== undefined) c.apiKey = c.apiKey.trim()
    if (c.baseUrl !== undefined) c.baseUrl = c.baseUrl.trim()
    if (c.model !== undefined) c.model = c.model.trim()
    Object.assign(apiConfig.value, c)
  }

  /** 将上下文片段拼接为 system prompt（AI 身份由世界书 at_constant 条目定义） */
  function buildSystemPrompt(contextParts: string[]): string {
    return contextParts.filter(Boolean).join('\n')
  }

  // ---- 预设模板 ----

  /** 获取所有预设 */
  function getPresets(): ApiPreset[] {
    return storage.getConfig<ApiPreset[]>(PRESETS_KEY, [])
  }

  /** 保存当前配置为预设 */
  function savePreset(name: string): boolean {
    const trimmed = name.trim()
    if (!trimmed) return false
    const presets = getPresets()
    // 同名覆盖
    const idx = presets.findIndex(p => p.name === trimmed)
    const p: ApiPreset = {
      name: trimmed,
      apiConfig: { ...apiConfig.value },
      createdAt: Date.now(),
    }
    if (idx >= 0) presets[idx] = p
    else presets.push(p)
    storage.saveConfig(PRESETS_KEY, presets)
    return true
  }

  /** 删除预设 */
  function deletePreset(name: string) {
    storage.saveConfig(PRESETS_KEY, getPresets().filter(p => p.name !== name))
  }

  /** 应用预设 */
  function applyPreset(name: string): boolean {
    const p = getPresets().find(x => x.name === name)
    if (!p) return false
    updateApiConfig(p.apiConfig)
    return true
  }

  return {
    apiConfig, isApiReady,
    updateApiConfig, buildSystemPrompt,
    getPresets, savePreset, deletePreset, applyPreset,
  }
})
