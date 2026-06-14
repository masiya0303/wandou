// ============================================================
// wandou · 记忆编译器 v2
//
// 对标 yijiekkk compileNarrativePromptContext() + Advanced，
// 但架构更好：
//  - 全量 TypeScript
//  - 分区编译函数独立可测
//  - 多阶段编译（pre → gap → retrieve → re）
//  - 编译缓存 + diff 追踪
//  - Dry-run 模式（不修改运行时）
//  - 可插拔检索器接口
//  - 完整 debug 日志链
// ============================================================

import type { CompilerRuntimeState } from './compilerRuntime'
import {
  createEmptyRuntime,
  buildRuntimeFromStores,
  hasSignificantChange,
  diffCompilations,
  type StoreProjectionInput,
  type CompiledContextSnapshot,
  type CompileDebugEntry,
} from './compilerRuntime'

// ---- Re-export for consumers ----
export type {
  CompilerRuntimeState,
  CompiledContextSnapshot,
  CompileDebugEntry,
} from './compilerRuntime'
export { buildRuntimeFromStores, createEmptyRuntime } from './compilerRuntime'

// ============================================================
// 配置
// ============================================================

export interface CompilerConfig {
  totalBudget: number
  budgets: {
    scene: number
    threads: number
    states: number
    relations: number
    relationNetwork: number
    events: number
    entities: number
    archives: number
  }
  hotLimits: {
    threads: number
    states: number
    relations: number
    relationNetwork: number
    events: number
    entities: number
  }
  queryLimits: {
    threads: number
    states: number
    relations: number
    events: number
    entities: number
    archives: number
  }
  dedupeEnabled: boolean
  /** 编译缓存：相同 query + 无重大状态变化时复用 */
  cacheEnabled: boolean
  /** 最大 debug 日志条数 */
  maxDebugLogs: number
}

export const DEFAULT_COMPILER_CONFIG: CompilerConfig = {
  totalBudget: 1400,
  budgets: {
    scene: 80,
    threads: 180,
    states: 180,
    relations: 140,
    relationNetwork: 100,
    events: 240,
    entities: 200,
    archives: 140,
  },
  hotLimits: {
    threads: 5,
    states: 6,
    relations: 4,
    relationNetwork: 5,
    events: 4,
    entities: 5,
  },
  queryLimits: {
    threads: 8,
    states: 8,
    relations: 6,
    events: 10,
    entities: 8,
    archives: 6,
  },
  dedupeEnabled: true,
  cacheEnabled: true,
  maxDebugLogs: 200,
}

// ============================================================
// Token 估算（中文精确版）
// ============================================================

export function estimateTokens(text: string): number {
  if (!text) return 0
  let tokens = 0
  for (const ch of text) {
    const code = ch.charCodeAt(0)
    if (code >= 0x4e00 && code <= 0x9fff) tokens += 1       // CJK 基本
    else if (code >= 0x3400 && code <= 0x4dbf) tokens += 1   // CJK 扩展A
    else if (/[a-zA-Z0-9]/.test(ch)) tokens += 0.3
    else if (ch === '\n') tokens += 0.5
    else tokens += 0.2
  }
  return Math.max(1, Math.ceil(tokens))
}

// ============================================================
// 分词（中文混合）
// ============================================================

function tokenize(text: string): string[] {
  const cleaned = text
    .replace(/[，,。\.！!？?；;：:、\s]+/g, ' ')
    .toLowerCase()
    .trim()
  if (!cleaned) return []
  const tokens: string[] = []
  let buffer = ''
  for (const ch of cleaned) {
    if (/[a-z0-9]/.test(ch)) {
      buffer += ch
    } else if (/[一-鿿]/.test(ch)) {
      if (buffer) { tokens.push(buffer); buffer = '' }
      tokens.push(ch)
    } else {
      if (buffer) { tokens.push(buffer); buffer = '' }
    }
  }
  if (buffer) tokens.push(buffer)
  return tokens.filter(t => t.length >= 1)
}

// ============================================================
// 查询包
// ============================================================

export interface CompilerQuery {
  inputText: string
  keywords: string[]
  entityNames: string[]
  timeRelated: boolean
  needRelations: boolean
  needHistory: boolean
}

// ============================================================
// 编译器输入（分区数据）
// ============================================================

export interface CompilerInput {
  query: CompilerQuery
  runtime: CompilerRuntimeState
}

// ============================================================
// 编译器输出
// ============================================================

export interface CompiledSection {
  kind: string
  text: string
  tokens: number
  itemIds: string[]
  layer: 'hot' | 'query'
}

