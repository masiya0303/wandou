// ============================================================
// wandou · 统一变量引擎
//
// 从 AI 回复中提取 <mj_variables> JSON Patch，
// 校验、路由并应用到各 Store（player / world / npc）。
//
// 变量定义见 variableRegistry.ts — 本文件只做解析 + 路由。
// ============================================================

import type { Quest } from '@/types/world'
import { usePlayerStore } from '@/stores/playerStore'
import { useNpcStore } from '@/stores/npcStore'
import { useStateStore } from '@/stores/stateStore'
import { safeParseJson, extractBalancedJson, tryRepairTruncatedJson } from './jsonExtract'
import {
  resolveVarDef,
  validateValue,
  type VarDef,
} from './variableRegistry'

// ============================================================
// 公共类型
// ============================================================

export interface VarOperation {
  op: 'add' | 'replace' | 'remove'
  path: string
  value?: any
}

export interface VarResult {
  cleanText: string
  applied: number
  summary: string
  operations: { op: VarOperation; result: string | null }[]
}

// ============================================================
// 提取链（5 级回退）
// ============================================================

export function extractAllJsonPayloads(text: string): string[] {
  const results: string[] = []

  if (!text) return results

  // 1. <mj_variables>...</mj_variables>
  const mjVarRe = /<mj_variables\b[^>]*>([\s\S]*?)<\/mj_variables\s*>/gi
  let m: RegExpExecArray | null
  while ((m = mjVarRe.exec(text)) !== null) {
    results.push(m[1].trim())
  }

  // 2. <variables>...</variables>（兼容旧格式）
  const varRe = /<variables?\b[^>]*>([\s\S]*?)<\/variables?\s*>/gi
  while ((m = varRe.exec(text)) !== null) {
    results.push(m[1].trim())
  }

  // 3. <patch>...</patch>
  const patchRe = /<patch\b[^>]*>([\s\S]*?)<\/patch\s*>/gi
  while ((m = patchRe.exec(text)) !== null) {
    results.push(m[1].trim())
  }

  // 4. ```json ... ```
  const fences: string[] = []
  const fenceRe = /```(?:json|javascript|js)?\s*([\s\S]*?)\s*```/gi
  while ((m = fenceRe.exec(text)) !== null) {
    const content = m[1].trim()
    if (content.startsWith('[') || (content.startsWith('{') && (content.includes('"op"') || content.includes('"path"') || content.includes('"player"')))) {
      fences.push(content)
    }
  }
  results.push(...fences.reverse())

  // 5. 裸 JSON 平衡提取
  const balanced = extractBalancedJson(text)
  if (balanced && !results.some(r => r === balanced)) {
    results.push(balanced)
  }

  return results
}

// ============================================================
// 解析 JSON Patch
// ============================================================

