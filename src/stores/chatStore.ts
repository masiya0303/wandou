// ============================================================
// wandou · 聊天 / 消息 Store
// 上下文构建 → contextBuilder.ts / 状态同步 → stateEngine.ts / 记忆提取 → memoryEngine.ts
//
// 物品同步策略：
//   1. 标签解析（同步，主路径）：applyStateTurn → playerStore.applyOps
//   2. API 提取（异步，回退路径）：extractItems → playerStore.applyOps
//   3. 两种路径统一通过 playerStore.applyOps，本回合自动去重
//   4. 物品通知通过 bus.emit('inventory:toast', ...) 发送 toast，不插入聊天消息
// ============================================================
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { GameMessage } from '@/types/game'
import { chatStream, abortGeneration } from '@/utils/api'
import { buildContextParts } from '@/utils/contextBuilder'
import {
  applyStateTurn,
  stripStateTags,
} from '@/utils/stateEngine'
import { processVariableUpdates } from '@/utils/variableEngine'
import { extractMemories, commitMemories } from '@/utils/memoryEngine'
import { extractItems } from '@/utils/itemExtractor'
import { usePlayerStore } from './playerStore'
import { bus } from '@/utils/events'
import { useApiStore } from './apiStore'

export type ErrorType = 'auth' | 'rate_limit' | 'server' | 'network' | 'timeout' | 'unknown'

function classifyError(msg: string): ErrorType {
  const m = msg.toLowerCase()
  if (m.includes('key') || m.includes('无权') || m.includes('401') || m.includes('403')) return 'auth'
  if (m.includes('频繁') || m.includes('稍后再试') || m.includes('429')) return 'rate_limit'
  if (m.includes('重试') || m.includes('502') || m.includes('503')) return 'server'
  if (m.includes('aborted') || m.includes('timeout') || m.includes('超时')) return 'timeout'
  if (m.includes('network') || m.includes('fetch') || m.includes('连接')) return 'network'
  return 'unknown'
}

const RECOVERY_HINTS: Record<ErrorType, string> = {
  auth: '请前往设置 → API 配置检查 Key 和地址',
  rate_limit: '请求太密集，稍等片刻后重试',
  server: '上游服务暂时故障，可稍后重试',
  timeout: '连接超时，检查网络或 API 地址',
  network: '网络不通，请检查连接或 API 地址',
  unknown: '',
}

export function getErrorHint(type: ErrorType): string { return RECOVERY_HINTS[type] }

