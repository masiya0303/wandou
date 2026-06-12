# wandou 物品状态同步系统

## 整体架构

```
                    AI 回复文本 (rawText)
                         │
                    ┌────┴────┐
                    │ beginTurn │  ← ① 清空本回合去重标记
                    └────┬────┘
                         │
              ┌──────────┴──────────┐
              │                     │
        ② processVariableUpdates  ③ applyStateTurn
           解析 <variables> 等       解析 <mj_inventory_ops> 等
              │                     │
              └──────────┬──────────┘
                         │
                    都调用 ↓
              ┌─────────────────────┐
              │ playerStore.applyOps │  ← ④ 唯一写入入口
              │  ├─ 过滤伪物品        │
              │  ├─ 检查去重标记      │
              │  ├─ 同名自动堆叠      │
              │  └─ 失败全部回滚      │
              └────────┬────────────┘
                       │
                  _thisTurnKeys 已记录
                       │
              ┌────────┴────────┐
              │  extractItems   │  ← ⑤ 异步 API 回退（2-10s 后）
              │  也走 applyOps  │
              │  被去重标记拦住  │
              └────────┬────────┘
                       │
                  ┌────┴────┐
                  │  toast  │  ← ⑥ 顶部浮窗 + 背包红点
                  └─────────┘
```

---

## 1. 核心原则

| 原则 | 说明 |
|------|------|
| **单入口** | 所有物品变更必须经由 `playerStore.applyOps()`，禁止直接操作 `inventory` 数组 |
| **双路径** | 标签解析（主） + API 提取（回退），两种来源汇聚到同一入口 |
| **回合去重** | 按 `name + type` 归一化后去重，同一回合同名同类型物品只生效一次 |
| **自动堆叠** | 同名同类物品自动合并 `quantity`，不产生重复条目 |
| **事务性** | 先备份，全部成功才提交；任一失败则回滚到操作前状态 |
| **Toast 通知** | 物品变更通过顶部浮窗提示，不插入聊天消息打断对话流 |

---

## 2. 关键环节详解

### 2.1 beginTurn — 回合开始

每轮 AI 回复处理前调用一次，由 `chatStore.sendMessage()` 统筹：

```typescript
player.beginTurn()
// → _thisTurnKeys = new Set()
// → newItemCount = 0
```

### 2.2 processVariableUpdates — 路径 A

解析 `<variables>` / `<mj_variables>` / `<patch>` 标签和代码围栏中的 JSON Patch：

```xml
<mj_variables>
[{"op":"add","path":"/player/inventory/-","value":{"name":"铁剑","type":"weapon","quantity":1}}]
</mj_variables>
```

内部通过 `handleInventoryPath()` 转换为 `InventoryOp` 格式，调用 `playerStore.applyOps()`。

**文件**: `src/utils/variableEngine.ts`

### 2.3 applyStateTurn — 路径 B

解析 `<mj_inventory_ops>` 标签：

```xml
<mj_inventory_ops>
[{"op":"add","name":"铁剑","quantity":1,"type":"weapon","description":"一把普通的铁剑"}]
</mj_inventory_ops>
```

内部通过 `applyInventoryOpsViaStore()` 转换为统一格式，调用 `playerStore.applyOps()`。

同时解析：`<mj_world_state>` `<mj_player_state>` `<mj_npc_update>` 等标签。

**文件**: `src/utils/stateEngine.ts`

### 2.4 applyOps — 唯一写入入口

```typescript
playerStore.applyOps(ops: InventoryOp[]): InventoryResult
```

处理流程：

```
add "铁剑" weapon ×1
  ├─ isFakeItem("铁剑") → false ✓
  ├─ _thisTurnKeys.has("铁剑|weapon") → false ✓ (本回合第一次见)
  ├─ 背包里有没有 name="铁剑" type="weapon"？→ 有 → quantity += 1
  ├─ 没有 → push 新条目
  └─ _thisTurnKeys.add("铁剑|weapon")

add "铁剑" weapon ×1 (又来一次)
  └─ _thisTurnKeys.has("铁剑|weapon") → true → 跳过 ✅

remove "旧钥匙"
  └─ 按 name 或 id 查找 → 找到 → quantity ≤ qty 时 splice，否则 quantity -= qty
```

**文件**: `src/stores/playerStore.ts`

返回结果：

```typescript
interface InventoryResult {
  ok: boolean          // 全部成功 = true
  placed: { name; quantity; type; description }[]
  removed: { name; quantity; type }[]
  failed: { name; reason }[]
  _rollback?: InventoryItem[]  // 失败时存放备份
}
```

### 2.5 extractItems — 异步回退（路径 C）

当 AI 没输出任何标签时，用轻量 API 调用从叙述文本中提取物品：

