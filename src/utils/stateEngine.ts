// ============================================================
// wandou · 状态快照 + 标签剥离
//
// 构建发给 AI 的状态快照，以及从 AI 回复中剥离变量标签。
// 变量解析和路由已统一到 variableEngine.ts。
// ============================================================

import { useStateStore } from '@/stores/stateStore'
import { usePlayerStore } from '@/stores/playerStore'
import { useNpcStore } from '@/stores/npcStore'

/** 构建发给 AI 的完整状态快照 */
export function buildFullStateSnapshot(): {
  worldJson: string
  playerJson: string
  npcJson: string
  memoryContext: string
} {
  const state = useStateStore()
  const player = usePlayerStore()
  const npc = useNpcStore()
  const char = player.character

  // world
  const worldSnapshot = {
    timeString: state.worldTime,
    location: state.currentLocation,
    weather: state.weather,
    events: state.activeEvents.map(e => ({
      title: e.title,
      description: e.description,
      status: e.status,
    })),
  }

  // player
  const playerSnapshot = {
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

  // npc
  const npcSnapshot = npc.getActiveNpcs()
    .slice(0, 15)
    .map((n) => ({
      id: n.id,
      name: n.name,
      role: n.role || '',
      personality: n.personality?.slice(0, 60) || '',
      favorability: n.favor ?? n.favorability ?? 0,
      isVisible: true,
      currentHp: n.currentHp,
      maxHp: n.maxHp,
    }))

  // memory
  let memoryContext = ''
  if (state.memories.length > 0) {
    const relevant = [...state.memories]
      .filter(m => m.state === 'active' || m.state === 'unknown')
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 10)
    if (relevant.length > 0) {
      const lines = ['【重要历史记录】']
      for (const m of relevant) {
        lines.push(`- [${m.category}] ${m.fact}`)
      }
      memoryContext = lines.join('\n')
    }
  }

  return {
    worldJson: JSON.stringify(worldSnapshot, null, 2),
    playerJson: JSON.stringify(playerSnapshot, null, 2),
    npcJson: JSON.stringify(npcSnapshot, null, 2),
    memoryContext,
  }
}

// ============================================================
// 标签剥离
// ============================================================

/** 标签名列表，统一管理 */
const VARIABLE_TAGS = ['mj_variables', 'variables', 'patch']
const COT_TAGS = ['thinking']

/**
 * 从 AI 回复中剥离所有变量标签和思维链标签，返回干净正文。
 * 只剥离，不解析 — 解析由 variableEngine.processVariableUpdates() 负责。
 */
export function stripStateTags(text: string): string {
  let cleaned = text

  // 思维链块
  for (const tag of COT_TAGS) {
    const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, 'gi')
    cleaned = cleaned.replace(re, '')
  }

  // 变量标签
  for (const tag of VARIABLE_TAGS) {
    const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, 'gi')
    cleaned = cleaned.replace(re, '')
  }

  // 含状态数据的 Markdown 代码围栏
  cleaned = cleaned.replace(/```(?:json)?\s*\n?\s*\[[\s\S]*?"op"\s*:\s*"(?:add|remove|replace)"[\s\S]*?\]\s*\n?\s*```/gi, '')
  cleaned = cleaned.replace(/```(?:json)?\s*\n?\s*\{[\s\S]*?"timeString"[\s\S]*?\}\s*\n?\s*```/gi, '')

  return cleaned.replace(/\n{3,}/g, '\n\n').trim()
}