export const useChatStore = defineStore('chat', () => {
  const messages = ref<GameMessage[]>([])
  const isGenerating = ref(false)
  const error = ref('')
  const errorType = ref<ErrorType>('unknown')
  const stateSyncEnabled = ref(true)
  const memorySyncEnabled = ref(true)
  /** 是否启用 API 物品提取回退（当 AI 没输出标签时） */
  const itemExtractionFallback = ref(true)

  const messageCount = computed(() => messages.value.length)

  // 保留最后一次输入用于重试
  let _lastInput = ''

  function addMessage(msg: GameMessage) { messages.value.push(msg) }
  function clearMessages() { messages.value = []; _lastInput = '' }

  /**
   * 发送物品 toast 通知（不插入聊天消息）
   */
  function emitItemToast(placed: { name: string; quantity: number }[], removed: { name: string; quantity: number }[]) {
    const parts: string[] = []
    for (const p of placed) {
      parts.push(`📦 获得 ${p.name}${p.quantity > 1 ? ' ×' + p.quantity : ''}`)
    }
    for (const r of removed) {
      parts.push(`🗑️ 失去 ${r.name}${r.quantity > 1 ? ' ×' + r.quantity : ''}`)
    }
    if (parts.length > 0) {
      bus.emit('inventory:toast', { message: parts.join('；'), placed, removed })
    }
  }

  async function sendMessage(userInput: string) {
    if (isGenerating.value || !userInput.trim()) return

    const api = useApiStore()
    const player = usePlayerStore()
    error.value = ''
    _lastInput = userInput.trim()

    const userMsg: GameMessage = {
      id: `user-${Date.now()}`, role: 'user',
      content: _lastInput, timestamp: Date.now(),
    }
    addMessage(userMsg)
    bus.emit('chat:message_sent', userMsg)

    const aiMsg: GameMessage = {
      id: `assistant-${Date.now()}`, role: 'assistant',
      content: '', timestamp: Date.now(),
    }
    addMessage(aiMsg)
    isGenerating.value = true
    bus.emit('chat:generation_start', aiMsg)

    try {
      const contextParts = buildContextParts({
        stateSyncEnabled: stateSyncEnabled.value,
        memorySyncEnabled: memorySyncEnabled.value,
        messages: messages.value,
      })
      const systemPrompt = api.buildFullSystemPrompt(contextParts)

      aiMsg.content = await chatStream(
        api.apiConfig,
        systemPrompt,
        messages.value.slice(0, -1),
        (token) => {
          aiMsg.content += token
          bus.emit('chat:generation_token', token, aiMsg)
        },
      )

      if (aiMsg.content) {
        const rawText = aiMsg.content

        // ---- 第1层：标签解析（同步，主路径） ----
        if (stateSyncEnabled.value) {
          // 重要：beginTurn() 必须在 processVariableUpdates 和 applyStateTurn 之前调用，
          // 这样两者的去重标记才能在同一回合内生效
          player.beginTurn()
          processVariableUpdates(rawText)  // 静默应用变量（含物品操作）
          const turnResult = applyStateTurn(rawText)  // 标签解析（世界/玩家/NPC/物品）

          // 标签解析得到的物品变更 → toast
          if (turnResult.inventory.placed.length > 0 || turnResult.inventory.removed.length > 0) {
            emitItemToast(
              turnResult.inventory.placed.map(p => ({ name: p.name, quantity: p.quantity || 1 })),
              turnResult.inventory.removed.map(r => ({ name: r.name, quantity: r.quantity || 1 })),
            )
          }
        }

        // 剥离所有标签（含 thinking），保留干净正文
        aiMsg.content = stripStateTags(rawText)

        // ---- 第2层：API 提取（异步，回退路径） ----
        // 只在启用回退且标签解析没有处理到物品时才调用
        if (stateSyncEnabled.value && itemExtractionFallback.value) {
          extractItems(api.apiConfig, messages.value.slice(0, -1), rawText)
            .then(items => {
              if (items.length === 0) return

              // 转换为统一格式 → 通过 playerStore 统一入口（去重自动生效）
              const ops = items.map(item => ({
                op: item.op,
                name: item.name,
                quantity: item.quantity,
                type: item.type,
                description: item.description,
              }))
              const result = player.applyOps(ops)

              if (result.placed.length > 0 || result.removed.length > 0) {
                emitItemToast(
                  result.placed.map(p => ({ name: p.name, quantity: p.quantity })),
                  result.removed.map(r => ({ name: r.name, quantity: r.quantity })),
                )
              }
            })
            .catch(() => {
              // 静默失败 — API 提取只是回退方案
            })
        }

        // ---- 记忆提取（异步） ----
        if (memorySyncEnabled.value) {
          const ctx = messages.value
            .slice(Math.max(0, messages.value.length - 6), -1)
            .map(m => `${m.role}: ${m.content}`)
            .join('\n')
          extractMemories(aiMsg.content, ctx)
            .then(entries => { if (entries.length > 0) commitMemories(entries) })
            .catch(() => {})
        }
      }

      bus.emit('chat:message_received', aiMsg)
    } catch (e: any) {
      // 用户主动停止 / 新请求替换旧请求 → 静默处理，不显示错误
      if (e?.name === 'AbortError') {
        // 只清理 AI 空消息，不弹错误
        const aiEmpty = messages.value.find(m => m.id === aiMsg.id && m.content === '')
        if (aiEmpty) messages.value = messages.value.filter(m => m.id !== aiMsg.id)
      } else {
        const msg = e?.message || '请求失败'
        error.value = msg
        errorType.value = classifyError(msg)
        // 只有非 Abort 错误才删除 ai 消息（让用户看到部分内容）
        messages.value = messages.value.filter(m => m.id !== aiMsg.id)
        bus.emit('chat:error', e)
      }
    } finally {
      isGenerating.value = false
      bus.emit('chat:generation_end', aiMsg)
    }
  }

  /** 错误后重试 — 复用上次输入 */
  function retry() {
    if (isGenerating.value || !_lastInput) return
    error.value = ''
    sendMessage(_lastInput)
  }

  function dismissError() {
    error.value = ''
  }

  async function regenerate() {
    if (isGenerating.value) return
    const last = messages.value[messages.value.length - 1]
    if (last?.role === 'assistant') messages.value.pop()
    const u = messages.value[messages.value.length - 1]
    if (u?.role === 'user') {
      const c = u.content
      messages.value.pop()
      await sendMessage(c)
    }
  }

  function stopGeneration() {
    abortGeneration()
    bus.emit('chat:generation_stop')
  }

  function snapshot(): GameMessage[] { return [...messages.value] }
  function restore(data: GameMessage[]) { messages.value = data || [] }

  return {
    messages, isGenerating, error, errorType, messageCount,
    stateSyncEnabled, memorySyncEnabled, itemExtractionFallback,
    addMessage, clearMessages, sendMessage, retry, dismissError,
    regenerate, stopGeneration, snapshot, restore,
  }
})