export function parseOperations(raw: string): VarOperation[] {
  const ops: VarOperation[] = []

  const trimmed = raw.trim()
  if (!trimmed) return ops

  let data: any = safeParseJson(trimmed)
  let wasTruncated = false

  if (data === null) {
    data = safeParseJson(trimmed.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, ''))
  }

  if (data === null) {
    // 尝试截断修复
    data = tryRepairTruncatedJson(trimmed)
    if (data !== null) {
      wasTruncated = true
      console.warn('[wandou] ⚠️ JSON Patch 被截断（可能 max_tokens 不足），已尝试修复并恢复部分操作')
    }
  }

  if (data === null) {
    return parseLooseOperations(raw)
  }

  if (wasTruncated && Array.isArray(data)) {
    console.warn('[wandou] ⚠️ 截断修复：原始 ' + trimmed.length + ' 字符，恢复了 ' + data.length + ' 个操作（可能丢失了最后几个）')
  }

  if (data === null) {
    return parseLooseOperations(raw)
  }

  if (Array.isArray(data)) {
    for (const item of data) {
      if (!item || typeof item !== 'object') continue
      const op = String(item.op ?? '').toLowerCase()
      const path = String(item.path ?? item.jsonPath ?? item.jsonpath ?? '')
      if (!op || !path) continue
      if (!['add', 'replace', 'remove', 'set', 'update', 'delete'].includes(op)) continue
      ops.push({
        op: op === 'set' || op === 'update' ? 'replace' : (op === 'delete' ? 'remove' : op) as any,
        path,
        value: item.value ?? item.newValue,
      })
    }
  } else if (data && typeof data === 'object') {
    // 路径映射对象：{ "/player/inventory/-": {...}, "/player/gold": 150 }
    let hasPathKeys = false
    for (const [key, val] of Object.entries(data)) {
      if (key.startsWith('/') || key.startsWith('$') || key.startsWith('.')) {
        const path = normalizeVariablePath(key)
        if (path) {
          ops.push({ op: 'replace', path, value: val })
          hasPathKeys = true
        }
      }
    }

    if (!hasPathKeys) {
      // 合并补丁风格：{ player: { inventory: [...], gold: 150 }, npcs: { ... } }
      if (data.player && typeof data.player === 'object') {
        if (data.player.gold !== undefined) {
          ops.push({ op: 'replace', path: '/player/gold', value: data.player.gold })
        }
        if (Array.isArray(data.player.inventory)) {
          ops.push({ op: 'replace', path: '/player/inventory', value: data.player.inventory })
        }
        if (data.player.quests !== undefined) {
          ops.push({ op: 'replace', path: '/player/quests', value: data.player.quests })
        }
        if (data.player.attributes && typeof data.player.attributes === 'object') {
          for (const [k, v] of Object.entries(data.player.attributes)) {
            ops.push({ op: 'replace', path: `/player/attributes/${k}`, value: v })
          }
        }
        const charFields = ['name', 'age', 'background', 'gender', '姓名', '年龄', '背景', '性别']
        for (const f of charFields) {
          if (data.player[f] !== undefined) {
            ops.push({ op: 'replace', path: `/player/character/${f}`, value: data.player[f] })
          }
        }
      }
      if (data.npcs && typeof data.npcs === 'object') {
        for (const [npcKey, npcData] of Object.entries(data.npcs)) {
          if (npcData && typeof npcData === 'object') {
            for (const [k, v] of Object.entries(npcData as any)) {
              ops.push({ op: 'replace', path: `/npcs/${npcKey}/${k}`, value: v })
            }
          }
        }
      }
    }
  }

  return ops
}

function parseLooseOperations(raw: string): VarOperation[] {
  const ops: VarOperation[] = []
  const lines = raw.split(/\r?\n/)

  for (const line of lines) {
    const trimmed = line.replace(/^[-*]\s+/, '').trim()
    if (!trimmed || trimmed.startsWith('```') || trimmed.startsWith('<')) continue

    const m = /^(\/[^\s=:]+|[$\.][^\s=:]+|[a-zA-Z_][\w\/\.]*)\s*[:=]\s*(.+)$/i.exec(trimmed)
      || /^(\/[^\s=:]+|[$\.][^\s=:]+)\s*=>\s*(.+)$/i.exec(trimmed)
    if (!m) continue

    const rawPath = m[1].trim()
    const path = normalizeVariablePath(rawPath)
    if (!path) continue

    const rawVal = m[2].trim().replace(/,$/, '')
    if (!rawVal) continue

    let value: any = rawVal
    if (/^(true|false|null)$/i.test(rawVal)) {
      value = rawVal.toLowerCase() === 'true' ? true : rawVal.toLowerCase() === 'false' ? false : null
    } else if (/^-?\d+(\.\d+)?$/.test(rawVal)) {
      value = Number(rawVal)
    } else if ((rawVal.startsWith('{') && rawVal.endsWith('}')) || (rawVal.startsWith('[') && rawVal.endsWith(']'))) {
      try { value = JSON.parse(rawVal) } catch { /* keep as string */ }
    } else if ((rawVal.startsWith('"') && rawVal.endsWith('"')) || (rawVal.startsWith("'") && rawVal.endsWith("'"))) {
      value = rawVal.slice(1, -1)
    }

    ops.push({ op: 'replace', path, value })
  }

  return ops
}

// ============================================================
// 路径规范化
// ============================================================

function normalizeVariablePath(raw: string): string {
  let path = String(raw || '').trim()
  if (!path) return ''

  if (path.startsWith('$')) {
    path = path.slice(1)
    if (path.startsWith('.')) path = path.slice(1)
  }
  if (path.includes('.') && !path.startsWith('/')) {
    path = '/' + path.replace(/\./g, '/')
  }
  if (!path.startsWith('/')) {
    path = '/' + path
  }
  return path.replace(/\/+$/, '')
}

