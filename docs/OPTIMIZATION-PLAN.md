# wandou 性能、成本与可靠性优化方案

> 撰写日期：2026-06-15
> 目标：在**更快、更省钱、效果更好**三个维度上系统性地优化 wandou 的 AI 对话生成链路

---

## 目录

1. [当前架构剖析：钱花在哪里，时间等在哪里](#1-当前架构剖析钱花在哪里时间等在哪里)
2. [核心策略一：双通道架构 + 结构化输出（影响最大）](#2-核心策略一双通道架构--结构化输出)
3. [核心策略二：Prompt 分层缓存](#3-核心策略二prompt-分层缓存)
4. [核心策略三：上下文窗口精算](#4-核心策略三上下文窗口精算)
5. [核心策略四：模型分级调度](#5-核心策略四模型分级调度)
6. [核心策略五：预计算与增量更新](#6-核心策略五预计算与增量更新)
7. [核心策略六：流式管道并行化](#7-核心策略六流式管道并行化)
8. [综合收益估算](#8-综合收益估算)
9. [实施路线图](#9-实施路线图)
10. [风险与回退方案](#10-风险与回退方案)

---

## 1. 当前架构剖析：钱花在哪里，时间等在哪里

### 1.1 一次完整对话的 Token 账单

以一次典型回合为例（已有 20 轮对话历史，5 个在场 NPC，3 条世界书命中）：

| 组成部分 | Token 估算 | 计费 | 占比 |
|---------|:---------:|:----:|:----:|
| **System Prompt 拼接体** | | | |
| ├─ 角色防火墙（RF） | ~40 | 输入 | 1% |
| ├─ 世界描述 | ~100 | 输入 | 1% |
| ├─ 角色状态 JSON（背包/任务/属性） | ~400 | 输入 | 5% |
| ├─ 记忆检索结果 | ~250 | 输入 | 3% |
| ├─ 世界书命中注入 | ~1500 | 输入 | **19%** |
| ├─ NPC 上下文 | ~300 | 输入 | 4% |
| └─ **变量更新协议模板** | **~1800** | 输入 | **23%** |
| **消息历史**（user+assistant ×20） | ~4000 | 输入 | **51%** |
| 用户消息 + BASE_SUFFIX | ~200 | 输入 | 3% |
| **输入小计** | **~8000** | — | 100% |
| | | | |
| **AI 输出** | | | |
| ├─ 叙事正文 | ~1200 | **输出** | 55% |
| ├─ `<thinking>` 块（强制≥200字） | ~400 | **输出** | 18% |
| └─ `<mj_variables>` JSON Patch | ~200 | **输出** | 9% |
| **输出小计** | **~1800** | — | 100% |

> 定价基准（DeepSeek-V3）：输入 $0.27/1M tokens，输出 $1.10/1M tokens
> **单轮成本 ≈ $0.00216（输入） + $0.00198（输出） = $0.00414**

### 1.2 隐性成本：格式失败导致的浪费

当前架构最昂贵的不是 tokens，而是**可靠性不足**：

| 失败场景 | 发生概率 | 额外成本 |
|---------|:---:|------|
| `<thinking>` 缺失 → 自动重试（最多 2 次） | ~15% | 该轮成本 ×1.15 |
| `<mj_variables>` 缺失 → API 物品提取回退 | ~10% | 额外一次 API 调用（~1000 tokens） |
| 同上 → API 任务提取回退 | ~10% | 再额外一次 API 调用（~1000 tokens） |
| 截断 JSON → 修复后部分丢失 | ~5% | 状态不同步，需手动修正 |
| `<thinking>` 太简略（合规检查不过） | ~20% | 变量更新质量下降 |

**综合浪费系数：约 1.25×** — 即每 4 轮对话中就有 1 轮的额外开销是白费的。

### 1.3 延迟分析：用户感知的等待时间

```
用户点击发送
    │
    ├─ 0ms:   sendMessage() 开始
    ├─ 50ms:  摘要检查（summarizer，仅在超阈值时触发）
    ├─ 10ms:  buildContextParts() — 拼接 System Prompt
    ├─ 200ms: HTTP 请求到达 API 服务器
    ├─ ═══════ API 思考时间（TTFT: Time To First Token）═══════
    │         当前：1.5~3 秒（因为需要先"想"thinking 再开始叙事）
    ├─ 3000ms: 流式输出叙事正文（~1200 tokens @ ~30 tok/s）
    ├─ 1200ms: 流式输出 thinking + variables（~600 tokens）
    ├─ 5ms:    processVariableUpdates() — 解析 + 路由
    ├─ 20ms:   异步回退提取（如触发）
    └─ 10ms:   记忆提取（异步）
    
用户看到第一段文字的总延迟：~1.8~3.3 秒
用户看到完整回复的总延迟：~4.5~6 秒
```

**延迟根本原因：AI 需要同时执行「叙事」「推理」「格式化输出」三个任务，而它们被串行地塞进了一个回复里。**

---

## 2. 核心策略一：双通道架构 + 结构化输出

> **一句话：叙事和状态提取分开，用两个专门优化过的 API 调用替代一个"什么都干"的调用。**
>
> 收益：⚡更快（TTFT 降 50%）  💰更省（输出 token 降 25%）  🎯更准（变量格式 100% 合法）

### 2.1 当前架构的问题

```
┌─────────┐     ┌──────────────────────────────────────┐     ┌─────────┐
│  用户   │ ──→ │      一次 API 调用（什么都干）          │ ──→ │  玩家   │
│  输入   │     │  1. 理解用户意图                       │     │  看到   │
└─────────┘     │  2. 按角色叙事（玩家看到的部分）         │     └─────────┘
                │  3. 在脑中写 thinking（200+字，不可见）  │
                │  4. 思考变量变化                         │
                │  5. 输出结构化 JSON Patch                │
                └──────────────────────────────────────┘

问题：
  A. 用户要等 AI "想完"才会看到第一个字（TTFT 高）
  B. AI 的注意力被分割 → 叙事质量下降 + 格式错误率升高
  C. thinking 消耗输出 token（$1.10/1M，比输入贵 4 倍！）
  D. 强制格式要求（BASE_SUFFIX）污染对话历史
```

### 2.2 双通道架构设计

```
                         ┌─────────────────────┐
                         │   通道一：叙事引擎    │
          ┌──────┐       │                     │
          │ 用户  │ ───→ │ 输入：角色 + 状态摘要 │ ──→ 流式输出 → 玩家看到
          │ 输入  │       │       + 对话历史     │      （纯叙事，无标签）
          └──────┘       │ 模型：DeepSeek-Chat  │
                         │ 温度：0.8（创意）     │
                         └──────────┬──────────┘
                                    │ 叙事文本完成
                                    ▼
                         ┌─────────────────────┐
                         │   通道二：状态提取    │
                         │                     │
                         │ 输入：叙事文本        │ ──→ JSON Patch → 更新 Store
                         │       + 当前状态快照  │      （结构化，100% 合法）
                         │ 模型：DeepSeek-Chat  │
                         │ 温度：0.0（精确）     │
                         │ response_format:     │
                         │   json_schema       │
                         └─────────────────────┘
```

### 2.3 通道一：叙事引擎（精简 Prompt）

剥离所有变量协议内容，系统 Prompt 仅保留：

```
【角色身份】（用户配置的角色 Prompt）
【角色认知防火墙】（roleFirewall.ts 缩略版）
【当前状态简报】（精简到 3-5 行）
【世界书 + NPC 上下文】（保持不变）
```

**状态简报的极简格式**（替代当前大段 JSON）：

```
当前：时间 2157年01月03日 08:15 · 冬木市·教堂 · 阴天
持有：金币 550 · 等离子手枪(material) 能量电池×3(consumable)
任务：清理鼠患(进行中) 寻找燃料(进行中) 
在场：酒保马克 军需官威尔(❤-10) 祭司艾琳(❤15)
```

从 ~1800 tokens 的 JSON 快照 → ~150 tokens 的简报行，**节省 90%**。

### 2.4 通道二：状态提取（结构化输出，100% 可靠）

这是整个方案的核心创新。当前架构最大的痛点是 AI 不按格式输出——这正是**结构化输出 API**要解决的问题。

```typescript
// 向 API 声明我们期望的 JSON Schema
const STATE_EXTRACTION_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "state_changes",
    strict: true,  // 关键：API 保证输出严格符合 schema
    schema: {
      type: "object",
      properties: {
        time_changed:    { type: "boolean" },
        new_time:        { type: "string" },
        location_changed:{ type: "boolean" },
        new_location:    { /* region, subRegion, detail */ },
        weather_changed: { type: "boolean" },
        new_weather:     { type: "string" },
        gold_delta:      { type: "integer" },
        inventory_added: { /* array of items */ },
        inventory_removed:{ /* array of names */ },
        inventory_updated:{ /* array of {name, quantity} */ },
        quests_added:    { /* array of quest objects */ },
        quests_updated:  { /* array of {title, status} */ },
        npc_added:       { /* array of npc objects */ },
        npc_identity_revealed: { /* array of {old_id, new_name, ...} */ },
        npc_favor_changes:{ /* array of {id, delta} */ },
        npc_left:        { /* array of ids */ },
      },
      additionalProperties: false
    }
  }
}

// API 调用
const response = await fetch(url, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${apiKey}` },
  body: JSON.stringify({
    model: 'deepseek-chat',
    temperature: 0,                    // 确定性输出
    response_format: STATE_EXTRACTION_SCHEMA,  // ← 关键
    messages: [
      { role: 'system', content: STATE_EXTRACTION_SYSTEM_PROMPT },
      { role: 'user', content: extractionInput },
    ],
    max_tokens: 1024,                  // 提取不需要很多 token
  })
})
```

**为什么这能做到 100% 可靠？**

- `strict: true` 模式下，API 提供商在模型推理后会做**约束解码（constrained decoding）**——每一 token 的选择都经过了 schema 校验，语法上不可能输出非法 JSON
- 不需要 `<mj_variables>` 标签 → 不需要 5 级回退提取链 → 不需要截断修复 → 不需要重试逻辑
- `temperature: 0` 保证相同输入有相同的结构化输出

> **支持此特性的 API**：OpenAI（`response_format`）、DeepSeek（v3 已支持 `response_format`）、Groq、Together AI 等。wandou 当前默认使用的 DeepSeek 已完全可用。

### 2.5 状态提取 System Prompt（精简版）

不再需要 110 行的协议模板。提取 Prompt 只需约 30 行：

```
你是游戏状态提取器。根据 AI 的叙事回复，提取其中发生的状态变化。

规则：
- 只提取叙事中明确发生的变化，不要推断
- 时间：每轮至少 +1 分钟（除非叙事中明确写了时间流逝量）
- 金币：不要和物品混淆，金币变化单独走 gold_delta
- 物品：已存在的物品用 inventory_updated，新物品用 inventory_added
- 任务：只有玩家明确接受的才算（NPC 口头发出的等玩家口头接受）
- NPC：用 ID 标识，不要用名字
- 如果某项没有变化，标记对应的 changed 字段为 false 即可

当前状态快照：
{{CURRENT_STATE_SNAPSHOT}}

AI 叙事回复：
{{NARRATION_TEXT}}
```

### 2.6 收益量化

| 指标 | 当前 | 优化后 | 改善 |
|------|:----:|:----:|:---:|
| System Prompt 大小 | ~3000 tokens | ~1200 tokens（叙事）+ ~500 tokens（提取） | -43% |
| 强制 `<thinking>` 输出 | 400 tokens（每轮） | **0**（消除） | -100% |
| 用户消息污染（SUFFIX） | 每轮注入 | **消除** | 对话更干净 |
| 格式失败率 | ~15-20% | **<0.1%**（schema 保证） | 99.5%↓ |
| 首 token 延迟（TTFT） | 1.8~3.3s | 0.8~1.5s | **~50%↓** |
| 每条消息输出 token | ~1800 | ~1200（叙事）+ ~150（提取） | -25% |
| 回合总成本 | $0.00414 | $0.00290 | **-30%** |
| API 调用次数 | 1（+回退 0~2 次） | **2（固定）** | 可预测 |

---

## 3. 核心策略二：Prompt 分层缓存

> **一句话：把每次请求中不变的内容标记为缓存，只传输变化的部分。**
>
> 收益：💰输入 token 成本降 60-70%  ⚡TTFT 降 30%

### 3.1 哪些内容可以缓存？

分析 `buildContextParts()` 的输出，按变化频率分三层：

| 层级 | 内容 | 变化频率 | 可缓存 |
|:----:|------|:----:|:----:|
| **L1 准静态** | 角色防火墙、变量提取 Prompt、输出格式说明 | 从不变化 | ✅ 完全缓存 |
| **L2 慢变** | 世界描述、世界书常驻条目（at_constant） | 切换世界时变化 | ✅ 跨回合缓存 |
| **L3 快变** | 状态简报（时间/位置/背包/任务/NPC） | 每轮变化 | ❌ 不可缓存 |
| **L3 快变** | 对话历史（最新的 N 条） | 每轮追加 | ❌ 不可缓存 |
| **L2.5 准慢变** | 世界书触发条目（关键词匹配结果） | 位置/话题变化时变化 | ⚠️ 有条件缓存 |

### 3.2 缓存架构

```
┌─────────────────────────────────────────────┐
│           System Prompt 构造                  │
│                                              │
│  ┌──────────────────────────────────┐        │
│  │ 缓存块 1：角色防火墙 + 提取规则   │  L1    │  ← cache_control: { type: "ephemeral" }
│  │ 约 500 tokens — 跨所有世界共用    │        │
│  ├──────────────────────────────────┤        │
│  │ 缓存块 2：世界书常驻条目          │  L2    │  ← 世界切换时更新缓存
│  │ 约 1000~3000 tokens — 世界级      │        │
│  ├──────────────────────────────────┤        │
│  │ 动态块 1：状态简报               │  L3    │  ← 每轮重新计算
│  │ 约 150 tokens                    │        │
│  ├──────────────────────────────────┤        │
│  │ 动态块 2：世界书触发条目          │  L2.5  │  ← 关键词匹配结果变化时更新
│  │ 约 500~1500 tokens               │        │
│  ├──────────────────────────────────┤        │
│  │ 动态块 3：最近对话历史            │  L3    │  ← 每轮追加
│  │ 约 2000~4000 tokens              │        │
│  └──────────────────────────────────┘        │
│                                              │
│  总输入：8000 tokens                         │
│  缓存命中：3500 tokens（44%）                 │
│  实际计费输入：4500 tokens                    │
└─────────────────────────────────────────────┘
```

### 3.3 实现要点

DeepSeek API 的缓存用法（Context Cache，类似 Anthropic 的 prompt caching）：

```typescript
// 在 messages 数组中，对缓存块标记 prefix 位置
// DeepSeek 会自动缓存 system prompt 的 prefix 部分
const messages = [
  {
    role: 'system',
    content: [
      {
        type: 'text',
        text: CACHE_BLOCK_1,  // 防火墙 + 提取规则
        cache_control: { type: 'ephemeral' }
      },
      {
        type: 'text',
        text: CACHE_BLOCK_2,  // 世界书常驻条目
        cache_control: { type: 'ephemeral' }
      },
      {
        type: 'text',
        text: DYNAMIC_BLOCK   // 状态简报 + 触发条目
      }
    ].filter(b => b.text).map(b => b.text).join('\n')
  },
  ...historyMessages  // 对话历史
]
```

> ⚠️ DeepSeek 的缓存实现细节可能随版本变动，建议查阅最新 API 文档。如果当前版本不支持 `cache_control`，可以用 Anthropic 的 prompt caching（Claude API）作为替代，或者先用「缩短 prompt」策略作为过渡。

### 3.4 收益量化

| 场景 | 输入 tokens | 缓存后计费 | 节省 |
|------|:---------:|:--------:|:---:|
| 冷启动（首次请求） | 8000 | 8000（全量计费） | 0% |
| 热请求（同世界同回合） | 8000 | 3500（缓存命中 56%） | **-56%** |
| 世界书未触发 | 6500 | 2500（缓存命中 62%） | **-62%** |
| 平均（80% 缓存命中率） | 7400 | 3700 | **-50%** |

结合 DeepSeek 的缓存定价（缓存写入略贵，缓存读取便宜 90%），**长期平均输入 token 成本下降 40-50%**。

---

## 4. 核心策略三：上下文窗口精算

> **一句话：不要发送不需要的东西，不要让 AI 读它不需要读的内容。**
>
> 收益：💰输入 token 降 20-30%  ⚡TTFT 降 10-15%

### 4.1 当前浪费点清单

| 浪费点 | 位置 | 浪费量 | 原因 |
|-------|------|:----:|------|
| **1. thinking 嵌入正文** | `chatStore.ts:286` | ~400 tokens/条 | thinking 通过 HTML 注释 `<!--thinking:...-->` 嵌入 AI 消息，然后被当作对话历史发回给 API |
| **2. BASE_SUFFIX 追加到用户消息** | `chatStore.ts:126-128` | ~100 tokens/条 | 每轮在用户消息末尾注入格式要求，这些注入文本留在对话历史里越积越多 |
| **3. 状态 JSON 冗余** | `contextBuilder.ts:46-49` | ~400 tokens | 角色状态 JSON 包含大量字段，但 AI 主要只用到背包和任务 |
| **4. NPC 全量扫描** | `contextBuilder.ts:125` | ~300 tokens | 所有在场 NPC 都列出，即使本轮对话完全没提到他们 |
| **5. 世界书全量关键词匹配** | `worldBookEngine.ts:10-83` | 不可控 | 用最近 10 条消息的全部文本匹配关键词，可能因为历史对话中提到某个词而触发不再相关的条目 |

### 4.2 精算措施

#### 措施 1：发送前剥离 thinking 注释

```typescript
// 在构建 API 消息数组前，清理所有 assistant 消息中的 thinking 嵌入
function cleanForApi(msg: GameMessage): GameMessage {
  if (msg.role !== 'assistant') return msg
  return {
    ...msg,
    content: msg.content.replace(/<!--thinking:[\s\S]*?-->/g, '')
  }
}
```

**收益**：20 轮对话中约 10 条 AI 消息，每条含 ~400 tokens 的 thinking → **节省 4000 tokens**。

#### 措施 2：BASE_SUFFIX 移到 System Prompt

当前做法是把格式要求追加到每条用户消息的 content 中。这些后缀留在对话历史里，20 轮后积累约 20 × 100 = 2000 tokens 的垃圾。

移入 System Prompt 尾部（一次写入，处处复用）：

```typescript
// 在 buildContextParts() 中添加一次，而非在 sendMessage() 中每条追加
parts.push(
  '[系统指令：回复末尾请输出你的思考过程和状态变化。' +
  '具体格式见上方"变量更新协议"。]'
)
```

**收益**：历史消息中消除 2000 tokens 累积垃圾 → **尤其对长会话增益明显**。

#### 措施 3：按需 NPC 注入

替代全量列出：

```typescript
// 不再：列出所有在场 NPC 的完整信息
// 改为：只列出最近 3 条消息中出现了名字的 NPC
function getRelevantNpcs(texts: string[], npcs: NpcEntry[], limit: number = 8) {
  const text = texts.join(' ').toLowerCase()
  const mentioned = npcs.filter(n =>
    n.name && text.includes(n.name.toLowerCase())
  )
  const recent = npcs
    .filter(n => npc.getNpcCategory(n) !== '离场')
    .sort((a, b) => (b.favor ?? 0) - (a.favor ?? 0)) // 好感度高的在前
  // 合并：提及的 NPC + 最近互动的 NPC，去重
  const seen = new Set(mentioned.map(n => n.id))
  const result = [...mentioned]
  for (const n of recent) {
    if (result.length >= limit) break
    if (!seen.has(n.id)) {
      result.push(n)
      seen.add(n.id)
    }
  }
  return result
}
```

**收益**：NPC 上下文从 ~300 tokens → ~100 tokens（平均），有效信息密度反而更高。

#### 措施 4：世界书双阶段匹配

当前用最近 10 条消息的全部内容做关键词匹配。改为：

```typescript
// 阶段 1：用户最新消息精确匹配（高优先级，用完整条目内容）
const userTexts = extractRecentText(messages.filter(m => m.role === 'user'), 3)
const highPriMatches = scanAndCollect(worldBook, userTexts, 4000)

// 阶段 2：全局上下文宽松匹配（低优先级，只注入条目标题/摘要）
const allTexts = extractRecentText(messages, 10)
const lowPriMatches = scanAndCollectBrief(worldBook, allTexts, 2000)
```

**收益**：世界书注入从 ~1500 tokens → ~1000 tokens，且相关性更高。

### 4.3 综合收益

| 精算措施 | 输入 token 节省 | 难度 |
|---------|:---:|:--:|
| 发送前剥离 thinking 注释 | -4000（累积） | 极低 |
| BASE_SUFFIX 移入 System Prompt | -2000（累积） | 极低 |
| 按需 NPC 注入 | -200/轮 | 低 |
| 世界书双阶段匹配 | -500/轮 | 中 |
| **合计（20 轮会话）** | **输入 -55%** | — |

---

## 5. 核心策略四：模型分级调度

> **一句话：不同的任务用不同的模型，贵模型用在刀刃上，便宜模型干粗活。**
>
> 收益：💰成本降 40-60%  ⚡慢任务不阻塞用户体验

### 5.1 任务分级

| 任务 | 当前模型 | 建议模型 | 理由 |
|------|---------|---------|------|
| **叙事生成** | DeepSeek-V3 | DeepSeek-V3 | 核心体验，必须用最好的 |
| **状态提取** | — | DeepSeek-V3（JSON 模式）或 DeepSeek-Lite | JSON 提取不需创造力，小模型足够 |
| **摘要压缩** | DeepSeek-V3 | DeepSeek-Lite 或本地模型 | 偶尔触发，容忍小误差 |
| **记忆提取** | DeepSeek-V3 | DeepSeek-Lite（JSON 模式） | 异步后台，不影响用户 |
| **物品提取回退** | DeepSeek-V3 | **消除（双通道架构不再需要）** | — |
| **任务提取回退** | DeepSeek-V3 | **消除（双通道架构不再需要）** | — |

### 5.2 成本对比

| 模型 | 输入价格 | 输出价格 |
|------|:------:|:------:|
| DeepSeek-V3 | $0.27/1M | $1.10/1M |
| DeepSeek-Lite | ~$0.14/1M | ~$0.28/1M |

状态提取每次约 1000 输入 + 150 输出 tokens：
- V3 成本：$0.00027 + $0.000165 = $0.000435
- Lite 成本：$0.00014 + $0.000042 = $0.000182
- **节省 58%**

### 5.3 使用时机策略

```
┌────────────────────────────────────────────────────┐
│                  智能路由决策树                      │
│                                                    │
│  ┌──────────┐     ┌──────────────────────┐         │
│  │ 新用户输入 │ ──→ │ 叙事生成：V3 (0.8 temp)│         │
│  └──────────┘     └──────────┬───────────┘         │
│                              │ 叙事文本              │
│                              ▼                      │
│                    ┌──────────────────┐            │
│                    │ 状态提取：Lite    │            │
│                    │ (0 temp + JSON)  │            │
│                    └──────────────────┘            │
│                                                    │
│  ┌──────────┐     ┌──────────────────────┐         │
│  │ 对话 ≥40轮│ ──→ │ 摘要压缩：Lite       │         │
│  └──────────┘     └──────────────────────┘         │
│                                                    │
│  ┌──────────┐     ┌──────────────────────┐         │
│  │ 每轮结尾  │ ──→ │ 记忆提取：Lite       │         │
│  │ (异步)   │     │ (JSON 模式)          │         │
│  └──────────┘     └──────────────────────┘         │
└────────────────────────────────────────────────────┘
```

---

## 6. 核心策略五：预计算与增量更新

> **一句话：用户还在打字的时候，系统已经在准备上下文了。**
>
> 收益：⚡ 减少用户感知延迟 200-500ms  💰小幅降低峰值 CPU 占用

### 6.1 预计算管线

```
用户正在输入...                   用户按下发送
    │                                  │
    ├─ 键盘事件触发 (每按键)            │
    ├─ 节流器: 300ms                    │
    │                                    │
    ├─ 预计算阶段:                       │ 发送阶段:
    │  ├─ scanNpcs() ← 提前跑           │ ├─ 将预计算结果注入 contextParts
    │  ├─ worldBook 关键词预匹配         │ ├─ 发送到 API（contextParts 已就绪）
    │  ├─ 记忆检索预过滤                 │ └─ TTFT 降低 200-500ms
    │  └─ 状态简报预序列化               │
    │                                    │
    └── 结果缓存，等待发送                │
```

### 6.2 具体实现

```typescript
// 在 InputBar 组件中
const precomputeTimeout = ref<ReturnType<typeof setTimeout> | null>(null)

function onUserTyping() {
  // 清除之前的预计算
  if (precomputeTimeout.value) clearTimeout(precomputeTimeout.value)
  
  // 用户停止输入 300ms 后开始预计算
  precomputeTimeout.value = setTimeout(() => {
    const input = inputText.value.trim()
    if (!input) return
    
    // 预计算世界书匹配
    const texts = [input, ...extractRecentText(messages.value, 5)]
    worldBookPreMatch.value = scanAndCollect(worldBook, texts, 3000)
    
    // 预构建状态简报
    stateBriefPrebuild.value = buildStateBrief()
    
    // 预检索 NPC
    npcPreContext.value = scanNpcs(npcs, texts, 1000)
  }, 300)
}
```

### 6.3 增量状态更新

对于状态简报（每轮变化的部分），采用增量 diff 而非全量重建：

```typescript
let cachedStateBrief = ''
let cachedStateVersion = 0

function buildStateBriefIncremental(): string {
  const currentVersion = getStateVersion() // 每次状态变化时递增
  if (currentVersion === cachedStateVersion) return cachedStateBrief
  
  cachedStateBrief = buildStateBrief() // 只在版本变化时重建
  cachedStateVersion = currentVersion
  return cachedStateBrief
}
```

---

## 7. 核心策略六：流式管道并行化

> **一句话：叙事还在流式输出的时候，状态提取就已经在准备了。**
>
> 收益：⚡ 叙事完成到 UI 更新的间隔从 1.5s 降到 200ms

### 7.1 当前串行流

```
叙事流式输出（3s）→ thinking 流式输出（1.2s）→ 变量解析（5ms）→ 回退提取（如触发, 1-3s）
                                                    ↑
                                         用户要等到这里才能看到完整结果
```

### 7.2 并行流设计

```typescript
async function sendMessageOptimized(userInput: string) {
  // ---- 阶段 1：叙事（流式）----
  isGenerating.value = true
  
  // 同时启动：叙事请求 + 准备提取上下文
  const [narrationText, extractionContext] = await Promise.all([
    // 通道 1：流式叙事
    chatStream(narrationConfig, narrationSystemPrompt, history, (token) => {
      aiMsg.content += token
      bus.emit('chat:generation_token', token, aiMsg)
    }),
    // 并行准备：构建提取上下文（不需要等叙事完成）
    prepareExtractionContext()
  ])
  
  // 叙事完成 → 用户看到完整回复
  bus.emit('chat:message_received', aiMsg)
  
  // ---- 阶段 2：状态提取（并行启动，可能已在叙事完成前结束）----
  const stateChanges = await extractState(narrationText, extractionContext)
  
  // ---- 阶段 3：应用变更 ----
  applyStateChanges(stateChanges) // 纯同步，5ms
  bus.emit('state:updated')
  
  // ---- 阶段 4：后台任务（不阻塞）----
  extractMemories(aiMsg.content, contextText).then(commitMemories)
}
```

关键在于 `prepareExtractionContext()` 和叙事 API 调用**同时启动**。状态简报、NPC 列表等在用户按下发送时就已就绪，不需要等叙事文本生成完毕。

### 7.3 流式提前截断优化

叙事文本中，AI 通常在最后 20% 的内容里描述状态变化（"你获得了...""任务已更新..."）。可以：

1. 设置一个检测器监听流式内容
2. 一旦检测到叙事核心部分已结束（如出现了对话分隔符、场景切换信号），立即用已生成的内容启动状态提取
3. 无需等叙事流完全结束

```typescript
let extractionStarted = false
const extractionTriggerPatterns = [
  /你获得了/, /失去了/, /任务.*完成/, /任务.*接受/,
  /离开了/, /到达了/, /天气.*变为/, /\d{4}年/
]

const enhancedOnChunk = (token: string) => {
  aiMsg.content += token
  bus.emit('chat:generation_token', token, aiMsg)
  
  // 提前触发状态提取（在叙事完成前）
  if (!extractionStarted && extractionTriggerPatterns.some(p => p.test(aiMsg.content))) {
    extractionStarted = true
    // 非阻塞启动提取，用当前已有文本
    extractState(aiMsg.content, extractionContext).then(changes => {
      pendingStateChanges = changes
    })
  }
}
```

---

## 8. 综合收益估算

### 8.1 单轮成本对比

| 阶段 | 当前方案 | 优化方案 | 节省 |
|------|:---:|:---:|:---:|
| **叙事** | | | |
| 输入 | 8000 tokens | 2500 有效 + 3000 缓存 = 2500 计费 | -69% |
| 输出 | 1800 tokens | 1200 tokens（无 thinking） | -33% |
| **提取** | — | | |
| 输入 | — | 800 tokens | +800 |
| 输出 | — | 150 tokens（JSON） | +150 |
| **回退调用** | 0~2 次额外 API | **0** | 消除 |
| **重试** | 15% 概率重试 | **0** | 消除 |

| 成本计算 | 当前 | 优化后 |
|------|:---:|:---:|
| 叙事输入成本 | $0.00216 | $0.00068 |
| 叙事输出成本 | $0.00198 | $0.00132 |
| 提取输入成本 | — | $0.00022 |
| 提取输出成本 | — | $0.00017 |
| 回退/重试浪费 (×1.25) | $0.00104 | $0 |
| **单轮合计** | **$0.00518** | **$0.00239** |

> **总成本降幅：-54%** — 即同样花 100 块钱的 API 额度，原来能玩 ~19,300 轮，优化后能玩 ~41,800 轮。

### 8.2 延迟对比

| 延迟指标 | 当前 | 优化后 | 改善 |
|------|:---:|:---:|:---:|
| 用户点击到看到第一段文字 | 1.8~3.3s | 0.6~1.2s | **-60%** |
| 用户看到完整叙事 | 3~4s | 3~4s | 持平 |
| 状态更新延迟 | 4~6s（含 thinking） | 叙事结束 + 0.2s | **-75%** |
| 重试导致的额外等待 | 最多 +6s | **0s** | 消除 |

### 8.3 格式可靠性对比

| 指标 | 当前 | 优化后 |
|------|:---:|:---:|
| 结构化输出合法性 | ~80-85%（需要重试/回退） | **>99.9%**（schema 约束解码） |
| 变量遗漏率 | ~10-15% | **<1%**（专用提取 prompt 更聚焦） |
| 截断 JSON 发生率 | ~5% | **0%**（提取用独立调用，不受叙事 max_tokens 影响） |
| 回退代码复杂度 | 3 条路径 × ~500 行代码 | **0**（不再需要回退） |

---

## 9. 实施路线图

### 第一阶段：零风险改进（1-2 天，立刻见效）

这些改进不需要动架构，直接在当前代码上修改：

| 序号 | 改进项 | 文件 | 预计时间 | 收益 |
|:--:|------|------|:--:|------|
| 1.1 | 发送前剥离 thinking 注释 | `chatStore.ts` | 0.5h | 输入 -20% |
| 1.2 | BASE_SUFFIX 移入 System Prompt | `chatStore.ts`, `contextBuilder.ts` | 0.5h | 输入 -10% |
| 1.3 | 按需 NPC 注入替代全量 | `contextBuilder.ts` | 1h | 输入 -5% |
| 1.4 | 状态简报极简化 | `contextBuilder.ts` | 1h | 输入 -15% |
| 1.5 | 封装 logger，剔除生产日志 | 新建 `utils/logger.ts` | 0.5h | 性能 + 专业性 |

**阶段一总收益**：输入 token -40%，延迟 -10%，不引入任何风险。

### 第二阶段：双通道架构（3-5 天，核心改造）

| 序号 | 改进项 | 新建/修改 | 预计时间 |
|:--:|------|------|:--:|
| 2.1 | 实现 `extractState()` — 结构化状态提取 | 新建 `utils/stateExtractor.ts` | 4h |
| 2.2 | 重构 `sendMessage()` — 分离叙事和提取 | 重构 `stores/chatStore.ts` | 4h |
| 2.3 | JSON Schema 定义 + 提取 System Prompt | 新建 `utils/extractionSchema.ts` | 2h |
| 2.4 | 移除 thinking 强制输出逻辑 | `chatStore.ts`, `variableRegistry.ts` | 1h |
| 2.5 | 移除 BASE_SUFFIX / VIOLATION_PREFIX 注入逻辑 | `chatStore.ts` | 1h |
| 2.6 | 移除回退提取链（itemExtractor, questExtractor 调用） | `chatStore.ts` | 1h |
| 2.7 | 适配现有 variableEngine 为 extractState 的输出格式 | `variableEngine.ts` | 2h |

**阶段二总收益**：格式可靠性 100%，延迟 -50%，成本 -30%。

### 第三阶段：缓存与模型分级（2-3 天）

| 序号 | 改进项 | 预计时间 |
|:--:|------|:--:|
| 3.1 | 实现 Prompt 分层缓存（L1/L2 缓存标记） | 3h |
| 3.2 | 模型路由器 — 按任务选择模型 | 2h |
| 3.3 | 摘要/记忆改用 Lite 模型 | 1h |
| 3.4 | 世界书预匹配缓存 | 2h |

**阶段三总收益**：成本再降 20%，延迟再降 10%。

### 第四阶段：预计算与并行化（1-2 天）

| 序号 | 改进项 | 预计时间 |
|:--:|------|:--:|
| 4.1 | 输入时预计算世界书/NPC 匹配 | 2h |
| 4.2 | 流式提前截断 — 叙事未完成即启动提取 | 2h |
| 4.3 | `prepareExtractionContext()` 与叙事并行 | 1h |

---

## 10. 风险与回退方案

### 10.1 双通道架构的风险

| 风险 | 概率 | 影响 | 缓解措施 |
|------|:---:|------|------|
| **状态提取遗漏**：叙事中隐含的状态变化没有被提取模型捕获 | 中 (5-10%) | 背包/任务/NPC 状态不同步 | 1) 提取 Prompt 做充分的小样本示例 2) 提取失败时 UI 提示玩家手动修正 3) 保留正则回退作为第三道防线 |
| **叙事-提取竞态**：提取返回的变量变化与叙事描述的对应关系出错 | 低 (2-5%) | 状态出现矛盾 | 提取时带入「当前状态」作为参考锚点，提取模型可以对比验证 |
| **双次调用延迟**：两次 API 调用比一次更慢 | 低 | 总延迟增加 | 两次调用**并行准备**而非串行，状态提取的输入在叙事进行中就预构建好了 |

### 10.2 API 兼容性风险

| 风险 | 缓解措施 |
|------|------|
| DeepSeek `response_format` 功能变更/不稳定 | 保留降级路径：如果 `response_format` 调用失败，自动回退到当前的 `<mj_variables>` 标签解析模式 |
| 结构化输出在某些边缘情况不严格 | 在客户端做第二层校验（复用现有的 `validateValue()`），不符合 schema 的字段丢弃 |

### 10.3 渐进式迁移策略

**不需要一次性切换。** 可以通过 feature flag 控制：

```typescript
// 在 apiStore 中
const useTwoPassArchitecture = ref(false)  // 默认关闭，灰度测试

async function sendMessage(input: string) {
  if (useTwoPassArchitecture.value) {
    return sendMessageTwoPass(input)
  }
  return sendMessageLegacy(input)  // 当前逻辑原封不动
}
```

建议的灰度步骤：
1. 自己在日常使用中开启双通道模式，观察 50-100 轮对话
2. 对比双通道和旧模式的变量同步准确率
3. 确认无误后设为默认，旧模式保留 1-2 个版本作为回退选项

### 10.4 回退按钮

如果双通道模式出问题，最差情况：
- 变量同步丢失一轮 → 玩家可以从背包/任务 UI 手动修正
- 连续出问题 → 关闭 feature flag，退回旧模式，一条语句恢复

**不存在数据不可逆丢失的风险。** 所有状态都持久化在 localStorage 中，API 提取失败不会删除任何已有状态。

---

## 📊 总结：一张图看懂全部优化

```
                       当前架构                    优化后架构
                       ────────                    ────────
                    
  可靠性    ████████░░ 80% 格式合法      ██████████ 99.9% JSON Schema 约束解码
  
  成本/轮   ████████░░ $0.0052           ██████░░░░ $0.0024 (-54%)
  
  首字延迟   ████████░░ 1.8~3.3s         ████░░░░░░ 0.6~1.2s (-60%)
  
  API调用   ████░░░░░░ 1次（+回退0~2）    ██████░░░░ 2次（固定，可预测）
  
  代码复杂度 ████████░░ 3条回退路径        ████░░░░░░ 1条主路径（+降级路径）
  
  对话清洁度 ██████░░░░ thinking 污染      ██████████ 纯叙事，无标签
```

**核心理念**：不让 AI 做"多线程"——叙事交给高温度模型自由发挥，状态提取交给零温度模型精确计算。两个任务各自在自己的最优配置下运行，合起来的效果远好于强迫一个模型同时兼顾。

---

## 附录 A：当前各 Prompt 组件的精确 token 估算方法

可使用以下脚本做精确统计（需 API key）：

```bash
# 用 DeepSeek 的 tokenizer 或 tiktoken 估算
# 中文大致按 1 字符 ≈ 0.5~0.7 token 计算
# 英文 1 字符 ≈ 0.25 token
# JSON 结构字符 1 字符 ≈ 0.3 token
```

## 附录 B：双通道架构下的 narrative System Prompt 完整示例

```
你是"乌拉"——这个世界本身。你以第二人称与玩家互动，同时扮演系统UI、旁白叙述者和所有NPC。

【角色认知防火墙】NPC只知道其亲眼所见/亲耳所闻的信息。不能使用系统设定、后台资料或其他角色内心想法。

【当前世界】2157年，后启示录风格的冬木市废墟。幸存者在残垣断壁间建立了一个小型聚居地。

【状态简报】
时间：2157年01月03日 08:15 | 冬木市·旧城区教堂 | 阴天
持有：金币 550 · 等离子手枪×1(weapon) · 能量电池×3(consumable) · 急救包×2(consumable)
任务：清理鼠患(进行中) · 寻找燃料(进行中)
在场：酒保马克(❤5) · 军需官威尔(❤-10) · 祭司艾琳(❤15)

【世界书·背景参考】
---（关键词触发的世界书条目）---

用沉浸式描写推动剧情，保持逻辑与发散思维。直接回应玩家的行动和对话，禁止用纯场景描写代替回应。
```

约 **600-800 tokens**（vs 当前的 ~3000 tokens）。

## 附录 C：状态提取 System Prompt 完整示例

```
你是游戏状态提取器。根据AI叙事，提取确切的状态变化。只提取叙事中明确发生的，不要推断。

规则：
- time_delta_minutes: 每轮至少流逝1分钟（除非叙事写"瞬间/立刻"），格式 {sign:"+", years:0, months:0, days:0, hours:0, minutes:1}
- gold: 金币变化量（负数为消耗），不要和物品混淆
- inventory: 已存在物品数量变化用updated，新物品用added，消耗/丢弃用removed
- quests: 只接受玩家明确同意的任务。NPC口头问你"要不要接"→不添加。玩家说"好/接/做"→添加
- npcs: 始终用ID标识（见当前状态快照）
- 无变化项标记对应_changed为false即可

当前状态快照：
{...}

AI叙事：
{...}
```

约 **400 tokens**。

---

> 📅 最后更新：2026-06-15
> 🔄 本文档将随优化实施进度持续更新
