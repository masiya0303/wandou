// ============================================================
// wandou · 检索流水线 (Retriever Pipeline)
//
// 对标 yijiekkk 的多阶段检索：
//   Round 0: Query Rewrite — LLM 扩展查询词
//   Round 1: Hybrid Retrieve — 关键词 + TF-IDF 并行
//   Round 2: LLM Rerank — 从 N 个候选中精排 M 条
//   Round 3: Graph Expand — 关系网络扩展 → 补充检索
//
// 全程可选：任一阶段崩溃不影响之前的产出。
// ============================================================

import type { CompilerRuntimeState } from './compilerRuntime'
import type { Retriever, RetrieverResult } from './memoryCompiler'
import { createKeywordRetriever } from './memoryCompiler'
import { VectorStore } from './vectorStore'
import { chatStream } from './api'
import type { ApiConfig } from '@/types/game'

// ============================================================
// Query Rewrite — LLM 扩展查询
// ============================================================

const REWRITE_SYSTEM_PROMPT = `你是查询扩展器。把用户提问改写为检索关键词列表。

规则：
- 提取核心实体名、地名、NPC名、物品名
- 补充同义词和相关表述
- 不要添加故事中不存在的虚构内容
- 输出 JSON 数组: ["词1", "词2", ...]`

async function rewriteQuery(
  userInput: string,
  apiConfig: ApiConfig,
): Promise<string[]> {
  if (!apiConfig.apiKey) return []
  try {
    const messages = [{ role: 'user' as const, content: userInput.slice(0, 500) }]
    const raw = await chatStream(apiConfig, REWRITE_SYSTEM_PROMPT, messages, () => {}, undefined, 0)
    const trimmed = raw.trim()
    // Try JSON parse
    try { const arr = JSON.parse(trimmed); if (Array.isArray(arr)) return arr.map(String).slice(0, 10) } catch {}
    // Extract [...] if wrapped
    const m = trimmed.match(/\[[\s\S]*\]/)
    if (m) { try { const arr = JSON.parse(m[0]); if (Array.isArray(arr)) return arr.map(String).slice(0, 10) } catch {} }
    // Fallback: split by newline/comma
    return trimmed.split(/[\n,，、]/).map(s => s.replace(/^["'\-*\s]+|["'\s]+$/g, '').trim()).filter(Boolean).slice(0, 10)
  } catch {
    return []
  }
}

// ============================================================
// LLM Reranker — 从 N 个候选中精排 M 条
// ============================================================

const RERANK_SYSTEM_PROMPT = `你是记忆检索重排器。给定用户提问和候选记忆列表，选出最相关的。

规则：
- 严格按相关性排序
- 选中的条目必须和提问直接相关
- 如果某条完全不相关，不选
- 输出 JSON 对象: {"selected":["id1","id2",...],"scores":{"id1":0.95,"id2":0.72,...}}
- 分数范围 0-1，只输出有把握的`

export interface RerankResult {
  selected: string[]
  scores: Record<string, number>
}

async function rerankCandidates(
  queryText: string,
  candidates: RetrieverResult[],
  apiConfig: ApiConfig,
  topM: number = 6,
): Promise<RetrieverResult[]> {
  if (!apiConfig.apiKey || candidates.length === 0) return candidates.slice(0, topM)
  if (candidates.length <= topM) return candidates

  const candidateText = candidates.map((c, i) =>
    `[ID:${c.id}] (相关度:${c.score.toFixed(2)}) ${c.text.slice(0, 200)}`
  ).join('\n\n')

  const userMsg = [
    `【用户提问】${queryText}`,
    '',
    `【候选记忆 (${candidates.length}条)】`,
    candidateText,
    '',
    `请选出最相关的 ${topM} 条。`,
  ].join('\n')

  try {
    const messages = [{ role: 'user' as const, content: userMsg }]
    const raw = await chatStream(apiConfig, RERANK_SYSTEM_PROMPT, messages, () => {}, undefined, 0)
    const trimmed = raw.trim()

    let result: RerankResult | null = null
    try { result = JSON.parse(trimmed) } catch {
      const m = trimmed.match(/\{[\s\S]*\}/)
      if (m) { try { result = JSON.parse(m[0]) } catch {} }
    }

    if (!result?.selected || !Array.isArray(result.selected)) {
      // Rerank 失败 → 返回原 top-M
      return candidates.slice(0, topM)
    }

    const selectedIds = new Set(result.selected)
    const reranked = candidates
      .filter(c => selectedIds.has(c.id))
      .map(c => ({
        ...c,
        score: (result!.scores?.[c.id] || 0.5) * c.score,
        source: 'vector' as RetrieverResult['source'],
      }))
      .sort((a, b) => b.score - a.score)

    return reranked.length > 0 ? reranked : candidates.slice(0, topM)
  } catch {
    return candidates.slice(0, topM)
  }
}

// ============================================================
// Graph Expander — 关系网络遍历
// ============================================================

export interface GraphExpansionResult {
  expandedEntities: string[]
  expandedKeywords: string[]
  /** 新发现的关联实体 ID */
  relatedNpcIds: string[]
}

export function expandGraph(
  hitEntities: string[],
  runtime: CompilerRuntimeState,
): GraphExpansionResult {
  const network = runtime.relationNetwork
  const entityCards = runtime.entityCards

  // 建立一个映射：实体名 → entityCard.id
  const nameToId = new Map<string, string>()
  for (const c of entityCards) {
    nameToId.set(c.name.toLowerCase(), c.id)
    for (const a of c.aliases) nameToId.set(a.toLowerCase(), c.id)
  }

  // 找出 hitEntities 对应的 ID
  const hitIds = new Set<string>()
  for (const name of hitEntities) {
    const id = nameToId.get(name.toLowerCase())
    if (id) hitIds.add(id)
  }

  // BFS 遍历关系网络（1-2 跳）
  const visited = new Set<string>(hitIds)
  const frontier = [...hitIds]
  const relatedIds: string[] = []
  const expandedEntities: string[] = []
  const expandedKeywords: string[] = []

  for (let hop = 0; hop < 2 && frontier.length > 0; hop++) {
    const next: string[] = []
    for (const nodeId of frontier) {
      for (const edge of network) {
        let neighbor: string | null = null
        if (edge.sourceId === nodeId && !visited.has(edge.targetId)) neighbor = edge.targetId
        else if (edge.targetId === nodeId && !visited.has(edge.sourceId)) neighbor = edge.sourceId

        if (neighbor) {
          visited.add(neighbor)
          next.push(neighbor)
          relatedIds.push(neighbor)

          // 找到邻居的实体名
          const card = entityCards.find(c => c.id === neighbor)
          if (card) {
            expandedEntities.push(card.name)
            if (card.name.length > 1) expandedKeywords.push(card.name)
            if (card.role && card.role.length > 0) expandedKeywords.push(card.role)
          }

          // 把关系类型也作为查询词
          if (edge.type && edge.type.length > 0) {
            expandedKeywords.push(edge.type)
          }
        }
      }
    }
    frontier.splice(0, frontier.length, ...next)
  }

  return {
    expandedEntities: [...new Set(expandedEntities)].slice(0, 8),
    expandedKeywords: [...new Set(expandedKeywords)].slice(0, 10),
    relatedNpcIds: relatedIds,
  }
}

// ============================================================
// 多轮检索流水线
// ============================================================

export interface PipelineConfig {
  /** 第一轮检索候选数 */
  round1TopK: number
  /** Rerank 后保留数 */
  round2TopM: number
  /** Graph expand 后补充检索数 */
  round3TopK: number
  /** 是否启用 Query Rewrite（需 API） */
  queryRewriteEnabled: boolean
  /** 是否启用 LLM Rerank（需 API） */
  rerankEnabled: boolean
  /** 是否启用 Graph Expand */
  graphExpandEnabled: boolean
  /** 最大检索轮数 */
  maxRounds: number
  /** API 配置 */
  apiConfig?: ApiConfig
}

export const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  round1TopK: 16,
  round2TopM: 6,
  round3TopK: 4,
  queryRewriteEnabled: true,
  rerankEnabled: true,
  graphExpandEnabled: true,
  maxRounds: 3,
}

export interface PipelineResult {
  results: RetrieverResult[]
  stages: Array<{ stage: string; count: number; message: string }>
  /** 是否触发了 graph expand */
  graphExpanded: boolean
  /** 扩展的实体 */
  expandedEntities: string[]
}

/**
 * 多轮检索流水线
 *
 * 对标 yijiekkk 的 query rewrite → embedding → rerank → graph expand，
 * 但使用 TF-IDF 替代 embedding（零 API 依赖），LLM 只做 rerank。
 */
export async function runRetrievalPipeline(
  queryText: string,
  runtime: CompilerRuntimeState,
  vectorStore: VectorStore,
  config: PipelineConfig = DEFAULT_PIPELINE_CONFIG,
): Promise<PipelineResult> {
  const stages: PipelineResult['stages'] = []
  const keywordRetriever = createKeywordRetriever(runtime)

  // ---- Round 0: Query Rewrite ----
  let expandedQuery = queryText
  if (config.queryRewriteEnabled && config.apiConfig?.apiKey) {
    try {
      const rewritten = await rewriteQuery(queryText, config.apiConfig)
      if (rewritten.length > 0) {
        expandedQuery = [queryText, ...rewritten.slice(0, 5)].join(' ')
        stages.push({ stage: 'rewrite', count: rewritten.length, message: `扩展查询词: ${rewritten.slice(0, 5).join(', ')}` })
      }
    } catch {
      stages.push({ stage: 'rewrite', count: 0, message: '跳过（API 不可用）' })
    }
  }

  // ---- Round 1: Hybrid Retrieve (keyword + TF-IDF) ----
  const [kwResults, tfidfResults] = await Promise.all([
    keywordRetriever.retrieve(expandedQuery, config.round1TopK),
    Promise.resolve(vectorStore.search(expandedQuery, config.round1TopK)),
  ])

  // Merge: keyword + TF-IDF, deduplicate by ID
  const merged = new Map<string, RetrieverResult>()
  for (const r of kwResults) {
    merged.set(r.id, r)
  }
  for (const r of tfidfResults) {
    if (!merged.has(r.id)) {
      merged.set(r.id, {
        id: r.id,
        text: '', // Will be filled from runtime
        keywords: [],
        entities: [],
        importance: 3,
        source: 'vector',
        score: r.score * 0.5, // TF-IDF scores are on a different scale
      })
    } else {
      // Boost keyword match with TF-IDF score
      const existing = merged.get(r.id)!
      existing.score += r.score * 0.3
    }
  }

  // Fill in text from runtime cards
  for (const [id, result] of merged) {
    if (!result.text) {
      const event = runtime.eventCards.find(e => e.id === id)
      const archive = runtime.archiveCards.find(a => a.id === id)
      const card = event || archive
      if (card) {
        result.text = card.summary || (card as any).excerpt || ''
        result.keywords = card.keywords || []
        result.entities = card.entities || []
        result.importance = card.importance || 3
      }
    }
  }

  let candidates = [...merged.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, config.round1TopK)

  stages.push({
    stage: 'retrieve',
    count: candidates.length,
    message: `关键词${kwResults.length}条 + TF-IDF${tfidfResults.length}条 → 合并去重${candidates.length}条`,
  })

  // ---- Round 2: LLM Rerank ----
  let graphExpanded = false
  const expandedEntities: string[] = []

  if (config.rerankEnabled && config.apiConfig?.apiKey && candidates.length > config.round2TopM) {
    try {
      const reranked = await rerankCandidates(queryText, candidates, config.apiConfig, config.round2TopM)
      stages.push({
        stage: 'rerank',
        count: reranked.length,
        message: `LLM 重排序: ${candidates.length}→${reranked.length}条`,
      })
      candidates = reranked
    } catch {
      stages.push({ stage: 'rerank', count: 0, message: '跳过（失败）' })
    }
  }

  // ---- Round 3: Graph Expand ----
  if (config.graphExpandEnabled && candidates.length > 0) {
    const allHitEntities = [...new Set(candidates.flatMap(c => c.entities))]
    const expansion = expandGraph(allHitEntities, runtime)

    if (expansion.expandedEntities.length > 0 || expansion.expandedKeywords.length > 0) {
      graphExpanded = true
      expandedEntities.push(...expansion.expandedEntities)

      // 补充检索：用扩展的关键词再搜一轮
      const expandedQueryText = [
        queryText,
        ...expansion.expandedEntities,
        ...expansion.expandedKeywords.slice(0, 5),
      ].join(' ')

      const [kwExtra, vecExtra] = await Promise.all([
        keywordRetriever.retrieve(expandedQueryText, config.round3TopK),
        Promise.resolve(vectorStore.search(expandedQueryText, config.round3TopK)),
      ])

      // 合并新结果（去重）
      const existingIds = new Set(candidates.map(c => c.id))
      const extraResults: RetrieverResult[] = []

      for (const r of kwExtra) {
        if (!existingIds.has(r.id)) {
          extraResults.push(r)
          existingIds.add(r.id)
        }
      }
      for (const r of vecExtra) {
        if (!existingIds.has(r.id)) {
          const event = runtime.eventCards.find(e => e.id === r.id)
          const archive = runtime.archiveCards.find(a => a.id === r.id)
          const card = event || archive
          extraResults.push({
            id: r.id,
            text: card?.summary || (card as any)?.excerpt || '',
            keywords: card?.keywords || [],
            entities: card?.entities || [],
            importance: card?.importance || 3,
            source: 'graph',
            score: r.score * 0.4,
          })
          existingIds.add(r.id)
        }
      }

      candidates.push(...extraResults.slice(0, config.round3TopK))

      stages.push({
        stage: 'graph',
        count: extraResults.length,
        message: `关系网扩展: 实体[${expansion.expandedEntities.join(',')}] → 补充${Math.min(extraResults.length, config.round3TopK)}条`,
      })
    }
  }

  return {
    results: candidates.sort((a, b) => b.score - a.score),
    stages,
    graphExpanded,
    expandedEntities,
  }
}

// ============================================================
// 流水线式 Retriever（实现 Retriever 接口）
// ============================================================

export function createPipelineRetriever(
  runtime: CompilerRuntimeState,
  vectorStore: VectorStore,
  config?: Partial<PipelineConfig>,
): Retriever {
  const fullConfig = { ...DEFAULT_PIPELINE_CONFIG, ...config }

  return {
    name: 'pipeline',
    async retrieve(queryText: string, topK: number): Promise<RetrieverResult[]> {
      const pipelineConfig = { ...fullConfig, round2TopM: Math.min(fullConfig.round2TopM, topK) }
      const result = await runRetrievalPipeline(queryText, runtime, vectorStore, pipelineConfig)
      return result.results.slice(0, topK)
    },
  }
}
