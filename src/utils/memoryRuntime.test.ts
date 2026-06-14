// ============================================================
// wandou · 记忆运行时测试
// ============================================================
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  MemoryRuntime,
  getMemoryRuntime,
  resetMemoryRuntime,
  ingestMemories,
  runLifecycle,
  DEFAULT_MEMORY_RUNTIME_CONFIG,
} from './memoryRuntime'
import { createEmptyRuntime } from './compilerRuntime'
import type { StoreProjectionInput } from './compilerRuntime'

function makeStoreInput(overrides?: Partial<StoreProjectionInput>): StoreProjectionInput {
  return {
    worldTime: '2157年 03月 15日 14:30',
    location: { region: '边境集市', subRegion: '商业区', detail: '星光酒馆' },
    weather: '阴天',
    npcs: [
      { id: 'npc-001', name: '酒保马克', role: '酒保', personality: '热情', appearance: '中年', 人物分类: '重点', favor: 35 },
      { id: 'npc-002', name: '军需官威尔', role: '军需官', personality: '严肃', appearance: '军装', 人物分类: '在场', favor: -5 },
    ],
    inventory: [{ name: '铁剑', quantity: 1, type: 'weapon' }],
    quests: [{ id: 'q-1', title: '收集铁矿石', questType: '支线', description: '军需官委托', status: 'active' }],
    memories: [
      { id: 'mem-1', fact: '马克透露仓库有可疑人物', category: 'clue', entities: ['马克', '仓库'], keywords: ['仓库', '可疑'], importance: 4, timeScope: 'mid', state: 'active', turnIndex: 12 },
      { id: 'mem-2', fact: '传说边境山脉有巨龙沉睡', category: 'world', entities: ['边境山脉', '巨龙'], keywords: ['传说', '巨龙'], importance: 3, timeScope: 'long', state: 'active', turnIndex: 1 },
    ],
    characterGold: 150,
    characterAttributes: { HP: 80, MP: 45 },
    turnIndex: 15,
    ...overrides,
  }
}

describe('MemoryRuntime', () => {
  let mr: MemoryRuntime

  beforeEach(() => {
    resetMemoryRuntime()
    mr = getMemoryRuntime()
    mr.config.persistenceEnabled = false // 测试时禁用 IndexedDB
  })

  afterEach(() => {
    resetMemoryRuntime()
  })

  it('初始化后为空状态', () => {
    expect(mr.turnIndex).toBe(0)
    expect(mr.compilerRuntime.eventCards.length).toBe(0)
    expect(mr.compilerRuntime.archiveCards.length).toBe(0)
  })

  it('syncFromStores 正确投影 store 数据', () => {
    mr.syncFromStores(makeStoreInput())
    expect(mr.turnIndex).toBe(15)
    expect(mr.compilerRuntime.sceneAnchor.location).toContain('边境集市')
    expect(mr.compilerRuntime.sceneAnchor.weather).toBe('阴天')
    expect(mr.compilerRuntime.entityCards.length).toBe(2)
    expect(mr.compilerRuntime.activeThreads.length).toBe(1)
    expect(mr.compilerRuntime.eventCards.length).toBe(1) // mem-1 is clue
    expect(mr.compilerRuntime.archiveCards.length).toBe(1) // mem-2 is world
  })

  it('场景锚点包含在场 NPC ID', () => {
    mr.syncFromStores(makeStoreInput())
    const ids = mr.compilerRuntime.sceneAnchor.presentNpcIds
    expect(ids).toContain('npc-001')
    expect(ids).toContain('npc-002')
  })

  it('关系边由商店投影产生', () => {
    mr.syncFromStores(makeStoreInput())
    expect(mr.compilerRuntime.relationEdges.length).toBeGreaterThanOrEqual(2)
    const markEdge = mr.compilerRuntime.relationEdges.find(e => e.targetName === '酒保马克')
    expect(markEdge?.favor).toBe(35)
    expect(markEdge?.relationType).toBe('友好')
  })

  it('生命周期：高 importance 事件保留更久', () => {
    mr.syncFromStores(makeStoreInput({ turnIndex: 100 }))
    // 手动推事件卡
    mr.compilerRuntime.eventCards.push(
      { id: 'ev-old-high', title: '高重要性旧事件', summary: '重要事件', timeLabel: '第10轮', importance: 5, category: 'event', entities: [], keywords: [], state: 'active', updatedAt: 10 },
      { id: 'ev-old-low', title: '低重要性旧事件', summary: '普通事件', timeLabel: '第10轮', importance: 1, category: 'event', entities: [], keywords: [], state: 'active', updatedAt: 10 },
    )
    const result = mr.runLifecycle()
    // 低重要性旧事件应过期，高重要性应保留
    expect(result.expired.length).toBeGreaterThan(0)
    // 高重要性事件不应被过期
    const highCard = mr.compilerRuntime.eventCards.find(c => c.id === 'ev-old-high')
    expect(highCard?.state).toBe('active')
  })

  it('检查点保存和加载', async () => {
    mr.syncFromStores(makeStoreInput())
    const messages: any[] = [
      { id: 'm1', role: 'user', content: '你好', timestamp: Date.now() },
      { id: 'm2', role: 'assistant', content: '欢迎来到酒馆', timestamp: Date.now() },
    ]

    const cp = await mr.saveCheckpoint(messages, '手工存档')
    expect(cp.turnIndex).toBe(15)
    expect(cp.label).toBe('手工存档')
    expect(mr.checkpoints.length).toBe(1)
  })

  it('摘要保存和读取', async () => {
    await mr.saveSummary('这是摘要内容', 5)
    expect(mr.summary?.text).toBe('这是摘要内容')
    expect(mr.summary?.messageIndex).toBe(5)
  })

  it('回退时摘要修复', async () => {
    await mr.saveSummary('摘要内容', 10)
    const messages: any[] = Array.from({ length: 15 }, (_, i) => ({
      id: `m${i}`, role: i % 2 === 0 ? 'user' : 'assistant', content: `消息${i}`, timestamp: Date.now(),
    }))
    const result = await mr.repairSummary(messages, 5)
    expect(result.removedSummaryCount).toBeGreaterThan(0)
    expect(mr.summary).toBeNull()
  })

  it('getCompilerRuntime 返回当前运行时', () => {
    mr.syncFromStores(makeStoreInput())
    const rt = mr.getCompilerRuntime()
    expect(rt.sceneAnchor.location).toContain('边境集市')
  })

  it('clearWorld 重置所有状态', async () => {
    mr.syncFromStores(makeStoreInput())
    await mr.clearWorld()
    expect(mr.compilerRuntime.eventCards.length).toBe(0)
    expect(mr.checkpoints.length).toBe(0)
    expect(mr.summary).toBeNull()
  })

  it('多次 sync+sync 不丢失数据', () => {
    mr.syncFromStores(makeStoreInput({ turnIndex: 5 }))
    const count5 = mr.compilerRuntime.eventCards.length
    mr.syncFromStores(makeStoreInput({ turnIndex: 10 }))
    // 每次 sync 都是全量重建，数量不变（但轮次变了）
    expect(mr.turnIndex).toBe(10)
    expect(mr.compilerRuntime.eventCards.length).toBe(count5)
  })

  it('大量事件卡触发裁剪', () => {
    mr.syncFromStores(makeStoreInput())
    // 添加超过 maxHotEventCards 的事件卡
    for (let i = 0; i < 250; i++) {
      mr.compilerRuntime.eventCards.push({
        id: `ev-${i}`, title: `事件${i}`, summary: `事件${i}摘要`,
        timeLabel: `第${i}轮`, importance: (i % 3 + 1) as 1 | 2 | 3,
        category: 'event', entities: [], keywords: [], state: 'active', updatedAt: i,
      })
    }
    const result = mr.runLifecycle()
    expect(result.pruned).toBeGreaterThan(0)
  })

  it('debug 日志自动裁剪', () => {
    for (let i = 0; i < 300; i++) {
      mr['_debug']('test', `日志${i}`)
    }
    expect(mr.debugLogs.length).toBeLessThanOrEqual(mr.config.debug.maxLogs)
  })
})

