// ============================================================
// wandou · 世界状态 Store
// 追踪世界时间、地点、事件、记忆、NPC 关系
// ============================================================
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  GameLocation, WorldEvent, MemoryEntry,
  NpcRelation, WorldTime,
} from '@/types/state'
import { bus } from '@/utils/events'

const DEFAULT_LOCATION: GameLocation = {
  region: '未知星域',
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
  return `${wt.era} ${padYear(wt.year)}年 ${pad2(wt.month)}月 ${pad2(wt.day)}日 ${pad2(wt.hour)}:${pad2(wt.minute)}`
}

export function parseWorldTimeString(s: string): WorldTime | null {
  const t = String(s || '').trim()
  const re = /^(.+?)\s+(\d+)年\s+(\d{1,2})月\s+(\d{1,2})日\s+(\d{1,2}):(\d{2})$/
  const m = re.exec(t)
  if (!m) return null
  const era = m[1].trim()
  const year = parseInt(m[2], 10)
  const month = parseInt(m[3], 10)
  const day = parseInt(m[4], 10)
  const hour = parseInt(m[5], 10)
  const minute = parseInt(m[6], 10)
  if (!isFinite(year) || !isFinite(month) || !isFinite(day) || !isFinite(hour) || !isFinite(minute)) return null
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  return { era, year, month, day, hour, minute }
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
  const worldTime = ref<string>('星历 2157年 01月 01日 08:00')
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
    if (!parsed) return { ok: false, reason: `时间格式无效，须为"星历 YYYY年 MM月 DD日 HH:MM"` }

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
  function advanceTurn() {
    turnIndex.value++
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
    if (data.worldTime) worldTime.value = data.worldTime
    if (data.currentLocation) currentLocation.value = { ...data.currentLocation }
    if (data.weather) weather.value = data.weather
    if (data.worldEvents) worldEvents.value = data.worldEvents
    if (data.memories) memories.value = data.memories
    if (data.npcRelations) npcRelations.value = data.npcRelations
    if (data.turnIndex !== undefined) turnIndex.value = data.turnIndex
  }

  function resetState() {
    worldTime.value = '星历 2157年 01月 01日 08:00'
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
    upsertNpcRelation, advanceTurn,
    snapshot, restore, resetState,
  }
})
