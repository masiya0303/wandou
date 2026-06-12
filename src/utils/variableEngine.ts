// ============================================================
// wandou · 增强变量引擎
//
// 从 AI 回复中提取 <variables> / <mj_variables> / <patch> 标签，
// 解析为 RFC 6902 JSON Patch 操作，应用到 playerStore / npcStore
//
// 增强点：
//   - 统一的多层标签提取（5 级回退）
//   - 支持中英文字段名双向兼容
//   - NPC 模糊匹配（name / id）
//   - 增量表达式 ("+N", "-N")
//   - 物品操作通过 playerStore.applyOps() 统一入口
// ============================================================

import type { InventoryItem, Quest } from '@/types/world'
import { usePlayerStore } from '@/stores/playerStore'
import { useNpcStore } from '@/stores/npcStore'
import { safeParseJson, extractBalancedJson } from './jsonExtract'

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
    // 只取看起来像操作数组或路径映射的
    if (content.startsWith('[') || content.startsWith('{') && (content.includes('"op"') || content.includes('"path"') || content.includes('"player"'))) {
      fences.push(content)
    }
  }
  // 从后往前取（最新的优先）
  results.push(...fences.reverse())

  // 5. 裸 JSON 平衡提取
  const balanced = extractBalancedJson(text)
  if (balanced && !results.some(r => r === balanced)) {
    results.push(balanced)
  }

  return results
}

// ============================================================
// 解析为 VarOperation[]
// ============================================================