// ============================================================
// 增量值解析
// ============================================================

export function resolveIncremental(current: number, raw: any): number {
  const cur = typeof current === 'number' ? current : 0
  if (typeof raw === 'number') return raw
  if (typeof raw === 'string') {
    const s = raw.trim()
    if (/^[+-]\d+(\.\d+)?$/.test(s)) return cur + Number(s)
    if (/^\d+(\.\d+)?$/.test(s)) return Number(s)
  }
  return cur
}

// ============================================================
// 操作路由
// ============================================================

export function applyOperation(op: VarOperation): string | null {
  const origPath = normalizeVariablePath(op.path)
  if (!origPath) return null

  const resolved = resolveVarDef(origPath)
  if (!resolved) {
    console.warn('[wandou] 变量路径未注册，跳过:', origPath)
    return null
  }

  const { def, dynamicName, canonicalPath } = resolved

  // 使用规范化后的路径进行路由（处理过中文→英文别名）
  const routePath = canonicalPath || origPath

  // 校验值
  if (op.value !== undefined) {
    const validation = validateValue(def, op.value)
    if (!validation.valid) {
      console.warn('[wandou] 变量值校验失败:', routePath, validation.reason)
      return null
    }
  }

  const parts = routePath.split('/').filter(Boolean)
  if (parts.length === 0) return null

  // 按顶级路径路由
  const root = parts[0]
  if (root === 'player') {
    return applyPlayerOp(op, parts.slice(1), def, dynamicName)
  }
  if (root === 'world') {
    return applyWorldOp(op, parts.slice(1), def)
  }
  if (root === 'npcs') {
    return applyNpcOp(op, parts.slice(1), def, dynamicName)
  }

  return null
}

// ============================================================
// Player 操作
// ============================================================

function applyPlayerOp(
  op: VarOperation,
  parts: string[],
  def: VarDef,
  _dynamicName?: string,
): string | null {
  const player = usePlayerStore()
  if (parts.length === 0) return null

  const head = parts[0]

  // /player/gold
  if (head === 'gold') {
    const current = player.character.gold ?? 0
    const method = def.incremental ? resolveIncremental : (v: any) => Number(v)
    const newVal = Math.max(0, method(current, op.value))
    player.updateCharacter({ ...player.character, gold: newVal })
    const diff = newVal - current
    if (diff > 0) return `🪙 金币 +${diff}（当前 ${newVal}）`
    if (diff < 0) return `🪙 金币 ${diff}（当前 ${newVal}）`
    return `🪙 金币 → ${newVal}`
  }

  // /player/attributes/{name}
  if (head === 'attributes' && parts.length > 1) {
    const attrName = parts[1]
    const attrs = { ...(player.character.attributes || {}) }
    const current = attrs[attrName] ?? 0
    attrs[attrName] = def.incremental ? resolveIncremental(current, op.value) : Number(op.value)
    player.updateCharacter({ ...player.character, attributes: attrs })
    return `✨ ${attrName}: ${attrs[attrName]}`
  }

  // /player/character/{field}
  if (head === 'character' && parts.length > 1) {
    const update: any = {}
    update[parts[1]] = op.value
    player.updateCharacter(update)
    return null
  }

  // /player/inventory
  if (head === 'inventory') {
    return handleInventoryOp(op, parts.slice(1), player)
  }

  // /player/quests
  if (head === 'quests') {
    return handleQuestOp(op, parts.slice(1), player)
  }

  // 直接字段
  if (parts.length === 1 && head !== 'attributes' && head !== 'inventory' && head !== 'quests') {
    const update: any = {}
    update[head] = op.value
    player.updateCharacter(update)
    return null
  }

  return null
}

// ============================================================
// 物品操作
// ============================================================

