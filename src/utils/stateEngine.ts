// ============================================================
// wandou · 状态同步引擎
// 参考 yaya 的 state_generate.js + yijiekkk 的 useVariableSystem.js
//
// 职责：
//   1. 构建状态快照（发给 AI 的当前状态 JSON）
//   2. 解析 AI 回复中的 mj_* 标签
//   3. 校验并应用变更到 Pinia Store（物品通过 playerStore.applyOps 统一入口）
//   4. 调用 AI（发送状态同步请求）
// ============================================================

import type {
  WorldSnapshot, PlayerSnapshot, NpcSnapshot,
  StateTurnResult, TagDefinition, InventoryOp,
} from '@/types/state'
import { useStateStore } from '@/stores/stateStore'
import { usePlayerStore } from '@/stores/playerStore'
import { useNpcStore } from '@/stores/npcStore'
import { bus } from '@/utils/events'
import type { InventoryItem } from '@/types/world'
import { safeParseJson, stripJsonFence, extractBalancedJson, tryExtractFromFences } from './jsonExtract'

// ============================================================
// 标签定义（stateRules.ts 引用）
// ============================================================

export const TAG_DEFINITIONS: TagDefinition[] = [
  {
    tag: 'mj_world_state',
    open: '<mj_world_state>',
    close: '</mj_world_state>',
    description: '世界状态：时间、地点、天气',
    example: '<mj_world_state>\n{"timeString":"星历 2157年 03月 15日 14:30","location":{"region":"近地轨道空间站","subRegion":"商业区","detail":"星光酒馆"},"weather":"晴朗"}\n</mj_world_state>',
  },
  {
    tag: 'mj_player_state',
    open: '<mj_player_state>',
    close: '</mj_player_state>',
    description: '主角状态：血量、法力、金币等',
    example: '<mj_player_state>\n{"currentHp":"+20","currentMp":"-5","gold":"-30"}\n</mj_player_state>',
  },
  {
    tag: 'mj_inventory_ops',
    open: '<mj_inventory_ops>',
    close: '</mj_inventory_ops>',
    description: '物品增减操作（JSON 数组）',
    example: '<mj_inventory_ops>\n[{"op":"add","name":"能量电池","quantity":2,"type":"material"},\n {"op":"remove","name":"旧式扫描仪","quantity":1}]\n</mj_inventory_ops>',
  },
  {
    tag: 'mj_npc_update',
    open: '<mj_npc_update>',
    close: '</mj_npc_update>',
    description: 'NPC 状态更新（JSON 数组）',
    example: '<mj_npc_update>\n[{"npcName":"酒保马克","favorability":"+5"},{"npcName":"陌生商人","favorability":0,"isVisible":true}]\n</mj_npc_update>',
  },
  {
    tag: 'mj_variables',
    open: '<mj_variables>',
    close: '</mj_variables>',
    description: '通用变量更新（RFC 6902 JSON Patch 数组）',
    example: '<mj_variables>\n[{"op":"replace","path":"/player/attributes/感知","value":"+2"},{"op":"add","path":"/player/quests/-","value":{"title":"寻找燃料","description":"在废船区寻找可用燃料","status":"active"}}]\n</mj_variables>',
  },
]

const TAG_MAP = new Map(TAG_DEFINITIONS.map(t => [t.tag, t]))

// ============================================================
// 快照构建
// ============================================================

export function buildWorldSnapshot(): WorldSnapshot {
  const state = useStateStore()
  return {
    timeString: state.worldTime,
    location: state.currentLocation,
    weather: state.weather,
    events: state.activeEvents.map(e => ({
      title: e.title,
      description: e.description,
      status: e.status,
    })),
  }
}

export function buildPlayerSnapshot(): PlayerSnapshot {
  const player = usePlayerStore()
  const char = player.character
  return {
    name: char.name,
    gender: char.gender,
    age: char.age,
    background: char.background.slice(0, 120),
    gold: char.gold ?? 0,
    attributes: { ...(char.attributes || {}) },
    inventory: player.inventory.map(i => ({
      name: i.name,
      quantity: i.quantity,
      type: i.type,
      description: i.description?.slice(0, 60),
    })),
    quests: player.quests.map(q => ({
      title: q.title,
      description: q.description.slice(0, 80),
      status: q.status,
    })),
  }
}