export function parseOperations(raw: string): VarOperation[] {
  const ops: VarOperation[] = []

  const trimmed = raw.trim()
  if (!trimmed) return ops

  // 尝试 JSON 解析
  let data: any = safeParseJson(trimmed)
  if (data === null) {
    data = safeParseJson(trimmed.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, ''))
  }

  if (data === null) {
    // 松散格式回退：/path/to/field = value
    return parseLooseOperations(raw)
  }

  if (Array.isArray(data)) {
    // RFC 6902 数组
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
        // character fields
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

/** 松散格式：/player/gold = 150 或 $.player.gold: 150 */
function parseLooseOperations(raw: string): VarOperation[] {
  const ops: VarOperation[] = []
  const lines = raw.split(/\r?\n/)

  for (const line of lines) {
    const trimmed = line.replace(/^[-*]\s+/, '').trim()
    if (!trimmed || trimmed.startsWith('```') || trimmed.startsWith('<')) continue

    // 匹配: path = value 或 path: value 或 path => value
    const m = /^(\/[^\s=:]+|[$\.][^\s=:]+|[a-zA-Z_][\w\/\.]*)\s*[:=]\s*(.+)$/i.exec(trimmed)
      || /^(\/[^\s=:]+|[$\.][^\s=:]+)\s*=>\s*(.+)$/i.exec(trimmed)
    if (!m) continue

    const rawPath = m[1].trim()
    const path = normalizeVariablePath(rawPath)
    if (!path) continue

    const rawVal = m[2].trim().replace(/,$/, '')
    if (!rawVal) continue

    let value: any = rawVal
    // 解析值
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

  // $ 前缀 → 去 $
  if (path.startsWith('$')) {
    path = path.slice(1)
    if (path.startsWith('.')) path = path.slice(1)
  }

  // 点分路径 → 斜杠路径
  if (path.includes('.') && !path.startsWith('/')) {
    path = '/' + path.replace(/\./g, '/')
  }

  if (!path.startsWith('/')) {
    path = '/' + path
  }

  // 去掉尾部斜杠
  path = path.replace(/\/+$/, '')

  return path
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
// 应用单条操作
// ============================================================

export function applyOperation(op: VarOperation): string | null {
  const player = usePlayerStore()
  const npc = useNpcStore()

  const path = normalizeVariablePath(op.path)
  if (!path) return null

  const parts = path.split('/').filter(Boolean)
  if (parts.length === 0) return null

  // === /player/... ===
  if (parts[0] === 'player') {
    return applyPlayerPath(op, parts.slice(1), player)
  }

  // === /npcs/... ===
  if (parts[0] === 'npcs') {
    return applyNpcPath(op, parts.slice(1), npc)
  }

  return null
}

// ============================================================
// Player 路径处理器
// ============================================================

function applyPlayerPath(op: VarOperation, parts: string[], player: ReturnType<typeof usePlayerStore>): string | null {
  if (parts.length === 0) return null

  const head = parts[0].toLowerCase()

  // /player/inventory/...
  if (['inventory', '背包', 'items'].includes(head) || head === 'inventory' || head === '背包') {
    return handleInventoryPath(op, parts.slice(1), player)
  }

  // /player/quests/...
  if (['quests', '任务', 'tasks'].includes(head) || head === 'quests' || head === '任务') {
    return handleQuestPath(op, parts.slice(1), player)
  }

  // /player/gold
  if (['gold', '金币', 'coins', '金钱'].includes(head) || head === 'gold') {
    const current = player.character.gold ?? 0
    const newVal = Math.max(0, resolveIncremental(current, op.value))
    player.updateCharacter({ ...player.character, gold: newVal })
    const diff = newVal - current
    if (diff > 0) return `🪙 金币 +${diff}（当前 ${newVal}）`
    if (diff < 0) return `🪙 金币 ${diff}（当前 ${newVal}）`
    return `🪙 金币 → ${newVal}`
  }

  // /player/attributes/{name}
  if (['attributes', '属性'].includes(head) || head === 'attributes') {
    if (parts.length > 1) {
      const attrName = parts[1]
      const attrs = { ...(player.character.attributes || {}) }
      const current = attrs[attrName] ?? 0
      attrs[attrName] = resolveIncremental(current, op.value)
      player.updateCharacter({ ...player.character, attributes: attrs })
      return `✨ ${attrName}: ${attrs[attrName]}`
    }
  }

  // /player/character/{field}
  if (['character', '角色'].includes(head) || head === 'character') {
    if (parts.length > 1) {
      const update: any = {}
      update[parts[1]] = op.value
      player.updateCharacter(update)
      return null // 角色字段变更不弹提醒
    }
  }

  // /player/{field} 直接字段
  if (parts.length === 1) {
    const update: any = {}
    update[parts[0]] = op.value
    player.updateCharacter(update)
    return null
  }

  return null
}

// ============================================================
// 物品路径处理器 — 通过 playerStore.applyOps() 统一入口
// ============================================================

function handleInventoryPath(op: VarOperation, parts: string[], player: ReturnType<typeof usePlayerStore>): string | null {
  if (op.op === 'add' || (op.op === 'replace' && parts[0] === '-')) {
    if (op.value && Array.isArray(op.value)) {
      // 批量添加 → 通过统一入口
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

  if (op.op === 'replace' && parts.length > 0 && parts[0] !== '-') {
    const identifier = parts[0]
    return handleInventoryUpdate(identifier, op.value, player)
  }

  if (op.op === 'remove' && parts.length > 0) {
    const identifier = parts[0]
    return handleInventoryRemove(identifier, player)
  }

  return null
}

function handleInventoryUpdate(identifier: string, value: any, player: ReturnType<typeof usePlayerStore>): string | null {
  if (!value) return null

  const items = player.inventory

  // 按索引
  const idx = Number(identifier)
  if (!isNaN(idx) && idx < items.length) {
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

function handleInventoryRemove(identifier: string, player: ReturnType<typeof usePlayerStore>): string | null {
  const items = player.inventory

  // 按索引
  const idx = Number(identifier)
  if (!isNaN(idx) && idx < items.length) {
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

function handleQuestPath(op: VarOperation, parts: string[], player: ReturnType<typeof usePlayerStore>): string | null {
  // add quest
  if ((op.op === 'add' || (op.op === 'replace' && parts[0] === '-')) && op.value && typeof op.value === 'object' && !Array.isArray(op.value)) {
    const q: Quest = {
      id: op.value.id || `q-${Date.now()}`,
      title: op.value.title || op.value.标题 || op.value.name || '新任务',
      description: op.value.description || op.value.描述 || op.value.content || '',
      status: 'active',
      objectives: Array.isArray(op.value.objectives) ? op.value.objectives : [],
    }
    player.addQuest(q)
    return `📋 新任务：${q.title}`
  }

  // update quest
  if (op.op === 'replace' && parts.length > 0 && parts[0] !== '-') {
    const quests = player.quests
    const byName = quests.find(q => q.id === parts[0] || q.title === parts[0])
    if (byName && op.value && typeof op.value === 'object') {
      if (op.value.status) {
        player.updateQuestStatus(byName.id, op.value.status as any)
        if (op.value.status === 'completed') return `✅ 任务完成：${byName.title}`
        if (op.value.status === 'failed') return `❌ 任务失败：${byName.title}`
      }
      if (op.value.title) byName.title = op.value.title
      if (op.value.description) byName.description = op.value.description
      return null
    }
  }

  return null
}

// ============================================================
// NPC 路径处理器
// ============================================================

function applyNpcPath(op: VarOperation, parts: string[], npc: ReturnType<typeof useNpcStore>): string | null {
  if (parts.length < 2) return null

  const npcName = parts[0]
  // 模糊匹配：先按 name 匹配，再按 id 匹配
  const target = npc.npcs.find(n =>
    n.name === npcName ||
    n.id === npcName ||
    n.name.toLowerCase() === npcName.toLowerCase()
  )
  if (!target) return null

  const field = parts[1].toLowerCase()

  // favor / 好感
  if (['favor', 'favorability', '好感', '好感度'].includes(field)) {
    const current = target.favor ?? target.favorability ?? 0
    const newVal = Math.max(-99, Math.min(99, resolveIncremental(current, op.value)))
    target.favor = newVal
    target.favorability = newVal
    const diff = newVal - current
    if (diff > 0) return `❤️ ${target.name} 好感 +${diff}`
    if (diff < 0) return `💔 ${target.name} 好感 ${diff}`
    return null
  }

  // 通用字段更新
  if (op.op === 'replace') {
    ;(target as Record<string, unknown>)[parts[1]] = op.value
  }

  return null
}

// ============================================================
// 辅助函数
// ============================================================

export function normalizeItemType(raw: string): InventoryItem['type'] {
  const t = String(raw || '').toLowerCase()
  if (t.includes('武器') || t.includes('weapon')) return 'weapon'
  if (t.includes('防具') || t.includes('铠甲') || t.includes('armor') || t.includes('盔甲')) return 'armor'
  if (t.includes('消耗') || t.includes('药') || t.includes('consumable') || t.includes('potion') || t.includes('食物') || t.includes('food')) return 'consumable'
  if (t.includes('材料') || t.includes('material') || t.includes('零件') || t.includes('矿石') || t.includes('component')) return 'material'
  if (t.includes('关键') || t.includes('key') || t.includes('钥匙') || t.includes('通行证') || t.includes('令牌')) return 'key'
  return 'other'
}

// ============================================================
// 主入口
// ============================================================

export function processVariableUpdates(text: string): VarResult {
  if (!text) return { cleanText: '', applied: 0, summary: '', operations: [] }

  let cleanText = text
  const opsApplied: { op: VarOperation; result: string | null }[] = []
  const summaries: string[] = []

  // 去掉所有标签
  const tagPatterns = [
    /<mj_variables\b[^>]*>[\s\S]*?<\/mj_variables\s*>/gi,
    /<variables?\b[^>]*>[\s\S]*?<\/variables?\s*>/gi,
    /<patch\b[^>]*>[\s\S]*?<\/patch\s*>/gi,
  ]
  for (const re of tagPatterns) {
    cleanText = cleanText.replace(re, '')
  }

  const payloads = extractAllJsonPayloads(text)

  for (const payload of payloads) {
    const ops = parseOperations(payload)
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
