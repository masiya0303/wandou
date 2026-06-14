// ============================================================
// wandou · JSON 提取工具（stateEngine + variableEngine 共用）
// ============================================================

/** 对 LLM 输出的 JSON 做容错清理：尾逗号、注释、裸键名 */
function sanitizeJsonLike(raw: string): string {
  let s = raw
  // 移除行注释 // ...
  s = s.replace(/\/\/[^\n]*/g, '')
  // 移除块注释 /* ... */
  s = s.replace(/\/\*[\s\S]*?\*\//g, '')
  // 移除尾逗号（数组 […] 和对象 {…} 内）
  s = s.replace(/,(\s*[}\]])/g, '$1')
  // 为无引号的 key 加双引号（容忍 {title:"..."} 这种 JS 写法）
  s = s.replace(/([{,]\s*)([a-zA-Z_$一-鿿][a-zA-Z0-9_$一-鿿]*)\s*:/g, '$1"$2":')
  return s
}

/** 安全解析 JSON（自动容错 LLM 常见格式错误），失败返回 null */
export function safeParseJson(raw: string): any {
  try { return JSON.parse(raw.trim()) } catch { /* try sanitized */ }
  try { return JSON.parse(sanitizeJsonLike(raw)) } catch { /* try repair */ }
  return tryRepairTruncatedJson(raw)
}

/**
 * 尝试修复被截断的 JSON 数组。
 * AI 输出可能达到 max_tokens 限制导致 JSON 在半路截断，
 * 例如 [{"op":"add",...}, {"op":"rep   ← 这里断了
 * 本函数尝试：去掉最后一个不完整元素，补上 ]，重新解析。
 */
export function tryRepairTruncatedJson(raw: string): any {
  let s = raw.trim()
  if (!s.startsWith('[')) return null

  // 清理：去掉末尾不完整的内容（最后一个未闭合的 { 或 "）
  s = sanitizeJsonLike(s)

  // 从末尾向前找最后一个完整的 } 或 ]，截断并补 ]
  let depth = 0
  let inString = false
  let escaped = false
  let lastComplete = -1

  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (escaped) { escaped = false; continue }
    if (ch === '\\') { escaped = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === '{' || ch === '[') depth++
    else if (ch === '}' || ch === ']') {
      depth--
      if (depth === 0 && (ch === '}' || ch === ']')) {
        lastComplete = i + 1
      }
    }
  }

  if (lastComplete <= 0) return null

  // 尝试: 截断到最后一个完整元素 → 补 ]
  let repaired = s.slice(0, lastComplete)
  // 去掉尾部可能的多余逗号
  repaired = repaired.replace(/,(\s*)$/, '$1')
  // 补上闭合括号（如果数组未闭合）
  if (!repaired.trimEnd().endsWith(']')) {
    repaired += ']'
  }

  try { return JSON.parse(repaired) } catch { /* give up */ }
  return null
}

/** 从文本中提取平衡的 JSON 对象或数组（如果首字符不是括号，从第一个括号位置开始） */
export function extractBalancedJson(text: string): string | null {
  const s = text.trim()
  if (!s) return null
  let firstChar = s[0]
  if (firstChar !== '{' && firstChar !== '[') {
    // 搜索第一个括号
    const idx = Math.min(
      s.indexOf('{') >= 0 ? s.indexOf('{') : Infinity,
      s.indexOf('[') >= 0 ? s.indexOf('[') : Infinity,
    )
    if (!isFinite(idx)) return null
    // 从 idx 开始提取
    const slice = s.slice(idx)
    return extractBalancedJson(slice)
  }

  const closer = firstChar === '{' ? '}' : ']'
  const stack: string[] = []
  let inString = false
  let escaped = false

  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (inString) {
      if (escaped) { escaped = false; continue }
      if (ch === '\\') { escaped = true; continue }
      if (ch === '"') { inString = false }
      continue
    }
    if (ch === '"') { inString = true; continue }
    if (ch === '{' || ch === '[') { stack.push(ch); continue }
    if (ch === closer && stack.length === 1) return s.slice(0, i + 1)
    if (ch === '}' || ch === ']') {
      const last = stack.pop()
      if (!last) return null
      if ((ch === '}' && last !== '{') || (ch === ']' && last !== '[')) return null
    }
  }
  return null
}