export function buildNpcSnapshot(limit: number = 15): NpcSnapshot[] {
  const npc = useNpcStore()
  return npc.npcs
    .filter(n => n.enabled)
    .slice(0, limit)
    .map((n) => ({
      id: n.id,
      name: n.name,
      role: n.role || '',
      personality: n.personality?.slice(0, 60) || '',
      favorability: n.favor ?? n.favorability ?? 0,
      isVisible: n.enabled,
      currentHp: n.currentHp,
      maxHp: n.maxHp,
    }))
}

export function buildMemoryContext(): string {
  const state = useStateStore()
  if (state.memories.length === 0) return ''

  // 按重要性排序，取前 10 条活跃记忆
  const relevant = [...state.memories]
    .filter(m => m.state === 'active' || m.state === 'unknown')
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 10)

  if (relevant.length === 0) return ''

  const lines = ['【重要历史记录】']
  for (const m of relevant) {
    lines.push(`- [${m.category}] ${m.fact}`)
  }
  return lines.join('\n')
}

/** 构建发给 AI 的完整状态快照 JSON */
export function buildFullStateSnapshot(): {
  worldJson: string
  playerJson: string
  npcJson: string
  memoryContext: string
} {
  return {
    worldJson: JSON.stringify(buildWorldSnapshot(), null, 2),
    playerJson: JSON.stringify(buildPlayerSnapshot(), null, 2),
    npcJson: JSON.stringify(buildNpcSnapshot(), null, 2),
    memoryContext: buildMemoryContext(),
  }
}

/** 从文本中提取指定标签内的内容 */
export function extractTagContent(text: string, tag: string): string | null {
  const def = TAG_MAP.get(tag)
  if (!def) return null

  const openEsc = def.open.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const closeEsc = def.close.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(openEsc + '\\s*([\\s\\S]*?)\\s*' + closeEsc, 'i')
  const m = re.exec(text)
  return m ? stripJsonFence(m[1]) : null
}

/** 从文本中提取标签或回退到 fence/裸 JSON */
function parseStructuredPayload(text: string, tag: string): any | null {
  // 方法 1: 标签提取
  const content = extractTagContent(text, tag)
  if (content) {
    const parsed = safeParseJson(content)
    if (parsed !== null) return parsed

    // 标签内可能还有代码块
    const fromFence = tryExtractFromFences(content)
    if (fromFence !== null) return fromFence
  }

  // 方法 2: 全文查找代码块
  const fromFence = tryExtractFromFences(text)
  if (fromFence !== null) return fromFence

  // 方法 3: 平衡括号提取
  const balanced = extractBalancedJson(text)
  if (balanced) {
    const parsed = safeParseJson(balanced)
    if (parsed !== null) return parsed
  }

  return null
}

// ============================================================
// 世界状态应用
// ============================================================

export function applyWorldPatch(patch: any): {
  applied: boolean; timeChanged: boolean; locationChanged: boolean; rejectedReason?: string
} {
  const store = useStateStore()
  const result = {
    applied: false,
    timeChanged: false,
    locationChanged: false,
    rejectedReason: undefined as string | undefined,
  }

  if (!patch || typeof patch !== 'object') return result

  // 时间
  if (patch.timeString && typeof patch.timeString === 'string') {
    const r = store.setWorldTime(patch.timeString)
    if (r.ok) {
      result.timeChanged = true
      result.applied = true
    } else {
      result.rejectedReason = (result.rejectedReason ? result.rejectedReason + '；' : '') + r.reason
    }
  }

  // 地点
  if (patch.location && typeof patch.location === 'object') {
    const loc: any = {}
    if (typeof patch.location.region === 'string') loc.region = patch.location.region
    if (typeof patch.location.subRegion === 'string') loc.subRegion = patch.location.subRegion
    if (typeof patch.location.detail === 'string') loc.detail = patch.location.detail
    // 兼容简单字符串格式
    if (typeof patch.location === 'string') loc.region = patch.location
    if (Object.keys(loc).length > 0) {
      const changed = store.setLocation(loc)
      if (changed) {
        result.locationChanged = true
        result.applied = true
      }
    }
  }

  // 天气
  if (patch.weather && typeof patch.weather === 'string') {
    store.setWeather(patch.weather)
    result.applied = true
  }

  return result
}