export interface CompilerOutput {
  compiledText: string
  sections: CompiledSection[]
  tokenEstimate: number
  meta: {
    includedMemoryIds: string[]
    includedNpcIds: string[]
    hotCoverageScore: number
    gaps: {
      entityGap: boolean
      timeGap: boolean
      relationGap: boolean
      historyGap: boolean
    }
    suggestedRecall: boolean
    droppedReasons: string[]
  }
}

// ============================================================
// 打分引擎
// ============================================================

interface ScoredItem<T> {
  item: T
  score: number
}

function scoreItems<T>(
  items: T[],
  query: CompilerQuery,
  opts: {
    getText: (item: T) => string
    getKeywords: (item: T) => string[]
    getEntities: (item: T) => string[]
    getImportance: (item: T) => number
    getRecency: (item: T) => number    // 0 = most recent
  },
): ScoredItem<T>[] {
  const queryTokens = new Set([
    ...tokenize(query.inputText),
    ...query.keywords.map(k => k.toLowerCase()),
    ...query.entityNames.map(e => e.toLowerCase()),
  ])

  return items
    .map(item => {
      let score = 0
      const text = opts.getText(item).toLowerCase()
      const kws = opts.getKeywords(item).map(k => k.toLowerCase())
      const entities = opts.getEntities(item).map(e => e.toLowerCase())

      for (const kw of kws) {
        if (queryTokens.has(kw)) { score += 10 }
        else {
          for (const qt of queryTokens) {
            if (kw.includes(qt) || qt.includes(kw)) { score += 4; break }
          }
        }
      }

      for (const e of entities) {
        if (queryTokens.has(e)) { score += 8 }
        else {
          for (const qt of queryTokens) {
            if (e.includes(qt) || qt.includes(e)) { score += 3; break }
          }
        }
      }

      const textTokens = tokenize(text)
      const matchCount = textTokens.filter(t => queryTokens.has(t)).length
      if (textTokens.length > 0) score += (matchCount / textTokens.length) * 15

      score += opts.getImportance(item) * 2

      const recency = opts.getRecency(item)
      if (recency >= 0) score += Math.max(0, 5 - recency * 0.05)

      return { item, score }
    })
    .filter(s => s.score >= 0)
    .sort((a, b) => b.score - a.score)
}

// ============================================================
// 分区编译函数
// ============================================================

function compileSceneSection(runtime: CompilerRuntimeState, budget: number): CompiledSection | null {
  const a = runtime.sceneAnchor
  const text = `📍 位置：${a.location} | 🕐 时间：${a.time} | 🌤️ 天气：${a.weather}`
  const tokens = estimateTokens(text)
  if (tokens > budget) return null
  return { kind: 'scene', text, tokens, itemIds: ['scene-anchor'], layer: 'hot' }
}

function compileStateSection(runtime: CompilerRuntimeState, budget: number): CompiledSection | null {
  const slots = runtime.stateSlots
  if (slots.length === 0) return null

  // 分组展示
  const byScope = new Map<string, { name: string; values: string[] }>()
  for (const s of slots) {
    if (!byScope.has(s.scopeId)) byScope.set(s.scopeId, { name: s.scopeName, values: [] })
    byScope.get(s.scopeId)!.values.push(`${s.slotType}:${s.value}`)
  }

  const lines: string[] = []
  for (const [, grp] of byScope) {
    const line = grp.values.join(' | ')
    lines.push(`- ${grp.name}：${line}`)
  }

  const text = `【当前状态】\n${lines.join('\n')}`
  const tokens = estimateTokens(text)
  if (tokens > budget) {
    // 逐行裁剪
    let acc = '【当前状态】\n'
    const kept: string[] = []
    for (const l of lines) {
      if (estimateTokens(acc + l + '\n') > budget) break
      kept.push(l)
      acc += l + '\n'
    }
    if (kept.length === 0) return null
    return {
      kind: 'states',
      text: `【当前状态】\n${kept.join('\n')}`,
      tokens: estimateTokens(acc),
      itemIds: ['state-snapshot'],
      layer: 'hot',
    }
  }

  return {
    kind: 'states',
    text,
    tokens,
    itemIds: ['state-snapshot'],
    layer: 'hot',
  }
}

