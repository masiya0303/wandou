// ============================================================
// wandou - 变量注册表
//
// 所有可用变量的唯一定义源。
// contextBuilder 从此生成协议文本，variableEngine 从此校验并路由操作。
// ============================================================

// ============================================================
// 类型定义
// ============================================================

export interface VarDef {
  /** 模板路径，{name} 为动态段（如 /player/attributes/{name}、/npcs/{name}/favor） */
  path: string
  /** 人类可读标签 */
  label: string
  /** 值类型 */
  type: 'number' | 'string' | 'boolean' | 'object'
  /** 默认值 */
  defaultValue: any
  /** 数值范围 */
  min?: number
  max?: number
  /** 是否支持增量表达式 "+N" / "-N" */
  incremental: boolean
  /** 分类 */
  category: 'player' | 'world' | 'npc'
  /** 简短说明（会出现在协议文本里） */
  description?: string
  /** 对 object 类型的值格式说明 */
  valueSchema?: string
}

export interface VarGroup {
  category: string
  label: string
  vars: VarDef[]
}

/** 传递给 buildVariableProtocolFromTemplate() 的当前状态快照 */
export interface ProtocolStateSnapshot {
  /** 背包物品，格式化字符串，如 "能量电池 ×3 (material), 等离子手枪 ×1 (weapon)" */
  inventory: string
  /** 背包物品名列表，用于 AI 快速去重判断 */
  itemNames: string[]
  /** 活跃任务，格式化字符串，如 "寻找燃料 (支线), 清理鼠患 (支线)" */
  quests: string
  /** 活跃任务标题列表，用于 AI 快速查重 */
  questTitles: string[]
  /** 当前金币 */
  gold: number
  /** 当前世界时间 */
  time: string
  /** 当前位置 */
  location: string
  /** 当前天气 */
  weather: string
  /** 在场 NPC，格式化字符串，如 "酒保马克(❤5), 军需官威尔(❤-10)" */
  npcs: string
  /** 在场 NPC 名列表，用于 AI 快速确认 NPC 是否存在 */
  npcNames: string[]
  /** 在场 NPC ID 列表 — AI 可用 ID 写路径（更稳定，推荐），也可用 name（兼容） */
  npcIds: string[]
}

// ============================================================
// 系统变量定义
// ============================================================

const INVENTORY_ITEM_SCHEMA = '{"name":"物品名","quantity":1,"type":"weapon|armor|consumable|material|key|other","description":"简述"}'
const QUEST_VALUE_SCHEMA = '{"title":"任务名字","questType":"主线|支线|日常|紧急|隐藏","description":"任务内容","reward":"任务奖励","color":"#ff6b6b","status":"active","source":"发布NPC名称|system"}'
const NPC_VALUE_SCHEMA = '{"name":"NPC名称","role":"身份/职业","personality":"性格特点","appearance":"外貌","background":"背景","relationToPlayer":"与玩家的关系","age":年龄数字,"gender":"性别","characterIntro":"人物介绍","sexualExperience":"性经历"}'
const NPC_IDENTITY_SCHEMA = '{"name":"真名","role":"真实身份","personality":"性格","appearance":"外貌描述","background":"背景故事","relationToPlayer":"与玩家关系","age":年龄数字,"gender":"性别","characterIntro":"人物介绍","sexualExperience":"性经历"}'

