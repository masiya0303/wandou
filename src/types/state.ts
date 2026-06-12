// ============================================================
// wandou · 状态同步系统类型
// ============================================================

/** 世界时间格式：如 "星历 0001年 01月 01日 08:00" */
export interface WorldTime {
  era: string       // "星历" / "公元" etc
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

/** 地点 */
export interface GameLocation {
  region: string    // 主区域（如 "近地轨道空间站"）
  subRegion: string // 子区域（如 "商业区"）
  detail: string    // 详细位置（如 "星光酒馆"）
}

/** 世界事件 */
export interface WorldEvent {
  id: string
  title: string
  description: string
  status: 'active' | 'resolved' | 'expired'
  importance: 1 | 2 | 3 | 4 | 5
  createdAt: string  // 世界时间字符串
  resolvedAt?: string
}

/** 记忆条目 */
export interface MemoryEntry {
  id: string
  fact: string              // 一句话客观描述
  category: MemoryCategory  // 主分类
  secondaryCategories?: MemoryCategory[]
  entities: string[]        // 关联实体名
  keywords: string[]
  importance: 1 | 2 | 3 | 4 | 5
  timeScope: 'short' | 'mid' | 'long'
  state: 'active' | 'resolved' | 'expired' | 'unknown'
  createdAt: number         // unix timestamp
  turnIndex: number         // 产生此记忆的对话轮次
}

export type MemoryCategory =
  | 'task' | 'character' | 'relationship' | 'location'
  | 'faction' | 'event' | 'clue' | 'item' | 'ability'
  | 'status' | 'rule' | 'world'

/** NPC 关系快照 */
export interface NpcRelation {
  npcId: string
  npcName: string
  favorability: number   // -99 ~ 99
  status: string         // "友好" / "中立" / "敌视" 等
  lastInteraction: string // 世界时间
}

// ============================================================
// 状态快照（发给 AI 的）
// ============================================================

/** 玩家状态快照 */
export interface PlayerSnapshot {
  name: string
  gender: string
  age: number
  background: string
  gold: number
  attributes: Record<string, number>
  inventory: { name: string; quantity: number; type: string; description?: string }[]
  equipped?: { name: string; slot: string }[]
  quests: { title: string; description: string; status: string }[]
}

/** NPC 快照（精简版，给 AI） */
export interface NpcSnapshot {
  id: string
  name: string
  role: string
  personality: string
  favorability: number
  isVisible: boolean
  currentHp?: number
  maxHp?: number
}

/** 世界状态快照 */
export interface WorldSnapshot {
  timeString: string
  location: GameLocation
  weather: string
  events: { title: string; description: string; status: string }[]
}

/** 库存操作 */
export interface InventoryOp {
  op: 'add' | 'remove'
  name: string
  quantity?: number
  type?: string
  description?: string
  grade?: string
}

/** 状态 AI 单轮处理结果 */
export interface StateTurnResult {
  ok: boolean
  world: {
    applied: boolean
    timeChanged: boolean
    locationChanged: boolean
    rejectedReason?: string
  }
  player: {
    appliedHp: boolean
    appliedMp: boolean
    goldChanged: boolean
    goldDelta: number
  }
  inventory: {
    placed: InventoryOp[]
    removed: InventoryOp[]
    failed: { op: InventoryOp; reason: string }[]
  }
  npcs: {
    updated: number
    errors: string[]
  }
  parseErrors: string[]
}

// ============================================================
// 规则模板
// ============================================================

/** 标签定义 */
export interface TagDefinition {
  tag: string
  open: string
  close: string
  description: string
  example: string
}
