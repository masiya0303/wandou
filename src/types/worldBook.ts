// ============================================================
// wandou v0.2 — 豌豆星际漂流 · 世界书类型定义
// 兼容 SillyTavern 世界书 JSON 格式
// ============================================================

/** 单条世界书条目 */
export interface WorldBookEntry {
  id: string
  keys: string[]       // 触发关键词（命中任一即触发）
  content: string      // 注入到 Prompt 的背景文本
  comment?: string     // 条目备注 / 标题
  enabled: boolean     // 是否启用
  priority: number     // 优先级 0-100，越高排在越前面
  position: 'before' | 'after' | 'at_constant'
  // before: 注入在 system prompt 之前
  // after: 注入在 system prompt 之后
  // at_constant: 始终注入（不受关键词匹配影响）
}

/** 世界书包 = 条目数组 */
export type WorldBookPack = WorldBookEntry[]

/** 导入 JSON 时容错的原始条目格式（id 和 enabled 可选） */
export interface RawWorldBookEntry {
  keys?: string[] | string
  content?: string
  comment?: string
  enabled?: boolean
  priority?: number
  position?: 'before' | 'after' | 'at_constant'
  // 也兼容 ST 的字段名
  key?: string[] | string
  secondary_keys?: string[]
  text?: string
  memo?: string
}

/** 导入结果 */
export interface ImportResult {
  success: boolean
  imported: number
  errors: string[]
  entries: WorldBookEntry[]
}
