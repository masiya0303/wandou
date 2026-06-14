// ============================================================
// wandou · 记忆运行时 (MemoryRuntime) v1
//
// 对标 yijiekkk useMemorySystem 的核心运行时，但：
// - IndexedDB 持久化（突破 localStorage 5MB 限制）
// - 完整的卡片生命周期（ingest → active → resolved → archived）
// - 检查点系统（自动保存 + 手动保存 + 回退）
// - 摘要管理系统（回退时自动修复）
// - 与编译器运行时无缝集成
// ============================================================

import type { MemoryEntry, MemoryCategory } from '@/types/state'
import type { GameMessage } from '@/types/game'
import type { ApiConfig } from '@/types/game'
import { chatStream } from '@/utils/api'
import type {
  CompilerRuntimeState,
  SceneAnchor,
  ThreadCard,
  StateSlot,
  EntityCard,
  RelationEdge,
  RelationNetworkEntry,
  EventCard,
  ArchiveCard,
  CompiledContextSnapshot,
} from './compilerRuntime'
import { buildRuntimeFromStores, createEmptyRuntime, type StoreProjectionInput } from './compilerRuntime'

// ============================================================
// 配置
// ============================================================

export interface MemoryRuntimeConfig {
  /** 数据库名称 */
  dbName: string
  /** 是否启用 IndexedDB 持久化 */
  persistenceEnabled: boolean
  /** 摄入管道 */
  ingest: {
    /** 触发时机 */
    trigger: 'post_assistant_turn'
    /** 最小批量轮数 */
    minBatchTurns: number
    /** 最大批量轮数 */
    maxBatchTurns: number
    /** 最小写入分数 */
    minWriteScore: number
    /** 去重窗口（轮数） */
    dedupeWindow: number
    /** 每次最多提取条数 */
    maxExtractPerBatch: number
    /** 重试次数 */
    retryCount: number
    /** 重试延迟 ms */
    retryDelayMs: number
  }
  /** 生命周期 */
  lifecycle: {
    /** 短期记忆过期轮数 */
    shortExpiryTurns: number
    /** 中期记忆过期轮数 */
    midExpiryTurns: number
    /** 长期记忆过期轮数（-1 = 不过期） */
    longExpiryTurns: number
    /** 最大活跃事件卡数 */
    maxHotEventCards: number
    /** 最大活跃线程数 */
    maxActiveThreads: number
    /** 检查点间隔（轮数） */
    checkpointInterval: number
    /** 自动归档：事件卡冷化后移入档案 */
    autoArchiveAfterTurns: number
  }
  /** 调试 */
  debug: {
    enabled: boolean
    maxLogs: number
  }
}

export const DEFAULT_MEMORY_RUNTIME_CONFIG: MemoryRuntimeConfig = {
  dbName: 'wandou_memory',
  persistenceEnabled: true,
  ingest: {
    trigger: 'post_assistant_turn',
    minBatchTurns: 1,
    maxBatchTurns: 4,
    minWriteScore: 0.45,
    dedupeWindow: 24,
    maxExtractPerBatch: 8,
    retryCount: 2,
    retryDelayMs: 1200,
  },
  lifecycle: {
    shortExpiryTurns: 12,
    midExpiryTurns: 30,
    longExpiryTurns: 120,
    maxHotEventCards: 200,
    maxActiveThreads: 30,
    checkpointInterval: 12,
    autoArchiveAfterTurns: 20,
  },
  debug: {
    enabled: true,
    maxLogs: 200,
  },
}

// ============================================================
// IndexedDB 持久化后端
// ============================================================

interface DBSchema {
  checkpoints: {
    key: string        // `${worldId}_${checkpointId}`
    value: CheckpointRecord
    indexes: { worldId: string; turnIndex: number }
  }
  summaries: {
    key: string        // `${worldId}_summary`
    value: SummaryRecord
  }
  eventCards: {
    key: string        // card id
    value: PersistedEventCard
    indexes: { worldId: string; turnIndex: number }
  }
  archiveCards: {
    key: string
    value: PersistedArchiveCard
    indexes: { worldId: string; turnIndex: number }
  }
}

interface CheckpointRecord {
  id: string
  worldId: string
  turnIndex: number
  createdAt: number
  /** 编译运行时快照 */
  runtimeSnapshot: string  // JSON
  /** 消息数组（用于回退时重建） */
  messageSnapshot: string  // JSON
  /** 记忆条目快照 */
  memorySnapshot: string   // JSON
  label?: string
}

