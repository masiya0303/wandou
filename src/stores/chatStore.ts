// ============================================================
// wandou · 聊天 / 消息 Store
//
// 架构 v6：
//   第一次调用（流式）→ AI 讲纯故事
//   第二次调用（后台）→ extractStateFromStory() 提取状态变化
// ============================================================
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { GameMessage } from '@/types/game'
import { chatStream, abortGeneration } from '@/utils/api'
import { buildContextParts } from '@/utils/contextBuilder'
import { processVariableUpdates, extractStateFromStory } from '@/utils/variableEngine'
import { extractMemories, commitMemories } from '@/utils/memoryEngine'
import { shouldSummarize, summarizeHistory } from '@/utils/summarizer'
import { getMemoryRuntime } from '@/utils/memoryRuntime'
import { usePlayerStore } from './playerStore'
import { useStateStore } from './stateStore'
import { useNpcStore } from './npcStore'
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

  /** AI 思考过程 — messageId → thinking 文本 */
  const thinkingMap = ref<Record<string, string>>({})
  const stateSyncEnabled = ref(true)
  const memorySyncEnabled = ref(true)
  /** 是否启用对话历史自动摘要 */
  const summaryEnabled = ref(true)
  /** 摘要触发阈值（消息条数，0=不启用） */
  const summaryThreshold = ref(40)

  const messageCount = computed(() => messages.value.length)

  // 保留最后一次输入用于手动重试
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

  async function sendMessage(userInput: string, skipAddUser: boolean = false) {
    if (isGenerating.value || !userInput.trim()) return

    const api = useApiStore()
    const player = usePlayerStore()
    // ---- 摘要检查 ----
    if (summaryEnabled.value && shouldSummarize(messages.value, summaryThreshold.value)) {
      const result = await summarizeHistory(messages.value, api.apiConfig)
      if (result) {
        messages.value = result
      }
    }

    error.value = ''
    _lastInput = userInput.trim()

    if (!skipAddUser) {
      const userMsg: GameMessage = {
        id: `user-${Date.now()}`, role: 'user',
        content: _lastInput, timestamp: Date.now(),
      }
      addMessage(userMsg)
      bus.emit('chat:message_sent', userMsg)
    }

    // 插入 AI 占位符
    const aiMsg: GameMessage = {
      id: `assistant-${Date.now()}`, role: 'assistant',
      content: '', timestamp: Date.now(),
    }
    addMessage(aiMsg)

    const messagesToSend = messages.value.slice(0, -1) // 排除 AI 占位符
    isGenerating.value = true
    bus.emit('chat:generation_start', aiMsg)

    try {
      // ====== 第一次调用：纯讲故事（流式） ======
      const contextParts = buildContextParts({
        stateSyncEnabled: stateSyncEnabled.value,
        memorySyncEnabled: memorySyncEnabled.value,
        messages: messages.value,
        userInput: _lastInput || '',
      })
      const systemPrompt = api.buildSystemPrompt(contextParts)

      aiMsg.content = await chatStream(
        api.apiConfig,
        systemPrompt,
        messagesToSend,
        (token) => {
          aiMsg.content += token
          bus.emit('chat:generation_token', token, aiMsg)
        },
      )

      if (aiMsg.content) {
        // 防御性剥离标签（叙事 AI 不该输出这些，但防一手）
        aiMsg.content = aiMsg.content
          .replace(/<thinking\b[^>]*>[\s\S]*?<\/thinking\s*>/gi, '')
          .replace(/<mj_variables\b[^>]*>[\s\S]*?<\/mj_variables\s*>/gi, '')
          .trim()

        // ====== 第二次调用：提取状态变化（后台，不流式） ======
        if (stateSyncEnabled.value) {
          try {
            const extraction = await extractStateFromStory(
              api.apiConfig,
              aiMsg.content,
              _lastInput,
            )

            if (extraction) {
              // 保存 thinking → 蛋糕 UI
              if (extraction.thinking) {
                thinkingMap.value[aiMsg.id] = extraction.thinking
                console.warn('[wandou] 🧠 提取思考: ' + extraction.thinking.length + '字')
              }

              // 处理变量更新
              if (extraction.rawVariables) {
                player.beginTurn()
                const varResult = processVariableUpdates(extraction.rawVariables)

                // 物品 toast
                const placedItems: { name: string; quantity: number }[] = []
                const removedItems: { name: string; quantity: number }[] = []
                for (const entry of varResult.operations) {
                  if (!entry.result) continue
                  const op = entry.op
                  if (op.path.includes('/inventory')) {
                    if (op.op === 'add' || (op.op === 'replace' && op.path.endsWith('/-'))) {
                      const name = op.value?.name || op.value?.名称 || ''
                      const qty = op.value?.quantity ?? op.value?.数量 ?? 1
                      if (name) placedItems.push({ name, quantity: qty })
                    } else if (op.op === 'remove') {
                      const parts = op.path.split('/').filter(Boolean)
                      const name = parts[parts.length - 1] || ''
                      if (name && name !== '-') removedItems.push({ name, quantity: 1 })
                    }
                  }
                }
                if (placedItems.length > 0 || removedItems.length > 0) {
                  emitItemToast(placedItems, removedItems)
                }

                // 任务 toast
                for (const entry of varResult.operations) {
                  if (!entry.result || !entry.op.path) continue
                  if (entry.op.path.includes('/quests') || entry.op.path.includes('/任务')) {
                    if (entry.result.startsWith('📋')) {
                      bus.emit('quest:added', { title: entry.result.replace('📋 新任务：', '') })
                    }
                  }
                }

                if (varResult.summary) {
                  console.warn('[wandou] 变量变更汇总:', varResult.summary)
                }
              }
            }
          } catch (extractErr: any) {
            console.warn('[wandou] 状态提取失败（不影响叙事）:', extractErr?.message || extractErr)
          }
        }

        // 将 thinking 嵌入消息（随存档持久化）
        const thinkText = thinkingMap.value[aiMsg.id]
        if (thinkText) {
          aiMsg.content += '\n<!--thinking:' + JSON.stringify(thinkText) + '-->'
        }

        // ---- 记忆提取（异步 + MemoryRuntime 摄入管道） ----
        if (memorySyncEnabled.value) {
          const ctx = messages.value
            .slice(Math.max(0, messages.value.length - 6), -1)
            .map(m => `${m.role}: ${m.content}`)
            .join('\n')

          // 传统记忆提取（兼容）
          extractMemories(aiMsg.content, ctx)
            .then(entries => { if (entries.length > 0) commitMemories(entries) })
            .catch(() => {})

          // MemoryRuntime 摄入管道
          try {
            const mr = getMemoryRuntime()
            const state = useStateStore()
            const npc = useNpcStore()
            const playerStore = usePlayerStore()
            // 同步 store 状态到编译器运行时
            mr.syncFromStores({
              worldTime: state.worldTime,
              location: state.currentLocation,
              weather: state.weather,
              npcs: npc.npcs,
              inventory: playerStore.inventory.map(i => ({
                name: i.name, quantity: i.quantity, type: i.type,
              })),
              quests: playerStore.quests,
              memories: state.memories,
              characterGold: playerStore.character.gold ?? 0,
              characterAttributes: (playerStore.character.attributes || {}) as Record<string, number>,
              turnIndex: state.turnIndex,
            })
            // 摄入新记忆到运行时
            await mr.ingestTurn(aiMsg.content, api.apiConfig)
            // 运行生命周期
            mr.runLifecycle()
            // 每 12 轮自动保存检查点
            if (state.turnIndex % 12 === 0) {
              await mr.saveCheckpoint(messages.value)
            }
          } catch (mrErr: any) {
            console.debug('[wandou] MemoryRuntime 摄入跳过:', mrErr?.message || mrErr)
          }
        }
      }

      bus.emit('chat:message_received', aiMsg)
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        const aiEmpty = messages.value.find(m => m.id === aiMsg.id && m.content === '')
        if (aiEmpty) messages.value = messages.value.filter(m => m.id !== aiMsg.id)
      } else {
        const msg = e?.message || '请求失败'
        error.value = msg
        errorType.value = classifyError(msg)
        messages.value = messages.value.filter(m => m.id !== aiMsg.id)
        bus.emit('chat:error', e)
      }
    } finally {
      isGenerating.value = false
      bus.emit('chat:generation_end', aiMsg)
    }
  }

  /** 错误后重试 — 复用上次输入（不重复添加用户消息） */
  function retry() {
    if (isGenerating.value || !_lastInput) return
    error.value = ''
    sendMessage(_lastInput, true)
  }

  function dismissError() {
    error.value = ''
  }

  /** 重新生成指定 AI 回复（默认最后一条）。
   *  会移除该 AI 消息及之后的所有消息，再移除其前面的 user 消息，最后用原 user 输入重新发送。 */
  async function regenerate(aiMsgId?: string) {
    if (isGenerating.value) return

    const targetId = aiMsgId
    let aiIdx: number

    if (targetId) {
      aiIdx = messages.value.findIndex(m => m.id === targetId)
      if (aiIdx === -1 || messages.value[aiIdx].role !== 'assistant') return
    } else {
      // 默认最后一条 assistant
      aiIdx = -1
      for (let i = messages.value.length - 1; i >= 0; i--) {
        if (messages.value[i].role === 'assistant') { aiIdx = i; break }
      }
      if (aiIdx === -1) return
    }

    // 找该 AI 消息前面的 user 消息
    let userIdx = -1
    for (let i = aiIdx - 1; i >= 0; i--) {
      if (messages.value[i].role === 'user') { userIdx = i; break }
    }
    if (userIdx === -1) return

    const userContent = messages.value[userIdx].content

    // 移除 aiIdx 及之后的所有消息
    messages.value.splice(aiIdx)
    // 移除那条 user 消息（它的索引可能变了，但 userIdx < 当前的 aiIdx，splice 后 userIdx 还在）
    // 注意：splice(aiIdx) 后 messages 长度变成 aiIdx，userIdx 一定 < aiIdx
    messages.value.splice(userIdx, 1)

    // 清除错误
    error.value = ''

    await sendMessage(userContent)
  }

  function stopGeneration() {
    abortGeneration()
    bus.emit('chat:generation_stop')
  }

  function snapshot(): GameMessage[] { return [...messages.value] }

  function restore(data: GameMessage[]) {
    messages.value = data || []
    // 从消息中的 <!--thinking:...--> 恢复 thinkingMap
    thinkingMap.value = {}
    const thinkRe = /<!--thinking:([\s\S]*?)-->/g
    for (const msg of messages.value) {
      if (msg.role !== 'assistant') continue
      let m: RegExpExecArray | null
      while ((m = thinkRe.exec(msg.content)) !== null) {
        const raw = m[1].trim()
        try {
          thinkingMap.value[msg.id] = JSON.parse(raw)
        } catch {
          // JSON 解析失败（可能是旧格式或截断），保留原始文本
          thinkingMap.value[msg.id] = raw
        }
      }
    }
    console.warn('[wandou] thinking 恢复:', Object.keys(thinkingMap.value).length, '条')
  }

  return {
    messages, isGenerating, error, errorType, messageCount,
    thinkingMap,
    stateSyncEnabled, memorySyncEnabled,
    summaryEnabled, summaryThreshold,
    addMessage, clearMessages, sendMessage, retry, dismissError,
    regenerate, stopGeneration, snapshot, restore,
  }
})