export const SYSTEM_VAR_GROUPS: VarGroup[] = [
  {
    category: 'player',
    label: '玩家',
    vars: [
      {
        path: '/player/gold',
        label: '金币',
        type: 'number',
        defaultValue: 100,
        min: 0,
        incremental: true,
        category: 'player',
        description: '当前持有金币数量',
      },
      {
        path: '/player/attributes/{name}',
        label: '属性值',
        type: 'number',
        defaultValue: 0,
        min: 0,
        incremental: true,
        category: 'player',
        description: '自定义属性（HP/MP/ATK/DEF 或任意自定名称）',
      },
      {
        path: '/player/inventory/-',
        label: '背包（添加物品）',
        type: 'object',
        defaultValue: null,
        incremental: false,
        category: 'player',
        description: '向背包添加新物品',
        valueSchema: INVENTORY_ITEM_SCHEMA,
      },
      {
        path: '/player/inventory/{name}',
        label: '背包物品（更新/移除）',
        type: 'object',
        defaultValue: null,
        incremental: false,
        category: 'player',
        description: '更新物品数量或移除物品。replace 更新，remove 移除',
        valueSchema: '{"quantity": 新数量} 或 remove 操作无需 value',
      },
      {
        path: '/player/quests',
        label: '任务（添加/替换）',
        type: 'object',
        defaultValue: null,
        incremental: false,
        category: 'player',
        description: '添加单个任务（value 为任务对象）或替换整个任务列表（value 为数组）',
        valueSchema: QUEST_VALUE_SCHEMA,
      },
      {
        path: '/player/quests/-',
        label: '任务（添加，JSON Patch）',
        type: 'object',
        defaultValue: null,
        incremental: false,
        category: 'player',
        description: '添加新任务（标准 JSON Patch 追加语法）',
        valueSchema: QUEST_VALUE_SCHEMA,
      },
      {
        path: '/player/quests/{title}',
        label: '任务（更新状态）',
        type: 'object',
        defaultValue: null,
        incremental: false,
        category: 'player',
        description: '更新任务状态，按标题匹配',
        valueSchema: '{"status":"completed|failed"}',
      },
      {
        path: '/player/character/{field}',
        label: '角色字段',
        type: 'string',
        defaultValue: '',
        incremental: false,
        category: 'player',
        description: '更新角色信息（name/age/gender/background）',
      },
    ],
  },
  {
    category: 'world',
    label: '世界',
    vars: [
      {
        path: '/world/time',
        label: '世界时间',
        type: 'string',
        defaultValue: '2157年 01月 01日 08:00',
        incremental: false,
        category: 'world',
        description: '格式：YYYY年 MM月 DD日 HH:MM，禁止时间倒流',
      },
      {
        path: '/world/location/region',
        label: '地点-区域',
        type: 'string',
        defaultValue: '未知区域',
        incremental: false,
        category: 'world',
        description: '主区域名称',
      },
      {
        path: '/world/location/subRegion',
        label: '地点-子区域',
        type: 'string',
        defaultValue: '',
        incremental: false,
        category: 'world',
        description: '子区域名称',
      },
      {
        path: '/world/location/detail',
        label: '地点-详细',
        type: 'string',
        defaultValue: '',
        incremental: false,
        category: 'world',
        description: '具体建筑/房间名',
      },
      {
        path: '/world/weather',
        label: '天气',
        type: 'string',
        defaultValue: '晴朗',
        incremental: false,
        category: 'world',
        description: '当前天气状况',
      },
    ],
  },
  {
    category: 'npc',
    label: 'NPC',
    vars: [
      {
        path: '/npcs/-',
        label: 'NPC（添加）',
        type: 'object',
        defaultValue: null,
        incremental: false,
        category: 'npc',
        description: '添加新登场的 NPC，仅在本轮正文中明确出现时添加。NPC ID 自动生成，可在当前状态中查看',
        valueSchema: NPC_VALUE_SCHEMA,
      },
      {
        path: '/npcs/{name|id}/identity',
        label: 'NPC 身份揭示（批量更新）',
        type: 'object',
        defaultValue: null,
        incremental: false,
        category: 'npc',
        description: '⭐ 推荐用 ID：/npcs/{id}/identity。也兼容 name：/npcs/{name}/identity。一次性更新 name+role+personality+appearance+background+relationToPlayer',
        valueSchema: NPC_IDENTITY_SCHEMA,
      },
      {
        path: '/npcs/{name|id}/favor',
        label: '好感度',
        type: 'number',
        defaultValue: 0,
        min: -99,
        max: 99,
        incremental: true,
        category: 'npc',
        description: '⭐ 推荐用 ID。按 NPC ID 或名称匹配，支持增量',
      },
      {
        path: '/npcs/{name|id}/name',
        label: 'NPC 名字（改名）',
        type: 'string',
        defaultValue: '',
        incremental: false,
        category: 'npc',
        description: '⭐ 推荐用 ID 做路径，value 为新名字。改名后自动记录旧名→新名映射',
      },
      {
        path: '/npcs/{name|id}/enabled',
        label: '是否出场',
        type: 'boolean',
        defaultValue: true,
        incremental: false,
        category: 'npc',
        description: '⭐ 推荐用 ID。设为 false 则该 NPC 离场',
      },
      {
        path: '/npcs/{name|id}/currentHp',
        label: '当前生命',
        type: 'number',
        defaultValue: 100,
        min: 0,
        incremental: true,
        category: 'npc',
        description: '⭐ 推荐用 ID。NPC 当前 HP，支持增量',
      },
    ],
  },
]