function compileThreadSection(
  runtime: CompilerRuntimeState,
  query: CompilerQuery,
  hotLimit: number,
  queryLimit: number,
  budget: number,
): CompiledSection[] {
  const threads = runtime.activeThreads.filter(t => t.status === 'active')
  if (threads.length === 0) return []

  const scored = scoreItems(threads, query, {
    getText: t => `${t.title} ${t.summary}`,
    getKeywords: t => [t.title, t.questType],
    getEntities: t => [],
    getImportance: () => 3,
    getRecency: () => 0,
  })

  const sections: CompiledSection[] = []
  const total = Math.min(scored.length, hotLimit + queryLimit)
  const hot = scored.slice(0, Math.min(hotLimit, total))
  const queryItems = scored.slice(hotLimit, total)

  if (hot.length > 0) {
    const lines = hot.map((s, i) => {
      const t = s.item
      const src = t.source !== 'unknown' ? `（来源：${t.source}）` : ''
      return `- 🎯 ${t.title}${src}`
    })
    const text = `【活跃任务】\n${lines.join('\n')}`
    const tokens = estimateTokens(text)
    if (tokens <= budget) {
      sections.push({ kind: 'threads', text, tokens, itemIds: hot.map(s => s.item.id), layer: 'hot' })
    }
  }

  if (queryItems.length > 0) {
    const lines = queryItems.map(s => `- 🎯 ${s.item.title}`)
    const text = `【更多任务】\n${lines.join('\n')}`
    const tokens = estimateTokens(text)
    const queryBudget = Math.floor(budget * 0.4)
    if (tokens <= queryBudget) {
      sections.push({ kind: 'threads', text, tokens, itemIds: queryItems.map(s => s.item.id), layer: 'query' })
    }
  }

  return sections
}

function compileRelationSection(
  runtime: CompilerRuntimeState,
  query: CompilerQuery,
  hotLimit: number,
  queryLimit: number,
  budget: number,
): CompiledSection[] {
  const edges = runtime.relationEdges
  if (edges.length === 0) return []

  const scored = scoreItems(edges, query, {
    getText: e => `${e.targetName} ${e.relationType} ${e.summary}`,
    getKeywords: e => [e.targetName, e.relationType],
    getEntities: e => [e.targetName],
    getImportance: e => Math.ceil(e.strength * 5),
    getRecency: () => 0,
  })

  const sections: CompiledSection[] = []
  const total = Math.min(scored.length, hotLimit + queryLimit)
  const hot = scored.slice(0, Math.min(hotLimit, total))
  const queryItems = scored.slice(hotLimit, total)

  if (hot.length > 0) {
    const lines = hot.map(s => {
      const e = s.item
      const favorEmoji = e.favor >= 50 ? '❤️' : e.favor >= 20 ? '💛' : e.favor <= -20 ? '💔' : '🤍'
      return `- ${e.targetName} ${favorEmoji}${e.favor}（${e.relationType}）`
    })
    const text = `【NPC 关系】\n${lines.join('\n')}`
    const tokens = estimateTokens(text)
    if (tokens <= budget) {
      sections.push({ kind: 'relations', text, tokens, itemIds: hot.map(s => s.item.id), layer: 'hot' })
    }
  }

  if (queryItems.length > 0) {
    const lines = queryItems.map(s => {
      const e = s.item
      return `- ${e.targetName}（${e.relationType}）❤️${e.favor}`
    })
    const text = `【其他NPC关系】\n${lines.join('\n')}`
    const tokens = estimateTokens(text)
    if (tokens <= Math.floor(budget * 0.4)) {
      sections.push({ kind: 'relations', text, tokens, itemIds: queryItems.map(s => s.item.id), layer: 'query' })
    }
  }

  return sections
}

function compileRelationNetworkSection(
  runtime: CompilerRuntimeState,
  query: CompilerQuery,
  hotLimit: number,
  budget: number,
): CompiledSection | null {
  const net = runtime.relationNetwork
  if (net.length === 0) return null

  // 按 query 中的 entityNames 筛选相关关系
  const relevant = net.filter(e =>
    query.entityNames.some(name =>
      e.sourceId.includes(name) || e.targetId.includes(name) ||
      (runtime.entityCards.find(c => c.id === e.sourceId)?.name || '').includes(name) ||
      (runtime.entityCards.find(c => c.id === e.targetId)?.name || '').includes(name)
    )
  )

  const source = relevant.length > 0 ? relevant : net
  const top = source.slice(0, hotLimit)

  const lines = top.map(e => {
    const srcName = e.sourceId === 'player' ? '玩家' :
      runtime.entityCards.find(c => c.id === e.sourceId)?.name || e.sourceId
    const tgtName = runtime.entityCards.find(c => c.id === e.targetId)?.name || e.targetId
    const strengthBar = '█'.repeat(Math.ceil(e.strength * 5))
    return `- ${srcName} → ${tgtName}：${e.type} ${strengthBar}`
  })

  const text = `【人物关系网】\n${lines.join('\n')}`
  const tokens = estimateTokens(text)
  if (tokens > budget) return null

  return {
    kind: 'relationNetwork',
    text,
    tokens,
    itemIds: top.map(e => `${e.sourceId}→${e.targetId}`),
    layer: 'hot',
  }
}

