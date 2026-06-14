// ============================================================
// wandou · AI 上下文构建器 v8
//
// v8 升级：
// - 使用 memoryCompiler v2 的结构化运行时
// - 支持高级异步多阶段编译（可选）
// - 世界书/NPC扫描独立于编译器
// ============================================================
import { useWorldStore } from '@/stores/worldStore'
import { useWorldBookStore } from '@/stores/worldBookStore'
import { useNpcStore } from '@/stores/npcStore'
import { useStateStore } from '@/stores/stateStore'
import { usePlayerStore } from '@/stores/playerStore'
import { ROLE_FIREWALL_SHORT } from '@/utils/roleFirewall'
import { scanAndCollect, extractRecentText } from '@/utils/worldBookEngine'
import { scanNpcs } from '@/utils/npcEngine'
import {
  compileContext,
  compileContextAdvanced,
  DEFAULT_COMPILER_CONFIG,
  buildRuntimeFromStores,
  createKeywordRetriever,
  type CompilerConfig,
  type CompilerQuery,
  type CompilerOutput,
  type Retriever,
  type AdvancedCompileResult,
} from '@/utils/memoryCompiler'
import type { CompilerRuntimeState } from '@/utils/compilerRuntime'
import type { GameMessage } from '@/types/game'

// ---- Re-export for external consumers ----
export type {
  CompilerConfig,
  CompilerQuery,
  CompilerOutput,
  CompilerRuntimeState,
  Retriever,
  AdvancedCompileResult,
}

export { DEFAULT_COMPILER_CONFIG, buildRuntimeFromStores }

// ============================================================
// 基础上下文构建（同步单阶段）
// ============================================================

export interface ContextOpts {
  stateSyncEnabled: boolean
  memorySyncEnabled: boolean
  messages: GameMessage[]
  userInput: string
  compilerConfig?: Partial<CompilerConfig>
}

export function buildContextParts(opts: ContextOpts): string[] {
  const ws = useWorldStore()
  const wbs = useWorldBookStore()
  const parts: string[] = []

  // ===== 第 1 层：世界设定 =====
  if (ws.worldDescription.trim()) {
    parts.push(`## 当前世界：${ws.worldName || '未知世界'}\n${ws.worldDescription.trim()}`)
  }

  // ===== 第 2 层：角色防火墙 =====
  parts.push(ROLE_FIREWALL_SHORT)

  // ===== 第 3 层：编译后的上下文（核心） =====
  if (opts.memorySyncEnabled) {
    const runtime = buildRuntimeFromStore(opts)
    const query = buildQueryFromInput(opts.userInput)

    if (runtime) {
      const cfg = { ...DEFAULT_COMPILER_CONFIG, ...(opts.compilerConfig || {}) }
      const compiled = compileContext({ runtime, query }, cfg)

      if (compiled.compiledText) {
        const label = buildCompilerLabel(compiled)
        parts.push(label + '\n' + compiled.compiledText)

        // 空缺预警
        if (compiled.meta.suggestedRecall) {
          const gapText = formatGapWarning(compiled.meta.gaps)
          if (gapText) parts.push(gapText)
        }
      }
    }
  }

  // ===== 第 4 层：世界书注入 =====
  const texts = extractRecentText(opts.messages, 10)
  injectWorldBookParts(parts, wbs, ws, texts)

  // ===== 第 5 层：NPC 角色卡 =====
  const ns = useNpcStore()
  const npcCtx = scanNpcs(ns.npcs, texts, 1500)
  if (npcCtx) parts.push(npcCtx)

  // ===== 第 6 层：叙事指令 =====
  parts.push('【叙事规则】你只需生动地推动剧情发展。禁止输出 <thinking> <mj_variables> 或其他 XML 标签。状态更新由另一个系统自动处理。')

  return parts
}

// ============================================================
// 高级异步上下文构建（多阶段编译）
// ============================================================

