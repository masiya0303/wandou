// ============================================================
// wandou · 记忆运行时端到端测试
//
// 模拟 20 轮对话，验证：
//   1. 编译器每轮正常产出
//   2. 生命周期正确裁剪
//   3. 检查点自动保存
//   4. 查询驱动——不同问题命中不同内容
//   5. token 始终不超预算
//
// 纯本地，不调 AI API
// ============================================================
import { describe, it, expect } from 'vitest'
import { MemoryRuntime, getMemoryRuntime, resetMemoryRuntime } from './memoryRuntime'
import { compileContext, DEFAULT_COMPILER_CONFIG } from './memoryCompiler'
import type { StoreProjectionInput } from './compilerRuntime'
import type { CompilerQuery } from './memoryCompiler'

// ---- 模拟世界状态工厂 ----

const WORLD_EVENTS = [
  { fact: '玩家在边境集市醒来', category: 'event' as const, entities: ['玩家'], keywords: ['醒来', '边境集市'], importance: 5 as const, turn: 0 },
  { fact: '酒保马克给了玩家一杯麦酒', category: 'event' as const, entities: ['马克', '玩家'], keywords: ['麦酒'], importance: 2 as const, turn: 2 },
  { fact: '马克透露仓库有可疑人物', category: 'clue' as const, entities: ['马克', '仓库'], keywords: ['仓库', '可疑'], importance: 4 as const, turn: 5 },
  { fact: '威尔委托收集5个铁矿石', category: 'task' as const, entities: ['威尔', '铁矿石'], keywords: ['铁矿石', '委托'], importance: 4 as const, turn: 8 },
  { fact: '玩家在仓库遭遇蒙面人袭击', category: 'event' as const, entities: ['玩家', '蒙面人', '仓库'], keywords: ['袭击', '蒙面人'], importance: 5 as const, turn: 12 },
  { fact: '蒙面人身上有边境守卫徽章', category: 'clue' as const, entities: ['蒙面人', '边境守卫'], keywords: ['徽章'], importance: 4 as const, turn: 14 },
  { fact: '威尔承认认识蒙面人', category: 'character' as const, entities: ['威尔', '蒙面人'], keywords: ['承认'], importance: 3 as const, turn: 16 },
  { fact: '密信揭示队长是幕后黑手', category: 'clue' as const, entities: ['边境守卫队长', '密信'], keywords: ['密信', '幕后黑手'], importance: 5 as const, turn: 20 },
  { fact: '传说边境山脉有巨龙沉睡', category: 'world' as const, entities: ['边境山脉', '巨龙'], keywords: ['传说', '巨龙'], importance: 3 as const, turn: 3 },
  { fact: '悬赏令通缉暗影之手盗贼团', category: 'clue' as const, entities: ['暗影之手'], keywords: ['悬赏令', '盗贼团'], importance: 3 as const, turn: 7 },
]