// ============================================================
// 玩家状态应用
// ============================================================

export function applyPlayerPatch(patch: any): {
  appliedHp: boolean; appliedMp: boolean; goldChanged: boolean; goldDelta: number
} {
  const player = usePlayerStore()
  const result = { appliedHp: false, appliedMp: false, goldChanged: false, goldDelta: 0 }

  if (!patch || typeof patch !== 'object') return result

  const attrs = { ...(player.character.attributes || {}) }
  let attrsChanged = false

  // currentHp
  if (patch.currentHp !== undefined) {
    const current = attrs['HP'] ?? 100
    const maxHp = attrs['maxHP'] ?? attrs['HP'] ?? 100
    const newVal = Math.max(0, Math.min(maxHp, resolveIncremental(current, patch.currentHp)))
    if (newVal !== current) {
      attrs['HP'] = newVal
      attrsChanged = true
      result.appliedHp = true
    }
  }

  // currentMp
  if (patch.currentMp !== undefined) {
    const current = attrs['MP'] ?? 50
    const maxMp = attrs['maxMP'] ?? attrs['MP'] ?? 50
    const newVal = Math.max(0, Math.min(maxMp, resolveIncremental(current, patch.currentMp)))
    if (newVal !== current) {
      attrs['MP'] = newVal
      attrsChanged = true
      result.appliedMp = true
    }
  }

  // gold
  if (patch.gold !== undefined) {
    const current = player.character.gold ?? 0
    const newVal = Math.max(0, resolveIncremental(current, patch.gold))
    if (newVal !== current) {
      player.updateCharacter({ ...player.character, gold: newVal })
      result.goldChanged = true
      result.goldDelta = newVal - current
    }
  }

  if (attrsChanged) {
    player.updateCharacter({ ...player.character, attributes: attrs })
  }

  return result
}

// ============================================================
// 物品操作 — 通过 playerStore 统一入口
// ============================================================

/**
 * 将原始物品数据转换为 playerStore 的 InventoryOp 格式并统一应用。
 * 这是所有物品变更的唯一通道 — 标签解析和 API 提取都走这里。
 */
function applyInventoryOpsViaStore(ops: any[]): {
  placed: InventoryOp[]; removed: InventoryOp[]; failed: { op: InventoryOp; reason: string }[]
} {
  const player = usePlayerStore()
  const failed: { op: InventoryOp; reason: string }[] = []

  if (!Array.isArray(ops)) return { placed: [], removed: [], failed }

  // 转换为统一的 InventoryOp 格式
  const normalized: import('@/stores/playerStore').InventoryOp[] = []
  for (const raw of ops) {
    if (!raw || typeof raw !== 'object') continue
    const opName = String(raw.op || '').toLowerCase()
    const itemName = String(raw.name || '').trim()
    if (!itemName) {
      failed.push({ op: raw as InventoryOp, reason: '缺少 name' })
      continue
    }
    if (opName !== 'add' && opName !== 'remove') {
      failed.push({ op: raw as InventoryOp, reason: `不支持的操作: ${raw.op}` })
      continue
    }
    normalized.push({
      op: opName as 'add' | 'remove',
      name: itemName,
      quantity: Math.max(1, Math.floor(Number(raw.quantity ?? raw.count ?? 1)) || 1),
      type: String(raw.type ?? raw.品类 ?? 'other').trim(),
      description: String(raw.description || raw.intro || raw.desc || ''),
    })
  }

  // 统一入口
  const result = player.applyOps(normalized)

  // 映射回旧格式
  const placed: InventoryOp[] = result.placed.map(p => ({
    op: 'add' as const,
    name: p.name,
    quantity: p.quantity,
    type: p.type,
    description: p.description,
  }))
  const removed: InventoryOp[] = result.removed.map(r => ({
    op: 'remove' as const,
    name: r.name,
    quantity: r.quantity,
    type: r.type,
  }))

  // 合并 failed
  for (const f of result.failed) {
    failed.push({ op: { op: 'add', name: f.name }, reason: f.reason })
  }

  return { placed, removed, failed }
}