interface SummaryRecord {
  worldId: string
  turnIndex: number
  text: string
  updatedAt: number
  /** 对应的消息索引（用于回退裁剪） */
  messageIndex: number
}

interface PersistedEventCard {
  id: string
  worldId: string
  title: string
  summary: string
  timeLabel: string
  importance: number
  category: string
  entities: string[]
  keywords: string[]
  state: string
  turnIndex: number
  archived: boolean
  archivedAt?: number
}

interface PersistedArchiveCard {
  id: string
  worldId: string
  arcTitle: string
  summary: string
  excerpt: string
  keywords: string[]
  entities: string[]
  timeSpan: string
  importance: number
  source: string
  turnIndex: number
}

function openDB(dbName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('checkpoints')) {
        const store = db.createObjectStore('checkpoints', { keyPath: 'id' })
        store.createIndex('worldId', 'worldId', { unique: false })
        store.createIndex('turnIndex', 'turnIndex', { unique: false })
      }
      if (!db.objectStoreNames.contains('summaries')) {
        db.createObjectStore('summaries', { keyPath: 'worldId' })
      }
      if (!db.objectStoreNames.contains('eventCards')) {
        const store = db.createObjectStore('eventCards', { keyPath: 'id' })
        store.createIndex('worldId', 'worldId', { unique: false })
        store.createIndex('turnIndex', 'turnIndex', { unique: false })
      }
      if (!db.objectStoreNames.contains('archiveCards')) {
        const store = db.createObjectStore('archiveCards', { keyPath: 'id' })
        store.createIndex('worldId', 'worldId', { unique: false })
        store.createIndex('turnIndex', 'turnIndex', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function idbPut(db: IDBDatabase, store: string, value: any): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    tx.objectStore(store).put(value)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

function idbGet<T>(db: IDBDatabase, store: string, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly')
    const req = tx.objectStore(store).get(key)
    req.onsuccess = () => resolve(req.result as T)
    req.onerror = () => reject(req.error)
  })
}

function idbGetAll<T>(db: IDBDatabase, store: string, index?: string, value?: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly')
    const objStore = tx.objectStore(store)
    const req = index && value ? objStore.index(index).getAll(value) : objStore.getAll()
    req.onsuccess = () => resolve(req.result as T[])
    req.onerror = () => reject(req.error)
  })
}

