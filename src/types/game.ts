// ============================================================
// wandou v0.7 — 豌豆星际漂流 · 基础类型
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
  background: string
}
