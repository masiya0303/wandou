/**
 * 任务管线端到端测试 —— 模拟 AI 输出各种任务格式
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePlayerStore } from '@/stores/playerStore'
import { processVariableUpdates } from './variableEngine'

describe('quest pipeline', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('AI 用标准格式 add + /player/quests/- 加任务', () => {
    const text = `好的，我帮你。
<mj_variables>
[
  {"op":"add","path":"/player/quests/-","value":{"title":"清理鼠患","description":"村长委托你去东区下水道清理变异老鼠","status":"active"}}
]
</mj_variables>`
    const player = usePlayerStore()
    const result = processVariableUpdates(text)

    expect(result.applied).toBe(1)
    expect(player.quests.length).toBe(1)
    expect(player.quests[0].title).toBe('清理鼠患')
  })

  it('AI 遗漏 /- 直接用 /player/quests', () => {
    const text = `交给我吧。
<mj_variables>
[
  {"op":"add","path":"/player/quests","value":{"title":"送信任务","description":"把信送到隔壁村","status":"active"}}
]
</mj_variables>`
    const player = usePlayerStore()
    const result = processVariableUpdates(text)

    expect(result.applied).toBe(1)
    expect(player.quests.length).toBe(1)
    expect(player.quests[0].title).toBe('送信任务')
  })

  it('AI 用 replace + 任务名 upsert 新任务', () => {
    const text = `任务创建了。
<mj_variables>
[
  {"op":"replace","path":"/player/quests/收集矿石","value":{"title":"收集矿石","description":"矿工需要5块铁矿石","status":"active"}}
]
</mj_variables>`
    const player = usePlayerStore()
    const result = processVariableUpdates(text)

    expect(result.applied).toBe(1)
    expect(player.quests.length).toBe(1)
    expect(player.quests[0].title).toBe('收集矿石')
  })

  it('AI 用中文 value 字段（标题/描述）', () => {
    const text = `没问题。
<mj_variables>
[
  {"op":"add","path":"/player/quests/-","value":{"标题":"拯救村庄","描述":"从哥布林手中救出村民","status":"active"}}
]
</mj_variables>`
    const player = usePlayerStore()
    const result = processVariableUpdates(text)

    expect(result.applied).toBe(1)
    expect(player.quests.length).toBe(1)
    expect(player.quests[0].title).toBe('拯救村庄')
  })

  it('同名任务不重复添加', () => {
    const player = usePlayerStore()
    // 先加一个
    player.addQuest({ id: 'q1', title: '清理鼠患', description: '...', status: 'active', objectives: [] })
    expect(player.quests.length).toBe(1)

    // AI 再次输出同名任务
    const text = `<mj_variables>
[
  {"op":"add","path":"/player/quests/-","value":{"title":"清理鼠患","description":"再一次？","status":"active"}}
]
</mj_variables>`
    const result = processVariableUpdates(text)

    expect(result.applied).toBeGreaterThanOrEqual(0) // 可能被去重或路径未注册
    expect(player.quests.length).toBe(1) // 仍然只有1个
  })

  it('完整 AI 回复（含 thinking + 剧情 + mj_variables）', () => {
    const text = `村长看着你，严肃地说："勇士，东边的下水道里出现了变异老鼠，已经伤了好几个居民了。你愿意帮我们清理掉它们吗？"你毫不犹豫地点了点头。

<thinking>
Step.1 事实抽取（仅从本轮剧情与玩家行动中提取已发生事实）：

  - 1.1 关键动作：村长→委托→玩家→要求清理东区下水道的变异老鼠
  - 1.2 数值变化：无
  - 1.3 时间流逝：约 5 分钟
  - 1.4 位置变化：无，仍在村长家
  - 1.5 天气变化：无
  - 1.6 NPC 变动：无新登场/离场
  - 1.7 NPC 好感：无
  - 1.8 任务变化：接到新委托「清理鼠患」
  - 1.9 物品变化：无
  - 1.10 排除清单：无
</thinking>
<mj_variables>
[
  {"op":"add","path":"/player/quests/-","value":{"title":"清理鼠患","description":"村长委托你去东区下水道清理变异老鼠","status":"active"}}
]
</mj_variables>`

    const player = usePlayerStore()
    const result = processVariableUpdates(text)

    console.log('[quest pipe test] applied:', result.applied, 'summary:', result.summary)
    console.log('[quest pipe test] operations:', JSON.stringify(result.operations))
    console.log('[quest pipe test] quests:', JSON.stringify(player.quests))

    expect(player.quests.length).toBe(1)
    expect(player.quests[0].title).toBe('清理鼠患')
    expect(result.summary).toContain('清理鼠患')
  })

  it('AI 输出带尾逗号 JSON（极常见）', () => {
    const text = `<mj_variables>
[
  {"op":"add","path":"/player/quests/-","value":{"title":"清理鼠患","description":"去下水道","status":"active"}},
]
</mj_variables>`
    const player = usePlayerStore()
    const result = processVariableUpdates(text)
    expect(result.applied).toBe(1)
    expect(player.quests.length).toBe(1)
    expect(player.quests[0].title).toBe('清理鼠患')
  })

  it('AI 用中文路径 /player/任务/-', () => {
    const text = `<mj_variables>
[
  {"op":"add","path":"/player/任务/-","value":{"title":"送信","description":"送信到隔壁村","status":"active"}}
]
</mj_variables>`
    const player = usePlayerStore()
    const result = processVariableUpdates(text)
    expect(result.applied).toBe(1)
    expect(player.quests.length).toBe(1)
    expect(player.quests[0].title).toBe('送信')
  })

  it('AI 用 JS 对象风格（无引号 key）', () => {
    const text = `<mj_variables>
[
  {op:"add",path:"/player/quests/-",value:{title:"收集药材",description:"采集5株草药",status:"active"}}
]
</mj_variables>`
    const player = usePlayerStore()
    const result = processVariableUpdates(text)
    expect(result.applied).toBe(1)
    expect(player.quests.length).toBe(1)
    expect(player.quests[0].title).toBe('收集药材')
  })

  it('safeParseJson 容错清理', async () => {
    const { safeParseJson } = await import('./jsonExtract')
    // 尾逗号
    expect(safeParseJson('[{"a":1},]')).toEqual([{a:1}])
    // 无引号 key
    expect(safeParseJson('{title:"hello",value:42}')).toEqual({title:"hello",value:42})
    // 行注释
    expect(safeParseJson('[{"a":1}] // comment')).toEqual([{a:1}])
  })
})
