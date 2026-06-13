// ============================================================
// wandou · NPC 角色书 Store
// ============================================================
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { NpcEntry } from '@/types/npc'
import { importNpcJson } from '@/utils/npcEngine'
import { bus } from '@/utils/events'

/** 人物分类合法值 */
export type NpcCategory = '在场' | '离场' | '重点'
export const NPC_CATEGORY_VALUES: ReadonlySet<string> = new Set(['在场', '离场', '重点'])
export const NPC_CATEGORY_DEFAULT: NpcCategory = '在场'

/** 好感度跨越阈值（绝对值差≥此值才记录事迹，防止每次微小变化都写） */
const FAVOR_CHRONICLE_THRESHOLD = 15

/** 好感度关键节点（跨过这些值记录事迹） */
const FAVOR_MILESTONES = [-50, 0, 30, 50, 80]

export const useNpcStore = defineStore('npc', () => {
  const npcs = ref<NpcEntry[]>([])

  /** 改名历史映射表：旧名（小写）→ 当前 NPC ID，用于 AI 用旧名路径时自动路由 */
  const nameHistory = ref<Map<string, string>>(new Map())

  const enabledNpcs = computed(() =>
    npcs.value.filter(n => getNpcCategory(n) !== '离场').length
  )

  // ============================================================
  // 人物分类
  // ============================================================

  /** 获取 NPC 人物分类，fallback 到旧 enabled 字段 */
  function getNpcCategory(npc: NpcEntry): NpcCategory {
    if (npc.人物分类 && NPC_CATEGORY_VALUES.has(npc.人物分类)) return npc.人物分类
    // 从旧 enabled 字段推导
    return npc.enabled ? '在场' : '离场'
  }

  /** 获取所有非离场 NPC（排序：重点 > 在场 > 离场） */
  function getActiveNpcs(): NpcEntry[] {
    const order: Record<string, number> = { '重点': 0, '在场': 1, '离场': 2 }
    return [...npcs.value]
      .filter(n => getNpcCategory(n) !== '离场')
      .sort((a, b) => (order[getNpcCategory(a)] ?? 1) - (order[getNpcCategory(b)] ?? 1))
  }

  /** 设置人物分类，变化时记录事迹 */
  function setCategory(id: string, category: NpcCategory, turnIndex?: number): boolean {
    const target = npcs.value.find(n => n.id === id)
    if (!target) return false
    const old = getNpcCategory(target)
    if (old === category) return false

    target.人物分类 = category
    // 同步 enabled 字段（向后兼容）
    target.enabled = category !== '离场'

    if (category === '离场') {
      target.离场轮次 = turnIndex
    }
    if (old === '离场' && category !== '离场') {
      target.出场轮次 = turnIndex
      // 离场后重新出场：清除旧的离场轮次
      target.离场轮次 = undefined
    }

    recordChronicle(id, `人物分类变更：${old} → ${category}`, turnIndex)
    bus.emit('npc:categoryChanged', { id, oldCategory: old, newCategory: category, npc: target })
    return true
  }

  // ============================================================
  // 人物事迹
  // ============================================================

  /** 向 NPC 追加人物事迹（自动去重最近一条相同内容） */
  function recordChronicle(id: string, event: string, turnIndex?: number): boolean {
    const target = npcs.value.find(n => n.id === id)
    if (!target || !event) return false

    if (!target.人物事迹) target.人物事迹 = []

    const prefix = turnIndex !== undefined ? `第${turnIndex}轮：` : ''
    const entry = prefix + event

    // 去重：最近一条相同内容不重复追加
    if (target.人物事迹.length > 0 && target.人物事迹[target.人物事迹.length - 1] === entry) {
      return false
    }

    target.人物事迹.push(entry)
    // 限制最多 50 条
    if (target.人物事迹.length > 50) {
      target.人物事迹 = target.人物事迹.slice(-50)
    }
    return true
  }

  /** 获取 NPC 最近 N 条事迹 */
  function getRecentChronicles(id: string, limit: number = 5): string[] {
    const target = npcs.value.find(n => n.id === id)
    if (!target?.人物事迹) return []
    return target.人物事迹.slice(-limit)
  }

  // ============================================================
  // 基本 CRUD
  // ============================================================

  function addEntries(entries: NpcEntry[], turnIndex?: number) {
    const ids = new Set(npcs.value.map(n => n.id))
    for (const e of entries) {
      if (!ids.has(e.id)) {
        // 自动填充人物分类
        if (!e.人物分类 || !NPC_CATEGORY_VALUES.has(e.人物分类)) {
          e.人物分类 = e.enabled === false ? '离场' : '在场'
        }
        if (e.人物分类 !== '离场' && e.出场轮次 === undefined) {
          e.出场轮次 = turnIndex
        }
        npcs.value.push(e)
        // 记录初始名字
        nameHistory.value.set(e.name.toLowerCase(), e.id)
        if (e.人物分类 !== '离场') {
          recordChronicle(e.id, `首次登场（名称：${e.name}）`, turnIndex)
        }
      }
    }
  }

  function remove(id: string) {
    const n = npcs.value.find(x => x.id === id)
    if (n) {
      for (const [k, v] of nameHistory.value) {
        if (v === id) nameHistory.value.delete(k)
      }
    }
    npcs.value = npcs.value.filter(n => n.id !== id)
  }

  function toggle(id: string) {
    const n = npcs.value.find(x => x.id === id)
    if (n) {
      const newCat: NpcCategory = getNpcCategory(n) === '离场' ? '在场' : '离场'
      setCategory(id, newCat)
    }
  }

  function importFromJson(s: string) {
    return importNpcJson(s)
  }

  // ============================================================
  // 模糊匹配
  // ============================================================

  /**
   * 按名称/ID/别称/历史名 模糊匹配 NPC。
   * 匹配优先级：精确 name → 精确 id → aliases → 历史旧名 → 小写 name
   * 返回匹配到的 NPC，未找到返回 undefined。
   */
  function findNpc(inputName: string): NpcEntry | undefined {
    if (!inputName) return undefined
    const lower = inputName.toLowerCase().trim()

    // 1. 精确 name
    const byName = npcs.value.find(n => n.name === inputName)
    if (byName) return byName

    // 2. 精确 id
    const byId = npcs.value.find(n => n.id === inputName)
    if (byId) return byId

    // 3. aliases（曾用名/别称）
    const byAlias = npcs.value.find(n =>
      n.aliases?.some(a => a.toLowerCase() === lower)
    )
    if (byAlias) return byAlias

    // 4. 历史旧名 → 查 nameHistory 找到 NPC ID，再用 ID 匹配
    const histId = nameHistory.value.get(lower)
    if (histId) {
      const byHist = npcs.value.find(n => n.id === histId)
      if (byHist) return byHist
    }

    // 5. 小写 name（最后的回退）
    const byLower = npcs.value.find(n => n.name.toLowerCase() === lower)
    if (byLower) return byLower

    return undefined
  }

  /**
   * 更新好感度（自动记录事迹和人物分类变动）。
   * 好感度跨越关键节点（-50, 0, 30, 50, 80）时自动记录事迹。
   */
  function updateFavor(id: string, newFavor: number, turnIndex?: number): { oldFavor: number; newFavor: number; milestones: number[] } | null {
    const target = npcs.value.find(n => n.id === id)
    if (!target) return null

    const oldFavor = target.favor ?? target.favorability ?? 0
    const clamped = Math.max(-99, Math.min(99, newFavor))
    target.favor = clamped
    target.favorability = clamped

    // 检测跨越的好感度节点
    const crossed: number[] = []
    for (const m of FAVOR_MILESTONES) {
      if ((oldFavor < m && clamped >= m) || (oldFavor > m && clamped <= m)) {
        crossed.push(m)
      }
    }

    // 好感度跨越节点 → 记录事迹
    if (crossed.length > 0) {
      for (const m of crossed) {
        const dir = clamped > oldFavor ? '突破' : '跌破'
        recordChronicle(id, `好感度${dir}节点 ${m}（${oldFavor} → ${clamped}）`, turnIndex)
      }
    } else if (Math.abs(clamped - oldFavor) >= FAVOR_CHRONICLE_THRESHOLD) {
      // 变化 ≥15 也记录
      recordChronicle(id, `好感度显著变化（${oldFavor} → ${clamped}）`, turnIndex)
    }

    bus.emit('npc:favorChanged', { id, oldFavor, newFavor: clamped, npc: target, crossed })
    return { oldFavor, newFavor: clamped, milestones: crossed }
  }

  // ============================================================
  // 改名（含事迹 + 分类联动）
  // ============================================================

  /**
   * 更新 NPC 名字（含身份揭示）。
   * 自动维护 aliases、nameHistory、identityHistory、人物事迹、人物分类。
   */
  function renameNpc(id: string, newName: string, turnIndex?: number): { oldName: string; newName: string; isIdentityReveal: boolean } | null {
    const target = npcs.value.find(n => n.id === id)
    if (!target) return null
    const oldName = target.name
    if (!newName || newName === oldName) return null

    // 检测是否是身份揭示（旧名是占位名）
    const PLACEHOLDER_PATTERNS = /^[\?？]{1,3}$|^陌生人$|^神秘人$|^不明$|^未知$|^无名$|^\?{3}$|^？{3}$|^stranger$/i
    const isReveal = PLACEHOLDER_PATTERNS.test(oldName) || (target.aliases?.some(a => PLACEHOLDER_PATTERNS.test(a)) ?? false)

    // 旧名加入 aliases
    if (!target.aliases) target.aliases = []
    if (!target.aliases.includes(oldName)) {
      target.aliases.push(oldName)
    }
    // 新名也加入 aliases
    if (!target.aliases.includes(newName)) {
      target.aliases.push(newName)
    }

    // 更新 name
    target.name = newName

    // 更新 keys
    if (!target.keys.includes(newName)) {
      target.keys.unshift(newName)
    }

    // 记录改名历史
    if (!target.identityHistory) target.identityHistory = []
    target.identityHistory.push({ from: oldName, to: newName, turnIndex: turnIndex ?? -1 })

    // 更新 nameHistory 映射
    nameHistory.value.set(oldName.toLowerCase(), id)
    nameHistory.value.set(newName.toLowerCase(), id)

    if (isReveal) {
      target.identityRevealed = true
      // 身份揭示 → 自动升级人物分类为重点
      if (getNpcCategory(target) === '在场') {
        target.人物分类 = '重点'
      }
      recordChronicle(id, `身份揭示：「${oldName}」→「${newName}」`, turnIndex)
      bus.emit('npc:identityRevealed', { id, oldName, newName, npc: target })
    } else {
      recordChronicle(id, `改名：「${oldName}」→「${newName}」`, turnIndex)
      bus.emit('npc:renamed', { id, oldName, newName, npc: target })
    }

    return { oldName, newName, isIdentityReveal }
  }

  /**
   * 为已有 NPC 设置 turnIndex（在 variableEngine 中调用时传入）
   */
  function setLastIdentityTurn(id: string, turnIndex: number) {
    const target = npcs.value.find(n => n.id === id)
    if (target?.identityHistory && target.identityHistory.length > 0) {
      target.identityHistory[target.identityHistory.length - 1].turnIndex = turnIndex
    }
  }

  // ============================================================
  // 快照 / 恢复（含旧数据自动迁移）
  // ============================================================

  function snapshot(): NpcEntry[] { return [...npcs.value] }

  function restore(data: NpcEntry[]) {
    npcs.value = data || []
    nameHistory.value.clear()

    for (const n of npcs.value) {
      // ---- 自动迁移旧数据 ----
      // enabled → 人物分类
      if (!n.人物分类 || !NPC_CATEGORY_VALUES.has(n.人物分类)) {
        n.人物分类 = n.enabled === false ? '离场' : '在场'
      }
      // identityHistory → 人物事迹（如果还没有事迹）
      if (!n.人物事迹 || n.人物事迹.length === 0) {
        if (n.identityHistory && n.identityHistory.length > 0) {
          n.人物事迹 = n.identityHistory.map(h =>
            `第${h.turnIndex >= 0 ? h.turnIndex : '?'}轮：${h.from !== h.to ? `改名「${h.from}」→「${h.to}」` : `记录`}`
          )
        }
      }

      // 重建 nameHistory
      nameHistory.value.set(n.name.toLowerCase(), n.id)
      if (n.aliases) {
        for (const a of n.aliases) {
          nameHistory.value.set(a.toLowerCase(), n.id)
        }
      }
      if (n.identityHistory) {
        for (const h of n.identityHistory) {
          nameHistory.value.set(h.from.toLowerCase(), n.id)
          nameHistory.value.set(h.to.toLowerCase(), n.id)
        }
      }
    }
  }

  function resetNpcs() {
    npcs.value = []
    nameHistory.value.clear()
  }

  return {
    // state
    npcs, enabledNpcs, nameHistory,
    // category
    getNpcCategory, getActiveNpcs, setCategory,
    // chronicles
    recordChronicle, getRecentChronicles,
    // favor (auto-chronicle)
    updateFavor,
    // crud
    addEntries, remove, toggle, importFromJson,
    // matching
    findNpc, renameNpc, setLastIdentityTurn,
    // persistence
    snapshot, restore, resetNpcs,
  }
})