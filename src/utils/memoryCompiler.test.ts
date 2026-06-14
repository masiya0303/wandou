// ============================================================
// wandou · 记忆编译器 v2 测试
// ============================================================
import { describe, it, expect } from 'vitest'
import {
  compileContext,
  compileContextDry,
  compileContextAdvanced,
  createKeywordRetriever,
  estimateTokens,
  DEFAULT_COMPILER_CONFIG,
  buildRuntimeFromStores,
  type CompilerInput,
  type CompilerQuery,
  type CompilerConfig,
  type CompilerRuntimeState,
} from './memoryCompiler'
import { createEmptyRuntime, type StoreProjectionInput } from './compilerRuntime'

// ---- 测试数据工厂 ----

function makeQuery(overrides: Partial<CompilerQuery> = {}): CompilerQuery {
  return {
    inputText: '我要去酒馆找马克问问有什么任务',
    keywords: ['酒馆', '马克', '任务'],
    entityNames: ['马克'],
    timeRelated: false,
    needRelations: true,
    needHistory: false,
    ...overrides,
  }
}

function makeStoreInput(overrides: Partial<StoreProjectionInput> = {}): StoreProjectionInput {
  return {
    worldTime: '2157年 03月 15日 14:30',
    location: { region: '边境集市', subRegion: '商业区', detail: '星光酒馆' },
    weather: '阴天',
    npcs: [
      {
        id: 'npc-001', name: '酒保马克', role: '酒保',
        personality: '热情健谈但嘴巴不严',
        appearance: '中年男性，略显发福',
        aliases: ['马克'], 人物分类: '重点', favor: 35,
      },
      {
        id: 'npc-002', name: '军需官威尔', role: '军需官',
        personality: '严肃刻板', appearance: '笔挺军装',
        人物分类: '在场', favor: -5,
      },
      {
        id: 'npc-003', name: '???', role: '神秘人物',
        personality: '神秘莫测', appearance: '戴兜帽',
        人物分类: '在场', favor: 0,
      },
    ],
    inventory: [
      { name: '铁剑', quantity: 1, type: 'weapon' },
      { name: '回复药', quantity: 3, type: 'consumable' },
      { name: '旧地图', quantity: 1, type: 'key' },
    ],
    quests: [
      {
        id: 'q-1', title: '收集铁矿石', questType: '支线',
        description: '军需官威尔委托收集5个铁矿石', status: 'active',
      },
      {
        id: 'q-2', title: '调查仓库可疑活动', questType: '主线',
        description: '马克说东区仓库有可疑人物', status: 'active', source: '马克',
      },
    ],
    memories: [
      {
        id: 'mem-1', fact: '马克透露东区仓库有可疑人物出没',
        category: 'clue', entities: ['马克', '东区仓库'],
        keywords: ['仓库', '可疑人物'], importance: 4,
        timeScope: 'mid', state: 'active', turnIndex: 12,
      },
      {
        id: 'mem-2', fact: '玩家在边境集市结识了酒保马克',
        category: 'character', entities: ['马克', '玩家'],
        keywords: ['结识', '马克'], importance: 2,
        timeScope: 'long', state: 'active', turnIndex: 3,
      },
      {
        id: 'mem-3', fact: '军需官威尔委托玩家收集5个铁矿石',
        category: 'task', entities: ['威尔', '铁矿石'],
        keywords: ['铁矿石', '收集'], importance: 4,
        timeScope: 'mid', state: 'active', turnIndex: 10,
      },
      {
        id: 'mem-4', fact: '传说边境山脉深处有古代巨龙沉睡',
        category: 'world', entities: ['边境山脉', '巨龙'],
        keywords: ['传说', '巨龙', '山脉', '沉睡'], importance: 3,
        timeScope: 'long', state: 'active', turnIndex: 1,
      },
    ],
    characterGold: 150,
    characterAttributes: { HP: 80, MP: 45, ATK: 12, DEF: 7 },
    turnIndex: 15,
    ...overrides,
  }
}