// ============================================================
// NPC 更新应用
// ============================================================

export function applyNpcUpdates(updates: any[]): { updated: number; errors: string[] } {
  const npc = useNpcStore()
  const state = useStateStore()
  let updated = 0
  const errors: string[] = []

  if (!Array.isArray(updates)) return { updated, errors }

  for (const raw of updates) {
    if (!raw || typeof raw !== 'object') continue
    const npcName = String(raw.npcName || raw.name || '').trim()
    if (!npcName) {
      errors.push('NPC 更新缺少 npcName')
      continue
    }

    // 查找 NPC
    const target = npc.npcs.find(n => n.id === npcName || n.name === npcName)
    if (target) {
      // 已有 NPC：只更新指定字段
      if (raw.favorability !== undefined || raw.favor !== undefined) {
        const val = raw.favorability ?? raw.favor
        const current = target.favor ?? target.favorability ?? 0
        target.favor = Math.max(-99, Math.min(99, resolveIncremental(current, val)))
        updated++
      }
      if (raw.isVisible !== undefined) {
        target.enabled = !!raw.isVisible
        updated++
      }
      if (raw.currentHp !== undefined && target.currentHp !== undefined) {
        target.currentHp = Math.max(0, resolveIncremental(target.currentHp!, raw.currentHp))
        updated++
      }
      // 同步到 NPC 关系
      const favor = target.favor ?? target.favorability ?? 0
      state.upsertNpcRelation({
        npcId: target.id,
        npcName: target.name,
        favorability: favor,
        status: favor > 30 ? '友好' : favor < -20 ? '敌视' : '中立',
        lastInteraction: state.worldTime,
      })
    } else {
      // 新 NPC：记录但暂不自动创建（避免 AI 幻觉创建大量 NPC）
      // 仅更新关系记录
      const favorVal = raw.favorability ?? raw.favor ?? 0
      state.upsertNpcRelation({
        npcId: '',
        npcName,
        favorability: typeof favorVal === 'number' ? favorVal : resolveIncremental(0, favorVal),
        status: '中立',
        lastInteraction: state.worldTime,
      })
      updated++
    }
  }

  return { updated, errors }
}

// ============================================================
// 变量 Patch 应用（兼容 variableEngine.ts）
// ============================================================

import { resolveIncremental, normalizeItemType } from './variableEngine'

// ============================================================
// 主入口：解析并应用全部状态变更
// ============================================================