function handleInventoryOp(
  op: VarOperation,
  parts: string[],
  player: ReturnType<typeof usePlayerStore>,
): string | null {
  // add 新物品: /player/inventory/-
  if (op.op === 'add' || (op.op === 'replace' && parts[0] === '-')) {
    if (op.value && Array.isArray(op.value)) {
      const ops = op.value
        .filter((v: any) => v && typeof v === 'object')
        .map((v: any) => ({
          op: 'add' as const,
          name: v.name || v.名称 || '未知道具',
          quantity: Math.max(1, Math.floor(Number(v.quantity ?? v.数量 ?? 1)) || 1),
          type: String(v.type ?? v.品类 ?? v.类型 ?? 'other'),
          description: String(v.description || v.描述 || v.intro || ''),
        }))
      if (ops.length > 0) {
        const result = player.applyOps(ops)
        const names = result.placed.map(p => p.name)
        if (names.length > 0) return `📦 获得 ${names.join('、')}`
      }
      return null
    }

    if (op.value && typeof op.value === 'object' && !Array.isArray(op.value)) {
      const itemName = op.value.name || op.value.名称 || '未知道具'
      const qty = Math.max(1, Math.floor(Number(op.value.quantity ?? op.value.数量 ?? 1)) || 1)
      const result = player.applyOps([{
        op: 'add',
        name: itemName,
        quantity: qty,
        type: String(op.value.type ?? op.value.品类 ?? op.value.类型 ?? 'other'),
        description: String(op.value.description || op.value.描述 || op.value.intro || ''),
      }])
      if (result.placed.length > 0) {
        return `📦 获得 ${itemName}${qty > 1 ? ` ×${qty}` : ''}`
      }
    }
    return null
  }

  // update 物品数量或属性: /player/inventory/{name}
  if (op.op === 'replace' && parts.length > 0 && parts[0] !== '-') {
    const identifier = parts[0]
    return handleInventoryUpdate(identifier, op.value, player)
  }

  // remove 物品: /player/inventory/{name}
  if (op.op === 'remove' && parts.length > 0) {
    const identifier = parts[0]
    return handleInventoryRemove(identifier, player)
  }

  return null
}

function handleInventoryUpdate(
  identifier: string,
  value: any,
  player: ReturnType<typeof usePlayerStore>,
): string | null {
  if (!value) return null
  const items = player.inventory

  // 按索引
  const idx = Number(identifier)
  if (!isNaN(idx) && idx >= 0 && idx < items.length) {
    if (value.quantity !== undefined) {
      const newQty = resolveIncremental(items[idx].quantity, value.quantity)
      player.updateItemQuantity(items[idx].id, newQty)
      return `${items[idx].name} 数量 → ${newQty}`
    }
  }

  // 按名称/ID
  const byName = items.find(i => i.name === identifier || i.id === identifier)
  if (byName && value.quantity !== undefined) {
    const newQty = resolveIncremental(byName.quantity, value.quantity)
    player.updateItemQuantity(byName.id, newQty)
    return `${byName.name} 数量 → ${newQty}`
  }

  return null
}

function handleInventoryRemove(
  identifier: string,
  player: ReturnType<typeof usePlayerStore>,
): string | null {
  const items = player.inventory

  // 按索引
  const idx = Number(identifier)
  if (!isNaN(idx) && idx >= 0 && idx < items.length) {
    const removed = items[idx]
    player.removeItem(removed.id)
    return `🗑️ 失去 ${removed.name}`
  }

  // 按名称/ID
  const byName = items.find(i => i.name === identifier || i.id === identifier)
  if (byName) {
    player.removeItem(byName.id)
    return `🗑️ 失去 ${byName.name}`
  }

  return null
}

// ============================================================
// 任务操作（统一通过 JSON Patch）
// ============================================================

// ============================================================
// 从 AI 输出的 value 构建 Quest（5字段齐全）
// ============================================================
function buildQuestFromValue(v: any): Quest {
  const questType = String(v.questType || v.任务类型 || v.type || '支线').trim()
  const color = String(v.color || v.任务颜色 || v.colour || defaultQuestColor(questType)).trim()
  return {
    id: v.id || `q-${Date.now()}`,
    title: (v.title || v.标题 || v.name || '新任务').toString().trim(),
    questType,
    description: (v.description || v.描述 || v.content || '').toString().trim(),
    reward: (v.reward || v.奖励 || v.任务奖励 || '').toString().trim(),
    color,
    status: (v.status || 'active').toString().trim() as any,
    objectives: Array.isArray(v.objectives) ? v.objectives : [],
    source: (v.source || v.来源 || v.发布者 || '').toString().trim() || undefined,
    sourceNpcId: (v.sourceNpcId || v.发布者ID || '').toString().trim() || undefined,
    acceptedAt: (v.acceptedAt || v.接取时间 || '').toString().trim() || undefined,
  }
}

