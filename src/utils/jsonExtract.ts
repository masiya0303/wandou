// ============================================================
// wandou · JSON 提取工具（stateEngine + variableEngine 共用）
// ============================================================

/** 安全解析 JSON，失败返回 null */
export function safeParseJson(raw: string): any {
  try { return JSON.parse(raw.trim()) } catch { return null }
}

/** 去掉 ```json ... ``` 围栏 */
export function stripJsonFence(s: string): string {
  const t = s.trim()
  const m = /^```(?:json)?\s*([\s\S]*?)\s*```$/im.exec(t)
  return m ? m[1].trim() : t
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

/** 从 Markdown 代码块提取 JSON（从后往前找） */
export function tryExtractFromFences(raw: string): any | null {
  const fenceRe = /```(?:json)?\s*([\s\S]*?)\s*```/g
  const matches: string[] = []
  let m: RegExpExecArray | null
  while ((m = fenceRe.exec(raw)) !== null) {
    matches.push(m[1].trim())
  }
  for (let i = matches.length - 1; i >= 0; i--) {
    const parsed = safeParseJson(matches[i])
    if (parsed !== null) return parsed
  }
  return null
}
