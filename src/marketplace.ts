// ============================================================
// wandou · 扩展市场（内置可用扩展目录）
// 新增扩展只需在此数组加一条
// ============================================================
import type { ExtensionManifest } from '@/types/extension'

export const MARKETPLACE: ExtensionManifest[] = [
  {
    id: 'regex',
    name: '正则替换',
    version: '1.0.0',
    author: 'wandou',
    description: 'AI 回复后处理：正则查找替换、去除 HTML、流光 CoT 等',
    icon: '📐',
    events: ['chat:message_sent', 'chat:message_received'],
    js: `
// 正则替换扩展 — 对用户输入和 AI 回复应用正则规则
return function(ctx) {
  const { bus, applyRegexList, useRegexStore } = ctx

  // 发送前过滤（placement 1）
  bus.on('chat:message_sent', (msg) => {
    const re = useRegexStore()
    if (!re.enabled || re.entries.length === 0) return
    const filtered = applyRegexList(re.activeEntries(), msg.content, 1)
    if (filtered !== msg.content) msg.content = filtered
  })

  // AI 回复后处理（placement 2）
  bus.on('chat:message_received', (msg) => {
    const re = useRegexStore()
    if (!re.enabled || re.entries.length === 0) return
    if (msg.content) msg.content = applyRegexList(re.activeEntries(), msg.content, 2)
  })
}
`,
  },
  {
    id: 'autosave',
    name: '自动存档',
    version: '1.0.0',
    author: 'wandou',
    description: '每次 AI 回复结束自动保存世界',
    icon: '💾',
    events: ['chat:generation_end', 'world:loaded'],
    js: `
// 自动存档扩展 — 回合结束和世界加载后自动存档
return function(ctx) {
  const { bus, useGameStore } = ctx
  bus.on('chat:generation_end', () => { useGameStore().syncSave() })
  bus.on('world:loaded', () => { useGameStore().syncSave() })
}
`,
  },
]