function compileEventSection(
  runtime: CompilerRuntimeState,
  query: CompilerQuery,
  hotLimit: number,
  queryLimit: number,
  budget: number,
): CompiledSection[] {
  const events = runtime.eventCards.filter(e => e.state !== 'expired')
  if (events.length === 0) return []

  const scored = scoreItems(events, query, {
    getText: e => `${e.title} ${e.summary}`,
    getKeywords: e => e.keywords,
    getEntities: e => e.entities,
    getImportance: e => e.importance,
    getRecency: e => Math.max(0, runtime.activeThreads.length + runtime.eventCards.length - e.updatedAt),
  })

  const sections: CompiledSection[] = []
  const total = Math.min(scored.length, hotLimit + queryLimit)
  const hot = scored.slice(0, Math.min(hotLimit, total))
  const queryItems = scored.slice(hotLimit, total)

  if (hot.length > 0) {
    const lines = hot.map(s => {
      const e = s.item
      const timeLabel = e.timeLabel ? ` [${e.timeLabel}]` : ''
      return `- ⭐${e.importance} ${e.summary}${timeLabel}`
    })
    const text = `【近期事件与线索】\n${lines.join('\n')}`
    const tokens = estimateTokens(text)
    if (tokens <= budget) {
      sections.push({ kind: 'events', text, tokens, itemIds: hot.map(s => s.item.id), layer: 'hot' })
    }
  }

  if (queryItems.length > 0) {
    const lines = queryItems.map(s => `- ${s.item.summary}`)
    const text = `【查询相关事件】\n${lines.join('\n')}`
    const tokens = estimateTokens(text)
    if (tokens <= Math.floor(budget * 0.5)) {
      sections.push({ kind: 'events', text, tokens, itemIds: queryItems.map(s => s.item.id), layer: 'query' })
    }
  }

  return sections
}

function compileEntitySection(
  runtime: CompilerRuntimeState,
  query: CompilerQuery,
  hotLimit: number,
  queryLimit: number,
  budget: number,
): CompiledSection[] {
  const active = runtime.entityCards.filter(c => c.category !== '离场')
  if (active.length === 0) return []

  const scored = scoreItems(active, query, {
    getText: c => `${c.name} ${c.role} ${c.personality}`,
    getKeywords: c => [c.name, ...c.aliases, ...c.tags],
    getEntities: c => [c.name],
    getImportance: c => c.category === '重点' ? 5 : 3,
    getRecency: () => 0,
  })

  const total = Math.min(scored.length, hotLimit + queryLimit)
  const top = scored.slice(0, total)

  const lines = top.map(s => {
    const c = s.item
    const parts: string[] = [`**${c.name}**`]
    if (c.role) parts.push(`身份：${c.role}`)
    if (c.personality) parts.push(`性格：${c.personality.slice(0, 50)}`)
    if (c.appearance) parts.push(`外貌：${c.appearance.slice(0, 30)}`)
    return parts.join(' | ')
  })

  const text = `【NPC 详情】\n${lines.map(l => `- ${l}`).join('\n')}`
  const tokens = estimateTokens(text)

  if (tokens > budget) {
    // 裁剪到预算
    let acc = '【NPC 详情】\n'
    const kept: string[] = []
    for (const l of lines) {
      if (estimateTokens(acc + `- ${l}\n`) > budget) break
      kept.push(l)
      acc += `- ${l}\n`
    }
    if (kept.length === 0) return []
    return [{
      kind: 'entities',
      text: `【NPC 详情】\n${kept.map(l => `- ${l}`).join('\n')}`,
      tokens: estimateTokens(acc),
      itemIds: scored.slice(0, kept.length).map(s => s.item.id),
      layer: kept.length <= hotLimit ? 'hot' : 'query',
    }]
  }

  return [{
    kind: 'entities',
    text,
    tokens,
    itemIds: top.map(s => s.item.id),
    layer: total <= hotLimit ? 'hot' : 'query',
  }]
}