// ============================================================
// 路径解析
// ============================================================

/** 扁平化所有 VarDef（含模板路径） */
let _flatDefs: VarDef[] | null = null
function getFlatDefs(): VarDef[] {
  if (!_flatDefs) {
    _flatDefs = SYSTEM_VAR_GROUPS.flatMap(g => g.vars)
  }
  return _flatDefs
}

// ============================================================
// 路径别名（AI 可能使用中文/简写路径，统一映射到注册路径）
// ============================================================

const PATH_ALIASES: Record<string, string> = {
  // 玩家中文名
  '/player/金币': '/player/gold',
  '/player/金钱': '/player/gold',
  '/player/钱': '/player/gold',
  '/player/属性': '/player/attributes',
  '/player/背包': '/player/inventory',
  '/player/背包/-': '/player/inventory/-',
  '/player/物品': '/player/inventory',
  '/player/物品/-': '/player/inventory/-',
  '/player/道具': '/player/inventory',
  '/player/道具/-': '/player/inventory/-',
  '/player/任务': '/player/quests',
  '/player/任务/-': '/player/quests/-',
  '/player/委托': '/player/quests',
  '/player/委托/-': '/player/quests/-',
  // 中文世界
  '/player/地点': '/world/location',
  '/player/位置': '/world/location',
  // 英文别名
  '/player/money': '/player/gold',
  '/player/items': '/player/inventory',
  '/player/items/-': '/player/inventory/-',
  '/player/missions': '/player/quests',
  '/player/missions/-': '/player/quests/-',
}

/**
 * 根据实际路径查找对应的 VarDef。
 * 先精确匹配 → 路径别名转换 → 模板匹配（{name} 段）。
 * 返回匹配到的定义和提取的动态参数名。
 */
export function resolveVarDef(inputPath: string): { def: VarDef; canonicalPath: string; dynamicName?: string } | null {
  let norm = normalizeVarPath(inputPath)
  if (!norm) return null

  // 路径别名转换
  const alias = PATH_ALIASES[norm] || PATH_ALIASES[norm.replace(/\/$/, '')]
  if (alias) {
    norm = normalizeVarPath(alias)
  }

  // 精确匹配
  for (const def of getFlatDefs()) {
    if (def.path === norm) return { def, canonicalPath: norm }
  }

  // 模板匹配：/player/attributes/{name}、/npcs/{name}/favor 等
  const inputParts = norm.split('/').filter(Boolean)
  for (const def of getFlatDefs()) {
    const tplParts = def.path.split('/').filter(Boolean)
    if (tplParts.length !== inputParts.length) continue

    let dynamicName: string | undefined
    let match = true
    for (let i = 0; i < tplParts.length; i++) {
      if (tplParts[i].startsWith('{') && tplParts[i].endsWith('}')) {
        dynamicName = inputParts[i]
      } else if (tplParts[i] !== inputParts[i]) {
        match = false
        break
      }
    }
    if (match) return { def, dynamicName, canonicalPath: def.path }
  }

  return null
}

/** 规范化路径：去掉 $ 前缀，点分转斜杠，确保以 / 开头 */
function normalizeVarPath(raw: string): string {
  let path = String(raw || '').trim()
  if (!path) return ''

  if (path.startsWith('$')) {
    path = path.slice(1)
    if (path.startsWith('.')) path = path.slice(1)
  }
  if (path.includes('.') && !path.startsWith('/')) {
    path = '/' + path.replace(/\./g, '/')
  }
  if (!path.startsWith('/')) {
    path = '/' + path
  }
  return path.replace(/\/+$/, '')
}

