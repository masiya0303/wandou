// ============================================================
// wandou · 任务提取器（轻量 API 回退方案）
//
// 当 AI 没有在 <mj_variables> 中输出任务操作时，
// 用一次轻量 API 调用从 AI 叙述中提取任务。
// ============================================================
import type { ApiConfig } from '@/types/game'

interface ExtractedQuest {
  title: string
  questType: string
  description: string
  reward: string
  color: string
  status: 'active' | 'completed' | 'failed'
}

function normalizeUrl(url: string): string {
  const clean = url.trim().replace(/\/+$/, '')
  return clean || 'https://api.deepseek.com'
}

/**
 * 从 AI 叙述 + 玩家输入中提取任务变化
 * @param existingTitles 背包里已有的任务标题列表，用于去重
 * 返回空数组表示无任务变化
 */
export async function extractQuests(
  config: ApiConfig,
  lastUserInput: string,
  lastAssistantContent: string,
  existingTitles: string[] = [],
): Promise<ExtractedQuest[]> {
  // 快速启发式过滤：玩家只是在打招呼/闲聊/询问，不是在选择任务
  const selectSignals = /我选|我要|我接|我挑|第一个|第二个|第三个|这个|那个|就它|就这个|做这个|接这个|好的.*任务|可以.*接|行.*任务|嗯.*第一个|好.*第一个/
  const listSignals = /有哪些|有什么.*任务|看看.*任务|怎么接|怎么做|是什么|这是什么|介绍一下|这里是|这是哪里|你好|你是谁|怎么玩|怎么弄|不知道|我不懂|我不明白|任务.*怎么|接什么|什么.*任务|能接|可以接/

  // 玩家在问/闲聊，不是在选择 → 跳过 API 调用，直接返回空
  if (!selectSignals.test(lastUserInput) && listSignals.test(lastUserInput)) {
    console.warn('[wandou] questExtractor: 玩家未明确选择任务，跳过提取')
    return []
  }

  const body = JSON.stringify({
    model: config.model,
    messages: [
      {
        role: 'system',
        content: [
          '从剧情文本 + 玩家发言中共同判断：玩家是否【已经明确接受/选择】了某个任务。',
          '',
          '核心规则（非常重要）：',
          '- 判断依据 = 玩家发言内容（user_said）+ AI 叙述内容（ai_said）',
          '',
          '情况 A — 玩家尚未选择：',
          '· 玩家只是在问"有什么任务""可以接吗""介绍一下"等 → 不提取任何任务',
          '· NPC 列出了一份清单但玩家没开口选 → 不提取任何任务',
          '',
          '情况 B — 玩家明确选择了：',
          '· 玩家说"我接第一个""第二个""我要XX任务""就它了"等 → 只提取玩家选的那个',
          '',
          '情况 C — NPC 直接委托单任务且玩家未拒绝 → 可提取（默认接受）',
          '',
          '- 任务类型：主线/支线/日常/紧急/隐藏',
          '- 任务颜色：主线=#ff6b6b、支线=#ffa726、日常=#66bb6a、紧急=#e53935、隐藏=#9575cd',
          '- 输出 JSON 数组，无任务变化时输出空数组 []',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          '玩家说了什么 = ' + lastUserInput.slice(-500),
          '',
          'AI 回复了什么 = ' + lastAssistantContent.slice(-3500),
          '',
          (existingTitles.length > 0
            ? '⚠️ 玩家背包里已存在这些任务（不得重复提取）：' + JSON.stringify(existingTitles)
            : '玩家背包里暂无任务。'),
          '',
          '输出格式:',
          '[{"title":"任务名字","questType":"支线","description":"任务内容简述","reward":"报酬说明","color":"#ffa726","status":"active"}]',
        ].join('\n'),
      },
    ],
    temperature: 0,
    max_tokens: 500,
  })

  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 12000)

  try {
    const url = `${normalizeUrl(config.baseUrl)}/v1/chat/completions`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey.trim()}` },
      body,
      signal: ac.signal,
    })

    if (!res.ok) {
      clearTimeout(timer)
      return []
    }

    const data = await res.json()
    const text = data?.choices?.[0]?.message?.content || ''
    const m = text.match(/\[[\s\S]*\]/)
    if (!m) { clearTimeout(timer); return [] }

    const parsed = JSON.parse(m[0])
    if (!Array.isArray(parsed)) { clearTimeout(timer); return [] }

    clearTimeout(timer)
    return parsed
      .filter((item: any) => item && item.title)
      .map((item: any) => ({
        title: String(item.title || '').trim(),
        questType: String(item.questType || item.任务类型 || '支线').trim(),
        description: String(item.description || item.描述 || '').trim(),
        reward: String(item.reward || item.奖励 || '').trim(),
        color: String(item.color || item.颜色 || defaultQuestColor(String(item.questType || '支线'))).trim(),
        status: (item.status === 'completed' || item.status === 'failed' ? item.status : 'active') as any,
      }))
  } catch {
    clearTimeout(timer)
    return []
  }
}

function defaultQuestColor(questType: string): string {
  switch (questType) {
    case '主线': return '#ff6b6b'
    case '支线': return '#ffa726'
    case '日常': return '#66bb6a'
    case '紧急': return '#e53935'
    case '隐藏': return '#9575cd'
    default: return '#ffa726'
  }
}