```typescript
extractItems(apiConfig, history, rawText)
  .then(items => player.applyOps(items))  // 走统一入口，自动去重
  .catch(() => {})  // 静默失败，不阻塞游戏
```

**API Prompt 要点**:
- 只提取实体物品（武器/防具/药水/材料/钥匙/道具）
- 不提取概念/信息/经验/好感
- 容器/泛指词（礼包/奖励/宝物）若无法确定具体物品名则跳过

**文件**: `src/utils/itemExtractor.ts`

可通过 `chatStore.itemExtractionFallback = false` 关闭。

### 2.6 Toast 通知 + 背包红点

`applyOps` 成功后自动触发：

```typescript
bus.emit('inventory:changed', { placed, removed })  // → GameHud 监听到 → 背包 tab 红点 ●
bus.emit('inventory:toast', { message })             // → GameHud 顶部浮窗 "📦 获得 铁剑 ×1"
```

- **Toast**: 3 秒自动消失，不打断对话
- **红点**: 点击背包 tab 后自动清除

**文件**: `src/components/game/GameHud.vue`

---

## 3. 去重机制

同一个 AI 回复里，"铁剑" 可能从多个路径到达：

```
processVariableUpdates  → add "铁剑"  ← 生效 ✅（第一个）
applyStateTurn          → add "铁剑"  ← _thisTurnKeys 已有 → 跳过
extractItems (async)    → add "铁剑"  ← _thisTurnKeys 已有 → 跳过
```

下一轮用户发送消息 → `chatStore.sendMessage()` → `beginTurn()` 清空标记 → 新回合可以正常获取新物品。

---

## 4. 伪物品过滤

多层检测，顺序执行：

| 层 | 位置 | 规则 |
|----|------|------|
| **正则模式** | `playerStore.ts` `FAKE_ITEM_PATTERNS` | 15 个正则，过滤"礼包""战利品""一大堆…"等 |
| **关键字黑名单** | `playerStore.ts` `FAKE_KEYWORDS` | 24 个词：经验、声望、情报、勇气、好感… |
| **名称长度** | `playerStore.ts` `isFakeItem()` | >30 字符 → 疑似描述，不是物品名 |
| **API Prompt** | `itemExtractor.ts` | 引导 AI 只输出实物，跳过概念词 |
| **描述信号** | `itemExtractor.ts` `isProbablyFake()` | 描述含"学会""领悟""感觉"等 → 过滤 |
| **other + 无描述** | `itemExtractor.ts` `isProbablyFake()` | type=other 且无描述 → 可疑，过滤 |

---

## 5. 事务回滚

```typescript
function applyOps(ops: InventoryOp[]): InventoryResult {
  const backup = inventory.value.slice()  // 浅拷贝备份

  for (const op of ops) {
    // 逐条处理...
    if (某条失败) {
      inventory.value = backup  // 全部回滚
      return { ok: false, ... }
    }
  }
  // 全部成功，提交
  return { ok: true, ... }
}
```

---

## 6. 文件清单

| 文件 | 职责 |
|------|------|
| `src/stores/playerStore.ts` | 玩家/背包/任务 Store，`applyOps()` 唯一写入入口 |
| `src/utils/stateEngine.ts` | 标签解析引擎（`<mj_*>` 标签），物品操作路由到 `applyOps` |
| `src/utils/variableEngine.ts` | 变量引擎（`<variables>` / JSON Patch），物品操作路由到 `applyOps` |
| `src/utils/itemExtractor.ts` | API 物品提取回退方案，共享 `isFakeItem()` |
| `src/stores/chatStore.ts` | 聊天编排，统筹 `beginTurn` → 标签解析 → API 回退 |
| `src/utils/events.ts` | 事件总线，`inventory:changed` + `inventory:toast` |
| `src/components/game/GameHud.vue` | UI：背包面板 + Toast 通知 + 红点 |

---

## 7. 开发者使用

```typescript
import { usePlayerStore } from '@/stores/playerStore'

const player = usePlayerStore()

// 加物品
const result = player.applyOps([
  { op: 'add', name: '铁剑', quantity: 1, type: 'weapon', description: '一把普通的铁剑' },
])

// 减物品
player.applyOps([
  { op: 'remove', name: '旧钥匙', quantity: 1 },
])

// 批量操作（原子性 — 全部成功或全部回滚）
player.applyOps([
  { op: 'add', name: '药水', quantity: 3, type: 'consumable' },
  { op: 'add', name: '护甲', quantity: 1, type: 'armor' },
  { op: 'remove', name: '金币', quantity: 50 },
])

console.log(result)
// { ok: true, placed: [...], removed: [...], failed: [] }
```

关闭 API 回退：

```typescript
const chat = useChatStore()
chat.itemExtractionFallback = false  // 只靠标签解析，省一次 API 调用
```
