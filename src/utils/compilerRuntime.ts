// ============================================================
// wandou · 编译器运行时状态树 (CompilerRuntime)
//
// 对标 yijiekkk memoryRuntime，但：
// - 全量 TypeScript 类型
// - 从 wandou 现有 Store 构建投影（非独立存储，避免同步问题）
// - 每次编译前后做 diff，追踪变化
// - 支持存档回退时的状态恢复
// ============================================================

// ---- 分区卡片类型 ----

/** 场景锚点 — 当前时空 */
export interface SceneAnchor {
  location: string
  time: string
  weather: string
  presentNpcIds: string[]
}

/** 活跃线程 — 任务/剧情线 */
export interface ThreadCard {
  id: string
  title: string
  summary: string         // 1-2句描述
  questType: string       // 主线/支线/日常/紧急/隐藏
  status: 'active' | 'completed' | 'failed' | 'blocked'
  blockingReason?: string // 为什么被阻塞
  source: string          // 任务来源 NPC / system
  updatedAt: number       // turnIndex
}

/** 状态槽 — 可追踪的数值/字符串状态 */
export interface StateSlot {
  id: string
  scopeId: string         // 所属对象 ID（player / npc-xxx）
  scopeName: string       // 所属对象名
  slotType: string        // 如 "金币" "HP" "好感度"
  value: number | string
  numericValue: number | null  // 数值化（用于打分）
  updatedAt: number
}

/** 实体卡 — NPC/组织/地点详情 */
export interface EntityCard {
  id: string
  name: string
  entityType: 'npc' | 'faction' | 'location'
  role: string
  personality: string
  appearance: string
  aliases: string[]
  category: '重点' | '在场' | '离场'
  tags: string[]          // 可检索标签
  updatedAt: number
}

/** 关系边 — NPC↔NPC 或 NPC↔玩家 的关系 */
export interface RelationEdge {
  id: string
  sourceId: string        // "player" 或 npc id
  sourceName: string
  targetId: string        // npc id
  targetName: string
  relationType: string    // "信任" "敌视" "同盟" "熟人" "陌生" 等
  favor: number           // -99 ~ 99
  strength: number        // 0~1 关系强度
  summary: string         // 一句话概括
  updatedAt: number
}

/** 事件卡 — 已发生的事件 */
export interface EventCard {
  id: string
  title: string
  summary: string
  timeLabel: string       // 世界时间标签
  importance: 1 | 2 | 3 | 4 | 5
  category: 'event' | 'clue' | 'task' | 'status' | 'item' | 'ability'
  entities: string[]      // 关联实体名
  keywords: string[]
  state: 'active' | 'resolved' | 'expired'
  updatedAt: number       // turnIndex
}

/** 档案卡 — 历史/长程记忆 */
export interface ArchiveCard {
  id: string
  arcTitle: string        // 归档标题（如 "边境山脉传说"）
  summary: string
  excerpt: string         // 详细片段
  keywords: string[]
  entities: string[]
  timeSpan: string        // 时间跨度标签
  importance: 1 | 2 | 3 | 4 | 5
  source: 'memory' | 'world_book' | 'vector_retrieval'
  updatedAt: number
}

/** 关系网络条目 — 简化版（用于快速图查找） */
export interface RelationNetworkEntry {
  sourceId: string
  targetId: string
  type: string
  strength: number
  summary: string
}

// ---- 编译结果快照 ----

export interface CompiledContextSnapshot {
  compiledAt: number
  queryText: string
  compiledText: string
  sections: { kind: string; itemCount: number; layer: 'hot' | 'query' }[]
  tokenEstimate: number
  gaps: {
    entityGap: boolean
    timeGap: boolean
    relationGap: boolean
    historyGap: boolean
  }
  suggestedRecall: boolean
  droppedReasons: string[]
  /** 与上一次编译的 diff */
  diff?: CompilationDiff
}