// ============================================================
// 值校验
// ============================================================

export interface ValidationResult {
  valid: boolean
  reason?: string
}

export function validateValue(def: VarDef, rawValue: any): ValidationResult {
  // remove 操作不需要 value
  if (rawValue === undefined || rawValue === null) {
    return { valid: true }
  }

  const vt = def.type

  if (vt === 'number') {
    // 增量字符串 "+N" / "-N" 合法（最终值在 apply 时校验）
    if (typeof rawValue === 'string' && /^[+-]\d+(\.\d+)?$/.test(rawValue)) {
      return { valid: true }
    }
    if (typeof rawValue === 'number') {
      if (def.min !== undefined && rawValue < def.min) {
        return { valid: false, reason: `${def.label} 不得低于 ${def.min}，收到 ${rawValue}` }
      }
      if (def.max !== undefined && rawValue > def.max) {
        return { valid: false, reason: `${def.label} 不得超过 ${def.max}，收到 ${rawValue}` }
      }
      return { valid: true }
    }
    if (typeof rawValue === 'string' && /^-?\d+(\.\d+)?$/.test(rawValue)) {
      const n = Number(rawValue)
      if (def.min !== undefined && n < def.min) {
        return { valid: false, reason: `${def.label} 不得低于 ${def.min}，收到 ${n}` }
      }
      if (def.max !== undefined && n > def.max) {
        return { valid: false, reason: `${def.label} 不得超过 ${def.max}，收到 ${n}` }
      }
      return { valid: true }
    }
    return { valid: false, reason: `${def.label} 期望数字类型，收到 ${typeof rawValue}` }
  }

  if (vt === 'string') {
    if (typeof rawValue === 'string') return { valid: true }
    if (typeof rawValue === 'number') return { valid: true } // 数字可以转字符串
    return { valid: false, reason: `${def.label} 期望字符串类型` }
  }

  if (vt === 'boolean') {
    if (typeof rawValue === 'boolean') return { valid: true }
    if (rawValue === 'true' || rawValue === 'false') return { valid: true }
    if (rawValue === 0 || rawValue === 1) return { valid: true }
    return { valid: false, reason: `${def.label} 期望布尔类型` }
  }

  // object — 宽松通过
  if (vt === 'object') {
    if (typeof rawValue === 'object' && rawValue !== null) return { valid: true }
    return { valid: false, reason: `${def.label} 期望对象类型` }
  }

  return { valid: true }
}


// ============================================================
// Prompt 模板系统（yijiekkk-style）
// 用 {{PLACEHOLDER}} 替代硬编码字符串拼接。
// DLC/世界可通过模板覆盖定制变量协议。
// ============================================================

/** 模板占位符 → 替换值 */
export interface PromptTemplateVars {
  '{{STATUS}}': string           // 完整变量快照
  '{{NPCS}}': string             // NPC 列表（含 ID）
  '{{NPC_IDS}}': string          // NPC ID 列表
  '{{INVENTORY}}': string        // 背包物品
  '{{QUESTS}}': string           // 任务列表
  '{{GOLD}}': string             // 当前金币
  '{{TIME}}': string             // 世界时间
  '{{LOCATION}}': string         // 当前位置
  '{{WEATHER}}': string          // 天气
  '{{VARIABLE_PATHS}}': string   // 可用路径速查表
  '{{THINKING_HINTS}}': string   // 思维链中动态提示（NPC/任务/物品去重）
  '{{IDENTITY_CHECKLIST}}': string // 身份揭示自检
}

