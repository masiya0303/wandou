// ============================================================
// wandou v0.7 — 豌豆 · 世界类型
// ============================================================

import type { CharacterInfo, GameMessage } from './game'
import type { WorldBookEntry } from './worldBook'
import type { NpcEntry } from './npc'
import type { GameLocation, WorldEvent, MemoryEntry, NpcRelation } from './state'

/** 背包物品 */
export interface InventoryItem {
  id: string
  name: string
  description: string
  quantity: number
  type: 'weapon' | 'armor' | 'consumable' | 'material' | 'key' | 'other'
  /** 可选，物品图标 emoji */
  icon?: string
}

/** 任务 */
export interface Quest {
  id: string
  title: string          // 任务名字
  questType: string      // 任务类型（主线/支线/日常/紧急/隐藏）
  description: string    // 任务内容
  reward: string         // 任务奖励
  color: string          // 任务颜色（hex 色值如 #ff6b6b）
  status: 'active' | 'completed' | 'failed'
  objectives: string[]
  /** 任务来源（NPC 名称或 "system"） */
  source?: string
  /** 发布任务的 NPC ID（如果是 NPC 委托） */
  sourceNpcId?: string
  /** 接取时间（世界时间字符串） */
  acceptedAt?: string
}

/** 一个完整的游戏世界 */
export interface World {
  id: string
  name: string
  description: string
  createdAt: number
  updatedAt: number
  character: CharacterInfo
  npcs: NpcEntry[]
  inventory: InventoryItem[]
  quests: Quest[]
  messages: GameMessage[]
  worldBook: WorldBookEntry[]
  worldBookEnabled: boolean
  /** 状态同步系统：世界状态 */
  stateData?: WorldSaveState
}

export interface WorldSaveState {
  worldTime: string
  currentLocation: GameLocation
  weather: string
  worldEvents: WorldEvent[]
  memories: MemoryEntry[]
  npcRelations: NpcRelation[]
  turnIndex: number
}

export interface WorldMeta {
  id: string; name: string; description: string; characterName: string
  messageCount: number; createdAt: number; updatedAt: number
  /** 存档槽位列表（从 storage 动态读取） */
  slots?: { name: string; timestamp: number; preview: string }[]
}

