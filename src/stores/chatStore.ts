// ============================================================
// wandou · 聊天 / 消息 Store
//
// 变量同步流：
//   1. processVariableUpdates() — 统一解析 <mj_variables> JSON Patch
//   2. playerStore.applyOps() — 统一物品入口（自动去重）
//   3. API 物品提取（异步，回退路径）→ playerStore.applyOps()
// ============================================================
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { GameMessage } from '@/types/game'
import { chatStream, abortGeneration } from '@/utils/api'
import { buildContextParts } from '@/utils/contextBuilder'
import { stripStateTags } from '@/utils/stateEngine'
import { processVariableUpdates } from '@/utils/variableEngine'
import { extractMemories, commitMemories } from '@/utils/memoryEngine'
import { extractItems } from '@/utils/itemExtractor'
import { extractQuests } from '@/utils/questExtractor'
import { shouldSummarize, summarizeHistory } from '@/utils/summarizer'
import { usePlayerStore } from './playerStore'
import { useStateStore } from './stateStore'
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
  /** 是否启用 API 物品提取回退（当 AI 没输出标签时） */
  const itemExtractionFallback = ref(true)
  /** 是否启用对话历史自动摘要 */
  const summaryEnabled = ref(true)
  /** 摘要触发阈值（消息条数，0=不启用） */
  const summaryThreshold = ref(40)

  const messageCount = computed(() => messages.value.length)

  // 保留最后一次输入用于重试
  let _lastInput = ''
  /** 当前发送已自动重试次数（防止死循环，最多重试 2 次） */
  let _thinkingRetryCount = 0
  const MAX_THINKING_RETRIES = 2

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
    // ---- 摘要检查（在添加用户消息前，防止新版被摘要吞掉） ----
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

    // ---- 强制输出格式后缀（追加到最后一条用户消息给 API，但不显示） ----
    const BASE_SUFFIX = `

[系统指令 — 最高优先级]
你必须在回复末尾输出以下两个标签，缺一不可：
1. <thinking>按 Step.0~Step.7 逐项详细检查，每项必须写明"当前值 → 是否有变化 → 结论"，禁止只写"无变化"三个字跳过、禁止只列条目不做推理。总共不低于200字。</thinking>
2. <mj_variables>[...]</mj_variables>（无变量变化时输出 []）
禁止省略任何标签。禁止只写正文不写标签。禁止 thinking 里敷衍了事。
正文已结束。现在输出标签：`

    const VIOLATION_PREFIX = `🛑 你上一轮回复严重违规：没有按 Step.0~Step.7 逐项输出 <thinking> 和 <mj_variables> 标签！

本轮必须严格按照以下模板输出 thinking，每项写明当前值→变化→结论：

`

    const MANDATORY_OUTPUT_SUFFIX = _thinkingRetryCount > 0
      ? VIOLATION_PREFIX + BASE_SUFFIX
      : BASE_SUFFIX

    // 先插入 AI 占位符，再构建 messagesToSend ——
    // slice(0,-1) 应该删掉 AI 占位符而不是用户消息
    const aiMsg: GameMessage = {
      id: `assistant-${Date.now()}`, role: 'assistant',
      content: '', timestamp: Date.now(),
    }
    addMessage(aiMsg)

    // 构建消息数组时，最后一条用户消息追加强制输出格式
    const messagesToSend = messages.value.slice(0, -1).map((m, i, arr) => {
      if (i === arr.length - 1) {
        return { ...m, content: m.content + MANDATORY_OUTPUT_SUFFIX }
      }
      return m
    })
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
        messagesToSend,
        (token) => {
          aiMsg.content += token
          bus.emit('chat:generation_token', token, aiMsg)
        },
      )

      if (aiMsg.content) {
        let rawText = aiMsg.content
        let _savedThinking = ''

        // ---- 提取 AI 思考过程（含自动重试） ----
        function extractThinking(text: string): string | null {
          const m = text.match(/<thinking\b[^>]*>([\s\S]*?)<\/thinking\s*>/i)
          return m ? m[1].trim() : null
        }

        let thinkContent = extractThinking(rawText)
        if (thinkContent) {
          _savedThinking = thinkContent
          thinkingMap.value[aiMsg.id] = thinkContent
          console.warn('[wandou] 🧠 AI 思考过程:\n' + thinkContent)
          _thinkingRetryCount = 0
        } else {
          console.error('[wandou] 🚨 AI 本轮未输出 <thinking> 标签！')
          console.error('[wandou] 完整回复末尾100字符:', rawText.slice(-100))
          bus.emit('chat:thinking_missing', aiMsg.id)

          if (_thinkingRetryCount < MAX_THINKING_RETRIES) {
            _thinkingRetryCount++
            console.warn(`[wandou] 🔄 自动重试 (${_thinkingRetryCount}/${MAX_THINKING_RETRIES})...`)

            // 构建重试用消息（不改 messages 数组）
            const retryMessages = messages.value.slice(0, -1).map((m, i, arr) => {
              if (i === arr.length - 1) {
                return { ...m, content: m.content + VIOLATION_PREFIX + BASE_SUFFIX }
              }
              return m
            })
            const retryContextParts = buildContextParts({
              stateSyncEnabled: stateSyncEnabled.value,
              memorySyncEnabled: memorySyncEnabled.value,
              messages: messages.value,
            })
            const retrySystemPrompt = api.buildFullSystemPrompt(retryContextParts)

            let retryContent = ''
            try {
              retryContent = await chatStream(
                api.apiConfig,
                retrySystemPrompt,
                retryMessages,
                (token) => { retryContent += token; aiMsg.content = retryContent; bus.emit('chat:generation_token', token, aiMsg) },
              )
            } catch (retryErr: any) {
              console.warn('[wandou] 重试被中止，保留第一轮正文:', retryErr?.message || retryErr?.name)
              if (!retryContent) retryContent = rawText // 恢复第一轮内容
            }

            // 重试完成：重新提取 thinking
            rawText = retryContent
            aiMsg.content = retryContent
            const retryThink = extractThinking(retryContent)
            if (retryThink) {
              _savedThinking = retryThink
              thinkingMap.value[aiMsg.id] = retryThink
              console.warn('[wandou] 🧠 AI 思考过程:\n' + retryThink)
            }
            _thinkingRetryCount = 0
          } else {
            console.error('[wandou] ❌ thinking 缺失已达最大重试次数，放弃自动重试')
            _thinkingRetryCount = 0
          }
        }

        // ---- 统一变量处理（唯一入口） ----
        if (stateSyncEnabled.value) {
          // beginTurn() 必须在 processVariableUpdates 之前调用，确保去重标记在同一回合生效
          player.beginTurn()
          const varResult = processVariableUpdates(rawText)

          // 物品变更 → toast 通知
          // 从 applied operations 中提取物品变更
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

          // 任务变更 → toast 通知（如果在 handleQuestOp 中未通过 event bus 触发，这里兜底）
          for (const entry of varResult.operations) {
            if (!entry.result || !entry.op.path) continue
            if (entry.op.path.includes('/quests') || entry.op.path.includes('/任务') || entry.op.path.includes('/委托') || entry.op.path.includes('/missions')) {
              if (entry.result.startsWith('📋')) {
                bus.emit('quest:added', { title: entry.result.replace('📋 新任务：', '') })
              }
            }
          }

          // 汇总日志（warning 级别，始终可见）
          if (varResult.summary) {
            console.warn('[wandou] 变量变更汇总:', varResult.summary)
          }
        }

        // 剥离所有变量标签，保留干净正文
        aiMsg.content = stripStateTags(rawText)

        // 将思考内容嵌入消息末尾（HTML 注释，不可见但随存档持久化）
        if (_savedThinking) {
          aiMsg.content += '\n<!--thinking:' + JSON.stringify(_savedThinking) + '-->'
        }

        // ---- API 物品提取（异步，回退路径 — 仅 mj_variables 缺失时启用） ----
        const hasMjVars = /<mj_variables\b/i.test(rawText)
        if (stateSyncEnabled.value && itemExtractionFallback.value && !hasMjVars) {
          extractItems(api.apiConfig, messages.value.slice(0, -1), rawText)
            .then(items => {
              if (items.length === 0) return

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

        // ---- API 任务提取（异步，回退路径 — 仅 mj_variables 缺失时启用） ----
        if (stateSyncEnabled.value && itemExtractionFallback.value && !hasMjVars) {
          extractQuests(api.apiConfig, _lastInput, rawText, player.quests.map(q => q.title))
            .then(quests => {
              if (quests.length === 0) return
              console.warn('[wandou] API 任务提取回退:', quests.map(q => q.title).join('、'))
              for (const q of quests) {
                // 避免重复：精确匹配 + 模糊匹配（名称相似度 > 50% 且同名关键词重叠）
                const existingTitles = player.quests.map(x => x.title)
                if (existingTitles.some(t => t === q.title)) continue
                // 模糊匹配：提取标题中的地点关键词，如果已有任务包含相同地点词则跳过
                const qWords = new Set(q.title.replace(/[·\-—，。！？、\s]/g, '').split(''))
                const isSimilar = existingTitles.some(t => {
                  const tWords = new Set(t.replace(/[·\-—，。！？、\s]/g, '').split(''))
                  const common = [...qWords].filter(w => tWords.has(w)).length
                  return common > q.title.length * 0.4 // 超过40%字符相同
                })
                if (isSimilar) {
                  console.warn('[wandou] questExtractor: 疑似重复，跳过:', q.title)
                  continue
                }
                player.addQuest({
                  id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                  title: q.title,
                  questType: q.questType || '支线',
                  description: q.description,
                  reward: q.reward,
                  color: q.color || '#ffa726',
                  status: q.status,
                  objectives: [],
                })
              }
            })
            .catch(() => {
              // 静默失败 — API 提取只是回退方案
            })
        }

        // ---- 从叙述文本直接提取时间/地点（正则回退） ----
        // 只在 mj_variables 解析失败时才启用（主路径优先）
        if (stateSyncEnabled.value) {
          const hasMjVars = /<mj_variables\b/i.test(rawText)
          if (hasMjVars) {
            // mj_variables 已提取 → 不跑正则回退，防止误匹配思考内容中的参考值
          } else {
            const stateStore = useStateStore()
            let timeExtractedViaFallback = false
            let locExtractedViaFallback = false

            // 先去掉 <thinking> 块，防止把思考中的「当前位置：未知」当真实值
            const textForFallback = rawText.replace(/<thinking\b[^>]*>[\s\S]*?<\/thinking\s*>/gi, '')

            // -------------------------------
            // 方式 A：AI 消息末尾的「时间 地点 天气」行
            // -------------------------------
            const lines = textForFallback.split(/\n/)
            for (let i = lines.length - 1; i >= Math.max(0, lines.length - 5); i--) {
              const line = lines[i].trim()
              if (!line) continue
              const endMatch = line.match(/^(\d{4}年\s*\d{2}月\s*\d{2}日\s*\d{2}:\d{2})\s+(.+?)\s+(\S+)$/)
              if (!endMatch) continue

              const timeStr = endMatch[1].replace(/\s+/g, ' ')
              const locRaw = endMatch[2].trim()
              const weatherRaw = endMatch[3].trim()

              const timeResult = stateStore.setWorldTime(timeStr)
              if (timeResult.ok) {
                console.warn('[wandou] 正则回退提取时间:', timeStr)
                timeExtractedViaFallback = true
              }

              stateStore.setWeather(weatherRaw)
              console.warn('[wandou] 正则回退提取天气:', weatherRaw)

              const dotIdx = locRaw.indexOf('·')
              let region: string; let subRegion: string; let detail: string
              if (dotIdx >= 0) {
                const leftSide = locRaw.slice(0, dotIdx).trim()
                detail = locRaw.slice(dotIdx + 1).trim()
                const leftParts = leftSide.split(/\s+/)
                region = leftParts[0] || locRaw
                subRegion = leftParts.slice(1).join(' ') || ''
              } else {
                const parts = locRaw.split(/\s+/)
                region = parts[0] || locRaw
                subRegion = parts.length > 1 ? parts[1] : ''
                detail = parts.length > 2 ? parts.slice(2).join(' ') : ''
              }

              const oldLoc = stateStore.currentLocation
              if (region !== oldLoc.region || subRegion !== oldLoc.subRegion || detail !== oldLoc.detail) {
                stateStore.setLocation({ region, subRegion, detail })
                console.warn('[wandou] 正则回退提取位置:', locRaw, '→', { region, subRegion, detail })
                locExtractedViaFallback = true
              }
              break
            }

            // -------------------------------
            // 方式 B：「当前时间：XXX」「当前位置：XXX」
            // -------------------------------
            const timeMatch = textForFallback.match(/当前时间[：:]\s*(\d{4}年\s*\d{2}月\s*\d{2}日\s*\d{2}:\d{2})/)
            if (timeMatch) {
              const timeResult = stateStore.setWorldTime(timeMatch[1].replace(/\s+/g, ' '))
              if (timeResult.ok) { console.warn('[wandou] 正则回退提取时间(B):', timeMatch[1]); timeExtractedViaFallback = true }
            }
            const locMatch = textForFallback.match(/当前位置[：:]\s*(.+?)(?:\n|$)/)
            if (locMatch) {
              const locStr = locMatch[1].trim()
              // 忽略占位值（如"未知区域""未知地区"），防止覆盖正确的变量值
              if (/^(未知|不明|未设定|暂无)/.test(locStr)) {
                console.debug('[wandou] 正则回退跳过占位位置:', locStr)
              } else {
                const parts = locStr.split('·')
                if (parts.length >= 2) {
                  stateStore.setLocation({ region: parts[0].trim(), subRegion: '', detail: parts.slice(1).join('·').trim() })
                } else {
                  stateStore.setLocation({ region: locStr, subRegion: '', detail: '' })
                }
                console.warn('[wandou] 正则回退提取位置(B):', locStr)
                locExtractedViaFallback = true
              }
            }

            if (timeExtractedViaFallback || locExtractedViaFallback) {
              const parts: string[] = []
              if (timeExtractedViaFallback) parts.push('时间')
              if (locExtractedViaFallback) parts.push('位置')
              console.warn(`[wandou] ⚠️ AI 未使用 <mj_variables> 标签，已从正文提取${parts.join('+')}`)
            }
          }
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
    stateSyncEnabled, memorySyncEnabled, itemExtractionFallback,
    summaryEnabled, summaryThreshold,
    addMessage, clearMessages, sendMessage, retry, dismissError,
    regenerate, stopGeneration, snapshot, restore,
  }
})
