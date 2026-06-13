# 豌豆变量总表

> 所有可用变量的唯一参考。变量定义源码在 `src/utils/variableRegistry.ts`，解析路由在 `src/utils/variableEngine.ts`。

---

## 架构

```
AI 回复 ──→ processVariableUpdates()        ← variableEngine.ts
                │
                ├─ extractAllJsonPayloads()   ← 5 级回退提取
                ├─ parseOperations()          ← JSON Patch → VarOperation[]
                ├─ resolveVarDef()            ← variableRegistry.ts（路径 → 定义 + 校验）
                └─ applyOperation()           ← 路由到 store
                      ├─ applyPlayerOp()      → playerStore
                      ├─ applyWorldOp()       → stateStore
                      └─ applyNpcOp()         → npcStore
```

**输出格式**：AI 在回复末尾输出 `<mj_variables>` 包裹的 JSON Patch 数组：

```json
<mj_variables>
[
  {"op":"replace","path":"/player/gold","value":"-50"},
  {"op":"add","path":"/player/inventory/-","value":{"name":"能量电池","quantity":2,"type":"material","description":"标准太空能源块"}}
]
</mj_variables>
```

**无变化时**：`<mj_variables>[]</mj_variables>`

---

## 操作类型

| op | 用途 |
|---|---|
| `replace` | 覆盖值（数值可用 `"+N"` / `"-N"` 增量） |
| `add` | 新增子元素（物品/任务） |
| `remove` | 删除子元素（物品） |

---

## 玩家变量 `/player/...`

### `/player/gold`

| 属性 | 值 |
|---|---|
| 类型 | `number` |
| 默认 | `100` |
| 范围 | `min: 0` |
| 增量 | ✅ `"+N"` / `"-N"` |
| 描述 | 当前持有金币数量 |
| Store | `playerStore.character.gold` |

**示例**：

```json
{"op":"replace","path":"/player/gold","value":"-50"}
{"op":"replace","path":"/player/gold","value":200}
```

**行为**：增量模式下 `"-50"` 在当前值上扣减；直接传数字则覆盖。结果 clamp 到 `>=0`。

---

### `/player/attributes/{name}`

| 属性 | 值 |
|---|---|
| 类型 | `number` |
| 默认 | `0` |
| 范围 | `min: 0` |
| 增量 | ✅ `"+N"` / `"-N"` |
| 描述 | 自定义属性（HP/MP/ATK/DEF 或任意自定名称） |
| Store | `playerStore.character.attributes[name]` |

**示例**：

```json
{"op":"replace","path":"/player/attributes/HP","value":"-20"}
{"op":"replace","path":"/player/attributes/灵力","value":"+50"}
```

**行为**：`{name}` 匹配任意属性名（不必预先注册），写入 `playerStore.character.attributes[attrName]`。

---

### `/player/inventory/-`（添加物品）

| 属性 | 值 |
|---|---|
| 类型 | `object` |
| 默认 | `null` |
| 增量 | ❌ |
| 描述 | 向背包添加新物品 |
| Store | `playerStore.applyOps()` |

**value schema**：

```json
{
  "name": "物品名",
  "quantity": 1,
  "type": "weapon|armor|consumable|material|key|other",
  "description": "简述"
}
```

**示例**：

```json
{"op":"add","path":"/player/inventory/-","value":{"name":"等离子手枪","quantity":1,"type":"weapon","description":"一把改装过的等离子武器"}}
```

**行为**：
- 同名同类型物品自动堆叠（quantity 累加）
- 本回合去重：同一 name+type 的 add 只生效一次
- 伪物品过滤：概念词（"经验"/"情报"/"好运"等）自动跳过
- 物品名超过 30 字符、或匹配已知伪物品模式 → 静默跳过

**物品类型识别**（中文/英文均可）：

| type | 触发词 |
|---|---|
| `weapon` | 武器、weapon |
| `armor` | 防具、铠甲、盔甲、armor |
| `consumable` | 消耗、药、食物、consumable、potion、food |
| `material` | 材料、零件、矿石、material、component |
| `key` | 关键、钥匙、通行证、令牌、key |
| `other` | 以上均不匹配时的默认值 |

---

### `/player/inventory/{name}`（更新/移除物品）

| 属性 | 值 |
|---|---|
| 类型 | `object`（replace）/ 无（remove） |
| 默认 | `null` |
| 增量 | ❌ |
| 描述 | 更新物品数量或移除物品 |
| Store | `playerStore.updateItemQuantity()` / `playerStore.removeItem()` |

**replace — 更新数量**：

```json
{"op":"replace","path":"/player/inventory/能量电池","value":{"quantity":5}}
{"op":"replace","path":"/player/inventory/能量电池","value":{"quantity":"+2"}}
{"op":"replace","path":"/player/inventory/0","value":{"quantity":3}}
```

**remove — 删除物品**：

```json
{"op":"remove","path":"/player/inventory/旧式扫描仪"}
{"op":"remove","path":"/player/inventory/0"}
```