describe('ingestMemories (unit)', () => {
  it('空文本返回空数组', async () => {
    const cfg: any = { apiKey: 'sk-test', baseUrl: 'https://api.example.com', model: 'test', temperature: 0.5, maxTokens: 1000 }
    // 不实际调用 API（空文本直接返回）
    const result = await ingestMemories('', cfg)
    expect(result.length).toBe(0)
  })

  it('无 API key 返回空数组', async () => {
    const cfg: any = { apiKey: '', baseUrl: 'https://api.example.com', model: 'test', temperature: 0.5, maxTokens: 1000 }
    const result = await ingestMemories('一些故事文本', cfg)
    expect(result.length).toBe(0)
  })
})

describe('runLifecycle (unit)', () => {
  it('近期事件不触发过期', () => {
    const events = [
      { id: 'e1', title: 't', summary: 's', timeLabel: '第10轮', importance: 3 as const, category: 'event' as const, entities: [], keywords: [], state: 'active' as const, updatedAt: 10 },
    ]
    const { events: updated, result } = runLifecycle(events, [], 12, DEFAULT_MEMORY_RUNTIME_CONFIG.lifecycle)
    expect(updated[0].state).toBe('active')
    expect(result.expired.length).toBe(0)
  })

  it('远过期事件被标记', () => {
    const events = [
      { id: 'e1', title: 't', summary: 's', timeLabel: '第1轮', importance: 1 as const, category: 'event' as const, entities: [], keywords: [], state: 'active' as const, updatedAt: 1 },
    ]
    const { events: updated, result } = runLifecycle(events, [], 50, DEFAULT_MEMORY_RUNTIME_CONFIG.lifecycle)
    expect(updated[0].state).toBe('expired')
    expect(result.expired.length).toBe(1)
  })
})

describe('getMemoryRuntime (singleton)', () => {
  afterEach(() => resetMemoryRuntime())

  it('返回同一个实例', () => {
    const a = getMemoryRuntime()
    const b = getMemoryRuntime()
    expect(a).toBe(b)
  })

  it('resetMemoryRuntime 创建新实例', () => {
    const a = getMemoryRuntime()
    resetMemoryRuntime()
    const b = getMemoryRuntime()
    expect(a).not.toBe(b)
  })
})
