// ============================================================
// wandou v0.7 — 豌豆 · 基础类型
// ============================================================

/** LLM API 配置 */
export interface ApiConfig {
  baseUrl: string
  apiKey: string
  model: string
  temperature: number
  maxTokens: number
  /** top_p 采样 (0-1)，默认不传则由 API 自行决定 */
  topP?: number
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
  background: string
  gold?: number
  attributes?: Record<string, number>
}