**行为**：`{name}` 按物品名、ID 或数字索引匹配。update 支持增量字符串 `"+2"` / `"-1"`。

---

### `/player/quests/-`（添加任务）

| 属性 | 值 |
|---|---|
| 类型 | `object` |
| 默认 | `null` |
| 增量 | ❌ |
| 描述 | 添加新任务 |
| Store | `playerStore.addQuest()` |

**value schema**：

```json
{
  "title": "任务标题",
  "description": "描述",
  "status": "active"
}
```

**示例**：

```json
{"op":"add","path":"/player/quests/-","value":{"title":"寻找燃料","description":"去废船区搜寻可用燃料","status":"active"}}
```

**行为**：生成 `q-{timestamp}` 格式的 ID，id/name/标题/描述 字段均支持中文别名（title/标题/name、description/描述/content）。

---

### `/player/quests/{title}`（更新任务状态）

| 属性 | 值 |
|---|---|
| 类型 | `object` |
| 默认 | `null` |
| 增量 | ❌ |
| 描述 | 更新任务状态，按标题/ID 匹配 |
| Store | `playerStore.updateQuestStatus()` |

**value schema**：

```json
{"status": "completed|failed"}
```

**示例**：

```json
{"op":"replace","path":"/player/quests/寻找燃料","value":{"status":"completed"}}
{"op":"replace","path":"/player/quests/寻找燃料","value":{"status":"failed"}}
```

**行为**：按 `{title}` 匹配 `quest.id` 或 `quest.title`。status 为 `completed` 时返回 `✅ 任务完成：xxx`。

---

### `/player/character/{field}`（角色字段）

| 属性 | 值 |
|---|---|
| 类型 | `string` |
| 默认 | `""` |
| 增量 | ❌ |
| 描述 | 更新角色信息 |
| Store | `playerStore.updateCharacter()` |

**示例**：

```json
{"op":"replace","path":"/player/character/name","value":"星野银河"}
{"op":"replace","path":"/player/character/background","value":"前星际舰队中尉"}
```

**行为**：`{field}` 匹配 `name`/`age`/`gender`/`background` 或任意自定义字段，直接写入 `playerStore.character[field]`。

---

## 世界变量 `/world/...`

### `/world/time`

| 属性 | 值 |
|---|---|
| 类型 | `string` |
| 默认 | `"星历 2157年 01月 01日 08:00"` |
| 增量 | ❌ |
| 描述 | 世界时间，禁止时间倒流 |
| Store | `stateStore.setWorldTime()` |

**示例**：

```json
{"op":"replace","path":"/world/time","value":"星历 2157年03月15日 14:30"}
```

**行为**：
- 格式校验：正则 `/^[^\d]*\s+\d{4}年\s+\d{1,2}月\s+\d{1,2}日\s+\d{1,2}:\d{2}$/`
- 单调性校验：新时间必须 >= 当前时间，否则返回 `{ ok: false, reason: "不得早于当前世界时间" }`
- 校验失败时静默跳过，不阻断对话

---

### `/world/location/region`

| 属性 | 值 |
|---|---|
| 类型 | `string` |
| 默认 | `"未知星域"` |
| Store | `stateStore.currentLocation.region` |

```json
{"op":"replace","path":"/world/location/region","value":"近地轨道空间站"}
```

---

### `/world/location/subRegion`

| 属性 | 值 |
|---|---|
| 类型 | `string` |
| 默认 | `""` |
| Store | `stateStore.currentLocation.subRegion` |

```json
{"op":"replace","path":"/world/location/subRegion","value":"商业区"}
```

---

### `/world/location/detail`

| 属性 | 值 |
|---|---|
| 类型 | `string` |
| 默认 | `""` |
| Store | `stateStore.currentLocation.detail` |

```json
{"op":"replace","path":"/world/location/detail","value":"星光酒馆"}
```

---

### `/world/weather`

| 属性 | 值 |
|---|---|
| 类型 | `string` |
| 默认 | `"晴朗"` |
| Store | `stateStore.weather` |

```json
{"op":"replace","path":"/world/weather","value":"雷暴"}
```

---

## NPC 变量 `/npcs/...`

所有 NPC 路径均使用 **`{name}` 动态匹配**：按 NPC 的 `name`、`id` 或 small-case 模糊匹配。

### `/npcs/{name}/favor`

| 属性 | 值 |
|---|---|
| 类型 | `number` |
| 默认 | `0` |
| 范围 | `min: -99, max: 99` |
| 增量 | ✅ `"+N"` / `"-N"` |
| 描述 | 按 NPC 名称匹配的好感度 |
| Store | `npcStore npc.favor` + `npc.favorability`（双写） |

**示例**：

```json
{"op":"replace","path":"/npcs/酒保马克/favor","value":"+5"}
{"op":"replace","path":"/npcs/军需官威尔/favor","value":"-10"}
```

