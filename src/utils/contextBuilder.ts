// ============================================================
// wandou · AI 上下文构建器 v5
//
// 协议文本由 variableRegistry 动态生成，不再硬编码在世界书条目中。
// ============================================================
import { useWorldStore } from '@/stores/worldStore'
import { useWorldBookStore } from '@/stores/worldBookStore'
import { useNpcStore } from '@/stores/npcStore'
import { usePlayerStore } from '@/stores/playerStore'
import { useStateStore } from '@/stores/stateStore'
import { buildFirewallBlock } from '@/utils/roleFirewall'
import { buildFullStateSnapshot } from '@/utils/stateEngine'
import { scanAndCollect, extractRecentText } from '@/utils/worldBookEngine'
import { scanNpcs } from '@/utils/npcEngine'
import { buildVariableProtocolFromTemplate, type ProtocolStateSnapshot } from '@/utils/variableRegistry'
import type { GameMessage } from '@/types/game'

function buildStateJsonSnapshot(): string {
  const ps = usePlayerStore()
  const ns = useNpcStore()
  const ss = useStateStore()

  const char = ps.character
  const snapshot: any = {
    player: {
      name: char.name || '未命名',
      gold: char.gold ?? 100,
      inventory: ps.inventory.map(i => ({ name: i.name, qty: i.quantity, type: i.type })),
      quests: ps.quests.filter(q => q.status === 'active').map(q => ({
        title: q.title,
        questType: q.questType || '支线',
        description: q.description,
        reward: q.reward || '',
        color: q.color || '#ffa726',
      })),
    },
    world: { time: ss.worldTime, location: ss.currentLocation, weather: ss.weather },
    npcs: ns.npcs.filter(n => ns.getNpcCategory(n) !== '离场').map(n => ({
      id: n.id,
      name: n.name,
      role: n.role,
      category: ns.getNpcCategory(n),
      favor: n.favor ?? 0,
      personality: n.personality.slice(0, 50),
      ...(n.aliases && n.aliases.length > 0 ? { aliases: n.aliases } : {}),
      ...(n.identityRevealed ? { identityRevealed: true } : {}),
    })),
  }
  return JSON.stringify(snapshot, null, 2)
}

export interface ContextOpts {
  stateSyncEnabled: boolean
  memorySyncEnabled: boolean
  messages: GameMessage[]
}

