// ============================================================
// wandou · 正则引擎：解析 /pattern/flags、LRU 缓存、执行替换
// ============================================================
import type { RegexEntry } from '@/types/regex'

// ---- LRU 正则缓存 ----
const regexCache = new Map<string, RegExp>()
const MAX_CACHE = 200

function parseRegex(raw: string): RegExp | null {
  if (!raw || !raw.trim()) return null
  const key = raw.trim()

  // 命中缓存 → LRU 重排
  const cached = regexCache.get(key)
  if (cached) {
    regexCache.delete(key)
    regexCache.set(key, cached)
    if (cached.global || cached.sticky) cached.lastIndex = 0
    return cached
  }

  const s = key
  let regex: RegExp | null = null

  // 标准格式：/pattern/flags
  const m = s.match(/^\/(.+)\/([gimsuy]*)$/)
  if (m) {
    try { regex = new RegExp(m[1], m[2] || 'g') } catch { /* skip */ }
  }

  // 非标准格式：作为转义字面量
  if (!regex) {
    try { regex = new RegExp(escapeRegex(s), 'gi') } catch { return null }
  }

  // 写入缓存（超限淘汰最旧）
  if (regexCache.size >= MAX_CACHE) {
    const first = regexCache.keys().next().value
    if (first) regexCache.delete(first)
  }
  regexCache.set(key, regex)
  return regex
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 对文本执行单条正则规则
 */
export function applyRegex(entry: RegexEntry, text: string): string {
  if (entry.disabled || !entry.findRegex || !text) return text

  const regex = parseRegex(entry.findRegex)
  if (!regex) return text

  let result = text

  // 执行正则替换
  try {
    result = result.replace(regex, entry.replaceString || '')
  } catch {
    // 正则执行失败则跳过
    return text
  }

  // 去除 trimStrings 中指定的前后缀
  for (const trim of entry.trimStrings || []) {
    if (!trim) continue
    // 转义后作为字面量去除
    const escaped = escapeRegex(trim)
    try {
      result = result.replace(new RegExp(escaped, 'gi'), '')
    } catch { /* skip broken trim */ }
  }

  return result
}

/**
 * 批量执行规则列表（按数组顺序）
 */
export function applyRegexList(entries: RegexEntry[], text: string, placement: number): string {
  if (!entries.length || !text) return text

  let result = text
  for (const entry of entries) {
    if (entry.disabled) continue
    if (!entry.placement.includes(placement)) continue
    result = applyRegex(entry, result)
  }
  return result
}

/**
 * 从 JSON 字符串导入正则列表
 */
export function importRegexJson(jsonStr: string): { success: boolean; imported: number; errors: string[]; entries: RegexEntry[] } {
  const errors: string[] = []

  let data: unknown
  try { data = JSON.parse(jsonStr) } catch (e: any) {
    return { success: false, imported: 0, errors: [`JSON 解析失败: ${e.message}`], entries: [] }
  }

  let rawArr: any[]
  if (Array.isArray(data)) {
    rawArr = data
  } else if (data && typeof data === 'object' && Array.isArray((data as any).entries)) {
    rawArr = (data as any).entries
  } else if (data && typeof data === 'object' && Array.isArray((data as any).regex)) {
    rawArr = (data as any).regex
  } else {
    return { success: false, imported: 0, errors: ['格式错误：期望数组'], entries: [] }
  }

  const entries: RegexEntry[] = []
  let idCounter = 0
  function genId(): string { idCounter++; return `re-${Date.now()}-${idCounter}` }

  for (let i = 0; i < rawArr.length; i++) {
    const raw = rawArr[i] as any
    if (!raw || typeof raw !== 'object') { errors.push(`#${i + 1}: 无效条目`); continue }

    // 跳过只有占位符的条目
    if (!raw.scriptName && !raw.findRegex) continue

    const entry: RegexEntry = {
      id: raw.id || genId(),
      scriptName: (raw.scriptName || '').trim(),
      findRegex: (raw.findRegex || '').trim(),
      replaceString: raw.replaceString || '',
      trimStrings: Array.isArray(raw.trimStrings) ? raw.trimStrings : [],
      placement: Array.isArray(raw.placement) && raw.placement.length > 0 ? raw.placement : [2],
      disabled: raw.disabled === true,
      markdownOnly: raw.markdownOnly !== false,
      promptOnly: raw.promptOnly === true,
      runOnEdit: raw.runOnEdit !== false,
      substituteRegex: typeof raw.substituteRegex === 'number' ? raw.substituteRegex : 0,
      minDepth: raw.minDepth ?? null,
      maxDepth: raw.maxDepth ?? null,
    }
    entries.push(entry)
  }

  return { success: entries.length > 0, imported: entries.length, errors, entries }
}