export interface CompilationDiff {
  /** 本次新增的条目 ID */
  added: { kind: string; id: string }[]
  /** 本次移除的条目 ID */
  removed: { kind: string; id: string }[]
  /** 内容变化但 ID 不变的条目 */
  changed: { kind: string; id: string; field: string }[]
}

export interface CompileDebugEntry {
  timestamp: number
  stage: 'pre_compile' | 'retrieve' | 're_compile' | 'final'
  tokenEstimate: number
  sectionCounts: Record<string, number>
  gaps: Record<string, boolean>
  suggestedRecall: boolean
  message: string
}

// ---- 运行时状态树 ----

export interface CompilerRuntimeState {
  /** 版本号 */
  version: number

  // ---- 分区数据 ----
  sceneAnchor: SceneAnchor
  activeThreads: ThreadCard[]
  stateSlots: StateSlot[]
  entityCards: EntityCard[]
  relationEdges: RelationEdge[]
  relationNetwork: RelationNetworkEntry[]
  eventCards: EventCard[]
  archiveCards: ArchiveCard[]

  // ---- 编译状态 ----
  lastCompiledContext: CompiledContextSnapshot | null
  compileDebugLogs: CompileDebugEntry[]

  // ---- 游标 ----
  /** 最后一次成功的编译时间戳 */
  lastCompiledAt: number
  /** 最后一次从 store 同步的 turnIndex */
  lastSyncTurnIndex: number
}

// ---- 默认值 ----

export function createEmptyRuntime(): CompilerRuntimeState {
  return {
    version: 1,
    sceneAnchor: {
      location: '未知',
      time: '未知',
      weather: '晴朗',
      presentNpcIds: [],
    },
    activeThreads: [],
    stateSlots: [],
    entityCards: [],
    relationEdges: [],
    relationNetwork: [],
    eventCards: [],
    archiveCards: [],
    lastCompiledContext: null,
    compileDebugLogs: [],
    lastCompiledAt: 0,
    lastSyncTurnIndex: -1,
  }
}

// ============================================================
// 从 wandou Store 投影到运行时
// ============================================================

export interface StoreProjectionInput {
  worldTime: string
  location: { region: string; subRegion: string; detail: string }
  weather: string
  npcs: Array<{
    id: string
    name: string
    role: string
    personality: string
    appearance: string
    background?: string
    relationToPlayer?: string
    aliases?: string[]
    人物分类?: string
    enabled?: boolean
    favor?: number
    favorability?: number
    identityRevealed?: boolean
  }>
  inventory: Array<{ name: string; quantity: number; type: string; description?: string }>
  quests: Array<{
    id: string
    title: string
    questType?: string
    description: string
    status: string
    reward?: string
    source?: string
  }>
  memories: Array<{
    id: string
    fact: string
    category: string
    entities: string[]
    keywords: string[]
    importance: 1 | 2 | 3 | 4 | 5
    timeScope: string
    state: string
    turnIndex: number
  }>
  characterGold: number
  characterAttributes: Record<string, number>
  turnIndex: number
}

/**
 * 从 wandou 现有 Store 数据构建编译器运行时投影。
 * 这是「对 store 的只读视图」——不改 store，只做结构化重组。
 */