/** 默认变量协议模板 */
export const DEFAULT_PROTOCOL_TEMPLATE = `=== 0) 当前状态 ===
背包：{{INVENTORY}}
任务：{{QUESTS}}
金币：{{GOLD}} | 时间：{{TIME}} | 位置：{{LOCATION}} | 天气：{{WEATHER}}
在场NPC：{{NPCS}}

=== 1) 必须强制执行（违反任一条则本轮输出无效） ===

【NPC 身份揭示 — 最重要规则】
### ⚠️ 铁律0：必须输出 mj_variables 标签！
即使本轮没有任何变化，也要输出 &lt;mj_variables&gt;[]&lt;/mj_variables&gt;。
禁止在正文中解释/讨论变量，变量操作全部放在标签内。

### ⚠️ 铁律1：NPC 身份揭示（最高优先级）
   - 若当前状态中有占位名 NPC（???/？？？/陌生人/神秘人），且本轮已透露真名：
     → 必须输出 identity 更新，**禁止输出 [] 空数组**！
   - ⭐ 始终用 NPC 的 ID（非 name）写路径！ID 见上方"当前状态"。
   - 格式：{"op":"replace","path":"/npcs/{NPC的ID}/identity","value":{"name":"真名","role":"身份","personality":"性格","appearance":"外貌","background":"背景","relationToPlayer":"关系"}}

### 铁律2：每轮必更
1) 时间：每轮强制 replace /world/time（格式 YYYY年 MM月 DD日 HH:MM，补零）
2) 位置/天气：正文写了新值 → 必须 replace 同步
3) 金币：变化只走 /player/gold，禁止放入背包物品
4) 去重：已存在 → replace 不可 add
5) 任务：5字段齐全（title/questType/description/reward/color/source）
     ⚠️ 任务来源判定（必读）：
       → 系统派发/剧情设定（桌上有委托单、手机收任务、公会已分配）→ 立即 add，source="system"，不需要等玩家口头接受
       → NPC 口头问"要不要接" → 等玩家明确说"我接/做这个"才 add，source=该NPC名
6) 排除：传闻/推测/未发生内容不写入 patch

=== 2) 输出格式 ===
1) 先输出 <thinking> 详细推理（不低于200字，每个 Step 必须写明当前值+变化过程+结论，禁止用"无变化"三个字跳过、禁止只列条目不写推理）
2) 再输出 <mj_variables> JSON Patch 数组
3) 🛑 铁律：每轮至少输出一个 replace 操作（时间必须更新！）。除非玩家什么都没做、正文只有一个字、时间没有流逝、位置没有变化、没有 NPC、没有物品、没有任务 — 只有这种极端情况才允许 []。否则至少包含时间更新。

<thinking>
Step.0 身份揭示检查：
  当前状态中的占位名NPC（???/？？？/陌生人/神秘人/不明/未知/无名）: {{NPCS}}
  本轮是否透露了任何NPC的真名或身份？→ 如有，操作清单必须包含 identity 更新（禁止输出 []）

Step.1 时间检查（每轮必做）：
  当前变量中的时间是: {{TIME}}
  本轮正文中时间向前流逝了多少分钟？（至少 +1 分钟，除非正文明确写"瞬间/立刻/同时"且在同一场景内）
  新时间 = 当前时间 + 流逝分钟 = ?（格式 YYYY年 MM月 DD日 HH:MM，月日时分必须两位补零，禁止时间倒流）

Step.2 位置检查（每轮必做）：
  当前位置: {{LOCATION}}
  本轮正文中玩家移动了吗？新位置的三级路径:
    region（区域）= ?
    subRegion（子区域）= ?
    detail（具体地点）= ?

Step.3 天气检查（每轮必做）：
  当前天气: {{WEATHER}}
  本轮正文中天气有变化吗？新天气 = ?

Step.4 物品变化检查：
  当前背包: {{INVENTORY}}
  本轮获得了新物品？（逐项核对物品名是否已在上方背包列表中 → 已存在用 replace 叠加 quantity，新物品才用 add）
  本轮消耗/丢弃了物品？（用 remove，路径中写明物品名）
  ⚠️ 金币/金钱/货币变化只能走 /player/gold 增量，禁止作为物品放入背包！
  ⚠️ 手机/字条/钥匙/证件等随身物品不算入背包，除非玩家明确"拾取/捡起/收入背包"

Step.5 任务变化检查：
  当前任务: {{QUESTS}}
  本轮接受了新任务？
    → 判定规则: NPC 列了多个任务但玩家未口头接受 → 不加
    → 系统派发（公告/短信/事件触发）→ source="system"，直接 add
    → NPC 口头委托且玩家明确说"接/做/好" → source=该NPC名，add
  本轮完成了任务？（replace status → completed）
  新任务字段必须齐全: title / questType / description / reward / color / source（缺一不可）

Step.6 NPC变化检查：
  当前在场NPC: {{NPCS}}
  新NPC登场？（add，含 name/role/personality/appearance/background/characterIntro/age/gender/relationToPlayer/sexualExperience 全部字段，不可省略）
  NPC离场？（replace enabled → false）
  好感度变化？（replace favor，支持增量 +N/-N）
  NPC本轮透露了真名/真实身份？
    → 必须用 identity 批量更新（name+role+personality+appearance+background+characterIntro+age+gender+relationToPlayer+sexualExperience 一次搞定）
    → 不要只改 name 一个字段！

Step.7 去重 + 占位值替换 + 排除自检（必须逐条回答）:
  物品去重: 已存在于背包的物品用 replace 而非 add？→
  任务去重: 已存在的任务只更新 status 而非重复 add？→
  NPC去重: 已在场的NPC只改字段，不重复 add？→
  占位值替换: 位置/天气为"未知区域/未知地区/空"但正文写了新值 → 已 replace？→
  排除过滤: 传闻/推测/未发生/提了但不拥有的内容已过滤？→

→ 最终操作清单（每个变化一行，无变化输出 []）:
</thinking>

【格式示例】
<mj_variables>
[
  {"op":"replace","path":"/world/time","value":"2157年 01月 03日 08:15"},
  {"op":"replace","path":"/world/location/region","value":"冬木市"},
  {"op":"replace","path":"/world/weather","value":"阴天"},
  {"op":"replace","path":"/player/gold","value":"-450"},
  {"op":"add","path":"/player/quests/-","value":{"title":"清理鼠患","questType":"支线","description":"村长委托清理东区鼠患","reward":"500G","color":"#ffa726","status":"active","source":"村长"}},
  {"op":"replace","path":"/npcs/{id}/identity","value":{"name":"远坂凛","role":"魔术师","personality":"傲娇果断","appearance":"红色上衣、黑色短裙","background":"远坂家继承人","relationToPlayer":"同盟"}}
]
</mj_variables>

=== 3) 路径速查 ===
{{VARIABLE_PATHS}}

⚠️ 【输出前速查】
□ 是不是输出了 <thinking> 和 <mj_variables> 两个标签？
{{IDENTITY_CHECKLIST}}
□ 任务字段齐全（含 source）？时间已补零？路径都在速查表中？
`