**行为**：
- `{name}` 模糊匹配 NPC：先精确 `name`，再精确 `id`，再 small-case name
- 增量模式下先算新值，再 clamp 到 `[-99, 99]`
- 同时写入 `npc.favor` 和 `npc.favorability` 两个字段
- 未找到 NPC 时静默跳过

---

### `/npcs/{name}/enabled`

| 属性 | 值 |
|---|---|
| 类型 | `boolean` |
| 默认 | `true` |
| 增量 | ❌ |
| 描述 | NPC 是否出场，`false` 则 NPC 离场 |
| Store | `npcStore npc.enabled` |

**示例**：

```json
{"op":"replace","path":"/npcs/酒保马克/enabled","value":false}
```

**行为**：`true`/`false`/`"true"`/`"false"`/`0`/`1` 均可。设为 `false` 时返回 `xxx 已离场`。

---

### `/npcs/{name}/currentHp`

| 属性 | 值 |
|---|---|
| 类型 | `number` |
| 默认 | `100` |
| 范围 | `min: 0` |
| 增量 | ✅ `"+N"` / `"-N"` |
| 描述 | NPC 当前 HP |
| Store | `npcStore npc.currentHp` |

**示例**：

```json
{"op":"replace","path":"/npcs/保安机甲/currentHp","value":"-30"}
```

**行为**：增量模式下在当前值上计算，结果 clamp 到 `>=0`。

---

## 完整速查表

| 路径 | 类型 | 增量 | op | value 格式 |
|---|---|---|---|---|
| `/player/gold` | number | ✅ | replace | `150` 或 `"-50"` |
| `/player/attributes/{name}` | number | ✅ | replace | `80` 或 `"+30"` |
| `/player/inventory/-` | object | — | add | `{"name":"…","quantity":1,"type":"…","description":"…"}` |
| `/player/inventory/{name}` | object | — | replace | `{"quantity":5}` 或 `{"quantity":"+1"}` |
| `/player/inventory/{name}` | — | — | remove | 无 |
| `/player/quests/-` | object | — | add | `{"title":"…","description":"…","status":"active"}` |
| `/player/quests/{title}` | object | — | replace | `{"status":"completed"|"failed"}` |
| `/player/character/{field}` | string | — | replace | `"新值"` |
| `/world/time` | string | — | replace | `"星历 2157年03月15日 14:30"` |
| `/world/location/region` | string | — | replace | `"近地轨道空间站"` |
| `/world/location/subRegion` | string | — | replace | `"商业区"` |
| `/world/location/detail` | string | — | replace | `"星光酒馆"` |
| `/world/weather` | string | — | replace | `"雷暴"` |
| `/npcs/{name}/favor` | number | ✅ | replace | `20` 或 `"+5"` |
| `/npcs/{name}/enabled` | boolean | — | replace | `true` / `false` |
| `/npcs/{name}/currentHp` | number | ✅ | replace | `100` 或 `"-30"` |

---

## 路径别名

系统接受以下等价写法（内部规范化到 `/xxx/yyy`）：

| 输入 | 规范化 |
|---|---|
| `/player/gold` | `/player/gold` |
| `player.gold` | `/player/gold` |
| `$.player.gold` | `/player/gold` |
| `/player/inventory/-` | `/player/inventory/-` |
| `npc.酒保马克.favor` | `/npcs/酒保马克/favor` |

---

## 解析回退链

按以下优先级从 AI 回复中提取 JSON Patch：

| 优先级 | 来源 |
|---|---|
| 1 | `<mj_variables>...</mj_variables>` 主格式 |
| 2 | `<variables>...</variables>` 旧格式兼容 |
| 3 | `<patch>...</patch>` 旧格式兼容 |
| 4 | ````json...```` 代码块（含关键字 `"op"`/`"path"`/`"player"`） |
| 5 | 裸 JSON 平衡提取 |

多组标签全部处理（非互斥）。

---

## 错误策略

所有错误均静默处理，不阻断对话流程：

| 情形 | 行为 |
|---|---|
| 路径未注册 | `console.debug` 跳过 |
| 类型校验失败 | `console.debug` 跳过 |
| NPC 未找到 | `console.debug` 跳过 |
| 世界时间格式无效/时间倒流 | 静默跳过 |
| 物品操作失败 | 事务回滚（整批 ops 全部撤销，不留下半完成状态） |
| JSON 解析失败 | 尝试下一级回退 |

---

## 添自定义变量

只需在 `src/utils/variableRegistry.ts` 中加一条 `VarDef`。AI 的 system prompt 会自动包含新路径。

**示例 — 加"声望"属性**：

```ts
{
  path: '/player/attributes/声望',
  label: '声望',
  type: 'number',
  defaultValue: 0,
  min: -100,
  max: 100,
  incremental: true,
  category: 'player',
  description: '在各方势力中的声望值',
}
```

`playerStore.character.attributes` 是 `Record<string, number>`，任意属性名自动支持，无需额外 Store 改造。

如果新变量不是简单键值对（比如全新的数据结构），则需要额外改两处：
1. 对应 Store — 加数据字段和更新方法
2. `variableEngine.ts` — 路由函数加分支