function defaultQuestColor(questType: string): string {
  switch (questType) {
    case '主线': return '#ff6b6b'
    case '支线': return '#ffa726'
    case '日常': return '#66bb6a'
    case '紧急': return '#e53935'
    case '隐藏': return '#9575cd'
    default: return '#ffa726'
  }
}

function handleQuestOp(
  op: VarOperation,
  parts: string[],
  player: ReturnType<typeof usePlayerStore>,
): string | null {
  const questValue: any = op.value

  // ---- add 新任务: /player/quests/- ----
  if ((op.op === 'add' || (op.op === 'replace' && parts[0] === '-')) &&
      questValue && typeof questValue === 'object' && !Array.isArray(questValue)) {
    const q = buildQuestFromValue(questValue)
    const existing = player.quests.find(x => x.title === q.title || x.id === q.id)
    if (existing) {
      if (questValue.status) player.updateQuestStatus(existing.id, questValue.status as any)
      if (questValue.description) existing.description = questValue.description
      return null
    }
    player.addQuest(q)
    console.warn('[wandou] 任务已添加 (/-):', q.title, 'type=', q.questType)
    return `📋 新任务：${q.title}`
  }

  // ---- add 新任务: /player/quests（AI 遗漏了 /-） ----
  if (parts.length === 0 &&
      (op.op === 'add' || op.op === 'replace') &&
      questValue && typeof questValue === 'object' && !Array.isArray(questValue)) {
    const q = buildQuestFromValue(questValue)
    if (!q.title || q.title === '新任务') return null
    const existing = player.quests.find(x => x.title === q.title || x.id === q.id)
    if (existing) {
      if (questValue.status) player.updateQuestStatus(existing.id, questValue.status as any)
      if (questValue.description) existing.description = questValue.description
      return null
    }
    player.addQuest(q)
    console.warn('[wandou] 任务已添加 (/quests):', q.title, 'type=', q.questType)
    return `📋 新任务：${q.title}`
  }

  // ---- add 批量任务: /player/quests 替换整个数组 ----
  if (parts.length === 0 && op.op === 'replace' && Array.isArray(questValue)) {
    const titles: string[] = []
    for (const item of questValue) {
      if (!item || typeof item !== 'object') continue
      const q = buildQuestFromValue(item)
      if (!q.title || q.title === '新任务') continue
      if (player.quests.some(x => x.title === q.title)) continue
      player.addQuest(q)
      titles.push(q.title)
    }
    if (titles.length > 0) {
      console.warn('[wandou] 批量任务已添加:', titles.join('、'))
      return `📋 新任务：${titles.join('、')}`
    }
    return null
  }

  // ---- update 任务状态 或 按名称 upsert: /player/quests/{title} ----
  if ((op.op === 'replace' || op.op === 'add') && parts.length > 0 && parts[0] !== '-') {
    const quests = player.quests
    const targetTitle = parts[0].trim()
    const byName = quests.find(q => q.id === targetTitle || q.title === targetTitle)

    if (byName && questValue && typeof questValue === 'object') {
      if (questValue.status) {
        const status = questValue.status
        player.updateQuestStatus(byName.id, status as any)
        if (status === 'completed') return `✅ 任务完成：${byName.title}`
        if (status === 'failed') return `❌ 任务失败：${byName.title}`
      }
      if (questValue.title) byName.title = questValue.title
      if (questValue.description) byName.description = questValue.description
      return null
    }

    // upsert: 未找到 → 创建新任务
    if (!byName && questValue && typeof questValue === 'object') {
      const q = buildQuestFromValue({ ...questValue, title: questValue.title || targetTitle })
      player.addQuest(q)
      console.warn('[wandou] 任务已添加 (upsert):', q.title, 'type=', q.questType)
      return `📋 新任务：${q.title}`
    }
  }

  return null
}

// ============================================================
// World 操作
// ============================================================

