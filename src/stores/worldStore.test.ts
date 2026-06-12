/**
 * World Store 测试 — 世界 CRUD + 持久化
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useWorldStore } from './worldStore'

describe('worldStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('initWorldList 从空 localStorage 开始', () => {
    const ws = useWorldStore()
    ws.initWorldList()
    expect(ws.worldList.length).toBe(0)
  })

  it('createWorld 添加新世界并设为 current', async () => {
    const ws = useWorldStore()
    const id = await ws.createWorld('星际站', '一个空间站')
    expect(ws.worldList.length).toBe(1)
    expect(ws.currentWorldId).toBe(id)
    expect(ws.worldName).toBe('星际站')
  })

  it('deleteWorld 移除并持久化', async () => {
    const ws = useWorldStore()
    const id = await ws.createWorld('测试', '')
    expect(ws.worldList.length).toBe(1)

    ws.deleteWorld(id)
    expect(ws.worldList.length).toBe(0)
    expect(ws.currentWorldId).toBeNull()
  })

  it('updateMeta 更新 meta 信息', async () => {
    const ws = useWorldStore()
    const id = await ws.createWorld('初始', '')
    ws.updateMeta(id, '角色名', 42)

    const found = ws.worldList.find(m => m.id === id)
    expect(found?.characterName).toBe('角色名')
    expect(found?.messageCount).toBe(42)
  })

  it('resetCurrent 清空当前世界指针', async () => {
    const ws = useWorldStore()
    await ws.createWorld('测试', '')
    ws.resetCurrent()
    expect(ws.currentWorldId).toBeNull()
    expect(ws.worldName).toBe('')
  })
})