function makeInput(queryOverrides?: Partial<CompilerQuery>): CompilerInput {
  return {
    query: makeQuery(queryOverrides),
    runtime: buildRuntimeFromStores(makeStoreInput()),
  }
}

// ============================================================
// estimateTokens
// ============================================================

describe('estimateTokens', () => {
  it('空字符串返回0', () => {
    expect(estimateTokens('')).toBe(0)
  })

  it('纯中文约1字符/token', () => {
    const tokens = estimateTokens('你好世界')
    expect(tokens).toBeGreaterThanOrEqual(2)
    expect(tokens).toBeLessThanOrEqual(6)
  })

  it('英文比中文省token（相同字符数）', () => {
    const cn = estimateTokens('你好世界测试')
    const en = estimateTokens('hello')
    // 4个中文字符 ≈ 4 tokens，5个英文 ≈ 1.5 tokens
    expect(en).toBeLessThan(cn)
  })
})

// ============================================================
// buildRuntimeFromStores
// ============================================================

describe('buildRuntimeFromStores', () => {
  it('正确投影 NPC 到实体卡', () => {
    const rt = buildRuntimeFromStores(makeStoreInput())
    expect(rt.entityCards.length).toBe(3)
    expect(rt.entityCards[0].name).toBe('酒保马克')
  })

  it('正确投影任务到活跃线程', () => {
    const rt = buildRuntimeFromStores(makeStoreInput())
    expect(rt.activeThreads.length).toBe(2)
    expect(rt.activeThreads[0].title).toBe('收集铁矿石')
  })

  it('正确投影状态槽', () => {
    const rt = buildRuntimeFromStores(makeStoreInput())
    const goldSlot = rt.stateSlots.find(s => s.slotType === '金币')
    expect(goldSlot?.value).toBe(150)
  })

  it('构建玩家→NPC 关系边', () => {
    const rt = buildRuntimeFromStores(makeStoreInput())
    const markEdge = rt.relationEdges.find(e => e.targetName === '酒保马克')
    expect(markEdge).toBeDefined()
    expect(markEdge!.favor).toBe(35)
  })

  it('离场 NPC 不出现在 presentNpcIds', () => {
    const si = makeStoreInput({
      npcs: [
        { id: 'npc-off', name: '已离开NPC', role: '', personality: '', appearance: '',
          人物分类: '离场', enabled: false, favor: 0 },
      ],
    })
    const rt = buildRuntimeFromStores(si)
    expect(rt.sceneAnchor.presentNpcIds).not.toContain('npc-off')
  })
})

// ============================================================
// compileContext（同步单阶段）
// ============================================================