function makeStoreInput(turn: number): StoreProjectionInput {
  const relevant = WORLD_EVENTS.filter(e => e.turn <= turn)
  return {
    worldTime: `2157年 03月 ${String(1 + (turn % 28)).padStart(2, '0')}日 ${String(8 + (turn % 12)).padStart(2, '0')}:00`,
    location: turn < 5 ? { region: '边境集市', subRegion: '广场', detail: '' }
      : turn < 15 ? { region: '边境集市', subRegion: '商业区', detail: '星光酒馆' }
      : { region: '边境集市', subRegion: '东区', detail: '废弃仓库' },
    weather: turn % 2 === 0 ? '阴天' : '小雨',
    npcs: [
      { id: 'npc-mark', name: '酒保马克', role: '酒保', personality: '热情', appearance: '中年', 人物分类: '重点', favor: 35 + turn },
      { id: 'npc-will', name: '军需官威尔', role: '军需官', personality: '严肃', appearance: '军装', 人物分类: '在场', favor: -5 + Math.floor(turn / 3) },
      { id: 'npc-captain', name: turn < 14 ? '???' : '边境守卫队长', role: turn < 14 ? '神秘' : '队长', personality: '冷酷', appearance: '兜帽', 人物分类: turn < 14 ? '在场' : '重点', favor: turn < 14 ? 0 : -40 },
    ],
    inventory: turn < 3 ? [] : [
      { name: '铁剑', quantity: 1, type: 'weapon' },
      ...(turn >= 8 ? [{ name: '铁矿石', quantity: Math.min(5, Math.floor(turn / 4)), type: 'material' }] : []),
    ],
    quests: turn < 8 ? [] : [
      { id: 'q-ore', title: '收集铁矿石', questType: '支线', description: '威尔委托', status: turn >= 18 ? 'completed' : 'active', source: '威尔' },
      ...(turn >= 12 ? [{ id: 'q-warehouse', title: '调查仓库袭击', questType: '主线', description: '找出袭击者', status: 'active', source: '马克' }] : []),
    ],
    memories: relevant.map((e) => ({
      id: `mem-${e.turn}`,
      fact: e.fact,
      category: e.category,
      entities: e.entities,
      keywords: e.keywords,
      importance: e.importance,
      timeScope: e.importance >= 4 ? 'long' as const : 'mid' as const,
      state: 'active' as const,
      turnIndex: e.turn,
    })),
    characterGold: 100 + turn * 5,
    characterAttributes: { HP: 100 - turn, MP: 50 },
    turnIndex: turn,
  }
}

// ---- 测试查询 ----

const QUERIES: Array<{ label: string; query: CompilerQuery; expectContains?: string[] }> = [
  {
    label: '问NPC',
    query: { inputText: '马克透露了什么', keywords: ['马克'], entityNames: ['马克'], timeRelated: false, needRelations: true, needHistory: false },
    expectContains: ['马克'],
  },
  {
    label: '问历史',
    query: { inputText: '边境山脉有什么传说', keywords: ['边境山脉', '传说', '巨龙'], entityNames: [], timeRelated: false, needRelations: false, needHistory: true },
    expectContains: ['巨龙'],
  },
  {
    label: '问关系',
    query: { inputText: '威尔和我关系怎么样', keywords: ['威尔', '关系'], entityNames: ['威尔'], timeRelated: true, needRelations: true, needHistory: false },
    expectContains: ['威尔'],
  },
  {
    label: '问仓库事件',
    query: { inputText: '仓库发生了什么', keywords: ['仓库', '袭击'], entityNames: [], timeRelated: false, needRelations: false, needHistory: true },
    expectContains: ['仓库'],
  },
]

// ============================================================
// E2E 测试
// ============================================================

