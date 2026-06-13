// ============================================================
// wandou v0.7 — 豌豆 · NPC 角色书类型
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
  /** 曾用名/别称列表（用于路径模糊匹配，如"陌生人"→"远坂凛"后仍可用旧名匹配） */
  aliases?: string[]
  /** 身份揭示历史：按时间顺序记录每次改名 [{from, to, turnIndex}] */
  identityHistory?: Array<{ from: string; to: string; turnIndex: number }>
  /** NPC 是否已完成身份揭示（name 不再是占位名） */
  identityRevealed?: boolean
  // ---- yijiekkk-style 语义化字段（全部 optional，向后兼容） ----
  /** 人物分类：在场=场景内活跃，离场=已离开，重点=剧情关键角色 */
  人物分类?: '在场' | '离场' | '重点'
  /** 人物事迹：关键事件时间线（身份揭示/好感里程碑/重要对话等自动记录） */
  人物事迹?: string[]
  /** 首次登场的对话轮次 */
  出场轮次?: number
  /** 最后一次离场的对话轮次 */
  离场轮次?: number
  // ---- 通用人口学字段 ----
  /** 年龄 */
  age?: number
  /** 性别 */
  gender?: string
  /** 人物介绍（叙事性概括，1-3句话描述这个人是谁） */
  characterIntro?: string
  /** 性经历 */
  sexualExperience?: string
  /** 世界特定属性（动态字段，如 异能/咒术/商业思维 等。key=属性名, value=属性值） */
  extraAttributes?: Record<string, string>
}

/** 导入结果 */
export interface NpcImportResult {
  success: boolean
  imported: number
  errors: string[]
  entries: NpcEntry[]
}
