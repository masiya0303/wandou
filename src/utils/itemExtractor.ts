// ============================================================
// wandou · 物品变化提取器（轻量 API 回退方案）
//
// 当 AI 没有输出 <mj_inventory_ops> 标签时，
// 用一次轻量 API 调用从 AI 叙述中提取物品 JSON。
//
// 注意：这是标签解析的回退方案，非主路径。
// 所有物品最终通过 playerStore.applyOps() 统一入口写入。
// ============================================================
import type { ApiConfig, GameMessage } from '@/types/game'
import { isFakeItem } from '@/stores/playerStore'

export interface ExtractedItem {
  op: 'add' | 'remove'
  name: string
  quantity: number
  type: string
  description: string
}

function normalizeUrl(url: string): string {
  const clean = url.trim().replace(/\/+$/, '')
  return clean || 'https://api.deepseek.com'
}

// ============================================================
// 启发式伪物品检测（比 playerStore.isFakeItem 更宽松的二次过滤）
// ============================================================

function isProbablyFake(item: ExtractedItem): boolean {
  // 先走共享检测
  if (isFakeItem(item.name)) return true

  // 描述中包含典型的"非实物"信号
  const desc = item.description.toLowerCase()
  const fakeDescSignals = [
    '经验', '声望', '好感', '关系', '情报', '信息',
    '学会', '领悟', '掌握', '理解', '知道了', '明白了',
    '感觉', '感到', '觉得', '认为',
    '能力提升', '等级提升', '升级',
  ]
  if (fakeDescSignals.some(s => desc.includes(s))) return true

  // type 为 other 且没有描述 → 可疑
  if (item.type === 'other' && !item.description.trim()) return true

  return false
}

// ============================================================
// 主提取函数
// ============================================================

export async function extractItems(
  config: ApiConfig,
  _history: GameMessage[],
  lastAssistantContent: string,
): Promise<ExtractedItem[]> {
  const body = JSON.stringify({
    model: config.model,
    messages: [
      {
        role: 'system',
        content: [
          '从剧情文本中提取玩家获得或失去的**实体物品**。',
          '规则：',
          '- 只提取实物（武器、防具、药水、材料、钥匙、道具），不提取概念/信息/经验/好感',
          '- 如果物品名是容器或泛指（如"礼包""奖励""东西""宝物"），尝试从描述中提取具体物品名',
          '- 若无法确定具体物品名，跳过该项',
          '- 输出 JSON 数组，无变化时输出空数组 []',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          '从以下剧情中提取物品变化:',
          '',
          lastAssistantContent.slice(-3000),
          '',
          '输出格式:',
          '[{"op":"add","name":"物品名","quantity":1,"type":"weapon|armor|consumable|material|key|other","description":"简述"}]',
        ].join('\n'),
      },
    ],
    temperature: 0,
    max_tokens: 300,
  })

  try {
    const url = `${normalizeUrl(config.baseUrl)}/v1/chat/completions`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey.trim()}` },
      body,
      signal: AbortSignal.timeout(10000),
    })

    if (!res.ok) {
      console.warn('[物品提取] API 返回', res.status)
      return []
    }

    const data = await res.json()
    const text = data?.choices?.[0]?.message?.content || ''
    const m = text.match(/\[[\s\S]*\]/)
    if (!m) return []

    const items = JSON.parse(m[0])
    if (!Array.isArray(items)) return []

    return items
      .filter((item: any) => item && item.name && (item.op === 'add' || item.op === 'remove'))
      .map((item: any) => ({
        op: item.op as 'add' | 'remove',
        name: String(item.name).trim(),
        quantity: Math.max(1, Math.floor(Number(item.quantity) || 1)),
        type: String(item.type || 'other').trim(),
        description: String(item.description || '').trim() || `（${item.op === 'add' ? '获得' : '失去'}）`,
      }))
      .filter((item: ExtractedItem) => !isProbablyFake(item))
  } catch (e: any) {
    if (e.name === 'AbortError' || e.name === 'TimeoutError') return []
    console.warn('[物品提取] 失败:', e.message)
    return []
  }
}
