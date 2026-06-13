// ============================================================
// wandou v0.7 — 豌豆 · NPC 角色书引擎
// 自有格式 + SillyTavern 角色卡兼容导入 + 关键词匹配
// ============================================================

import type { NpcEntry, NpcImportResult } from '../types/npc'

let idCounter = 0
function genId(): string { idCounter++; return `npc-${Date.now()}-${idCounter}` }

// ---------- 关键词匹配 ----------

export function scanNpcs(
  npcs: NpcEntry[],
  chatHistory: string[],
  maxTokens: number = 1500,
): string {
  const enabled = npcs.filter(n => n.enabled)
  if (enabled.length === 0) return ''

  const historyText = chatHistory.join(' ').toLowerCase()
  const matched: NpcEntry[] = []

  for (const npc of enabled) {
    // 合并所有可匹配的关键词：keys + aliases
    const allKeys = [...new Set([
      ...npc.keys,
      ...(npc.aliases || []),
    ])]
    for (const key of allKeys) {
      if (!key.trim()) continue
      if (historyText.includes(key.toLowerCase().trim())) {
        matched.push(npc)
        break
      }
    }
  }

  if (matched.length === 0) return ''

  matched.sort((a, b) => b.priority - a.priority)

  const parts: string[] = []
  let used = 0
  const maxChars = maxTokens * 2

  for (const npc of matched) {
    const card = formatNpcCard(npc)
    if (used + card.length > maxChars) break
    parts.push(card)
    used += card.length
  }

  if (parts.length === 0) return ''
  return `\n\n【当前场景 NPC 角色卡】\n${parts.join('\n\n---\n')}\n`
}

function formatNpcCard(npc: NpcEntry): string {
  const lines: string[] = []
  lines.push(`「${npc.name}」(${npc.role})`)
  if (npc.aliases && npc.aliases.length > 0) lines.push(`别名/曾用名: ${npc.aliases.join(', ')}`)
  if (npc.identityRevealed) lines.push(`⚠️ 身份已揭示（原名可能是占位名）`)
  if (npc.personality) lines.push(`性格: ${npc.personality}`)
  if (npc.appearance) lines.push(`外貌: ${npc.appearance}`)
  if (npc.background) lines.push(`背景: ${npc.background}`)
  if (npc.relationToPlayer) lines.push(`与玩家关系: ${npc.relationToPlayer}`)
  if (npc.speechStyle) lines.push(`说话风格: ${npc.speechStyle}`)
  if (npc.scenario) lines.push(`当前场景: ${npc.scenario}`)
  return lines.join('\n')
}

// ---------- 导入解析 ----------

export function importNpcJson(jsonStr: string): NpcImportResult {
  const errors: string[] = []
  let data: unknown

  try { data = JSON.parse(jsonStr) } catch (e: any) {
    return { success: false, imported: 0, errors: [`JSON 解析失败: ${e.message}`], entries: [] }
  }

  const entries: NpcEntry[] = []

  // 单对象 → 转数组
  let rawArr: unknown[]
  if (Array.isArray(data)) {
    rawArr = data
  } else if (data && typeof data === 'object') {
    rawArr = [data]
  } else {
    return { success: false, imported: 0, errors: ['JSON 格式错误'], entries: [] }
  }

  for (let i = 0; i < rawArr.length; i++) {
    const raw = rawArr[i] as any
    if (!raw || typeof raw !== 'object') { errors.push(`#${i + 1}: 无效`); continue }

    // 检测 ST 角色卡
    const isSt = raw.spec || raw.spec_version || raw.data
    const src = isSt ? (raw.data || raw) : raw

    const name = (src.name || '').trim()
    if (!name) { errors.push(`#${i + 1}: 缺少名字`); continue }

    const keys: string[] = [name]
    if (Array.isArray(src.tags)) keys.push(...src.tags)
    if (Array.isArray(src.keywords)) keys.push(...src.keywords)
    if (Array.isArray(raw.keys)) keys.push(...raw.keys)
    if (Array.isArray(raw.aliases)) keys.push(...raw.aliases)

    const entry: NpcEntry = {
      id: genId(),
      name,
      keys: [...new Set(keys.map((k: string) => k.trim()).filter(Boolean))],
      role: (src.role || src.occupation || '').trim(),
      personality: (src.personality || '').trim(),
      appearance: (src.appearance || '').trim(),
      background: (src.creator_notes || src.background || src.backstory || '').trim(),
      relationToPlayer: (src.relationToPlayer || src.relation || '').trim(),
      speechStyle: (src.speechStyle || src.speech_style || '').trim(),
      scenario: (src.scenario || '').trim(),
      firstMessage: (src.first_mes || src.firstMessage || '').trim(),
      enabled: raw.enabled !== false,
      priority: typeof raw.priority === 'number' ? Math.max(0, Math.min(100, raw.priority)) : 50,
    }

    // ---- 自动推导人物分类（yijiekkk-style） ----
    const allTagText = [...entry.keys, ...(Array.isArray(src.tags) ? src.tags : [])].join(' ')
    if (/重点|关键角色|核心|重要NPC|主要角色/i.test(allTagText)) {
      entry.人物分类 = '重点'
    } else if (/离场|退场|离场NPC|已离开/i.test(allTagText)) {
      entry.人物分类 = '离场'
    } else {
      entry.人物分类 = '在场'
    }

    // ST: description 拆到 personality/appearance
    if (!entry.personality && !entry.appearance && src.description) {
      const desc = src.description.trim()
      const sep = desc.indexOf('\n')
      if (sep > 0) {
        entry.appearance = desc.slice(0, sep).trim()
        entry.personality = desc.slice(sep + 1).trim()
      } else if (desc.length <= 80) {
        entry.personality = desc
      } else {
        entry.appearance = desc.slice(0, 80) + '...'
      }
    }

    entries.push(entry)
  }

  return { success: entries.length > 0, imported: entries.length, errors, entries }
}