function idbDelete(db: IDBDatabase, store: string, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    tx.objectStore(store).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

function idbClear(db: IDBDatabase, store: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    tx.objectStore(store).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

// ============================================================
// 中文分词（与编译器一致）
// ============================================================

function tokenize(text: string): string[] {
  const cleaned = text.replace(/[，,。\.！!？?；;：:、\s]+/g, ' ').toLowerCase().trim()
  if (!cleaned) return []
  const tokens: string[] = []
  let buffer = ''
  for (const ch of cleaned) {
    if (/[a-z0-9]/.test(ch)) { buffer += ch }
    else if (/[一-鿿]/.test(ch)) { if (buffer) { tokens.push(buffer); buffer = '' } tokens.push(ch) }
    else { if (buffer) { tokens.push(buffer); buffer = '' } }
  }
  if (buffer) tokens.push(buffer)
  return tokens.filter(t => t.length >= 1)
}

function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1
  const setA = new Set(a)
  const setB = new Set(b)
  let intersection = 0
  for (const t of setA) { if (setB.has(t)) intersection++ }
  const union = new Set([...setA, ...setB]).size
  return union === 0 ? 0 : intersection / union
}

// ============================================================
// 摄入引擎 — AI 文本 → 记忆卡片
// ============================================================

const INGEST_SYSTEM_PROMPT = `你是游戏记忆提取器。从故事文本中提取有长期价值的客观事实。

【8 类可提取分类】
1. event：已发生的剧情事件、剧情节点
2. clue：线索、证据、密码、条件、情报
3. task：任务、委托、承诺、交易、契约
4. status：状态变化（伤势、诅咒、封印、增益等）
5. item：获得/失去的关键物品、装备
6. ability：技能解锁、能力提升、资格获取
7. character：角色身份、立场、设定确认
8. relationship：人物关系变化

【不要提取】
- 日常寒暄、无意义闲聊、纯氛围描写
- 未确定的主观推断、心理描写
- 已消耗的普通补给、一次性细枝末节
- 性格/外貌细节（已有 NPC 系统管理）

【格式】
输出 JSON 数组，每个元素：
{"fact":"一句话客观描述","category":"分类","entities":["关联实体"],"keywords":["检索关键词"],"importance":1-5,"timeScope":"short|mid|long"}

importance: 5=极重要（主线转折、角色死亡、重大揭示）→ 1=仅参考
timeScope: short=短期有效(几轮) mid=中期有效(几十轮) long=长期有效

无有价值内容输出 []`

export async function ingestMemories(
  storyText: string,
  apiConfig: ApiConfig,
  _config: MemoryRuntimeConfig = DEFAULT_MEMORY_RUNTIME_CONFIG,
): Promise<MemoryEntry[]> {
  if (!apiConfig.apiKey || !storyText.trim()) return []

  const messages: Array<{ role: string; content: string }> = [
    { role: 'user', content: storyText.slice(0, 4000) },
  ]

  try {
    const raw = await chatStream(apiConfig, INGEST_SYSTEM_PROMPT, messages, () => {}, undefined, 1)

    let parsed: any[] | null = null
    const trimmed = raw.trim()
    try { parsed = JSON.parse(trimmed) } catch {
      const fenceRe = /```(?:json)?\s*([\s\S]*?)\s*```/
      const fm = fenceRe.exec(trimmed)
      try { parsed = JSON.parse(fm ? fm[1].trim() : trimmed) } catch { /* skip */ }
    }

    if (!parsed || !Array.isArray(parsed)) return []

    const now = Date.now()
    const entries: MemoryEntry[] = []

    for (let i = 0; i < Math.min(parsed.length, 10); i++) {
      const item = parsed[i]
      if (!item?.fact || typeof item.fact !== 'string') continue

      const cat = String(item.category || 'event').toLowerCase().trim()
      const validCats = new Set(['event', 'clue', 'task', 'status', 'item', 'ability', 'character', 'relationship'])
      const category: MemoryCategory = validCats.has(cat) ? (cat as MemoryCategory) : 'event'

      entries.push({
        id: `ingest-${now}-${i}-${Math.random().toString(36).slice(2, 6)}`,
        fact: item.fact.trim(),
        category,
        entities: Array.isArray(item.entities) ? item.entities.map(String) : [],
        keywords: Array.isArray(item.keywords) ? item.keywords.map(String) : [],
        importance: Math.max(1, Math.min(5, Number(item.importance) || 3)) as 1 | 2 | 3 | 4 | 5,
        timeScope: ['short', 'mid', 'long'].includes(item.timeScope) ? item.timeScope : 'mid',
        state: 'active',
        createdAt: now,
        turnIndex: 0, // 由调用方填入
      })
    }

    return entries
  } catch (e: any) {
    console.warn('[MemoryRuntime] 摄入失败:', e.message)
    return []
  }
}

// ============================================================
// 生命周期管理器
// ============================================================

export interface LifecycleResult {
  expired: string[]
  archived: { id: string; reason: string }[]
  pruned: number
}

export function runLifecycle(
  eventCards: EventCard[],
  archiveCards: ArchiveCard[],
  turnIndex: number,
  config: MemoryRuntimeConfig['lifecycle'],
): { events: EventCard[]; archives: ArchiveCard[]; result: LifecycleResult } {
  const result: LifecycleResult = { expired: [], archived: [], pruned: 0 }

  // 1. 事件卡过期/归档
  const updatedEvents: EventCard[] = []
  for (const card of eventCards) {
    const age = turnIndex - card.updatedAt
    const maxAge = card.importance >= 4 ? config.longExpiryTurns :
                  card.importance >= 3 ? config.midExpiryTurns :
                  config.shortExpiryTurns

    if (maxAge >= 0 && age > maxAge && card.state === 'active') {
      // 高重要性事件 → 归档而非过期
      if (card.importance >= 3 && age <= config.autoArchiveAfterTurns + maxAge) {
        card.state = 'resolved'
        result.archived.push({ id: card.id, reason: `超过${age}轮，已归档` })
      } else {
        card.state = 'expired'
        result.expired.push(card.id)
      }
    }
    updatedEvents.push(card)
  }

  // 2. 裁剪热事件卡（保留最新的 high-importance）
  if (updatedEvents.length > config.maxHotEventCards) {
    const active = updatedEvents.filter(e => e.state === 'active')
    const resolved = updatedEvents.filter(e => e.state !== 'active')

    // 活跃的按重要性+最近排序
    active.sort((a, b) => {
      if (b.importance !== a.importance) return b.importance - a.importance
      return b.updatedAt - a.updatedAt
    })

    // 保留前 maxHotEventCards 条活跃 + 所有已解析的
    const keepActive = active.slice(0, config.maxHotEventCards)
    const dropped = active.slice(config.maxHotEventCards)
    for (const d of dropped) d.state = 'expired'
    result.pruned += dropped.length

    const finalEvents = [...keepActive, ...resolved, ...dropped]
    return { events: finalEvents, archives: archiveCards, result }
  }

  return { events: updatedEvents, archives: archiveCards, result }
}

// ============================================================
// 检查点系统
// ============================================================

export interface Checkpoint {
  id: string
  turnIndex: number
  createdAt: number
  label?: string
  messageCount: number
  memoryCount: number
}

// ============================================================
// 摘要管理
// ============================================================

export interface SummaryState {
  text: string
  messageIndex: number
  turnIndex: number
  updatedAt: number
}

// ============================================================
// MemoryRuntime 主类
// ============================================================

export class MemoryRuntime {
  // ---- 状态 ----
  worldId: string = ''
  turnIndex: number = 0

  // 编译器运行时
  compilerRuntime: CompilerRuntimeState = createEmptyRuntime()

  // 摘要
  summary: SummaryState | null = null

  // 检查点
  checkpoints: Checkpoint[] = []

  // 配置
  config: MemoryRuntimeConfig = { ...DEFAULT_MEMORY_RUNTIME_CONFIG }

  // IndexedDB
  private _db: IDBDatabase | null = null
  private _dbReady: boolean = false

  // 调试日志
  debugLogs: Array<{ ts: number; stage: string; message: string }> = []

  // ---- 初始化 ----

  async init(worldId: string, config?: Partial<MemoryRuntimeConfig>) {
    this.worldId = worldId
    if (config) Object.assign(this.config, config)
    // IndexedDB 延迟到首次 syncFromStores 时打开
    this._initPromise = this._lazyInitDB()
  }

  private _initPromise: Promise<void> | null = null

  private async _lazyInitDB() {
    if (!this.config.persistenceEnabled || this._dbReady) return
    try {
      this._db = await openDB(this.config.dbName)
      this._dbReady = true
      await this._loadFromDB()
      this._debug('init', 'IndexedDB 就绪，已恢复持久化卡片')
    } catch (e: any) {
      console.warn('[MemoryRuntime] IndexedDB 初始化失败，回退到内存模式:', e.message)
      this.config.persistenceEnabled = false
    }
  }

  /** 从 Store 投影同步编译器运行时。保留已持久化的生命周期状态。 */
  syncFromStores(input: StoreProjectionInput) {
    // 保存 DB 加载的卡片（如果有）
    const prevEventCards = this.compilerRuntime.eventCards
    const prevArchiveCards = this.compilerRuntime.archiveCards

    // 从 store 重建
    this.compilerRuntime = buildRuntimeFromStores(input)
    this.turnIndex = input.turnIndex

    // ---- 合并持久化卡片（IndexedDB 里的生命周期状态） ----
    // 从旧运行时中保留状态不为 'active' 的卡片（这些是生命周期处理过的）
    const newEventIds = new Set(this.compilerRuntime.eventCards.map(e => e.id))
    const newArchiveIds = new Set(this.compilerRuntime.archiveCards.map(a => a.id))

    for (const prev of prevEventCards) {
      if (prev.state !== 'active' && !newEventIds.has(prev.id)) {
        this.compilerRuntime.eventCards.unshift(prev)
      }
    }
    for (const prev of prevArchiveCards) {
      if (!newArchiveIds.has(prev.id)) {
        this.compilerRuntime.archiveCards.unshift(prev)
      }
    }

    this._debug('sync', `同步完成：${this.compilerRuntime.eventCards.length}事件卡 ${this.compilerRuntime.archiveCards.length}档案卡 t${this.turnIndex}`)
  }

  // ---- 摄入管道 ----

  async ingestTurn(storyText: string, apiConfig: ApiConfig): Promise<MemoryEntry[]> {
    if (!storyText.trim()) return []

    const entries = await ingestMemories(storyText, apiConfig, this.config)

    // 去重：与已有事件卡 + 档案卡比较
    const existingTexts = new Set([
      ...this.compilerRuntime.eventCards.map(e => e.summary),
      ...this.compilerRuntime.archiveCards.map(a => a.summary),
    ])

    const deduped: MemoryEntry[] = []
    for (const entry of entries) {
      const tokens = tokenize(entry.fact)
      let isDup = false
      for (const existing of existingTexts) {
        if (jaccardSimilarity(tokens, tokenize(existing)) > 0.5) {
          isDup = true
          break
        }
      }
      if (!isDup) {
        entry.turnIndex = this.turnIndex
        deduped.push(entry)
        existingTexts.add(entry.fact)
      }
    }

    // 合并到编译器运行时
    for (const entry of deduped) {
      if (['event', 'clue', 'task', 'status'].includes(entry.category)) {
        this.compilerRuntime.eventCards.push({
          id: entry.id,
          title: entry.fact.slice(0, 40),
          summary: entry.fact,
          timeLabel: `第${entry.turnIndex}轮`,
          importance: entry.importance,
          category: entry.category as EventCard['category'],
          entities: entry.entities,
          keywords: entry.keywords,
          state: entry.state === 'active' ? 'active' : 'expired',
          updatedAt: entry.turnIndex,
        })
      } else {
        this.compilerRuntime.archiveCards.push({
          id: entry.id,
          arcTitle: entry.fact.slice(0, 40),
          summary: entry.fact,
          excerpt: entry.fact,
          keywords: entry.keywords,
          entities: entry.entities,
          timeSpan: entry.timeScope === 'short' ? '短期' : entry.timeScope === 'mid' ? '中期' : '长期',
          importance: entry.importance,
          source: 'memory',
          updatedAt: entry.turnIndex,
        })
      }
    }

    this._debug('ingest', `摄入 ${deduped.length}/${entries.length} 条新记忆（去重跳过 ${entries.length - deduped.length}）`)

    // 持久化
    if (this.config.persistenceEnabled && deduped.length > 0) {
      await this._persistCards()
    }

    return deduped
  }

  // ---- 生命周期 ----

  runLifecycle(): LifecycleResult {
    const { events, archives, result } = runLifecycle(
      this.compilerRuntime.eventCards,
      this.compilerRuntime.archiveCards,
      this.turnIndex,
      this.config.lifecycle,
    )
    this.compilerRuntime.eventCards = events
    this.compilerRuntime.archiveCards = archives
    this._debug('lifecycle', `过期:${result.expired.length} 归档:${result.archived.length} 裁剪:${result.pruned}`)
    return result
  }

  // ---- 检查点 ----

  async saveCheckpoint(
    messages: GameMessage[],
    label?: string,
  ): Promise<Checkpoint> {
    const cp: Checkpoint = {
      id: `cp-${this.turnIndex}-${Date.now()}`,
      turnIndex: this.turnIndex,
      createdAt: Date.now(),
      label,
      messageCount: messages.length,
      memoryCount: this.compilerRuntime.eventCards.length + this.compilerRuntime.archiveCards.length,
    }

    this.checkpoints.push(cp)
    // 保留最近 20 个检查点
    if (this.checkpoints.length > 20) {
      const oldest = this.checkpoints.shift()
      if (oldest && this._db) {
        try { await idbDelete(this._db, 'checkpoints', oldest.id) } catch {}
      }
    }

    if (this._db) {
      const record: CheckpointRecord = {
        id: cp.id,
        worldId: this.worldId,
        turnIndex: this.turnIndex,
        createdAt: cp.createdAt,
        runtimeSnapshot: JSON.stringify(this.compilerRuntime),
        messageSnapshot: JSON.stringify(messages.slice(-50)),
        memorySnapshot: JSON.stringify({
          events: this.compilerRuntime.eventCards.slice(0, 100),
          archives: this.compilerRuntime.archiveCards.slice(0, 100),
        }),
        label,
      }
      try { await idbPut(this._db, 'checkpoints', record) } catch (e: any) {
        console.warn('[MemoryRuntime] 检查点保存失败:', e.message)
      }
    }

    this._debug('checkpoint', `检查点 ${cp.id} 已保存 (t${cp.turnIndex}, ${cp.memoryCount}张卡片)`)
    return cp
  }

  async loadCheckpoint(checkpointId: string): Promise<{
    runtime: CompilerRuntimeState | null
    messages: GameMessage[]
    memorySnapshot: any
  } | null> {
    if (!this._db) return null

    const record = await idbGet<CheckpointRecord>(this._db, 'checkpoints', checkpointId)
    if (!record) return null

    try {
      const runtime = JSON.parse(record.runtimeSnapshot)
      // 确保运行时结构完整
      const restored = { ...createEmptyRuntime(), ...runtime }
      const messages = JSON.parse(record.messageSnapshot)
      const memorySnapshot = JSON.parse(record.memorySnapshot)
      return { runtime: restored, messages, memorySnapshot }
    } catch {
      return null
    }
  }

  // ---- 回退消息时修复摘要 ----

  async repairSummary(
    messages: GameMessage[],
    rollbackIndex: number,
  ): Promise<{ removedSummaryCount: number }> {
    // 裁剪消息到回退索引
    const kept = messages.slice(0, rollbackIndex + 1)

    // 如果摘要指向了被删除的消息，重置摘要
    if (this.summary && this.summary.messageIndex > rollbackIndex) {
      const removedCount = this.summary.messageIndex - rollbackIndex
      this.summary = null
      this._debug('repair', `摘要已重置：回退到 index ${rollbackIndex}，移除 ${removedCount} 条消息`)
      return { removedSummaryCount: removedCount }
    }

    return { removedSummaryCount: 0 }
  }

  // ---- 编译上下文代理 ----

  getCompilerRuntime(): CompilerRuntimeState {
    return this.compilerRuntime
  }

  getSceneAnchor(): SceneAnchor {
    return this.compilerRuntime.sceneAnchor
  }

  // ---- IndexedDB 持久化 ----

  private async _loadFromDB() {
    if (!this._db) return

    // 恢复事件卡
    const eventRecords = await idbGetAll<PersistedEventCard>(this._db, 'eventCards', 'worldId', this.worldId)
    for (const rec of eventRecords) {
      this.compilerRuntime.eventCards.push({
        id: rec.id,
        title: rec.title,
        summary: rec.summary,
        timeLabel: rec.timeLabel,
        importance: rec.importance as 1 | 2 | 3 | 4 | 5,
        category: rec.category as EventCard['category'],
        entities: rec.entities,
        keywords: rec.keywords,
        state: rec.state as 'active' | 'resolved' | 'expired',
        updatedAt: rec.turnIndex,
      })
    }

    // 恢复档案卡
    const archiveRecords = await idbGetAll<PersistedArchiveCard>(this._db, 'archiveCards', 'worldId', this.worldId)
    for (const rec of archiveRecords) {
      this.compilerRuntime.archiveCards.push({
        id: rec.id,
        arcTitle: rec.arcTitle,
        summary: rec.summary,
        excerpt: rec.excerpt,
        keywords: rec.keywords,
        entities: rec.entities,
        timeSpan: rec.timeSpan,
        importance: rec.importance as 1 | 2 | 3 | 4 | 5,
        source: rec.source as 'memory' | 'world_book' | 'vector_retrieval',
        updatedAt: rec.turnIndex,
      })
    }

    // 恢复检查点列表
    const cpRecords = await idbGetAll<CheckpointRecord>(this._db, 'checkpoints', 'worldId', this.worldId)
    this.checkpoints = cpRecords
      .sort((a, b) => b.turnIndex - a.turnIndex)
      .slice(0, 20)
      .map(r => ({
        id: r.id,
        turnIndex: r.turnIndex,
        createdAt: r.createdAt,
        label: r.label,
        messageCount: 0,
        memoryCount: 0,
      }))

    // 恢复摘要
    const summaryRecord = await idbGet<SummaryRecord>(this._db, 'summaries', this.worldId)
    if (summaryRecord) {
      this.summary = {
        text: summaryRecord.text,
        messageIndex: summaryRecord.messageIndex,
        turnIndex: summaryRecord.turnIndex,
        updatedAt: summaryRecord.updatedAt,
      }
    }

    this._debug('load', `从 IndexedDB 恢复：${eventRecords.length}事件卡 ${archiveRecords.length}档案卡 ${this.checkpoints.length}检查点`)
  }

  private async _persistCards() {
    if (!this._db) return

    // 持久化事件卡
    const tx1 = this._db.transaction('eventCards', 'readwrite')
    const eventStore = tx1.objectStore('eventCards')
    for (const card of this.compilerRuntime.eventCards.slice(-50)) {
      eventStore.put({
        id: card.id, worldId: this.worldId, title: card.title, summary: card.summary,
        timeLabel: card.timeLabel, importance: card.importance, category: card.category,
        entities: card.entities, keywords: card.keywords, state: card.state,
        turnIndex: card.updatedAt, archived: card.state !== 'active',
      } satisfies PersistedEventCard)
    }
    await new Promise<void>((resolve, reject) => {
      tx1.oncomplete = () => resolve()
      tx1.onerror = () => reject(tx1.error)
    })

    // 持久化档案卡
    const tx2 = this._db.transaction('archiveCards', 'readwrite')
    const archiveStore = tx2.objectStore('archiveCards')
    for (const card of this.compilerRuntime.archiveCards.slice(-30)) {
      archiveStore.put({
        id: card.id, worldId: this.worldId, arcTitle: card.arcTitle, summary: card.summary,
        excerpt: card.excerpt, keywords: card.keywords, entities: card.entities,
        timeSpan: card.timeSpan, importance: card.importance, source: card.source,
        turnIndex: card.updatedAt,
      } satisfies PersistedArchiveCard)
    }
    await new Promise<void>((resolve, reject) => {
      tx2.oncomplete = () => resolve()
      tx2.onerror = () => reject(tx2.error)
    })
  }

  async saveSummary(text: string, messageIndex: number) {
    this.summary = {
      text,
      messageIndex,
      turnIndex: this.turnIndex,
      updatedAt: Date.now(),
    }
    if (this._db) {
      await idbPut(this._db, 'summaries', {
        worldId: this.worldId, turnIndex: this.turnIndex,
        text, updatedAt: Date.now(), messageIndex,
      } satisfies SummaryRecord)
    }
  }

  async clearWorld() {
    if (this._db) {
      const stores = ['checkpoints', 'summaries', 'eventCards', 'archiveCards']
      for (const store of stores) {
        const all = await idbGetAll<{ id: string; worldId: string }>(this._db, store, 'worldId', this.worldId)
        for (const item of all) { await idbDelete(this._db, store, item.id) }
      }
    }
    this.compilerRuntime = createEmptyRuntime()
    this.checkpoints = []
    this.summary = null
    this._debug('clear', '世界数据已清除')
  }

  async close() {
    if (this._db) {
      this._db.close()
      this._db = null
      this._dbReady = false
    }
  }

  // ---- 调试 ----

  private _debug(stage: string, message: string) {
    if (!this.config.debug.enabled) return
    this.debugLogs.push({ ts: Date.now(), stage, message })
    if (this.debugLogs.length > this.config.debug.maxLogs) {
      this.debugLogs = this.debugLogs.slice(-this.config.debug.maxLogs)
    }
    console.warn(`[MemoryRuntime] ${stage}: ${message}`)
  }

  getRecentDebugLogs(count: number = 20) {
    return this.debugLogs.slice(-count)
  }

  /** 计算存储用量（近似值，供 UI 展示） */
  async estimateStorageUsage(): Promise<{ eventCards: number; archiveCards: number; checkpoints: number; summaries: number; totalBytes: number }> {
    let eventCards = 0, archiveCards = 0, checkpoints = 0, summaries = 0, totalBytes = 0
    if (this._db) {
      const evts = await idbGetAll<any>(this._db, 'eventCards', 'worldId', this.worldId)
      eventCards = evts.length
      totalBytes += JSON.stringify(evts).length
      const arcs = await idbGetAll<any>(this._db, 'archiveCards', 'worldId', this.worldId)
      archiveCards = arcs.length
      totalBytes += JSON.stringify(arcs).length
      const cps = await idbGetAll<any>(this._db, 'checkpoints', 'worldId', this.worldId)
      checkpoints = cps.length
      totalBytes += JSON.stringify(cps).length
      const s = await idbGet<any>(this._db, 'summaries', this.worldId)
      if (s) { summaries = 1; totalBytes += JSON.stringify(s).length }
    }
    return { eventCards, archiveCards, checkpoints, summaries, totalBytes }
  }
}

// ============================================================
// 全局单例（与 wandou 生命周期绑定）
// ============================================================

let _globalRuntime: MemoryRuntime | null = null

export function getMemoryRuntime(): MemoryRuntime {
  if (!_globalRuntime) _globalRuntime = new MemoryRuntime()
  return _globalRuntime
}

export function resetMemoryRuntime() {
  _globalRuntime = null
}

// Re-export types for convenience
export type { MemoryEntry, MemoryCategory } from '@/types/state'