describe('compileContext', () => {
  it('基本输入产生非空输出', () => {
    const result = compileContext(makeInput())
    expect(result.compiledText.length).toBeGreaterThan(0)
    expect(result.sections.length).toBeGreaterThan(0)
  })

  it('场景锚点总是第一个', () => {
    const result = compileContext(makeInput())
    expect(result.sections[0]?.kind).toBe('scene')
    expect(result.sections[0]?.layer).toBe('hot')
  })

  it('NPC 名出现在编译结果', () => {
    const result = compileContext(makeInput())
    expect(result.compiledText).toContain('马克')
  })

  it('token 不超预算', () => {
    const result = compileContext(makeInput())
    expect(result.tokenEstimate).toBeLessThanOrEqual(DEFAULT_COMPILER_CONFIG.totalBudget + 200)
  })

  it('空世界也能产出 scene', () => {
    const empty = makeInput()
    empty.runtime = createEmptyRuntime()
    const result = compileContext(empty)
    expect(result.compiledText).toContain('位置')
  })

  it('高 relevance NPC 出现在热态层', () => {
    const input = makeInput({ entityNames: ['马克'], keywords: ['马克', '酒保'] })
    const result = compileContext(input)
    const hot = result.sections.filter(s => s.layer === 'hot')
    const hasMark = hot.some(s => s.text.includes('马克'))
    expect(hasMark).toBe(true)
  })

  it('历史回溯触发 archive 层', () => {
    const input = makeInput({
      inputText: '边境山脉以前发生过什么传说',
      keywords: ['边境山脉', '传说', '巨龙'],
      needHistory: true, timeRelated: true,
    })
    const result = compileContext(input)
    expect(result.compiledText).toContain('巨龙')
  })

  it('空缺检测：无 NPC 时标记 entityGap', () => {
    const si = makeStoreInput({ npcs: [] })
    const input: CompilerInput = { query: makeQuery({ entityNames: ['神秘人'] }), runtime: buildRuntimeFromStores(si) }
    const result = compileContext(input)
    expect(result.meta.gaps.entityGap).toBe(true)
  })

  it('超小预算时仍产出 scene', () => {
    const tiny: CompilerConfig = {
      ...DEFAULT_COMPILER_CONFIG,
      totalBudget: 100,
      budgets: { ...DEFAULT_COMPILER_CONFIG.budgets, scene: 60, threads: 10, states: 10, relations: 0, relationNetwork: 0, events: 0, entities: 0, archives: 0 },
    }
    const result = compileContext(makeInput(), tiny)
    expect(result.compiledText).toContain('位置')
    expect(result.tokenEstimate).toBeLessThanOrEqual(120)
  })

  it('大量记忆时编译不崩溃且不包含全部', () => {
    const si = makeStoreInput()
    si.memories = Array.from({ length: 50 }, (_, i) => ({
      id: `mem-${i}`,
      fact: `事件${i}：发生了某某事情 关键词是关键词${i}`,
      category: 'event' as const,
      entities: [`实体${i}`],
      keywords: [`关键词${i}`],
      importance: ((i % 5) + 1) as 1 | 2 | 3 | 4 | 5,
      timeScope: 'mid' as const,
      state: 'active' as const,
      turnIndex: 50 - i, // newer first
    }))
    const input: CompilerInput = {
      query: makeQuery({ keywords: ['关键词0', '关键词1'], inputText: '关键词0 关键词1 事件' }),
      runtime: buildRuntimeFromStores(si),
    }
    const result = compileContext(input)
    // 不应该包含所有50条
    expect(result.meta.includedMemoryIds.length).toBeLessThan(50)
    // 编译不应该报错
    expect(result.compiledText.length).toBeGreaterThan(0)
  })

  it('去重后无重复文本块', () => {
    const result = compileContext(makeInput())
    const texts = result.sections.map(s => s.text)
    const unique = new Set(texts)
    expect(unique.size).toBe(texts.length)
  })

  it('关系网络分区出现当有 NPC 和关系查询', () => {
    // buildRuntimeFromStores 为 NPC 之间共享标签时创建 relationNetwork 条目
    const si = makeStoreInput()
    // 确保两个 NPC 有相同的标签
    si.npcs = [
      {
        id: 'npc-001', name: '酒保马克', role: '酒保',
        personality: '热情', appearance: '中年',
        aliases: ['马克'], 人物分类: '重点', favor: 35,
      },
      {
        id: 'npc-002', name: '军需官威尔', role: '军需官',
        personality: '严肃', appearance: '军装',
        人物分类: '在场', favor: -5,
      },
    ]
    const runtime = buildRuntimeFromStores(si)
    const input: CompilerInput = { query: makeQuery({ needRelations: true, entityNames: ['马克', '威尔'] }), runtime }
    const result = compileContext(input)
    // 至少应该有关系相关的 section
    const hasRelSections = result.sections.some(s => s.kind === 'relations' || s.kind === 'relationNetwork')
    expect(hasRelSections).toBe(true)
  })
})

// ============================================================
// Dry-run 模式
// ============================================================

describe('compileContextDry', () => {
  it('dry-run 不覆盖缓存', () => {
    const input = makeInput()
    // 关闭缓存做首次编译（确保是全新的）
    const first = compileContext(input, { ...DEFAULT_COMPILER_CONFIG, cacheEnabled: false })
    const dry = compileContextDry(input)
    expect(dry.compiledText).toBe(first.compiledText)
    expect(dry.wouldReplaceCache).toBe(true)
  })
})

// ============================================================
// 关键词检索器
// ============================================================