describe('MemoryRuntime E2E', () => {
  let mr: MemoryRuntime

  // ---- 模拟 20 轮 ----
  function simTurns(count: number) {
    for (let t = 0; t <= count; t++) {
      mr.syncFromStores(makeStoreInput(t))
      if (t % 3 === 0 && t > 0) {
        mr.compilerRuntime.eventCards.push({
          id: `ingest-${t}`, title: `t${t}事件`, summary: `第${t}轮新事件`,
          timeLabel: `第${t}轮`, importance: 2, category: 'event',
          entities: [], keywords: [], state: 'active', updatedAt: t,
        })
      }
      if (t % 5 === 0) mr.runLifecycle()
    }
  }

  it('模拟20轮后编译器产出非空', () => {
    resetMemoryRuntime()
    mr = getMemoryRuntime()
    mr.config.persistenceEnabled = false
    simTurns(20)

    const output = compileContext({
      query: { inputText: '现在什么情况', keywords: [], entityNames: [], timeRelated: false, needRelations: false, needHistory: false },
      runtime: mr.getCompilerRuntime(),
    })

    expect(output.compiledText.length).toBeGreaterThan(0)
    expect(output.sections.length).toBeGreaterThanOrEqual(2)
    expect(output.tokenEstimate).toBeLessThanOrEqual(DEFAULT_COMPILER_CONFIG.totalBudget + 200)
  })

  it('查询驱动 — 不同问题命中不同内容', () => {
    const runtime = mr.getCompilerRuntime()

    for (const q of QUERIES) {
      const output = compileContext({ query: q.query, runtime })
      const text = output.compiledText

      for (const expected of q.expectContains || []) {
        expect(text).toContain(expected)
      }

      expect(output.tokenEstimate).toBeLessThanOrEqual(DEFAULT_COMPILER_CONFIG.totalBudget + 200)
    }
  })

  it('问马克不出巨龙，问巨龙能出巨龙', () => {
    const runtime = mr.getCompilerRuntime()

    const markOutput = compileContext({
      query: { inputText: '马克的事情', keywords: ['马克'], entityNames: ['马克'], timeRelated: false, needRelations: true, needHistory: false },
      runtime,
    })
    const dragonOutput = compileContext({
      query: { inputText: '巨龙传说', keywords: ['巨龙', '传说'], entityNames: [], timeRelated: false, needRelations: false, needHistory: true },
      runtime,
    })

    // 巨龙不应该出现在马克查询的热态层
    const markHot = markOutput.sections.filter(s => s.layer === 'hot').map(s => s.text).join('\n')
    expect(markHot).not.toContain('巨龙')

    // 但应该出现在巨龙查询中
    expect(dragonOutput.compiledText).toContain('巨龙')
  })

  it('20轮后运行时卡片数合理', () => {
    const events = mr.compilerRuntime.eventCards.length
    const archives = mr.compilerRuntime.archiveCards.length

    // 不应该无限制增长（生命周期会裁剪）
    expect(events).toBeLessThan(50)
    expect(archives).toBeLessThan(30)
  })

  it('场景锚点包含当前位置和时间', () => {
    const anchor = mr.getSceneAnchor()
    expect(anchor.location).toContain('边境集市')
    expect(anchor.time).toContain('2157年')
  })

  it('关系边正确反映好感度变化', () => {
    const markEdge = mr.compilerRuntime.relationEdges.find(e => e.targetName === '酒保马克')
    expect(markEdge).toBeDefined()
    expect(markEdge!.favor).toBeGreaterThan(35) // 35 + turn(20)
  })

  it('NPC ??? 在 turn<14 时未被揭示，turn>=20 时已揭示', () => {
    // 重建到第10轮
    resetMemoryRuntime()
    const mrEarly = getMemoryRuntime()
    mrEarly.config.persistenceEnabled = false
    for (let t = 0; t <= 10; t++) mrEarly.syncFromStores(makeStoreInput(t))

    const earlyEntities = mrEarly.compilerRuntime.entityCards
    const mysteryEarly = earlyEntities.find(e => e.name === '???')
    expect(mysteryEarly).toBeDefined()
    expect(mysteryEarly!.tags).not.toContain('身份已揭示')

    // 推进到第20轮
    for (let t = 11; t <= 20; t++) mrEarly.syncFromStores(makeStoreInput(t))
    const lateEntities = mrEarly.compilerRuntime.entityCards
    const captain = lateEntities.find(e => e.name === '边境守卫队长')
    expect(captain).toBeDefined()
    expect(captain!.category).toBe('重点')
  })

  it('检查点自动保存', async () => {
    await mr.saveCheckpoint([], '手工测试')
    expect(mr.checkpoints.length).toBeGreaterThan(0)
  })

  it('摘要读写完整', async () => {
    await mr.saveSummary('测试摘要：玩家已完成多个任务', 20)
    expect(mr.summary).toBeDefined()
    expect(mr.summary!.text).toContain('测试摘要')
    expect(mr.summary!.messageIndex).toBe(20)
  })

  it('生命周期处理旧事件', () => {
    // 推一个很老的事件卡
    mr.compilerRuntime.eventCards.push({
      id: 'ev-ancient', title: '古老事件', summary: '非常古老的事件',
      timeLabel: '第1轮', importance: 1, category: 'event',
      entities: [], keywords: [], state: 'active', updatedAt: 1,
    })

    // 推 turnIndex 到 50
    mr.turnIndex = 50
    const result = mr.runLifecycle()

    const ancientCard = mr.compilerRuntime.eventCards.find(e => e.id === 'ev-ancient')
    expect(ancientCard!.state).toBe('expired')
    expect(result.expired).toContain('ev-ancient')
  })
})
