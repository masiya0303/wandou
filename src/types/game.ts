// ============================================================
// wandou v0.1 — 豌豆星际漂流 · 类型定义
// ============================================================

/** LLM API 配置 */
export interface ApiConfig {
  baseUrl: string
  apiKey: string
  model: string
  temperature: number
  maxTokens: number
}

/** 单条消息 */
export interface GameMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

/** 角色信息 */
export interface CharacterInfo {
  name: string
  age: number
  gender: string
  background: string   // 角色背景简述
}

/** 游戏存档 */
export interface GameSave {
  version: string
  timestamp: number
  character: CharacterInfo
  messages: GameMessage[]
  systemPrompt: string
  apiConfig: ApiConfig
}

/** 游戏阶段 */
export type GamePhase =
  | 'start'       // 开始画面
  | 'setup'       // 角色+API 设置
  | 'playing'     // 游戏中

/** 设置面板 Tab */
export type SettingsTab = 'api' | 'character' | 'prompt'