function compileArchiveSection(
  runtime: CompilerRuntimeState,
  query: CompilerQuery,
  limit: number,
  budget: number,
): CompiledSection | null {
  const archives = runtime.archiveCards
  if (archives.length === 0) return null

  const scored = scoreItems(archives, query, {
    getText: a => `${a.arcTitle} ${a.summary}`,
    getKeywords: a => a.keywords,
    getEntities: a => a.entities,
    getImportance: a => a.importance,
    getRecency: a => Math.max(0, 100 - a.updatedAt),
  })

  const top = scored.slice(0, limit)
  if (top.length === 0) return null

  const lines = top.map(s => {
    const a = s.item
    return `- [${a.timeSpan}] ${a.summary}`
  })

  let text = `【历史参考】\n${lines.join('\n')}`
  let tokens = estimateTokens(text)

  if (tokens > budget) {
    let acc = '【历史参考】\n'
    const kept: string[] = []
    for (const l of lines) {
      if (estimateTokens(acc + l + '\n') > budget) break
      kept.push(l)
      acc += l + '\n'
    }
    if (kept.length === 0) return null
    text = `【历史参考】\n${kept.join('\n')}`
    tokens = estimateTokens(text)
  }

  return {
    kind: 'archives',
    text,
    tokens,
    itemIds: top.slice(0, lines.indexOf(lines[lines.length - 1]) + 1).map(s => s.item.id),
    layer: 'query',
  }
}

// ============================================================
// 去重
// ============================================================