function applyWorldOp(
  op: VarOperation,
  parts: string[],
  _def: VarDef,
): string | null {
  const store = useStateStore()
  if (parts.length === 0) return null

  const head = parts[0]

  // /world/time
  if (head === 'time') {
    if (typeof op.value === 'string') {
      const r = store.setWorldTime(op.value)
      if (r.ok) return `⏰ ${op.value}`
      console.debug('[wandou] 时间更新失败:', r.reason)
    }
    return null
  }

  // /world/location/...
  if (head === 'location' && parts.length > 1) {
    const loc: any = {}
    if (parts[1] === 'region') loc.region = String(op.value)
    else if (parts[1] === 'subRegion') loc.subRegion = String(op.value)
    else if (parts[1] === 'detail') loc.detail = String(op.value)
    if (Object.keys(loc).length > 0) {
      store.setLocation(loc)
      return null // location change already emitted by stateStore
    }
    return null
  }

  // /world/weather
  if (head === 'weather') {
    store.setWeather(String(op.value))
    return null
  }

  return null
}

// ============================================================
// NPC 操作
// ============================================================

function applyNpcOp(
  op: VarOperation,
  parts: string[],
  def: VarDef,
  npcName?: string,
): string | null {
  const npc = useNpcStore()

  // add 新 NPC: /npcs/-
  if ((op.op === 'add' || (op.op === 'replace' && parts[0] === '-')) && op.value && typeof op.value === 'object' && !Array.isArray(op.value)) {
    const v = op.value
    const name = (v.name || v.名称 || '').trim()
    if (!name) return null
    // 同名 NPC 已存在 → 不重复添加
    if (npc.npcs.some(n => n.name === name || n.id === name)) {
      console.debug('[wandou] NPC 已存在，跳过添加:', name)
      return null
    }
    const entry: NpcEntry = {
      id: `npc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      keys: [name],
      role: String(v.role || v.身份 || v.职业 || ''),
      personality: String(v.personality || v.性格 || ''),
      appearance: String(v.appearance || v.外貌 || ''),
      background: String(v.background || v.背景 || ''),
      relationToPlayer: String(v.relationToPlayer || v.与玩家关系 || ''),
      speechStyle: '',
      scenario: '',
      firstMessage: '',
      enabled: true,
      priority: 10,
      // 通用人口学字段
      age: (() => { const n = Number(v.age ?? v.年龄); return n > 0 ? n : undefined })(),
      gender: String(v.gender ?? v.性别 ?? ''),
      characterIntro: String(v.characterIntro ?? v.人物介绍 ?? v.intro ?? ''),
      sexualExperience: String(v.sexualExperience ?? v.性经历 ?? ''),
      // 世界特定属性
      extraAttributes: v.extraAttributes && typeof v.extraAttributes === 'object'
        ? Object.fromEntries(Object.entries(v.extraAttributes as Record<string, unknown>).map(([k, v]) => [k, String(v ?? '')]))
        : undefined,
    }
    npc.addEntries([entry])
    return `👤 ${name} 登场（ID: ${entry.id}）`
  }

  if (parts.length < 2 || !npcName) return null

  const field = parts[1]

  // 模糊匹配 NPC（使用 npcStore 的 findNpc，支持 aliases + nameHistory）
  const target = npc.findNpc(npcName)

  if (!target) {
    console.warn('[wandou] ⚠️ NPC 未找到，变量操作跳过:', npcName, '→ 路径:', op.path, '| 在场NPC:', npc.npcs.filter(n => n.enabled).map(n => n.name).join(', '))
    return null
  }

  // ---- identity 批量身份揭示 ----
  if (field === 'identity' && op.value && typeof op.value === 'object') {
    const v = op.value
    const updates: string[] = []

    // 先改名（如果提供了新名字且不同于当前名）
    if (typeof v.name === 'string' && v.name.trim() && v.name.trim() !== target.name) {
      const renameResult = npc.renameNpc(target.id, v.name.trim())
      if (renameResult) {
        if (renameResult.isIdentityReveal) {
          updates.push(`🪪 身份揭示：${renameResult.oldName} → ${renameResult.newName}`)
        } else {
          updates.push(`📝 ${renameResult.oldName} → ${renameResult.newName}`)
        }
      }
    }

    // 批量更新其他字段
    const fields: Array<{ key: string; label: string }> = [
      { key: 'role', label: '身份' },
      { key: 'personality', label: '性格' },
      { key: 'appearance', label: '外貌' },
      { key: 'background', label: '背景' },
      { key: 'relationToPlayer', label: '关系' },
      { key: 'age', label: '年龄' },
      { key: 'gender', label: '性别' },
      { key: 'characterIntro', label: '人物介绍' },
      { key: 'sexualExperience', label: '性经历' },
    ]
    for (const { key } of fields) {
      if (typeof v[key] === 'string' && v[key].trim()) {
        ;(target as Record<string, unknown>)[key] = v[key].trim()
        updates.push(`${key}: ${v[key].trim().slice(0, 30)}`)
      }
    }

    // 也处理中文别名
    const aliasMap: Record<string, string> = {
      '身份': 'role', '职业': 'role',
      '性格': 'personality',
      '外貌': 'appearance',
      '背景': 'background',
      '与玩家关系': 'relationToPlayer', '关系': 'relationToPlayer',
      '年龄': 'age',
      '性别': 'gender',
      '人物介绍': 'characterIntro',
      '性经历': 'sexualExperience',
    }
    for (const [ck, ek] of Object.entries(aliasMap)) {
      if (typeof v[ck] === 'string' && v[ck].trim()) {
        ;(target as Record<string, unknown>)[ek] = v[ck].trim()
      }
    }

    // 更新世界特定属性（extraAttributes）
    if (v.extraAttributes && typeof v.extraAttributes === 'object' && !Array.isArray(v.extraAttributes)) {
      if (!target.extraAttributes) target.extraAttributes = {}
      for (const [k, val] of Object.entries(v.extraAttributes as Record<string, unknown>)) {
        if (typeof val === 'string' && val.trim()) {
          target.extraAttributes[k] = val.trim()
          updates.push(`extra.${k}: ${val.trim().slice(0, 20)}`)
        }
      }
    }

    return updates.length > 0 ? updates.join(' | ') : null
  }

  // favor / 好感度（使用 npcStore.updateFavor 自动记录事迹）
  if (field === 'favor' || field === 'favorability') {
    const current = target.favor ?? target.favorability ?? 0
    const newVal = def.incremental
      ? resolveIncremental(current, op.value)
      : Number(op.value)
    const clamped = Math.max(def.min ?? -99, Math.min(def.max ?? 99, newVal))
    const result = npc.updateFavor(target.id, clamped)
    if (!result) return null
    const diff = clamped - current
    if (diff > 0) return `❤️ ${target.name} 好感 +${diff}`
    if (diff < 0) return `💔 ${target.name} 好感 ${diff}`
    return null
  }

  // enabled / isVisible（使用 setCategory 自动记录事迹）
  if (field === 'enabled' || field === 'isVisible') {
    const val = op.value === 'true' || op.value === true || op.value === 1 ? true : false
    npc.setCategory(target.id, val ? '在场' : '离场')
    return val ? null : `${target.name} 已离场`
  }

  // currentHp
  if (field === 'currentHp') {
    const current = target.currentHp ?? 100
    const newVal = def.incremental
      ? resolveIncremental(current, op.value)
      : Number(op.value)
    target.currentHp = Math.max(0, newVal)
    return null
  }

  // 改名：使用 npcStore.renameNpc() 统一处理（含 aliases/nameHistory/事迹 维护）
  if (field === 'name' && op.op === 'replace' && typeof op.value === 'string') {
    const newName = op.value.trim()
    if (!newName) return null
    const renameResult = npc.renameNpc(target.id, newName)
    if (!renameResult) return null
    if (renameResult.isIdentityReveal) {
      return `🪪 身份揭示：${renameResult.oldName} → ${renameResult.newName}`
    }
    return `📝 ${renameResult.oldName} → ${renameResult.newName}`
  }

  // 通用字段更新
  if (op.op === 'replace') {
    ;(target as Record<string, unknown>)[parts[1]] = op.value
  }

  return null
}

// ============================================================
// 主入口
// ============================================================

export function processVariableUpdates(text: string): VarResult {
  if (!text) return { cleanText: '', applied: 0, summary: '', operations: [] }

  let cleanText = text
  const opsApplied: { op: VarOperation; result: string | null }[] = []
  const summaries: string[] = []

  // 去掉所有变量标签和思维链（思维链是 AI 内部推理，不应出现在聊天显示中）
  const tagPatterns = [
    /<thinking\b[^>]*>[\s\S]*?<\/thinking\s*>/gi,
    /<mj_variables\b[^>]*>[\s\S]*?<\/mj_variables\s*>/gi,
    /<variables?\b[^>]*>[\s\S]*?<\/variables?\s*>/gi,
    /<patch\b[^>]*>[\s\S]*?<\/patch\s*>/gi,
  ]
  for (const re of tagPatterns) {
    cleanText = cleanText.replace(re, '')
  }

  // 先从原始文本中去掉 <thinking> 块，防止平衡 JSON 提取误读其中的结构化内容
  const textForExtract = text.replace(/<thinking\b[^>]*>[\s\S]*?<\/thinking\s*>/gi, '')
  const payloads = extractAllJsonPayloads(textForExtract)

  // --- 调试日志：显示 AI 原始变量输出 ---
  const hasThinking = /<thinking\b/i.test(text)
  const hasMjVars = /<mj_variables\b/i.test(text)

  if (payloads.length > 0) {
    console.warn('[wandou] ✅ 标签 | thinking:' + hasThinking + ' | mj_variables:' + hasMjVars + ' | 提取到 ' + payloads.length + ' 个 JSON 负载')
    for (let i = 0; i < payloads.length; i++) {
      console.warn('[wandou] 负载 #' + (i + 1) + ':', payloads[i].slice(0, 500))
    }
  } else if (text.includes('mj_variables') || text.includes('variables')) {
    console.warn('[wandou] ⚠️ 标签存在但解析失败 | 原文片段:', text.slice(Math.max(0, text.indexOf('mj_variables') - 20), text.indexOf('mj_variables') + 500))
  } else {
    console.warn('[wandou] ❌ 未检测到 <mj_variables> 标签 | thinking:' + hasThinking + ' | 本轮变量不会更新')
  }

  // 提取 thinking 内容用于合规检查
  const thinkMatch = text.match(/<thinking\b[^>]*>([\s\S]*?)<\/thinking\s*>/i)
  if (thinkMatch) {
    const thinkContent = thinkMatch[1].trim()
    const hasStep0 = /Step\.0|身份揭示/i.test(thinkContent)
    const hasStep3 = /Step\.[3-7]|规则自检|去重.*replace|占位值.*replace|物品变化|任务变化|NPC.*变化|时间检查|位置检查|天气检查/i.test(thinkContent)
    const tooShort = thinkContent.length < 200
    const onlyNoChange = /^(无变化|无需更新|没有任何变化|nothing.*change)[\s。.]*$/i.test(thinkContent.trim())
    const hasNoChange = /无变化|无需更新|没有任何|nothing.*change/i.test(thinkContent)
    console.warn('[wandou] thinking 合规: Step.0=' + hasStep0 + ' | 多步骤=' + hasStep3 + ' | 太短=' + tooShort + ' | 全是无变化=' + onlyNoChange + ' | 长度=' + thinkContent.length + '字符')
    if (tooShort || onlyNoChange || (!hasStep3 && hasNoChange)) {
      console.warn('[wandou] ⚠️ AI thinking 太简略或不完整！可能遗漏变量更新。thinking 应包含 Step.0~Step.7 逐项检查，每项写明当前值→变化→结论')
    }
  } else {
    console.error('[wandou] 🚨🚨🚨 本轮无 <thinking> 标签！AI 跳过了思考步骤。')
  }

  for (const payload of payloads) {
    const ops = parseOperations(payload)
    console.warn('[wandou] 解析到', ops.length, '个操作:', ops.map(o => `${o.op} ${o.path}`).join(', ') || '(无)')
    for (const op of ops) {
      const result = applyOperation(op)
      opsApplied.push({ op, result })
      if (result) summaries.push(result)
    }
  }

  return {
    cleanText: cleanText.trim().replace(/\n{3,}/g, '\n\n'),
    applied: opsApplied.length,
    summary: summaries.slice(0, 5).join('；'),
    operations: opsApplied,
  }
}
