// ============================================================
// wandou · 玩家角色 / 背包 / 任务 Store
//
// 物品同步核心原则：
//   1. 所有物品变更必须通过 applyOps() — 唯一入口
//   2. 同名同类型物品自动堆叠
//   3. 本回合已处理的物品自动去重（防止标签解析 + API 提取重复）
//   4. 事务性：先浅拷贝备份，全部成功才提交；任一失败则回滚
// ============================================================
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { CharacterInfo } from '@/types/game'
import type { InventoryItem, Quest } from '@/types/world'
import { bus } from '@/utils/events'

export interface InventoryOp {
  op: 'add' | 'remove'
  name: string
  quantity?: number
  type?: string
  description?: string
  /** 可选：保留已有物品 ID（用于 restore/snapshot 场景） */
  id?: string
}

export interface InventoryResult {
  ok: boolean
  placed: { name: string; quantity: number; type: string; description?: string }[]
  removed: { name: string; quantity: number; type?: string }[]
  failed: { name: string; reason: string }[]
  /** 需要回滚时，这里存放备份 */
  _rollback?: InventoryItem[]
}

const VALID_TYPES = ['weapon', 'armor', 'consumable', 'material', 'key', 'other'] as const
type ItemType = typeof VALID_TYPES[number]

function normalizeType(raw: string): ItemType {
  const t = String(raw || '').toLowerCase()
  // weapon: 武器 / 装备（剑/刀/弓/枪/杖等）/ 兵器
  if (t.includes('武器') || t.includes('weapon') || t.includes('兵器') ||
      t.includes('剑') || t.includes('刀') || t.includes('弓') || t.includes('枪') ||
      t.includes('杖') || t.includes('锤') || t.includes('斧') || t.includes('匕首') ||
      t.includes('sword') || t.includes('blade') || t.includes('bow') || t.includes('spear') ||
      t.includes('staff') || t.includes('dagger') || t.includes('axe') || t.includes('hammer')) return 'weapon'
  // armor: 防具 / 铠甲 / 头盔 / 盾 / 护甲 / 衣服 / 饰品
  if (t.includes('防具') || t.includes('铠甲') || t.includes('armor') || t.includes('盔甲') ||
      t.includes('头盔') || t.includes('盾') || t.includes('护甲') || t.includes('护具') ||
      t.includes('衣服') || t.includes('饰品') || t.includes('披风') || t.includes('戒指') ||
      t.includes('项链') || t.includes('手镯') || t.includes('腰带') || t.includes('靴') ||
      t.includes('helmet') || t.includes('shield') || t.includes('ring') || t.includes('cloak') ||
      t.includes('boot') || t.includes('belt') || t.includes('amulet')) return 'armor'
  // consumable: 消耗品 / 药水 / 食物 / 卷轴
  if (t.includes('消耗') || t.includes('药') || t.includes('consumable') || t.includes('potion') ||
      t.includes('食物') || t.includes('food') || t.includes('卷轴') || t.includes('scroll') ||
      t.includes('饮料') || t.includes('drink') || t.includes('酒') || t.includes('果实')) return 'consumable'
  // material: 材料 / 矿石 / 零件 / 资源
  if (t.includes('材料') || t.includes('material') || t.includes('零件') || t.includes('矿石') ||
      t.includes('component') || t.includes('资源') || t.includes('布料') || t.includes('木材') ||
      t.includes('药草') || t.includes('herb') || t.includes('ore') || t.includes('cloth') ||
      t.includes('wood') || t.includes('皮革') || t.includes('leather') || t.includes('宝石') ||
      t.includes('gem') || t.includes('水晶') || t.includes('crystal')) return 'material'
  // key: 关键物品 / 钥匙 / 通行证 / 令牌
  if (t.includes('关键') || t.includes('key') || t.includes('钥匙') || t.includes('通行证') ||
      t.includes('令牌') || t.includes('信物') || t.includes('地图') || t.includes('map') ||
      t.includes('碎片')) return 'key'
  // 装备 → 默认归 weapon（AI 常把武器/防具统称为"装备"）
  if (t.includes('装备') || t.includes('equipment')) return 'weapon'
  return 'other'
}