/**
 * 用模板变量渲染 prompt 模板。
 * 替换所有 {{PLACEHOLDER}} 占位符。
 */
export function renderPromptTemplate(
  template: string,
  vars: Partial<PromptTemplateVars>,
): string {
  let result = template
  for (const [placeholder, value] of Object.entries(vars)) {
    if (value !== undefined) {
      result = result.replaceAll(placeholder, String(value ?? ''))
    }
  }
  return result
}

/** 从当前状态构建模板变量 */
export function buildTemplateVars(state?: ProtocolStateSnapshot): Partial<PromptTemplateVars> {
  if (!state) return {}

  // 构建路径速查表文本
  const pathLines: string[] = []
  for (const group of SYSTEM_VAR_GROUPS) {
    pathLines.push('【' + group.label + '路径】')
    for (const v of group.vars) {
      const parts: string[] = [v.path]
      if (v.incremental) parts.push('(+N/-N)')
      if (v.valueSchema) parts.push('value: ' + v.valueSchema)
      if (v.description) parts.push('- ' + v.description)
      pathLines.push(parts.join(' '))
    }
    pathLines.push('')
  }

  // 思维链动态提示
  const thinkHints: string[] = ['  - 关键动作与数值变化（金币/属性/HP/MP等）',
                                '  - 时间流逝（分钟）与位置/天气变化（仅正文明确提及）']
  if (state.npcNames && state.npcNames.length > 0) {
    thinkHints.push('  - NPC：当前在场=[' + state.npcNames.join(', ') + ']；已存在禁add，改字段')
  }
  if (state.npcIds && state.npcIds.length > 0) {
    thinkHints.push('  - NPC的ID：[' + state.npcIds.join(', ') + '] ← 用这些ID写路径！')
  }
  if (state.questTitles && state.questTitles.length > 0) {
    thinkHints.push('  - 任务：当前=[' + state.questTitles.join(', ') + ']；已存在禁add，用replace更新status')
  }
  if (state.itemNames && state.itemNames.length > 0) {
    thinkHints.push('  - 物品：当前持有=[' + state.itemNames.join(', ') + ']；已存在禁add，用replace叠加quantity')
  }

  // 身份揭示自检 —— 显式列出每个占位名 NPC
  const identLines: string[] = []
  const PLACEHOLDER_RE = /^[\?？]{1,3}$|^陌生人$|^神秘人$|^不明$|^未知$|^无名$|^stranger$/i

  if (state.npcIds && state.npcIds.length > 0) {
    // 从已格式化的 npcs 字符串和 npcNames 中推断哪些是占位名
    // 注意：state 里没有 NPC 的 name/id 对应关系，只能从 npcNames 判断
    const placeholderNames: string[] = []
    if (state.npcNames) {
      for (const name of state.npcNames) {
        if (PLACEHOLDER_RE.test(name)) {
          placeholderNames.push(name)
        }
      }
    }
    if (placeholderNames.length > 0) {
      identLines.push('  ⚠️ 占位名 NPC 检测：以下 NPC 名为占位 → 若本轮揭示了真名，MUST 输出 identity 更新！')
      // 尝试从 npcs 格式化字符串中提取 id-name 对
      const npcStr = state.npcs || ''
      for (const pname of placeholderNames) {
        // 从 "[npc-xxx]???" 格式中提取 ID
        const re = new RegExp(`\\[([^\\]]+)\\]${pname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
        const m = re.exec(npcStr)
        if (m) {
          identLines.push(`    路径：/npcs/${m[1]}/identity → 填入真名+身份信息`)
        } else {
          identLines.push(`    路径：/npcs/{${pname}的ID}/identity → 填入真名+身份信息`)
        }
      }
      identLines.push('  → 有揭示时禁止输出 <mj_variables>[] 空数组！')
    } else {
      identLines.push('  无占位名 NPC → 无需身份揭示操作')
    }
  }

  identLines.push('  □ 物品/任务/NPC：已在列表中的用 replace 而非 add？')
  identLines.push('  □ 正文的时间/地点/天气同步到了变量？')
  const identCheck = identLines.join('\n')

  return {
    '{{STATUS}}': [
      '背包：' + (state.inventory || '空'),
      '任务：' + (state.quests || '无'),
      '金币：' + state.gold + ' | 时间：' + state.time + ' | 位置：' + state.location + ' | 天气：' + state.weather,
    ].join('\n'),
    '{{NPCS}}': state.npcs || '无',
    '{{NPC_IDS}}': state.npcIds ? state.npcIds.join(', ') : '',
    '{{INVENTORY}}': state.inventory || '空',
    '{{QUESTS}}': state.quests || '无',
    '{{GOLD}}': String(state.gold),
    '{{TIME}}': state.time,
    '{{LOCATION}}': state.location,
    '{{WEATHER}}': state.weather,
    '{{VARIABLE_PATHS}}': pathLines.join('\n'),
    '{{THINKING_HINTS}}': thinkHints.join('\n'),
    '{{IDENTITY_CHECKLIST}}': identCheck,
  }
}

/**
 * 从模板构建变量协议。
 * 如果 DLC 提供了自定义模板，优先使用。
 * @param state 当前状态快照
 * @param customTemplate 可选的自定义模板（DLC/世界覆盖）
 */
export function buildVariableProtocolFromTemplate(
  state?: ProtocolStateSnapshot,
  customTemplate?: string,
): string {
  const vars = buildTemplateVars(state)
  const template = customTemplate || DEFAULT_PROTOCOL_TEMPLATE
  return renderPromptTemplate(template, vars)
}