describe('createKeywordRetriever', () => {
  it('按关键词检索记忆', async () => {
    const runtime = buildRuntimeFromStores(makeStoreInput())
    const retriever = createKeywordRetriever(runtime)
    // '仓库' 是 mem-1 的关键词
    const results = await retriever.retrieve('仓库 可疑人物 东区', 5)
    expect(results.length).toBeGreaterThan(0)
    // 至少应该包含仓库相关内容
    const hasWarehouse = results.some(r => r.text.includes('仓库') || r.text.includes('可疑'))
    expect(hasWarehouse).toBe(true)
  })

  it('无匹配时返回空', async () => {
    const runtime = createEmptyRuntime()
    const retriever = createKeywordRetriever(runtime)
    const results = await retriever.retrieve('完全不存在的关键词', 5)
    expect(results.length).toBe(0)
  })
})

// ============================================================
// 高级异步编译
// ============================================================

describe('compileContextAdvanced', () => {
  it('基本异步编译成功', async () => {
    const input = makeInput()
    const result = await compileContextAdvanced(input, {
      enableRetrieval: false,
    })
    expect(result.output.compiledText.length).toBeGreaterThan(0)
    expect(result.debugLogs.length).toBeGreaterThan(0)
    expect(result.retrievalTriggered).toBe(false)
  })

  it('空缺触发检索', async () => {
    const input = makeInput({
      inputText: '边境山脉的巨龙是什么',
      keywords: ['边境山脉', '巨龙'],
      needHistory: true, timeRelated: true, entityNames: [],
    })
    // 巨龙记忆是 world category，在存档区
    const result = await compileContextAdvanced(input, {
      enableRetrieval: true,
      retriever: createKeywordRetriever(input.runtime),
    })
    expect(result.debugLogs.map(d => d.stage)).toContain('pre_compile')
    expect(result.output.compiledText.length).toBeGreaterThan(0)
  })

  it('debug 回调被调用', async () => {
    const input = makeInput()
    const stages: string[] = []
    await compileContextAdvanced(input, {
      enableRetrieval: false,
      onDebug: (entry) => stages.push(entry.stage),
    })
    expect(stages).toContain('pre_compile')
    expect(stages).toContain('final')
  })

  it('检索失败不崩溃', async () => {
    // 构造一个必然触发 suggestedRecall 的场景：空运行时 + 需要历史
    const runtime = createEmptyRuntime()
    const input: CompilerInput = {
      query: {
        inputText: '有什么历史事件',
        keywords: ['历史'],
        entityNames: [],
        timeRelated: true,
        needRelations: false,
        needHistory: true,
      },
      runtime,
    }
    const badRetriever = {
      name: 'bad',
      retrieve: async () => { throw new Error('检索挂了') },
    }
    const result = await compileContextAdvanced(input, {
      enableRetrieval: true,
      retriever: badRetriever,
    })
    expect(result.output.compiledText.length).toBeGreaterThan(0)
    // 检索失败应该记录在 debug 日志中
    const hasRetrieveStage = result.debugLogs.some(d => d.stage === 'retrieve')
    expect(hasRetrieveStage).toBe(true)
  })
})

// ============================================================
// 配置定制
// ============================================================

describe('custom config', () => {
  it('增大预算产出更多内容', () => {
    const small = compileContext(makeInput(), DEFAULT_COMPILER_CONFIG)
    const largeCfg: CompilerConfig = {
      ...DEFAULT_COMPILER_CONFIG,
      totalBudget: 3000,
      budgets: {
        scene: 100, threads: 300, states: 300,
        relations: 250, relationNetwork: 200,
        events: 500, entities: 400, archives: 300,
      },
      hotLimits: { ...DEFAULT_COMPILER_CONFIG.hotLimits, events: 8, entities: 8 },
      queryLimits: { ...DEFAULT_COMPILER_CONFIG.queryLimits, events: 15, archives: 10 },
    }
    const large = compileContext(makeInput(), largeCfg)
    expect(large.tokenEstimate).toBeGreaterThanOrEqual(small.tokenEstimate)
  })
})
