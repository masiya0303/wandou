/**
 * API Store 测试 — 配置管理 + 预设模板
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useApiStore } from './apiStore'

describe('apiStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('默认 key 为空，isApiReady 为 false', () => {
    const api = useApiStore()
    expect(api.isApiReady).toBe(false)
  })

  it('设置 key 后 isApiReady 为 true', () => {
    const api = useApiStore()
    api.updateApiConfig({ apiKey: 'sk-test' })
    expect(api.isApiReady).toBe(true)
  })

  it('buildFullSystemPrompt 合并上下文', () => {
    const api = useApiStore()
    const result = api.buildFullSystemPrompt(['上下文A', '', '上下文B'])
    expect(result).toContain('上下文A')
    expect(result).toContain('上下文B')
    // 含上下文A
    expect(result.includes('上下文A')).toBe(true)
    expect(result.includes('上下文B')).toBe(true)
  })

  it('预设 CRUD', () => {
    const api = useApiStore()
    // 保存
    expect(api.savePreset('测试预设')).toBe(true)
    expect(api.getPresets().length).toBe(1)
    // 同名覆盖
    api.savePreset('测试预设')
    expect(api.getPresets().length).toBe(1)
    // 删除
    api.deletePreset('测试预设')
    expect(api.getPresets().length).toBe(0)
  })

  it('保存空名称返回 false', () => {
    const api = useApiStore()
    expect(api.savePreset('')).toBe(false)
  })

  it('应用预设同步配置', () => {
    const api = useApiStore()
    api.updateApiConfig({ apiKey: 'old-key', model: 'old-model' })
    api.savePreset('p1')

    // 改配置
    api.updateApiConfig({ apiKey: 'new-key' })
    // 应用预设恢复
    const ok = api.applyPreset('p1')
    expect(ok).toBe(true)
    expect(api.apiConfig.apiKey).toBe('old-key')
  })

  it('应用不存在的预设返回 false', () => {
    expect(useApiStore().applyPreset('nonexistent')).toBe(false)
  })
})