export function buildRuntimeFromStores(input: StoreProjectionInput): CompilerRuntimeState {
  const loc = [input.location.region, input.location.subRegion, input.location.detail]
    .filter(Boolean).join(' · ') || '未知'

  const presentNpcIds = input.npcs
    .filter(n => {
      const cat = n.人物分类 || (n.enabled !== false ? '在场' : '离场')
      return cat !== '离场'
    })
    .map(n => n.id)

  // ---- 场景锚点 ----
  const sceneAnchor: SceneAnchor = {
    location: loc,
    time: input.worldTime,
    weather: input.weather,
    presentNpcIds,
  }

  // ---- 活跃线程（任务） ----
  const activeThreads: ThreadCard[] = input.quests
    .filter(q => q.status === 'active')
    .map(q => ({
      id: q.id,
      title: q.title,
      summary: q.description.slice(0, 120),
      questType: q.questType || '支线',
      status: 'active' as const,
      source: q.source || 'unknown',
      updatedAt: input.turnIndex,
    }))

  // ---- 状态槽（金币/属性/背包关键物品） ----
  const stateSlots: StateSlot[] = [
    {
      id: 'state-gold',
      scopeId: 'player',
      scopeName: '玩家',
      slotType: '金币',
      value: input.characterGold,
      numericValue: input.characterGold,
      updatedAt: input.turnIndex,
    },
    ...Object.entries(input.characterAttributes).map(([k, v]) => ({
      id: `state-attr-${k}`,
      scopeId: 'player',
      scopeName: '玩家',
      slotType: k,
      value: v,
      numericValue: v,
      updatedAt: input.turnIndex,
    })),
    ...input.inventory.slice(0, 10).map(item => ({
      id: `state-item-${item.name}`,
      scopeId: 'player',
      scopeName: '玩家',
      slotType: '物品',
      value: `${item.name}×${item.quantity}`,
      numericValue: item.quantity,
      updatedAt: input.turnIndex,
    })),
  ]

  // ---- 实体卡（NPC） ----
  const entityCards: EntityCard[] = input.npcs.map(n => ({
    id: n.id,
    name: n.name,
    entityType: 'npc' as const,
    role: n.role || '',
    personality: n.personality || '',
    appearance: n.appearance || '',
    aliases: n.aliases || [],
    category: (n.人物分类 as '重点' | '在场' | '离场') || (n.enabled !== false ? '在场' : '离场'),
    tags: [
      ...(n.role ? [n.role] : []),
      ...(n.aliases || []),
      n.identityRevealed ? '身份已揭示' : '',
    ].filter(Boolean),
    updatedAt: input.turnIndex,
  }))

  // ---- 关系边（玩家→NPC 和 NPC→NPC） ----
  const relationEdges: RelationEdge[] = []
  const relationNetwork: RelationNetworkEntry[] = []

  for (const n of input.npcs) {
    if (n.人物分类 === '离场' && !n.enabled) continue

    const favor = n.favor ?? n.favorability ?? 0
    let relationType = '陌生'
    if (favor >= 60) relationType = '亲密'
    else if (favor >= 30) relationType = '友好'
    else if (favor >= 10) relationType = '熟人'
    else if (favor <= -30) relationType = '敌对'
    else if (favor <= -10) relationType = '冷淡'

    let strength = Math.abs(favor) / 100
    if (favor >= 50) strength = Math.min(1, 0.5 + favor / 200)

    const summary = n.relationToPlayer
      || (favor >= 60 ? `${n.name}与玩家关系亲密` :
          favor >= 30 ? `${n.name}与玩家友好` :
          favor <= -30 ? `${n.name}与玩家敌对` : '')

    relationEdges.push({
      id: `rel-player-${n.id}`,
      sourceId: 'player',
      sourceName: '玩家',
      targetId: n.id,
      targetName: n.name,
      relationType,
      favor,
      strength,
      summary,
      updatedAt: input.turnIndex,
    })

    relationNetwork.push({
      sourceId: 'player',
      targetId: n.id,
      type: relationType,
      strength,
      summary,
    })
  }

  // 为有共同标签/同一势力的 NPC 之间建立关系（启发式）
  for (let i = 0; i < entityCards.length; i++) {
    for (let j = i + 1; j < entityCards.length; j++) {
      const a = entityCards[i]
      const b = entityCards[j]
      const sharedTags = a.tags.filter(t => b.tags.includes(t) && t.length > 1)
      if (sharedTags.length > 0) {
        relationNetwork.push({
          sourceId: a.id,
          targetId: b.id,
          type: '同阵营',
          strength: 0.3 + sharedTags.length * 0.1,
          summary: `共同标签：${sharedTags.join('、')}`,
        })
      }
    }
  }

  // ---- 事件卡（近期记忆 — event/clue/task/status 类） ----
  const eventCategories = new Set(['event', 'clue', 'task', 'status', 'item', 'ability'])
  const eventCards: EventCard[] = input.memories
    .filter(m => eventCategories.has(m.category) && m.state !== 'expired')
    .sort((a, b) => b.turnIndex - a.turnIndex)
    .slice(0, 30)
    .map(m => ({
      id: m.id,
      title: m.fact.slice(0, 40),
      summary: m.fact,
      timeLabel: `第${m.turnIndex}轮`,
      importance: m.importance,
      category: m.category as EventCard['category'],
      entities: m.entities,
      keywords: m.keywords,
      state: m.state as 'active' | 'resolved' | 'expired',
      updatedAt: m.turnIndex,
    }))

  // ---- 档案卡（长程记忆 — location/faction/rule/relationship/character/world 类） ----
  const archiveCategories = new Set(['location', 'faction', 'rule', 'relationship', 'character', 'world'])
  const archiveCards: ArchiveCard[] = input.memories
    .filter(m => archiveCategories.has(m.category))
    .sort((a, b) => b.turnIndex - a.turnIndex)
    .slice(0, 30)
    .map(m => ({
      id: m.id,
      arcTitle: m.fact.slice(0, 40),
      summary: m.fact,
      excerpt: m.fact,
      keywords: m.keywords,
      entities: m.entities,
      timeSpan: m.timeScope === 'short' ? '短期' : m.timeScope === 'mid' ? '中期' : '长期',
      importance: m.importance,
      source: 'memory' as const,
      updatedAt: m.turnIndex,
    }))

  return {
    version: 1,
    sceneAnchor,
    activeThreads,
    stateSlots,
    entityCards,
    relationEdges,
    relationNetwork,
    eventCards,
    archiveCards,
    lastCompiledContext: null,
    compileDebugLogs: [],
    lastCompiledAt: 0,
    lastSyncTurnIndex: input.turnIndex,
  }
}

