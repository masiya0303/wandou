/**
 * Player Store 测试 — 背包/任务/属性
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePlayerStore } from './playerStore'

describe('playerStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('新角色 isCharacterReady 为 false', () => {
    expect(usePlayerStore().isCharacterReady).toBe(false)
  })

  it('设置名字后 isCharacterReady 为 true', () => {
    const p = usePlayerStore()
    p.updateCharacter({ name: '船长' })
    expect(p.isCharacterReady).toBe(true)
  })

  it('addItem 添加物品到背包', () => {
    const p = usePlayerStore()
    p.addItem({ id: '1', name: '电池', description: '标准电池', quantity: 2, type: 'material' })
    expect(p.inventory.length).toBe(1)
    expect(p.inventory[0].name).toBe('电池')
  })

  it('removeItem 按 id 移除', () => {
    const p = usePlayerStore()
    p.addItem({ id: '1', name: 'A', description: '', quantity: 1, type: 'key' })
    p.addItem({ id: '2', name: 'B', description: '', quantity: 1, type: 'key' })
    p.removeItem('1')
    expect(p.inventory.length).toBe(1)
    expect(p.inventory[0].id).toBe('2')
  })

  it('updateItemQuantity 修改数量', () => {
    const p = usePlayerStore()
    p.addItem({ id: '1', name: '电池', description: '', quantity: 2, type: 'material' })
    p.updateItemQuantity('1', 5)
    expect(p.inventory[0].quantity).toBe(5)
    p.updateItemQuantity('1', 0)
    expect(p.inventory[0].quantity).toBe(0)
  })

  it('quest CRUD', () => {
    const p = usePlayerStore()
    p.addQuest({ id: 'q1', title: '主线', description: 'desc', status: 'active', objectives: [] })
    expect(p.quests.length).toBe(1)
    p.updateQuestStatus('q1', 'completed')
    expect(p.quests[0].status).toBe('completed')
    p.removeQuest('q1')
    expect(p.quests.length).toBe(0)
  })

  it('snapshot + restore 完整序列', () => {
    const p = usePlayerStore()
    p.updateCharacter({ name: '探险者', gold: 200 })
    p.addItem({ id: 'i1', name: '能量棒', description: '', quantity: 3, type: 'consumable' })
    p.addQuest({ id: 'q1', title: '找燃料', description: '', status: 'active', objectives: [] })

    const snap = p.snapshot()
    p.resetPlayer()
    expect(p.character.name).toBe('')
    expect(p.inventory.length).toBe(0)

    p.restore(snap)
    expect(p.character.name).toBe('探险者')
    expect(p.character.gold).toBe(200)
    expect(p.inventory.length).toBe(1)
    expect(p.quests[0].title).toBe('找燃料')
  })
})
