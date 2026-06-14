// ============================================================
// wandou · 记忆引擎
//
// 借鉴 yijiekkk 的 memory-prompts.js，轻量化：
//   - 每轮从 AI 剧情回复中提取关键事实
//   - 关键词匹配检索相关记忆→注入 system prompt
//   - 自动裁剪旧记忆
// ============================================================

import type { MemoryEntry, MemoryCategory } from '@/types/state'
import { useStateStore } from '@/stores/stateStore'
import { useApiStore } from '@/stores/apiStore'
import { chatStream } from '@/utils/api'
import { buildMemoryExtractPrompt } from '@/utils/stateRules'
import { bus } from '@/utils/events'

// ============================================================
// 内存去重与检索（纯本地，无需向量）
// ============================================================

/** 分词（中英文混合） */
function tokenize(text: string): string[] {
  const cleaned = text
    .replace(/[，,。\.！!？?；;：:、\s]+/g, ' ')
    .toLowerCase()
    .trim()
  if (!cleaned) return []
  // 中文字符按单字拆分，英文按词拆分
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

/** 计算两条文本的 Jaccard 相似度（用于本地检索和去重） */
function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1
  const setA = new Set(a)
  const setB = new Set(b)
  let intersection = 0
  for (const t of setA) {
    if (setB.has(t)) intersection++
  }
  const union = new Set([...setA, ...setB]).size
  return union === 0 ? 0 : intersection / union
}

// ============================================================
// AI 提取记忆（异步，不阻塞主流程）
// ============================================================

const CATEGORY_LABELS: Record<MemoryCategory, string> = {
  task: '任务', character: '角色', relationship: '关系', location: '地点',
  faction: '势力', event: '事件', clue: '线索', item: '物品',
  ability: '能力', status: '状态', rule: '规则', world: '世界',
}

const VALID_CATEGORIES = new Set(Object.keys(CATEGORY_LABELS))

function normalizeCategory(raw: string): MemoryCategory {
  const s = String(raw || '').toLowerCase().trim()
  if (VALID_CATEGORIES.has(s)) return s as MemoryCategory
  // fallback: try to find "event" in "事件"
  for (const [key, label] of Object.entries(CATEGORY_LABELS)) {
    if (s === label || s.includes(key) || key.includes(s)) return key as MemoryCategory
  }
  return 'event'
}

export async function extractMemories(
  storyText: string,
  contextText: string = '',
): Promise<MemoryEntry[]> {
  const api = useApiStore()
  if (!api.apiConfig.apiKey) return []

  try {
    const systemPrompt = buildMemoryExtractPrompt()
    let userContent = '请从以下剧情中提取关键事实：\n\n'
    if (contextText) {
      userContent += `【当前上下文】\n${contextText}\n\n`
    }
    userContent += storyText.slice(0, 4000) // 截断长文本

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userContent },
    ]

    const fullText = await chatStream(
      api.apiConfig,
      systemPrompt,
      messages as any,
      () => {}, // 不流式展示
    )

    // 解析 AI 返回的 JSON
    const raw = fullText.trim()
    let parsed: any[] | null = null

    // 尝试直接 JSON 解析
    try {
      parsed = JSON.parse(raw)
    } catch {
      // 尝试提取代码块或平衡括号
      let extracted = raw
      const fenceRe = /```(?:json)?\s*([\s\S]*?)\s*```/
      const fm = fenceRe.exec(raw)
      if (fm) extracted = fm[1].trim()
      try {
        parsed = JSON.parse(extracted)
      } catch {
        // 平衡括号提取
        const start = extracted.indexOf('[')
        if (start >= 0) {
          let depth = 0
          let inString = false
          let escaped = false
          for (let i = start; i < extracted.length; i++) {
            const ch = extracted[i]
            if (inString) {
              if (escaped) { escaped = false; continue }
              if (ch === '\\') { escaped = true; continue }
              if (ch === '"') { inString = false }
              continue
            }
            if (ch === '"') { inString = true; continue }
            if (ch === '[') { depth++; continue }
            if (ch === ']') {
              depth--
              if (depth === 0) {
                try { parsed = JSON.parse(extracted.slice(start, i + 1)) } catch { /* ignore */ }
                break
              }
            }
          }
        }
      }
    }

    if (!parsed || !Array.isArray(parsed)) return []

    // 标准化为 MemoryEntry
    const entries: MemoryEntry[] = []
    const store = useStateStore()

    for (let i = 0; i < Math.min(parsed.length, 8); i++) {
      const rawEntry = parsed[i]
      if (!rawEntry || typeof rawEntry !== 'object' || !rawEntry.fact) continue

      const entry: MemoryEntry = {
        id: `mem-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
        fact: String(rawEntry.fact).trim(),
        category: normalizeCategory(rawEntry.category),
        secondaryCategories: Array.isArray(rawEntry.secondaryCategories)
          ? rawEntry.secondaryCategories.map(normalizeCategory)
          : undefined,
        entities: Array.isArray(rawEntry.entities) ? rawEntry.entities.map(String) : [],
        keywords: Array.isArray(rawEntry.keywords) ? rawEntry.keywords.map(String) : [],
        importance: Math.max(1, Math.min(5, Number(rawEntry.importance) || 3)) as 1 | 2 | 3 | 4 | 5,
        timeScope: ['short', 'mid', 'long'].includes(rawEntry.timeScope) ? rawEntry.timeScope : 'mid',
        state: ['active', 'resolved', 'expired', 'unknown'].includes(rawEntry.state) ? rawEntry.state : 'active',
        createdAt: Date.now(),
        turnIndex: store.turnIndex,
      }

      // 去重：与已有记忆比较
      const allTokens = tokenize(entry.fact)
      const isDup = store.memories.some(m => {
        const existingTokens = tokenize(m.fact)
        return jaccardSimilarity(allTokens, existingTokens) > 0.6
      })
      if (!isDup) {
        entries.push(entry)
      }
    }

    return entries
  } catch (e: any) {
    console.warn('[MemoryEngine] 记忆提取失败:', e.message)
    return []
  }
}

// ============================================================
// 记忆管理
// ============================================================

/** 将提取结果存到 Store 并触发裁剪 */
export function commitMemories(entries: MemoryEntry[]) {
  if (entries.length === 0) return

  const store = useStateStore()
  store.addMemories(entries)
  store.pruneMemories(200)

  bus.emit('state:memory_added', entries)
}

/** 手动添加一条记忆 */
export function addManualMemory(fact: string, category: MemoryCategory = 'event', importance: 1 | 2 | 3 | 4 | 5 = 3) {
  const store = useStateStore()
  const entry: MemoryEntry = {
    id: `mem-manual-${Date.now()}`,
    fact: fact.trim(),
    category,
    entities: [],
    keywords: [],
    importance,
    timeScope: 'mid',
    state: 'active',
    createdAt: Date.now(),
    turnIndex: store.turnIndex,
  }
  store.addMemory(entry)
  bus.emit('state:memory_added', [entry])
}

/** 将记忆放入已解决/过期 */
export function resolveMemory(id: string) {
  const store = useStateStore()
  const mem = store.memories.find(m => m.id === id)
  if (mem) mem.state = 'resolved'
}

export function expireMemory(id: string) {
  const store = useStateStore()
  const mem = store.memories.find(m => m.id === id)
  if (mem) mem.state = 'expired'
}