export interface AdvancedContextOpts extends ContextOpts {
  /** 是否启用检索阶段 */
  enableRetrieval?: boolean
  /** 外部检索器（不传则用内置关键词检索器） */
  retriever?: Retriever
  /** 编译阶段的 debug 回调 */
  onCompileDebug?: (label: string, detail: string) => void
}

export async function buildContextPartsAdvanced(
  opts: AdvancedContextOpts,
): Promise<{ parts: string[]; compileResult: AdvancedCompileResult | null }> {
  const ws = useWorldStore()
  const wbs = useWorldBookStore()
  const parts: string[] = []

  if (ws.worldDescription.trim()) {
    parts.push(`## 当前世界：${ws.worldName || '未知世界'}\n${ws.worldDescription.trim()}`)
  }
  parts.push(ROLE_FIREWALL_SHORT)

  let compileResult: AdvancedCompileResult | null = null

  if (opts.memorySyncEnabled) {
    const runtime = buildRuntimeFromStore(opts)
    const query = buildQueryFromInput(opts.userInput)

    if (runtime) {
      const cfg = { ...DEFAULT_COMPILER_CONFIG, ...(opts.compilerConfig || {}) }
      let retriever = opts.retriever
      // 默认使用 TF-IDF 向量检索器（零依赖），词关键词做回退
      if (!retriever) {
        try {
          const { getVectorStore } = await import('./vectorStore')
          const vs = getVectorStore()
          // 确保索引
          if (vs.indexedDocs === 0) vs.index(runtime)
          const { createPipelineRetriever, DEFAULT_PIPELINE_CONFIG: pCfg } = await import('./retrieverPipeline')
          retriever = createPipelineRetriever(runtime, vs, {
            ...pCfg,
            // 高级模式默认不调 LLM rerank（避免额外 API 调用延迟）
            queryRewriteEnabled: false,
            rerankEnabled: false,
            graphExpandEnabled: pCfg.graphExpandEnabled,
          })
        } catch {
          retriever = createKeywordRetriever(runtime)
        }
      }

      compileResult = await compileContextAdvanced(
        { runtime, query },
        {
          config: cfg,
          retriever,
          enableRetrieval: opts.enableRetrieval ?? true,
          onDebug: opts.onCompileDebug
            ? (entry) => opts.onCompileDebug!(entry.stage, entry.message)
            : undefined,
        },
      )

      const output = compileResult.output
      if (output.compiledText) {
        const label = buildCompilerLabel(output)
        const retrievalNote = compileResult.retrievalTriggered
          ? ` · 🔍检索+${compileResult.retrievedCount}条`
          : ''
        parts.push(label + retrievalNote + '\n' + output.compiledText)

        if (output.meta.suggestedRecall) {
          const gapText = formatGapWarning(output.meta.gaps)
          if (gapText) parts.push(gapText)
        }
      }
    }
  }

  // 世界书
  const texts = extractRecentText(opts.messages, 10)
  injectWorldBookParts(parts, wbs, ws, texts)

  // NPC 角色卡
  const ns = useNpcStore()
  const npcCtx = scanNpcs(ns.npcs, texts, 1500)
  if (npcCtx) parts.push(npcCtx)

  // 叙事指令
  parts.push('【叙事规则】你只需生动地推动剧情发展。禁止输出 <thinking> <mj_variables> 或其他 XML 标签。状态更新由另一个系统自动处理。')

  return { parts, compileResult }
}

// ============================================================
// 内部桥接函数
// ============================================================

function buildRuntimeFromStore(opts: ContextOpts): CompilerRuntimeState | null {
  const ss = useStateStore()
  const ns = useNpcStore()
  const ps = usePlayerStore()

  return buildRuntimeFromStores({
    worldTime: ss.worldTime,
    location: ss.currentLocation,
    weather: ss.weather,
    npcs: ns.npcs,
    inventory: ps.inventory.map(i => ({
      name: i.name,
      quantity: i.quantity,
      type: i.type,
      description: i.description,
    })),
    quests: ps.quests,
    memories: ss.memories,
    characterGold: ps.character.gold ?? 0,
    characterAttributes: (ps.character.attributes || {}) as Record<string, number>,
    turnIndex: ss.turnIndex,
  })
}