export function buildContextParts(opts: ContextOpts): string[] {
  const ws = useWorldStore()
  const wbs = useWorldBookStore()
  const ns = useNpcStore()
  const parts: string[] = []

  if (ws.worldDescription.trim()) {
    parts.push(`## 当前世界：${ws.worldName || '未知世界'}\n${ws.worldDescription.trim()}`)
  }

  parts.push(buildFirewallBlock())

  // ---- 当前角色状态（AI 需要知道背包/任务现状） ----
  if (opts.stateSyncEnabled) {
    parts.push(`【当前角色状态】${buildStateJsonSnapshot()}`)
  }

  // ---- 记忆 ----
  if (opts.memorySyncEnabled) {
    const fullSnapshot = buildFullStateSnapshot()
    if (fullSnapshot.memoryContext) {
      parts.push(`【相关历史记录】\n${fullSnapshot.memoryContext}`)
    }
  }

  const texts = extractRecentText(opts.messages, 10)

  // ===== 世界书注入 =====
  const globalWbCount = wbs.globalWorldBook.length
  const worldWbCount = wbs.worldBook.length
  const globalWbEnabled = wbs.globalWorldBookEnabled && globalWbCount > 0
  const worldWbEnabled = wbs.worldBookEnabled && worldWbCount > 0

  if (globalWbEnabled || worldWbEnabled) {
    console.warn(
      `[wandou] 世界书状态: 全局${globalWbCount}条(enabled=${wbs.globalWorldBookEnabled}), ` +
      `当前${worldWbCount}条(enabled=${wbs.worldBookEnabled})`
    )
  }

  if (globalWbEnabled) {
    const result = scanAndCollect(wbs.globalWorldBook, texts, 6000)
    if (result.text) {
      parts.push(result.text.replace('【世界书·背景参考】', '【全局世界书】'))
      console.warn(`[wandou] 全局世界书: ${result.matchedCount}/${result.totalEnabled}条命中并注入`)
    } else {
      console.warn(`[wandou] 全局世界书: 0/${result.totalEnabled}条命中 — 全部未触发`)
    }
  }

  if (worldWbEnabled) {
    const result = scanAndCollect(wbs.worldBook, texts, 6000)
    if (result.text) {
      parts.push(result.text.replace('【世界书·背景参考】', `【${ws.worldName || '当前'}世界书】`))
      console.warn(`[wandou] 当前世界书: ${result.matchedCount}/${result.totalEnabled}条命中并注入`)
    } else {
      console.warn(`[wandou] 当前世界书: ${result.matchedCount}/${result.totalEnabled}条命中但 content 为空，未注入`)
      const enabled = wbs.worldBook.filter(e => e.enabled)
      if (enabled.length > 0) {
        console.warn(`[wandou] 以下 ${enabled.length} 条的内容为空：`)
        for (const e of enabled) {
          console.warn(`[wandou]   - "${e.comment || '(无名)'}" keys=[${(e.keys || []).join(', ')}] const=${e.position === 'at_constant'} content="${(e.content || '').slice(0, 80)}"`)
        }
      }
    }
  }

  const npcCtx = scanNpcs(ns.npcs, texts, 1500)
  if (npcCtx) parts.push(npcCtx)

  // ---- 变量更新协议（必须放在最后，让 AI 在回复前最后看到的就是输出格式要求） ----
  if (opts.stateSyncEnabled) {
    const ss = useStateStore()
    const ps = usePlayerStore()
    const ns = useNpcStore()
    const char = ps.character

    const stateSnapshot: ProtocolStateSnapshot = {
      inventory: ps.inventory.length > 0
        ? ps.inventory.map(i => `${i.name}×${i.quantity}(${i.type})`).join('、')
        : '空',
      itemNames: ps.inventory.map(i => i.name),
      quests: ps.quests.filter(q => q.status === 'active').length > 0
        ? ps.quests.filter(q => q.status === 'active').map(q => `${q.title}(${q.questType || '支线'})`).join('、')
        : '无',
      questTitles: ps.quests.filter(q => q.status === 'active').map(q => q.title),
      gold: char.gold ?? 100,
      time: ss.worldTime,
      location: [ss.currentLocation.region, ss.currentLocation.subRegion, ss.currentLocation.detail].filter(Boolean).join('·'),
      weather: ss.weather,
      npcs: ns.npcs.filter(n => ns.getNpcCategory(n) !== '离场').length > 0
        ? ns.npcs.filter(n => ns.getNpcCategory(n) !== '离场').map(n =>
            `[${n.id}]${n.name}(${ns.getNpcCategory(n)},❤${n.favor ?? 0})`
          ).join('、')
        : '无',
      npcNames: ns.npcs.filter(n => ns.getNpcCategory(n) !== '离场').map(n => n.name),
      npcIds: ns.npcs.filter(n => ns.getNpcCategory(n) !== '离场').map(n => n.id),
    }

    // 检测占位名 NPC —— 如果存在，在协议前方插入醒目警告
    const placeholderNpcs = ns.npcs
      .filter(n => ns.getNpcCategory(n) !== '离场')
      .filter(n => /^[\?？]{1,3}$|^陌生人$|^神秘人$|^不明$|^未知$|^无名$|^stranger$/i.test(n.name))
    if (placeholderNpcs.length > 0) {
      const warnLines = placeholderNpcs.map(n =>
        `  ⚠️ NPC [${n.id}] 当前名为"${n.name}"（占位名）→ 若本轮揭示真名，必须输出 /npcs/${n.id}/identity 更新！` +
        (n.role ? ` 当前已知身份：${n.role}` : '')
      )
      parts.push('## ⚠️⚠️⚠️ 本轮身份揭示警告 ⚠️⚠️⚠️\n' +
        '以下 NPC 名称为占位名，若本轮对话中该 NPC 透露了真名 → 你 **必须** 在 <mj_variables> 中输出 identity 更新！\n' +
        warnLines.join('\n') +
        '\n禁止在本轮输出 <mj_variables>[] 空数组！')
    }

    parts.push('## 变量更新协议\n' + buildVariableProtocolFromTemplate(stateSnapshot))
  }

  return parts
}
