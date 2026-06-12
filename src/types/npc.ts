// ============================================================
// wandou v0.7 — 豌豆星际漂流 · NPC 角色书类型
// 自有格式 + SillyTavern 角色卡兼容
// ============================================================

/** NPC 角色书条目 */
export interface NpcEntry {
  id: string
  name: string              // NPC 名字
  keys: string[]            // 触发关键词（名字 + 别名 + 称号）
  role: string              // 身份/职业
  personality: string       // 性格特点
  appearance: string        // 外貌描述
  background: string        // 背景故事
  relationToPlayer: string  // 与玩家的关系
  speechStyle: string       // 说话风格
  scenario: string          // 出场场景
  firstMessage: string      // 首次对话模板（ST 兼容）
  enabled: boolean
  priority: number
  // 运行时动态字段
  favor?: number
  favorability?: number
  currentHp?: number
  maxHp?: number
}

/** 导入结果 */
export interface NpcImportResult {
  success: boolean
  imported: number
  errors: string[]
  entries: NpcEntry[]
}