function buildQueryFromInput(userInput: string): CompilerQuery {
  const tokens = tokenizeForCompiler(userInput)
  const keywords = tokens.filter(t => t.length >= 2).slice(0, 10)

  const npcNames = (() => {
    try {
      const ns = useNpcStore()
      return ns.npcs
        .filter(n => ns.getNpcCategory(n) !== '离场')
        .flatMap(n => [n.name, ...(n.aliases || [])])
    } catch { return [] as string[] }
  })()

  const hitEntities = npcNames.filter(name =>
    tokens.some(t => name.toLowerCase().includes(t) || t.includes(name.toLowerCase()))
  )

  const timeRelated = /时间|现在|几点|什么时|日期|天|年|月|日|小时|分钟|刚才|之前|之后|然后/.test(userInput)
  const needRelations = /关系|好感|认识|知道.*谁|谁.*认识|朋友|敌人|同盟|信任|怀疑|背叛/.test(userInput) || hitEntities.length > 0
  const needHistory = /之前|历史|过去|以前|曾经|回忆|记得|发生过|怎么回事/.test(userInput)

  return {
    inputText: userInput,
    keywords,
    entityNames: hitEntities,
    timeRelated,
    needRelations,
    needHistory,
  }
}

function tokenizeForCompiler(text: string): string[] {
  const cleaned = text
    .replace(/[，,。\.！!！?？；;：:、\s]+/g, ' ')
    .toLowerCase()
    .trim()
  if (!cleaned) return []
  const tokens: string[] = []
  let buffer = ''
  for (const ch of cleaned) {
    if (/[a-z0-9]/.test(ch)) { buffer += ch }
    else if (/[一-鿿]/.test(ch)) { if (buffer) { tokens.push(buffer); buffer = '' } tokens.push(ch) }
    else { if (buffer) { tokens.push(buffer); buffer = '' } }
  }
  if (buffer) tokens.push(buffer)
  return tokens.filter(t => t.length >= 1)
}

function buildCompilerLabel(output: CompilerOutput): string {
  const parts: string[] = [
    `【记忆编译器 · ${output.sections.length}区 · ~${output.tokenEstimate}tk`,
  ]
  if (output.meta.droppedReasons.length > 0) {
    parts.push(` · 裁剪:${output.meta.droppedReasons.length}项`)
  }
  if (output.meta.suggestedRecall) {
    parts.push(' · ⚠️空缺')
  }
  parts.push('】')
  return parts.join('')
}

function formatGapWarning(gaps: CompilerOutput['meta']['gaps']): string | null {
  const reasons: string[] = []
  if (gaps.entityGap) reasons.push('实体信息不足')
  if (gaps.timeGap) reasons.push('时间线缺失')
  if (gaps.relationGap) reasons.push('NPC关系缺失')
  if (gaps.historyGap) reasons.push('历史背景缺失')
  if (reasons.length === 0) return null
  return `【⚠️ 信息缺口】${reasons.join('、')}。请 AI 保守叙事，不要臆造未确认的信息。`
}

function injectWorldBookParts(
  parts: string[],
  wbs: ReturnType<typeof useWorldBookStore>,
  ws: ReturnType<typeof useWorldStore>,
  texts: string[],
) {
  const globalWbEnabled = wbs.globalWorldBookEnabled && wbs.globalWorldBook.length > 0
  const worldWbEnabled = wbs.worldBookEnabled && wbs.worldBook.length > 0

  if (globalWbEnabled) {
    const result = scanAndCollect(wbs.globalWorldBook, texts, 6000)
    if (result.text) {
      parts.push(result.text.replace('【世界书·背景参考】', '【全局世界书】'))
    }
  }

  if (worldWbEnabled) {
    const result = scanAndCollect(wbs.worldBook, texts, 6000)
    if (result.text) {
      parts.push(result.text.replace('【世界书·背景参考】', `【${ws.worldName || '当前'}世界书】`))
    }
  }
}