export function applyStateTurn(text: string): StateTurnResult {
  const store = useStateStore()
  const player = usePlayerStore()

  // NOTE: beginTurn() 和 processVariableUpdates() 已在 chatStore.sendMessage() 中提前调用，
  // 这里不再重复，避免同一批操作被 applied 两次

  const result: StateTurnResult = {
    ok: true,
    world: { applied: false, timeChanged: false, locationChanged: false },
    player: { appliedHp: false, appliedMp: false, goldChanged: false, goldDelta: 0 },
    inventory: { placed: [], removed: [], failed: [] },
    npcs: { updated: 0, errors: [] },
    parseErrors: [],
  }

  if (!text) return result

  // 1. 世界状态
  const worldRaw = parseStructuredPayload(text, 'mj_world_state')
  if (worldRaw) {
    const wr = applyWorldPatch(worldRaw)
    result.world = wr
    if (wr.rejectedReason) result.parseErrors.push(`世界状态: ${wr.rejectedReason}`)
  }

  // 2. 玩家状态
  const playerRaw = parseStructuredPayload(text, 'mj_player_state')
  if (playerRaw) {
    result.player = applyPlayerPatch(playerRaw)
  }

  // 3. 物品操作 — 通过 playerStore 统一入口
  const invRaw = parseStructuredPayload(text, 'mj_inventory_ops')
  if (invRaw && Array.isArray(invRaw)) {
    result.inventory = applyInventoryOpsViaStore(invRaw)
    if (result.inventory.failed.length > 0) {
      for (const f of result.inventory.failed) {
        result.parseErrors.push(`物品: ${f.reason} (${f.op.name})`)
      }
    }
    if (!result.ok) result.ok = result.inventory.failed.length === 0
  }

  // 4. NPC 更新
  const npcRaw = parseStructuredPayload(text, 'mj_npc_update')
  if (npcRaw && Array.isArray(npcRaw)) {
    result.npcs = applyNpcUpdates(npcRaw)
    if (result.npcs.errors.length > 0) {
      for (const e of result.npcs.errors) {
        result.parseErrors.push(`NPC: ${e}`)
      }
    }
  }

  // 5. 发送事件
  if (result.world.timeChanged || result.world.locationChanged) {
    bus.emit('state:world_changed', { world: result.world })
  }
  if (
    result.player.appliedHp || result.player.appliedMp ||
    result.inventory.placed.length > 0 || result.inventory.removed.length > 0
  ) {
    store.advanceTurn()
  }
  bus.emit('state:sync_complete', result)

  return result
}

// ============================================================
// 构建摘要（给玩家看的变更提示）
// ============================================================

export function buildStateChangeSummary(result: StateTurnResult): string {
  const parts: string[] = []

  if (result.world.locationChanged) parts.push(`📍 到达 ${useStateStore().locationString()}`)
  if (result.world.timeChanged) parts.push(`⏰ ${useStateStore().worldTime}`)
  if (result.player.goldChanged) {
    const d = result.player.goldDelta
    if (d > 0) parts.push(`🪙 金币 +${d}`)
    else if (d < 0) parts.push(`🪙 金币 ${d}`)
  }
  for (const p of result.inventory.placed) {
    const qty = p.quantity && p.quantity > 1 ? ` ×${p.quantity}` : ''
    parts.push(`📦 获得 ${p.name}${qty}`)
  }
  for (const r of result.inventory.removed) {
    parts.push(`🗑️ 失去 ${r.name}`)
  }
  if (result.player.appliedHp || result.player.appliedMp) {
    parts.push(`❤️ 状态已更新`)
  }
  if (result.npcs.updated > 0) {
    parts.push(`👥 NPC 关系已更新`)
  }

  return parts.join('；') || ''
}

// ============================================================
// 从 AI 回复中剥离所有状态标签，返回干净正文
// ============================================================

export function stripStateTags(text: string): string {
  let cleaned = text
  // CoT 思维链块（必须在其他标签之前剥离，因为它可能包含变量路径文本）
  cleaned = cleaned.replace(/<thinking\b[^>]*>[\s\S]*?<\/thinking\s*>/gi, '')
  // mj_* 标签
  for (const def of TAG_DEFINITIONS) {
    const openEsc = def.open.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const closeEsc = def.close.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(openEsc + '[\\s\\S]*?' + closeEsc, 'gi')
    cleaned = cleaned.replace(re, '')
  }
  // <variables> / <patch> 标签
  cleaned = cleaned.replace(/<variables?\b[^>]*>[\s\S]*?<\/variables?\s*>/gi, '')
  cleaned = cleaned.replace(/<patch\b[^>]*>[\s\S]*?<\/patch\s*>/gi, '')
  // 含状态数据的 Markdown 代码围栏
  cleaned = cleaned.replace(/```(?:json)?\s*\n?\s*\[[\s\S]*?"op"\s*:\s*"(?:add|remove|replace)"[\s\S]*?\]\s*\n?\s*```/gi, '')
  cleaned = cleaned.replace(/```(?:json)?\s*\n?\s*\{[\s\S]*?"timeString"[\s\S]*?\}\s*\n?\s*```/gi, '')
  return cleaned.replace(/\n{3,}/g, '\n\n').trim()
}
