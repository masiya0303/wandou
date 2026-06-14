// ============================================================
// wandou · 世界状态 Store
// 追踪世界时间、地点、事件、记忆、NPC 关系
// 统一状态树（UnifiedVariableState）是 AI 变量操作的 transient view
// ============================================================
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  GameLocation, WorldEvent, MemoryEntry,
  NpcRelation, WorldTime, UnifiedVariableState,
} from '@/types/state'
import { bus } from '@/utils/events'
import { usePlayerStore } from '@/stores/playerStore'
import { useNpcStore } from '@/stores/npcStore'

const DEFAULT_LOCATION: GameLocation = {
  region: '未知地区',
  subRegion: '',
  detail: '',
}

function pad2(n: number): string {
  const s = String(Math.max(0, Math.floor(n)))
  return s.length < 2 ? '0' + s : s
}

function padYear(y: number): string {
  let s = String(Math.max(0, Math.floor(y)))
  while (s.length < 4) s = '0' + s
  return s
}

export function formatWorldTimeString(wt: WorldTime): string {
  return `${padYear(wt.year)}年 ${pad2(wt.month)}月 ${pad2(wt.day)}日 ${pad2(wt.hour)}:${pad2(wt.minute)}`
}

export function parseWorldTimeString(s: string): WorldTime | null {
  const t = String(s || '').trim()
  if (!t) return null

  // 格式: "YYYY年 MM月 DD日 HH:MM"（月日时分必须两位补零，如 01、08、05）
  const re = /^(\d{4})年\s+(\d{2})月\s+(\d{2})日\s+(\d{2}):(\d{2})$/
  const m = re.exec(t)
  if (!m) return null

  const year = parseInt(m[1], 10)
  const month = parseInt(m[2], 10)
  const day = parseInt(m[3], 10)
  const hour = parseInt(m[4], 10)
  const minute = parseInt(m[5], 10)
  if (!isFinite(year) || !isFinite(month) || !isFinite(day) || !isFinite(hour) || !isFinite(minute)) return null
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  return { year, month, day, hour, minute }
}

/** 比较两个 WorldTime：-1 a<b, 0 相等, 1 a>b */
export function compareWorldTime(a: WorldTime | null, b: WorldTime | null): number {
  if (!a || !b) return 0
  if (a.year !== b.year) return a.year < b.year ? -1 : 1
  if (a.month !== b.month) return a.month < b.month ? -1 : 1
  if (a.day !== b.day) return a.day < b.day ? -1 : 1
  if (a.hour !== b.hour) return a.hour < b.hour ? -1 : 1
  if (a.minute !== b.minute) return a.minute < b.minute ? -1 : 1
  return 0
}

