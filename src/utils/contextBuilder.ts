// ============================================================
// wandou · AI 上下文构建器 v4
// 短协议: JSON 快照注入 system prompt
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
      quests: ps.quests.filter(q => q.status === 'active').map(q => q.title),
    },
    world: { time: ss.worldTime, location: ss.currentLocation },
    npcs: ns.npcs.filter(n => n.enabled).map(n => ({ name: n.name, favor: n.favor ?? 0 })),
  }
  return JSON.stringify(snapshot)
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

  if (opts.stateSyncEnabled) {
    parts.push(`【当前角色状态】${buildStateJsonSnapshot()}`)
  }

  if (opts.memorySyncEnabled) {
    const fullSnapshot = buildFullStateSnapshot()
    if (fullSnapshot.memoryContext) {
      parts.push(`【相关历史记录】\n${fullSnapshot.memoryContext}`)
    }
  }

  const texts = extractRecentText(opts.messages, 10)

  if (wbs.globalWorldBookEnabled && wbs.globalWorldBook.length > 0) {
    const ctx = scanAndCollect(wbs.globalWorldBook, texts, 1500)
    if (ctx) parts.push(ctx.replace('【世界书·背景参考】', '【全局世界书】'))
  }

  if (wbs.worldBookEnabled && wbs.worldBook.length > 0) {
    const ctx = scanAndCollect(wbs.worldBook, texts, 1500)
    if (ctx) parts.push(ctx.replace('【世界书·背景参考】', `【${ws.worldName || '当前'}世界书】`))
  }

  const npcCtx = scanNpcs(ns.npcs, texts, 1500)
  if (npcCtx) parts.push(npcCtx)

  return parts
}