/** 计算两个运行时之间实体是否变化（缓存失效判断） */
export function hasSignificantChange(prev: CompilerRuntimeState, next: CompilerRuntimeState): boolean {
  if (prev.lastSyncTurnIndex !== next.lastSyncTurnIndex) return true
  if (prev.eventCards.length !== next.eventCards.length) return true
  if (prev.activeThreads.length !== next.activeThreads.length) return true
  // 场景锚点变化
  if (prev.sceneAnchor.location !== next.sceneAnchor.location) return true
  if (prev.sceneAnchor.time !== next.sceneAnchor.time) return true
  if (prev.sceneAnchor.weather !== next.sceneAnchor.weather) return true
  return false
}

/** 计算两次编译之间的 diff */
export function diffCompilations(
  prev: CompiledContextSnapshot | null,
  next: CompiledContextSnapshot,
): CompilationDiff {
  if (!prev) return { added: [], removed: [], changed: [] }

  const prevItems = new Map<string, { kind: string }>()
  for (const s of prev.sections) {
    prevItems.set(`${s.kind}`, { kind: s.kind })
  }

  const nextItems = new Map<string, { kind: string }>()
  for (const s of next.sections) {
    nextItems.set(`${s.kind}`, { kind: s.kind })
  }

  const added: { kind: string; id: string }[] = []
  const removed: { kind: string; id: string }[] = []

  for (const [key, val] of nextItems) {
    if (!prevItems.has(key)) added.push({ kind: val.kind, id: key })
  }
  for (const [key, val] of prevItems) {
    if (!nextItems.has(key)) removed.push({ kind: val.kind, id: key })
  }

  return { added, removed, changed: [] }
}
