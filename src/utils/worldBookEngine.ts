// ============================================================
// wandou v0.9 — 豌豆星际漂流 · 世界书引擎
// 兼容 SillyTavern / AI 对话卡片等多种 JSON 格式
// ============================================================

import type { WorldBookEntry, RawWorldBookEntry, ImportResult } from '../types/worldBook'

// ---------- 匹配引擎 ----------

export function scanAndCollect(
  entries: WorldBookEntry[],
  chatHistory: string[],
  maxTokens: number = 2000,
): string {
  const enabled = entries.filter(e => e.enabled)
  if (enabled.length === 0) return ''

  const historyText = chatHistory.join(' ').toLowerCase()
  const maxChars = maxTokens * 2

  // at_constant 条目始终命中
  const constant = enabled.filter(e => e.position === 'at_constant')
  const matched: WorldBookEntry[] = [...constant]

  for (const entry of enabled) {
    if (entry.position === 'at_constant') continue
    if (matched.includes(entry)) continue

    let hit = false
    for (const key of entry.keys) {
      const k = key.toLowerCase().trim()
      if (!k) continue
      if (historyText.includes(k)) { hit = true; break }
    }
    if (hit) matched.push(entry)
  }

  if (matched.length === 0) return ''

  matched.sort((a, b) => b.priority - a.priority)

  const parts: string[] = []
  let used = 0
  for (const entry of matched) {
    const text = entry.content.trim()
    if (!text) continue
    if (used + text.length > maxChars) break
    parts.push(text)
    used += text.length
  }

  if (parts.length === 0) return ''
  return `\n\n---\n【世界书·背景参考】\n${parts.join('\n\n---\n')}\n---\n`
}

export function extractRecentText(
  messages: Array<{ role: string; content: string }>,
  count: number = 10,
): string[] {
  return messages.slice(-count).map(m => m.content)
}

// ---------- 导入 ----------

let idCounter = 0
function genId(): string { idCounter++; return `wb-${Date.now()}-${idCounter}` }

export function importWorldBook(jsonStr: string): ImportResult & { entries: WorldBookEntry[] } {
  const errors: string[] = []
  let data: unknown

  try { data = JSON.parse(jsonStr) } catch (e: any) {
    return { success: false, imported: 0, errors: [`JSON 解析失败: ${e.message}`], entries: [] }
  }

  let rawArr: RawWorldBookEntry[]
  if (Array.isArray(data)) {
    rawArr = data
  } else if (data && typeof data === 'object' && Array.isArray((data as any).entries)) {
    rawArr = (data as any).entries
  } else {
    return { success: false, imported: 0, errors: ['JSON 格式错误：期望数组或 { entries: [...] }'], entries: [] }
  }

  const entries: WorldBookEntry[] = []

  for (let i = 0; i < rawArr.length; i++) {
    const raw = rawArr[i] as any
    if (!raw || typeof raw !== 'object') { errors.push(`#${i + 1}: 无效`); continue }

    // keys: 兼容 keys / key / keyword / keywords（数组或逗号分隔字符串）
    let keys: string[] = []
    if (Array.isArray(raw.keys)) keys = raw.keys
    else if (typeof raw.keys === 'string') keys = raw.keys.split(',').map((s: string) => s.trim())
    else if (Array.isArray(raw.key)) keys = raw.key
    else if (typeof raw.key === 'string') keys = raw.key.split(',').map((s: string) => s.trim())
    else if (Array.isArray(raw.keywords)) keys = raw.keywords
    else if (typeof raw.keywords === 'string') keys = raw.keywords.split(',').map((s: string) => s.trim())
    if (Array.isArray(raw.secondary_keys)) keys = [...keys, ...raw.secondary_keys]

    const content = (raw.content || raw.text || '').trim()
    if (!content) { errors.push(`#${i + 1}: 缺少 content`); continue }

    // position: 兼容 constant:true / always:true → at_constant
    let pos: 'before' | 'after' | 'at_constant' = 'after'
    if (raw.constant === true || raw.always === true || (typeof raw.constant === 'number' && raw.constant > 0)) {
      pos = 'at_constant'
    } else if (raw.position === 'before' || raw.position === 'after' || raw.position === 'at_constant') {
      pos = raw.position
    }

    // priority: 兼容 order 字段（1-10 → 10-100）、probability
    let pri = 50
    if (typeof raw.priority === 'number') pri = raw.priority
    else if (typeof raw.order === 'number') pri = raw.order * 10
    else if (typeof raw.probability === 'number') pri = raw.probability
    pri = Math.max(0, Math.min(100, pri))

    entries.push({
      id: genId(),
      keys: keys.map((k: string) => k.trim()).filter(Boolean),
      content,
      comment: raw.comment || raw.memo || raw.name || '',
      enabled: raw.enabled !== false && raw.hidden !== true,
      priority: pri,
      position: pos,
    })
  }

  return { success: entries.length > 0, imported: entries.length, errors, entries }
}