export const useStateStore = defineStore('state', () => {
  // ---- 核心状态 ----
  const worldTime = ref<string>('2157年 01月 01日 08:00')
  const currentLocation = ref<GameLocation>({ ...DEFAULT_LOCATION })
  const weather = ref<string>('晴朗')
  const worldEvents = ref<WorldEvent[]>([])
  const memories = ref<MemoryEntry[]>([])
  const npcRelations = ref<NpcRelation[]>([])
  const turnIndex = ref<number>(0)

  // ---- 计算属性 ----
  const worldTimeParsed = computed(() => parseWorldTimeString(worldTime.value))
  const activeEvents = computed(() => worldEvents.value.filter(e => e.status === 'active'))
  const longTermMemories = computed(() =>
    memories.value.filter(m => m.timeScope === 'long' && m.state === 'active')
  )

  // ---- 世界时间 ----
  function setWorldTime(newTime: string): { ok: boolean; reason?: string } {
    const trimmed = String(newTime).trim()
    if (!trimmed) return { ok: false, reason: '时间字符串为空' }

    const parsed = parseWorldTimeString(trimmed)
    if (!parsed) return { ok: false, reason: `时间格式无效，须为"YYYY年 MM月 DD日 HH:MM"（月日时分必须两位补零，如 2157年 01月 03日 08:15）` }

    const old = worldTimeParsed.value
    if (old && compareWorldTime(parsed, old) < 0) {
      return { ok: false, reason: `不得早于当前世界时间（禁止时间倒流）` }
    }

    worldTime.value = formatWorldTimeString(parsed)
    bus.emit('state:world_changed', { field: 'worldTime', value: worldTime.value })
    return { ok: true }
  }

  // ---- 地点 ----
  function setLocation(loc: Partial<GameLocation>): boolean {
    let changed = false
    if (loc.region !== undefined && loc.region !== currentLocation.value.region) {
      currentLocation.value.region = loc.region
      changed = true
    }
    if (loc.subRegion !== undefined && loc.subRegion !== currentLocation.value.subRegion) {
      currentLocation.value.subRegion = loc.subRegion
      changed = true
    }
    if (loc.detail !== undefined && loc.detail !== currentLocation.value.detail) {
      currentLocation.value.detail = loc.detail
      changed = true
    }
    if (changed) {
      bus.emit('state:world_changed', { field: 'location', value: currentLocation.value })
    }
    return changed
  }

  function setWeather(w: string) {
    weather.value = w
  }

  function locationString(): string {
    const parts = [currentLocation.value.region]
    if (currentLocation.value.subRegion) parts.push(currentLocation.value.subRegion)
    if (currentLocation.value.detail) parts.push(currentLocation.value.detail)
    return parts.join(' · ')
  }

  // ---- 世界事件 ----
  function addWorldEvent(event: WorldEvent) {
    worldEvents.value.push(event)
  }
  function updateWorldEvent(id: string, patch: Partial<WorldEvent>) {
    const e = worldEvents.value.find(x => x.id === id)
    if (e) Object.assign(e, patch)
  }
  function removeWorldEvent(id: string) {
    worldEvents.value = worldEvents.value.filter(x => x.id !== id)
  }

  // ---- 记忆 ----
  function addMemory(entry: MemoryEntry) {
    // 去重：相同 fact 只保留一条
    const exists = memories.value.find(m => m.fact === entry.fact)
    if (exists) {
      // 更新已有记忆
      Object.assign(exists, entry, { id: exists.id })
      return
    }
    memories.value.push(entry)
  }
  function addMemories(entries: MemoryEntry[]) {
    for (const e of entries) addMemory(e)
  }
  function pruneMemories(maxCount: number = 200) {
    if (memories.value.length <= maxCount) return
    // 按重要性 + 时间排序，保留最重要的
    const sorted = [...memories.value].sort((a, b) => {
      if (b.importance !== a.importance) return b.importance - a.importance
      return b.createdAt - a.createdAt
    })
    memories.value = sorted.slice(0, maxCount)
  }

  // ---- NPC 关系 ----
  function upsertNpcRelation(rel: NpcRelation) {
    const existing = npcRelations.value.find(r => r.npcId === rel.npcId || r.npcName === rel.npcName)
    if (existing) {
      Object.assign(existing, rel)
    } else {
      npcRelations.value.push(rel)
    }
  }

  // ---- 回合 ----
  // ============================================================
  // 统一状态树（yijiekkk-style）— AI 变量操作的 transient view
  // ============================================================

  /** 从三个独立 Store 组装统一状态树 */
  function getUnifiedState(): UnifiedVariableState {
    const ps = usePlayerStore()
    const ns = useNpcStore()

    // NPCs → ID-keyed Map
    const npcsMap: Record<string, Record<string, any>> = {}
    for (const n of ns.npcs) {
      npcsMap[n.id] = {
        姓名: n.name,
        name: n.name,
        性别: n.gender ?? '',
        年龄: n.age ?? 0,
        职业: n.role,
        role: n.role,
        人物分类: ns.getNpcCategory(n),
        性格: n.personality,
        personality: n.personality,
        外貌: n.appearance,
        appearance: n.appearance,
        背景: n.background,
        background: n.background,
        与玩家关系: n.relationToPlayer,
        relationToPlayer: n.relationToPlayer,
        好感度: n.favor ?? n.favorability ?? 0,
        favor: n.favor ?? n.favorability ?? 0,
        当前HP: n.currentHp ?? 100,
        currentHp: n.currentHp ?? 100,
        最大HP: n.maxHp ?? 100,
        maxHp: n.maxHp ?? 100,
        人物事迹: n.人物事迹 ?? [],
        enabled: ns.getNpcCategory(n) !== '离场',
        // 保留原始引用用于 commit 回写
        _npcRef: n,
      }
    }

    return {
      player: {
        姓名: ps.character.name,
        name: ps.character.name,
        性别: ps.character.gender,
        年龄: ps.character.age,
        金币: ps.character.gold ?? 0,
        gold: ps.character.gold ?? 0,
        属性: ps.character.attributes ?? {},
        attributes: ps.character.attributes ?? {},
        背景: ps.character.background,
        background: ps.character.background,
        inventory: ps.inventory.map(i => ({
          id: i.id,
          name: i.name,
          quantity: i.quantity,
          type: i.type,
          description: i.description,
        })),
        quests: ps.quests.map(q => ({
          id: q.id,
          title: q.title,
          questType: q.questType,
          description: q.description,
          reward: q.reward,
          color: q.color,
          status: q.status,
          source: q.source,
        })),
      },
      npcs: npcsMap,
      time: worldTime.value,
      location: { ...currentLocation.value },
      state: {
        天气: weather.value,
        世界大事: worldEvents.value.map(e => ({ ...e })),
      },
    }
  }

  /** 将统一状态树的变更写回三个独立 Store */
  function commitUnifiedState(state: UnifiedVariableState): string[] {
    const ps = usePlayerStore()
    const ns = useNpcStore()
    const changes: string[] = []

    // 写回 player
    if (state.player && typeof state.player === 'object') {
      const p = state.player
      const charUpdate: any = {}
      if (typeof p.name === 'string' || typeof p.姓名 === 'string') {
        charUpdate.name = (p.姓名 || p.name || ps.character.name).toString()
      }
      const goldVal = p.金币 ?? p.gold
      if (goldVal !== undefined && typeof goldVal === 'number') {
        charUpdate.gold = Math.max(0, Math.floor(goldVal))
        changes.push(`🪙 金币 → ${charUpdate.gold}`)
      }
      if (p.attributes && typeof p.attributes === 'object') {
        charUpdate.attributes = { ...p.attributes }
      } else if (p.属性 && typeof p.属性 === 'object') {
        charUpdate.attributes = { ...p.属性 }
      }
      if (objectKeys(charUpdate).length > 0) {
        ps.updateCharacter(charUpdate)
      }
    }

    // 写回 NPCs
    if (state.npcs && typeof state.npcs === 'object') {
      for (const [npcId, npcData] of Object.entries(state.npcs)) {
        if (!npcData || typeof npcData !== 'object') continue
        const ref = npcData._npcRef as any
        const target = ref || ns.npcs.find(n => n.id === npcId)
        if (!target) continue

        // 同步字段回 target
        const syncKeys = ['role', 'personality', 'appearance', 'background', 'relationToPlayer',
          '职业', '性格', '外貌', '背景', '与玩家关系']
        for (const key of syncKeys) {
          if (typeof npcData[key] === 'string' && npcData[key]) {
            ;(target as any)[key] = npcData[key]
          }
        }

        // 好感度
        const favorVal = npcData.好感度 ?? npcData.favor
        if (favorVal !== undefined && typeof favorVal === 'number') {
          ns.updateFavor(target.id, Math.max(-99, Math.min(99, Math.floor(favorVal))))
        }

        // 人物分类
        if (npcData.人物分类 && typeof npcData.人物分类 === 'string') {
          ns.setCategory(target.id, npcData.人物分类 as any)
        }

        // 姓名
        const newName = npcData.姓名 ?? npcData.name
        if (typeof newName === 'string' && newName && newName !== target.name) {
          ns.renameNpc(target.id, newName)
        }

        // HP
        const hpVal = npcData.当前HP ?? npcData.currentHp
        if (hpVal !== undefined && typeof hpVal === 'number') {
          target.currentHp = Math.max(0, Math.floor(hpVal))
        }
      }
    }

    // 写回时间
    if (state.time && typeof state.time === 'string' && state.time !== worldTime.value) {
      setWorldTime(state.time)
    }

    // 写回位置
    if (state.location && typeof state.location === 'object') {
      setLocation(state.location as any)
    }

    // 写回天气
    const weatherVal = state.state?.天气
    if (weatherVal && typeof weatherVal === 'string' && weatherVal !== weather.value) {
      weather.value = weatherVal
    }

    return changes
  }

  function objectKeys(obj: any): string[] {
    if (!obj || typeof obj !== 'object') return []
    return Object.keys(obj)
  }

  // ---- 快照 / 恢复 ----
  function snapshot() {
    return {
      worldTime: worldTime.value,
      currentLocation: { ...currentLocation.value },
      weather: weather.value,
      worldEvents: [...worldEvents.value],
      memories: [...memories.value],
      npcRelations: [...npcRelations.value],
      turnIndex: turnIndex.value,
    }
  }

  function restore(data: {
    worldTime?: string
    currentLocation?: GameLocation
    weather?: string
    worldEvents?: WorldEvent[]
    memories?: MemoryEntry[]
    npcRelations?: NpcRelation[]
    turnIndex?: number
  }) {
    if (data.worldTime) {
      // 格式校验（不检查时间倒流，因为恢复存档本身就是"回到过去"）
      const t = String(data.worldTime).trim()
      if (parseWorldTimeString(t)) {
        worldTime.value = t
        bus.emit('state:world_changed', { field: 'worldTime', value: t })
      } else {
        console.warn('[wandou] 存档世界时间格式无效，已保留当前值:', data.worldTime)
      }
    }
    if (data.currentLocation) {
      currentLocation.value = { ...data.currentLocation }
      bus.emit('state:world_changed', { field: 'location', value: currentLocation.value })
    }
    if (data.weather) {
      weather.value = data.weather
      bus.emit('state:world_changed', { field: 'weather', value: data.weather })
    }
    if (data.worldEvents) worldEvents.value = data.worldEvents
    if (data.memories) memories.value = data.memories
    if (data.npcRelations) npcRelations.value = data.npcRelations
    if (data.turnIndex !== undefined) turnIndex.value = data.turnIndex
  }

  function resetState() {
    worldTime.value = '2157年 01月 01日 08:00'
    currentLocation.value = { ...DEFAULT_LOCATION }
    weather.value = '晴朗'
    worldEvents.value = []
    memories.value = []
    npcRelations.value = []
    turnIndex.value = 0
  }

  return {
    // state
    worldTime, currentLocation, weather, worldEvents, memories, npcRelations, turnIndex,
    // computed
    worldTimeParsed, activeEvents, longTermMemories,
    // methods
    setWorldTime, setLocation, setWeather, locationString,
    addWorldEvent, updateWorldEvent, removeWorldEvent,
    addMemory, addMemories, pruneMemories,
    upsertNpcRelation,
    // unified state tree
    getUnifiedState, commitUnifiedState,
    // persistence
    snapshot, restore, resetState,
  }
})