function genId(): string {
  return `it-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

// ============================================================
// 伪物品检测 — 概念词、容器、抽象描述不应成为物品
// ============================================================

const FAKE_ITEM_PATTERNS: RegExp[] = [
  // 容器/泛指
  /^新生礼包$/,
  /^礼包$/,
  /^见面礼$/,
  /^奖励$/,
  /^东西$/,
  /^包裹$/,
  /^战利品$/,
  /^宝物$/,
  /^宝藏$/,
  /^好东西$/,
  /^神秘礼物$/,
  /^一份?礼物$/,
  /^一个?包裹$/,
  /^一些/,
  /^(一大堆|好多|很多|一些|各种|众多|大量).+/,
  /^贵重物品$/,
  /^值钱的东西$/,
  /^报酬$/,
  /^赏金$/,
  /^酬劳$/,
  /^谢礼$/,
  // 抽象/概念
  /^.{0,3}(的|之)(信任|认可|尊重|好感|友谊|爱情|忠诚|承诺|祝福|诅咒|原谅|宽恕|歉意|感谢)$/,
  /^(信任|认可|尊重|好感|承诺|祝福|诅咒|原谅|宽恕)$/,
  /^关于.{1,20}的(线索|情报|信息|消息|传闻|谣言)$/,
  // 经验/技能类
  /^(战斗|生存| crafting|锻造|炼金|魔法|射击|格斗|潜行)经验$/,
  /^.{1,10}(技能|能力|天赋)(提升|升级|觉醒|领悟)?$/,
  // too vague
  /^.{0,2}(装备|道具|物品|物资|资源|补给)$/,
  // 货币/金钱 — 这些走 /player/gold，禁止作为物品
  /^(金币|银币|铜币|金钱?|块钱?|元|G|gold|coin|money|cash)$/i,
  /^\d+\s*(枚|个)?\s*(金币|银币|铜币|G|gold|coins?)$/i,
  /^(金币|银币|铜币)\s*[x×]\s*\d+$/i,
]

const FAKE_KEYWORDS = new Set([
  '经验', '经验值', '声望', '荣誉', '积分', '点数', '好感度',
  '信息', '情报', '消息', '线索',
  '机会', '希望', '勇气', '信心', '决心', '信任', '友谊', '爱情',
  '祝福', '诅咒', '命运', '运气',
  '知识', '智慧', '记忆', '回忆',
  '力量', '敏捷', '智力', '体力', '精神', '耐力',
  '学会', '领悟', '掌握', '理解',
  '一个承诺', '承诺', '约定',
  // 货币 — 走 /player/gold
  '金币', '银币', '铜币', '金钱', '钱', '块钱', '元',
  'gold', 'coin', 'coins', 'money', 'cash', 'G',
  '教训', '启示', '感悟',
])

export function isFakeItem(name: string): boolean {
  const trimmed = name.trim()
  if (!trimmed) return true
  if (trimmed.length > 30) return true // 太长的是描述不是物品名
  if (FAKE_KEYWORDS.has(trimmed)) return true
  // 也检查名字中包含伪关键词（如"战斗经验"包含"经验"）
  for (const kw of FAKE_KEYWORDS) {
    if (trimmed.includes(kw)) return true
  }
  for (const re of FAKE_ITEM_PATTERNS) {
    if (re.test(trimmed)) return true
  }
  // 只含标点/空白/emoji → 伪物品
  if (/^[\s\p{Emoji}\p{Punctuation}，。！？；：""''（）【】《》…—]+$/u.test(trimmed)) return true
  return false
}

// ============================================================
// Store
// ============================================================

const DEFAULT_CHAR: CharacterInfo = {
  name: '', age: 25, gender: '', background: '',
  gold: 100, attributes: { HP: 100, MP: 50, ATK: 10, DEF: 5 },
}

export const usePlayerStore = defineStore('player', () => {
  const character = ref<CharacterInfo>({ ...DEFAULT_CHAR })
  const inventory = ref<InventoryItem[]>([])
  const quests = ref<Quest[]>([])

  /** 本回合已处理的物品去重键（name|type 归一化后） */
  const _thisTurnKeys = new Set<string>()
  /** 本回合新获得的物品数量（用于 UI 红点） */
  const newItemCount = ref(0)

  const isCharacterReady = computed(() => !!character.value.name.trim())

  // ---- 角色 ----
  function updateCharacter(c: Partial<CharacterInfo>) {
    Object.assign(character.value, c)
  }

  // ---- 内部方法（不暴露） ----

  function _findIndex(idOrName: string): number {
    return inventory.value.findIndex(
      i => i.id === idOrName || i.name === idOrName,
    )
  }

  function _findByNameType(name: string, type?: string): InventoryItem | undefined {
    const nt = type ? normalizeType(type) : undefined
    // 精确匹配：名称 + 类型
    const exact = inventory.value.find(i => {
      const nameMatch = i.name === name
      if (!nameMatch) return false
      if (nt !== undefined) return i.type === nt
      return true
    })
    if (exact) return exact
    // 回退：仅按名称匹配（防止 AI 两次输出 type 不一致导致重复创建）
    if (nt !== undefined) {
      const byName = inventory.value.find(i => i.name === name)
      if (byName) {
        console.debug(`[wandou] 物品"${name}"类型不匹配（已有:${byName.type}, 新:${nt}），按名称回退匹配，跳过重复创建`)
        return byName
      }
    }
    return undefined
  }

  function _dedupKey(name: string, type?: string): string {
    return `${name.trim()}|${normalizeType(type || 'other')}`
  }

  // ---- 统一物品操作入口 ----

  /**
   * 对背包执行批量物品操作。
   * 这是所有物品变更的唯一入口 — 标签解析、API 提取、变量引擎都必须通过此方法。
   *
   * 保证：
   *  - 同名同类型自动堆叠
   *  - 本回合去重（同一 name+type 的 add 只生效一次）
   *  - 事务性：任一操作失败则全部回滚
   */
  function applyOps(ops: InventoryOp[]): InventoryResult {
    const result: InventoryResult = {
      ok: true,
      placed: [],
      removed: [],
      failed: [],
    }

    if (!Array.isArray(ops) || ops.length === 0) return result

    // 浅拷贝备份（事务性）
    const backup = inventory.value.slice()
    // 本轮将要变更的临时跟踪（用于事务内去重，避免同一批 ops 里有重复）
    const batchAdded = new Map<string, { idx: number; qty: number }>()

    for (const raw of ops) {
      if (!raw || typeof raw !== 'object') continue

      const opName = String(raw.op || '').toLowerCase()
      const itemName = String(raw.name || '').trim()

      if (!itemName) {
        result.failed.push({ name: '', reason: '缺少 name' })
        continue
      }

      if (opName === 'add') {
        // 伪物品过滤
        if (isFakeItem(itemName)) {
          result.failed.push({ name: itemName, reason: '疑似伪物品（概念词/容器），已跳过' })
          continue
        }

        const qty = Math.max(1, Math.floor(Number(raw.quantity ?? raw.count ?? 1)) || 1)
        const type = normalizeType(raw.type ?? 'other')
        const dKey = _dedupKey(itemName, type)

        // 去重：本回合已处理过同名同类型物品
        if (_thisTurnKeys.has(dKey)) {
          continue // 静默跳过，不报错
        }

        // 事务内去重：同一批 ops 内重复
        const batched = batchAdded.get(dKey)
        if (batched) {
          // 更新已添加的条目数量
          inventory.value[batched.idx].quantity += qty
          batched.qty += qty
          const placedItem = result.placed.find(p => p.name === itemName && p.type === type)
          if (placedItem) placedItem.quantity = batched.qty
          continue
        }

        // 检查背包里是否已有同名同类型物品
        const existing = _findByNameType(itemName, type)
        if (existing) {
          existing.quantity += qty
          _thisTurnKeys.add(dKey)
          result.placed.push({
            name: itemName,
            quantity: qty,
            type,
            description: String(raw.description || raw.intro || raw.desc || ''),
          })
          continue
        }

        // 新建物品
        const item: InventoryItem = {
          id: raw.id || genId(),
          name: itemName,
          description: String(raw.description || raw.intro || raw.desc || ''),
          quantity: qty,
          type,
        }
        const idx = inventory.value.push(item) - 1
        batchAdded.set(dKey, { idx, qty })
        _thisTurnKeys.add(dKey)
        result.placed.push({
          name: itemName,
          quantity: qty,
          type,
          description: item.description,
        })
      } else if (opName === 'remove') {
        const qty = Math.max(1, Math.floor(Number(raw.quantity ?? raw.count ?? 1)) || 1)

        // 按名称或 ID 匹配
        const idx = _findIndex(itemName)
        if (idx === -1) {
          result.failed.push({ name: itemName, reason: `未找到物品"${itemName}"` })
          continue
        }

        const target = inventory.value[idx]
        if (target.quantity <= qty) {
          // 完全移除
          inventory.value.splice(idx, 1)
          // 调整 batchAdded 中受影响的索引
          for (const [key, val] of batchAdded) {
            if (val.idx > idx) val.idx--
          }
        } else {
          target.quantity -= qty
        }
        result.removed.push({ name: itemName, quantity: qty, type: target.type })
      } else {
        result.failed.push({ name: itemName, reason: `不支持的操作: ${raw.op}` })
      }
    }

    // 事务性判断：有失败项则回滚
    if (result.failed.length > 0) {
      result.ok = false
      result._rollback = backup
      inventory.value = backup
      // 清空去重标记（因为回滚了，这些物品事实上没被处理）
      for (const p of result.placed) {
        _thisTurnKeys.delete(_dedupKey(p.name, p.type))
      }
      return result
    }

    // 成功：触发通知
    if (result.placed.length > 0 || result.removed.length > 0) {
      newItemCount.value += result.placed.length
      bus.emit('inventory:changed', {
        placed: result.placed,
        removed: result.removed,
      })
    }

    return result
  }

  // ---- 公开 API（向后兼容，但推荐使用 applyOps） ----

  /** 添加单个物品（自动堆叠）。推荐使用 applyOps 代替 */
  function addItem(item: InventoryItem) {
    applyOps([{
      op: 'add',
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      type: item.type,
      description: item.description,
    }])
  }

  /** 按 ID 移除物品 */
  function removeItem(id: string) {
    const item = inventory.value.find(i => i.id === id)
    if (item) {
      applyOps([{ op: 'remove', name: item.name, quantity: item.quantity }])
    }
  }

  /** 更新物品数量（不会自动移除 quantity=0 的物品，由调用者决定） */
  function updateItemQuantity(id: string, qty: number) {
    const item = inventory.value.find(i => i.id === id)
    if (item) item.quantity = Math.max(0, qty)
  }

  /** 按名称+类型移除 */
  function removeItemByName(name: string, type?: string) {
    const item = type
      ? _findByNameType(name, type)
      : inventory.value.find(i => i.name === name)
    if (item) {
      removeItem(item.id)
    }
  }

  // ---- 任务 ----
  function addQuest(q: Quest) {
    quests.value.push(q)
    bus.emit('quest:added', q)
  }
  function removeQuest(id: string) {
    const q = quests.value.find(x => x.id === id)
    if (q) {
      quests.value = quests.value.filter(x => x.id !== id)
      bus.emit('quest:removed', q)
    }
  }
  function updateQuestStatus(id: string, status: Quest['status']) {
    const q = quests.value.find(x => x.id === id)
    if (q) {
      q.status = status
      bus.emit('quest:updated', q)
    }
  }

  // ---- 回合管理 ----
  /** 重置本回合的去重状态（每轮 AI 回复处理前调用） */
  function beginTurn() {
    _thisTurnKeys.clear()
    newItemCount.value = 0
  }

  /** 清除新物品红点 */
  function clearNewItemBadge() {
    newItemCount.value = 0
  }

  // ---- 快照 / 恢复（供 gameStore 持久化用） ----
  function snapshot() {
    return {
      character: { ...character.value },
      inventory: [...inventory.value],
      quests: [...quests.value],
    }
  }

  function restore(data: { character: CharacterInfo; inventory: InventoryItem[]; quests: Quest[] }) {
    character.value = data.character || { ...DEFAULT_CHAR }
    inventory.value = data.inventory || []
    quests.value = data.quests || []
    _thisTurnKeys.clear()
    newItemCount.value = 0
  }

  function resetPlayer() {
    character.value = { ...DEFAULT_CHAR }
    inventory.value = []
    quests.value = []
    _thisTurnKeys.clear()
    newItemCount.value = 0
  }

  return {
    // state
    character, inventory, quests, isCharacterReady, newItemCount,
    // character
    updateCharacter,
    // unified ops — 这是主入口
    applyOps,
    // legacy API
    addItem, removeItem, updateItemQuantity, removeItemByName,
    // quests
    addQuest, removeQuest, updateQuestStatus,
    // turn
    beginTurn, clearNewItemBadge,
    // persistence
    snapshot, restore, resetPlayer,
  }
})
