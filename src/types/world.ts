// ============================================================
// wandou v0.7 — 豌豆星际漂流 · 世界类型
// ============================================================

import type { CharacterInfo, GameMessage, ApiConfig } from './game'
import type { WorldBookEntry } from './worldBook'
import type { NpcEntry } from './npc'

/** 一个完整的游戏世界 */
export interface World {
  id: string
  name: string              // 世界名称
  description: string       // 世界描述（注入 system prompt）
  createdAt: number
  updatedAt: number
  character: CharacterInfo  // 玩家角色
  npcs: NpcEntry[]          // NPC 列表
  messages: GameMessage[]   // 聊天历史
  worldBook: WorldBookEntry[]
  worldBookEnabled: boolean
}

/** 世界列表项（轻量元数据，不包含消息等大数据） */
export interface WorldMeta {
  id: string
  name: string
  description: string
  characterName: string     // 玩家角色名
  messageCount: number      // 消息数量
  createdAt: number
  updatedAt: number
}

/** 世界存档数据（存储用） */
export interface WorldSave {
  version: string
  world: World
  apiConfig: ApiConfig
}
