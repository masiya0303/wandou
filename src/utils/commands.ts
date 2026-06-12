// ============================================================
// wandou · 斜杠命令（输入栏 /command 快捷操作）
// ============================================================
import { useChatStore } from '@/stores/chatStore'
import { useGameStore } from '@/stores/gameStore'
import { useRegexStore } from '@/stores/regexStore'

type CmdFn = (args: string) => string | false  // 返回提示信息 或 false=静默

const commands: Record<string, CmdFn> = {
  retry(_) {
    const chat = useChatStore()
    if (chat.isGenerating) return '正在生成中，请稍候再试'
    chat.regenerate()
    return false
  },

  clear(_) {
    if (!confirm('确定清除当前世界所有数据？\n\n清空：聊天记录、背包、任务、NPC、世界状态、金币\n保留：世界设定、世界书、API 配置、角色身份')) return false
    const game = useGameStore()
    game.resetWorldData()
    return '所有数据已清除'
  },

  save(_) {
    const game = useGameStore()
    game.syncSave()
    return '已存档'
  },

  help(_) {
    return `可用命令：/retry  /clear  /save  /help  /re on|off  /export`
  },

  re(args) {
    const re = useRegexStore()
    const a = args.trim().toLowerCase()
    if (a === 'on') { re.enabled = true; return '正则替换已开启' }
    if (a === 'off') { re.enabled = false; return '正则替换已关闭' }
    return `正则替换：${re.enabled ? '开启' : '关闭'}（使用 /re on|off 切换）`
  },

  export(_) {
    const game = useGameStore()
    const json = game.exportWorld()
    if (!json) return '没有可导出的世界'
    const blob = new Blob([json], { type: 'application/json' })
    const ws = JSON.parse(json).world
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${ws?.name || 'world'}.json`
    a.click(); URL.revokeObjectURL(url)
    return '已导出世界 JSON'
  },
}

/**
 * 尝试执行斜杠命令。返回 true 表示已处理（不发送到 AI）
 */
export function runCommand(input: string): { handled: boolean; feedback: string | null } {
  if (!input.startsWith('/')) return { handled: false, feedback: null }

  const parts = input.slice(1).split(/\s+/)
  const cmd = parts[0]?.toLowerCase()
  const args = parts.slice(1).join(' ')

  const fn = commands[cmd]
  if (!fn) return { handled: true, feedback: `未知命令 /${cmd}，输入 /help 查看可用命令` }

  const result = fn(args)
  if (result === false) return { handled: true, feedback: null }
  return { handled: true, feedback: result }
}