function dedupeSections(sections: CompiledSection[]): CompiledSection[] {
  const seen = new Set<string>()
  return sections.filter(s => {
    const normalized = s.text.replace(/\s+/g, '')
    const key = `${s.kind}:${normalized.slice(0, 60)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// ============================================================
// 可插拔检索器接口
// ============================================================

export interface RetrieverResult {
  id: string
  text: string
  keywords: string[]
  entities: string[]
  importance: number
  source: 'keyword' | 'vector' | 'graph'
  score: number
}

export interface Retriever {
  name: string
  /** 检索相关条目 */
  retrieve(query: string, topK: number): Promise<RetrieverResult[]>
}

/** 关键词检索器（纯本地，始终可用） */
export function createKeywordRetriever(runtime: CompilerRuntimeState): Retriever {
  return {
    name: 'keyword',
    async retrieve(queryText: string, topK: number): Promise<RetrieverResult[]> {
      const queryTokens = tokenize(queryText)
      const queryTextLower = queryText.toLowerCase()
      const results: RetrieverResult[] = []

      // 从事件卡 + 档案卡检索
      for (const card of [...runtime.eventCards, ...runtime.archiveCards]) {
        let score = 0
        for (const kw of card.keywords) {
          const kwLower = kw.toLowerCase()
          // 精确命中
          if (queryTokens.includes(kwLower)) { score += 3; continue }
          // 部分命中（中文分词粒度不一致时的回退）
          if (queryTextLower.includes(kwLower) || kwLower.includes(queryTextLower)) { score += 2; continue }
          // 逐 token 命中
          for (const qt of queryTokens) {
            if (qt.length >= 2 && (kwLower.includes(qt) || qt.includes(kwLower))) { score += 1; break }
          }
        }
        for (const e of card.entities) {
          const eLower = e.toLowerCase()
          if (queryTokens.includes(eLower)) { score += 2; continue }
          if (queryTextLower.includes(eLower)) { score += 1 }
        }
        if (score > 0) {
          results.push({
            id: card.id,
            text: card.summary || (card as any).excerpt || '',
            keywords: card.keywords,
            entities: card.entities,
            importance: card.importance,
            source: 'keyword',
            score,
          })
        }
      }

      return results
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
    },
  }
}

/** 组合检索器：先本地关键词，再可选向量检索 */
export function createHybridRetriever(
  runtime: CompilerRuntimeState,
  vectorRetriever?: Retriever,
): Retriever {
  const keyword = createKeywordRetriever(runtime)
  return {
    name: 'hybrid',
    async retrieve(queryText: string, topK: number): Promise<RetrieverResult[]> {
      const kwResults = await keyword.retrieve(queryText, topK)
      if (!vectorRetriever || kwResults.length >= topK) return kwResults

      // 补充向量检索
      const remaining = topK - kwResults.length
      const vecResults = await vectorRetriever.retrieve(queryText, remaining)
      const kwIds = new Set(kwResults.map(r => r.id))
      return [...kwResults, ...vecResults.filter(r => !kwIds.has(r.id))]
    },
  }
}

// ============================================================
// 编译缓存
// ============================================================

interface CacheEntry {
  queryKey: string
  output: CompilerOutput
  snapshot: CompiledContextSnapshot
  timestamp: number
}

let _compileCache: CacheEntry | null = null
const CACHE_TTL = 60000 // 1分钟

function buildQueryKey(query: CompilerQuery): string {
  return [
    query.inputText.slice(0, 80),
    ...query.keywords.slice(0, 6),
    ...query.entityNames.slice(0, 6),
    query.timeRelated ? 't' : '',
    query.needRelations ? 'r' : '',
    query.needHistory ? 'h' : '',
  ].join('|')
}

function checkCache(query: CompilerQuery, runtime: CompilerRuntimeState): CompilerOutput | null {
  if (!_compileCache) return null
  if (Date.now() - _compileCache.timestamp > CACHE_TTL) { _compileCache = null; return null }
  if (_compileCache.queryKey !== buildQueryKey(query)) return null
  return _compileCache.output
}

function writeCache(query: CompilerQuery, output: CompilerOutput, snapshot: CompiledContextSnapshot) {
  _compileCache = {
    queryKey: buildQueryKey(query),
    output,
    snapshot,
    timestamp: Date.now(),
  }
}

// ============================================================
// 主编译函数（同步，单阶段）
// ============================================================

export function compileContext(
  input: CompilerInput,
  config: CompilerConfig = DEFAULT_COMPILER_CONFIG,
): CompilerOutput {
  const { runtime, query } = input
  const { budgets, hotLimits, queryLimits, totalBudget } = config

  // 缓存检查
  if (config.cacheEnabled) {
    const cached = checkCache(query, runtime)
    if (cached) return cached
  }

  const sections: CompiledSection[] = []
  let totalTokens = 0
  const droppedReasons: string[] = []

  // 1. 场景锚点
  const scene = compileSceneSection(runtime, budgets.scene)
  if (scene) { sections.push(scene); totalTokens += scene.tokens }
  else droppedReasons.push('scene_over_budget')

  // 2. 玩家状态
  const state = compileStateSection(runtime, budgets.states)
  if (state && totalTokens + state.tokens <= totalBudget) {
    sections.push(state); totalTokens += state.tokens
  }

  // 3. NPC 关系
  for (const rs of compileRelationSection(runtime, query, hotLimits.relations, queryLimits.relations, budgets.relations)) {
    if (totalTokens + rs.tokens > totalBudget) { droppedReasons.push('relations_over_budget'); break }
    sections.push(rs); totalTokens += rs.tokens
  }

  // 4. 关系网络
  const net = compileRelationNetworkSection(runtime, query, hotLimits.relationNetwork, budgets.relationNetwork)
  if (net && totalTokens + net.tokens <= totalBudget) {
    sections.push(net); totalTokens += net.tokens
  }

  // 5. NPC 实体详情
  for (const es of compileEntitySection(runtime, query, hotLimits.entities, queryLimits.entities, budgets.entities)) {
    if (totalTokens + es.tokens > totalBudget) { droppedReasons.push('entities_over_budget'); break }
    sections.push(es); totalTokens += es.tokens
  }

  // 6. 活跃任务
  for (const ts of compileThreadSection(runtime, query, hotLimits.threads, queryLimits.threads, budgets.threads)) {
    if (totalTokens + ts.tokens > totalBudget) { droppedReasons.push('threads_over_budget'); break }
    sections.push(ts); totalTokens += ts.tokens
  }

  // 7. 近期事件
  for (const es of compileEventSection(runtime, query, hotLimits.events, queryLimits.events, budgets.events)) {
    if (totalTokens + es.tokens > totalBudget) { droppedReasons.push('events_over_budget'); break }
    sections.push(es); totalTokens += es.tokens
  }

  // 8. 历史档案（最低优先级）
  const remaining = Math.min(budgets.archives, totalBudget - totalTokens)
  if (remaining > 40) {
    const arc = compileArchiveSection(runtime, query, queryLimits.archives, remaining)
    if (arc && totalTokens + arc.tokens <= totalBudget) {
      sections.push(arc); totalTokens += arc.tokens
    }
  } else {
    droppedReasons.push('archives_insufficient_budget')
  }

  // 去重
  const finalSections = config.dedupeEnabled ? dedupeSections(sections) : sections

  // 组装
  const compiledText = finalSections.map(s => s.text).join('\n\n').trim()

  // 空缺检测
  const includedNpcIds = finalSections
    .filter(s => s.kind === 'relations' || s.kind === 'entities' || s.kind === 'relationNetwork')
    .flatMap(s => s.itemIds)
  const includedMemoryIds = finalSections
    .filter(s => s.kind === 'events' || s.kind === 'archives')
    .flatMap(s => s.itemIds)
  const hotCoverageScore = finalSections.filter(s => s.layer === 'hot').reduce((sum, s) => sum + s.itemIds.length, 0)
  const hasEntities = includedNpcIds.length > 0
  const hasEvents = includedMemoryIds.length > 0

  const gaps = {
    entityGap: query.entityNames.length > 0 && !hasEntities,
    timeGap: query.timeRelated && !hasEvents,
    relationGap: query.needRelations && includedNpcIds.length === 0,
    historyGap: query.needHistory && includedMemoryIds.length === 0,
  }

  const suggestedRecall =
    hotCoverageScore <= 4 || gaps.entityGap || gaps.timeGap || gaps.relationGap || gaps.historyGap

  const output: CompilerOutput = {
    compiledText,
    sections: finalSections,
    tokenEstimate: estimateTokens(compiledText),
    meta: { includedMemoryIds, includedNpcIds, hotCoverageScore, gaps, suggestedRecall, droppedReasons },
  }

  // 写入缓存
  if (config.cacheEnabled) {
    writeCache(query, output, buildSnapshot(query.inputText, output, gaps, suggestedRecall, droppedReasons))
  }

  return output
}

// ============================================================
// Dry-run 模式：编译但不写缓存、不写运行时
// ============================================================

export function compileContextDry(
  input: CompilerInput,
  config: CompilerConfig = DEFAULT_COMPILER_CONFIG,
): CompilerOutput & { wouldReplaceCache: boolean } {
  const prevCache = _compileCache
  const result = compileContext(input, { ...config, cacheEnabled: false })
  _compileCache = prevCache // 恢复缓存
  return {
    ...result,
    wouldReplaceCache: prevCache?.queryKey !== buildQueryKey(input.query),
  }
}

// ============================================================
// 高级多阶段编译（异步）
// ============================================================

export interface AdvancedCompileOptions {
  config?: CompilerConfig
  retriever?: Retriever
  /** 写入 debug 日志的回调 */
  onDebug?: (entry: CompileDebugEntry) => void
  /** 是否启用第二阶段检索 */
  enableRetrieval: boolean
}

export interface AdvancedCompileResult {
  output: CompilerOutput
  snapshot: CompiledContextSnapshot
  debugLogs: CompileDebugEntry[]
  /** 是否经过了检索阶段 */
  retrievalTriggered: boolean
  /** 检索补充的条目数 */
  retrievedCount: number
}

function buildSnapshot(
  queryText: string,
  output: CompilerOutput,
  gaps: CompilerOutput['meta']['gaps'],
  suggestedRecall: boolean,
  droppedReasons: string[],
): CompiledContextSnapshot {
  return {
    compiledAt: Date.now(),
    queryText,
    compiledText: output.compiledText,
    sections: output.sections.map(s => ({ kind: s.kind, itemCount: s.itemIds.length, layer: s.layer })),
    tokenEstimate: output.tokenEstimate,
    gaps,
    suggestedRecall,
    droppedReasons,
  }
}

/**
 * 高级异步编译：
 *   Stage 1: pre-compile（检测空缺）
 *   Stage 2: 如果有空缺 + 有检索器 → 触发检索 → 将结果注入运行时
 *   Stage 3: re-compile（用补充后的运行时）
 *
 * 对标 yijiekkk compileNarrativePromptContextAdvanced()
 */
export async function compileContextAdvanced(
  input: CompilerInput,
  opts: AdvancedCompileOptions,
): Promise<AdvancedCompileResult> {
  const config = opts.config || DEFAULT_COMPILER_CONFIG
  const debugLogs: CompileDebugEntry[] = []
  const runtime = input.runtime

  function pushDebug(
    stage: CompileDebugEntry['stage'],
    message: string,
    output?: CompilerOutput,
  ) {
    const entry: CompileDebugEntry = {
      timestamp: Date.now(),
      stage,
      tokenEstimate: output?.tokenEstimate || 0,
      sectionCounts: output ? Object.fromEntries(output.sections.map(s => [s.kind, s.itemIds.length])) : {},
      gaps: output?.meta.gaps || { entityGap: false, timeGap: false, relationGap: false, historyGap: false },
      suggestedRecall: output?.meta.suggestedRecall || false,
      message,
    }
    debugLogs.push(entry)
    opts.onDebug?.(entry)
  }

  // === Stage 1: Pre-compile ===
  const stage1 = compileContext(input, { ...config, cacheEnabled: false })
  pushDebug('pre_compile', `预编译完成：${stage1.sections.length}区 ~${stage1.tokenEstimate}tk`, stage1)

  let retrievalTriggered = false
  let retrievedCount = 0
  let finalOutput = stage1

  // === Stage 2: Retrieve if gaps exist ===
  if (opts.enableRetrieval && stage1.meta.suggestedRecall && opts.retriever) {
    retrievalTriggered = true

    // 构建检索查询：合并用户输入 + 空缺维度关键词
    const gapHints: string[] = []
    if (stage1.meta.gaps.entityGap) gapHints.push(...input.query.entityNames)
    if (stage1.meta.gaps.timeGap) gapHints.push('时间', '日期', '发生')
    if (stage1.meta.gaps.relationGap) gapHints.push('关系', '认识', '联系')
    if (stage1.meta.gaps.historyGap) gapHints.push('历史', '过去', '之前')

    const retrievalQuery = [input.query.inputText, ...gapHints].join(' ')

    try {
      const results = await opts.retriever.retrieve(retrievalQuery, 8)
      retrievedCount = results.length

      if (results.length > 0) {
        // 将检索结果注入运行时（临时扩展档案卡）
        const augmentedRuntime: CompilerRuntimeState = {
          ...runtime,
          archiveCards: [
            ...runtime.archiveCards,
            ...results
              .filter(r => !runtime.archiveCards.some(a => a.id === r.id))
              .map(r => ({
                id: r.id,
                arcTitle: r.text.slice(0, 40),
                summary: r.text,
                excerpt: r.text,
                keywords: r.keywords,
                entities: r.entities,
                timeSpan: '检索补充',
                importance: Math.max(1, Math.min(5, Math.ceil(r.score / 3))) as 1 | 2 | 3 | 4 | 5,
                source: r.source === 'vector' ? 'vector_retrieval' as const : 'memory' as const,
                updatedAt: Date.now(),
              })),
          ],
        }

        pushDebug('retrieve', `检索到 ${results.length} 条补充记忆，重新编译`, undefined)

        // === Stage 3: Re-compile with augmented runtime ===
        finalOutput = compileContext(
          { ...input, runtime: augmentedRuntime },
          { ...config, cacheEnabled: false },
        )
        pushDebug('re_compile', `重新编译完成：${finalOutput.sections.length}区 ~${finalOutput.tokenEstimate}tk`, finalOutput)
      } else {
        pushDebug('retrieve', '检索无补充结果，保持预编译输出', undefined)
      }
    } catch (e: any) {
      pushDebug('retrieve', `检索失败：${e.message}，保持预编译输出`, undefined)
    }
  }

  pushDebug('final', `最终输出：${finalOutput.sections.length}区 ~${finalOutput.tokenEstimate}tk`, finalOutput)

  // 构建快照
  const prevSnapshot = runtime.lastCompiledContext
  const snapshot = buildSnapshot(
    input.query.inputText,
    finalOutput,
    finalOutput.meta.gaps,
    finalOutput.meta.suggestedRecall,
    finalOutput.meta.droppedReasons,
  )
  snapshot.diff = prevSnapshot ? diffCompilations(prevSnapshot, snapshot) : undefined

  return {
    output: finalOutput,
    snapshot,
    debugLogs,
    retrievalTriggered,
    retrievedCount,
  }
}

// ============================================================
// 兼容旧 API
// ============================================================

/**
 * @deprecated 使用 compileContext({ runtime, query }, config) 替代。
 * 这个接口为兼容旧 contextBuilder 保留。
 */
export function compileContextLegacy(opts: {
  userInput: string
  runtime: CompilerRuntimeState
  config?: CompilerConfig
}): CompilerOutput {
  const tokens = tokenize(opts.userInput)
  const query: CompilerQuery = {
    inputText: opts.userInput,
    keywords: tokens.filter(t => t.length >= 2).slice(0, 10),
    entityNames: [],
    timeRelated: /时间|现在|几点|日期|天|年|月|日|刚才|之后/.test(opts.userInput),
    needRelations: /关系|好感|认识|朋友|敌人|同盟/.test(opts.userInput),
    needHistory: /之前|历史|过去|以前|曾经|回忆/.test(opts.userInput),
  }
  return compileContext({ query, runtime: opts.runtime }, opts.config)
}
