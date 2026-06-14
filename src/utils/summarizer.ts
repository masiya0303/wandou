// ============================================================
// wandou · 对话历史摘要引擎
//
// 当消息数超过阈值时，调用 AI 将旧消息压缩为摘要，
// 以 system 消息形式插入消息列表头部，防止 token 溢出。
// ============================================================

import type { GameMessage, ApiConfig } from '@/types/game'
import { chatStream } from '@/utils/api'

/** 默认摘要触发阈值（消息条数） */
export const DEFAULT_SUMMARY_THRESHOLD = 40

/** 最近保留原文的消息数（不参与摘要） */
const KEEP_RECENT = 20

/** 摘要专用系统提示词 */
const SUMMARY_SYSTEM_PROMPT = `你是游戏记录压缩器。将对话历史压缩为简洁摘要，保留：
- 所有重要事件（获得物品、完成任务、NPC登场/离场、战斗、关键对话）
- 关键角色的名字、身份、与玩家的关系
- 时间/地点变化的时间线
- 保留玩家已完成的任务和当前活跃任务

格式要求：
- 用中文，要点列表
- 省略无关紧要的闲聊和过渡描述
- 尽量压缩，不超过 500 字`

/**
 * 判断是否需要触发摘要。
 * @returns 需要摘要时返回 true
 */
export function shouldSummarize(messages: GameMessage[], threshold: number = DEFAULT_SUMMARY_THRESHOLD): boolean {
  if (threshold <= 0) return false
  // 只数 user + assistant 消息（不数 system 和已存在的摘要）
  const conversational = messages.filter(m => m.role === 'user' || m.role === 'assistant')
  return conversational.length >= threshold
}

/**
 * 将消息数组中最旧的对话替换为摘要 system 消息。
 * 保留最近 KEEP_RECENT 条 user+assistant 消息原文。
 *
 * @returns 包含摘要消息的新消息数组，失败时返回 null（调用方应回退到原始消息）
 */
export async function summarizeHistory(
  messages: GameMessage[],
  apiConfig: ApiConfig,
): Promise<GameMessage[] | null> {
  // 分离要摘要的部分和保留的部分
  const conversational = messages.filter(m => m.role === 'user' || m.role === 'assistant')
  if (conversational.length <= KEEP_RECENT) return null

  const toSummarize = conversational.slice(0, conversational.length - KEEP_RECENT)
  if (toSummarize.length === 0) return null

  // 构建摘要请求的输入
  const historyText = toSummarize
    .map(m => `${m.role === 'user' ? '玩家' : 'AI'}: ${m.content.slice(0, 500)}`)
    .join('\n')

  try {
    const summaryMessages: Array<{ role: string; content: string }> = [
      { role: 'user', content: `请压缩以下对话历史：\n\n${historyText.slice(0, 8000)}` },
    ]

    const summaryText = await chatStream(
      apiConfig,
      SUMMARY_SYSTEM_PROMPT,
      summaryMessages as any,
      () => {}, // 不需要流式展示
    )

    const trimmed = summaryText.trim()
    if (!trimmed || trimmed.length < 20) return null

    // 构建摘要 system 消息
    const summaryMsg: GameMessage = {
      id: `summary-${Date.now()}`,
      role: 'system',
      content: `📋 【对话历史摘要】\n${trimmed}`,
      timestamp: Date.now(),
    }

    // 构建新消息数组：
    // system消息（旧摘要） + 新摘要 + 保留的原文
    const existingSummaries = messages.filter(m => m.role === 'system' && m.id.startsWith('summary-'))
    const kept = conversational.slice(conversational.length - KEEP_RECENT)

    const result: GameMessage[] = [
      ...existingSummaries,
      summaryMsg,
      ...kept,
    ]

    console.warn(`[wandou] 📋 摘要完成：${toSummarize.length} 条消息 → ${trimmed.length} 字摘要`)
    return result

  } catch (e: any) {
    console.warn('[wandou] 摘要生成失败，跳过本轮摘要:', e.message)
    return null
  }
}
