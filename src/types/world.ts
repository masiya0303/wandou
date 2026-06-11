// ============================================================
// wandou v0.7 — 豌豆星际漂流 · 世界类型
// ============================================================

import type { CharacterInfo, GameMessage, ApiConfig } from './game'
import type { WorldBookEntry } from './worldBook'
import type { NpcEntry } from './npc'

/** 背包物品 */
export interface InventoryItem {
  id: string
  name: string
  description: string
  quantity: number
  type: 'weapon' | 'armor' | 'consumable' | 'material' | 'key' | 'other'
}

/** 任务 */
export interface Quest {
  id: string
  title: string
  description: string
  status: 'active' | 'completed' | 'failed'
  objectives: string[]
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
}

export interface WorldMeta {
  id: string; name: string; description: string; characterName: string
  messageCount: number; createdAt: number; updatedAt: number
}

export interface WorldSave {
  version: string; world: World; apiConfig: ApiConfig
}
