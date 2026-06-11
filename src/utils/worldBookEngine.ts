// ============================================================
// wandou v0.2 — 豌豆星际漂流 · 世界书引擎
// 兼容 SillyTavern 世界书 JSON 格式
// ============================================================

import type { WorldBookEntry, RawWorldBookEntry, ImportResult } from '../types/worldBook'

// ---------- 匹配引擎 ----------

/**
 * 从聊天历史中收集命中的世界书条目，按优先级排序，返回注入文本
 * @param entries 全部世界书条目
 * @param chatHistory 聊天历史文本片段（取近 10 条消息）
 * @param maxTokens 最大输出 token 估算（粗略 1 char ≈ 2 tokens）
 */
export function scanAndCollect(
  entries: WorldBookEntry[],
  chatHistory: string[],
  maxTokens: number = 2000,
): string {
  const enabled = entries.filter(e => e.enabled)
  if (enabled.length === 0) return ''

  const historyText = chatHistory.join(' ').toLowerCase()
  const maxChars = maxTokens * 2 // rough estimate

  // at_constant 条目始终命中
  const constant = enabled.filter(e => e.position === 'at_constant')

  // keyword + secondary_key 匹配
  const matched: WorldBookEntry[] = [...constant]

  for (const entry of enabled) {
    if (entry.position === 'at_constant') continue
    if (matched.includes(entry)) continue

    let hit = false
    for (const key of entry.keys) {
      const k = key.toLowerCase().trim()
      if (!k) continue
      // 子串匹配
      if (historyText.includes(k)) {
        hit = true
        break
      }
    }
    if (hit) {
      matched.push(entry)
    }
  }

  if (matched.length === 0) return ''

  // 按 priority 降序
  matched.sort((a, b) => b.priority - a.priority)

  // 拼接，控制总长度
  const parts: string[] = []
  let used = 0
  for (const entry of matched) {
    const text = entry.content.trim()
    if (!text) continue
    if (used + text.length > maxChars) break
    parts.push(text)
    used += text.length
  }

  if (parts.length === 0) return ''

  return `\n\n---\n【世界书·背景参考】\n${parts.join('\n\n---\n')}\n---\n`
}

/** 对 GameMessage[] 取最近 N 条文本 */
export function extractRecentText(
  messages: Array<{ role: string; content: string }>,
  count: number = 10,
): string[] {
  return messages.slice(-count).map(m => m.content)
}

// ---------- 导入 ----------

let idCounter = 0
function genId(): string {
  idCounter++
  return `wb-${Date.now()}-${idCounter}`
}

/**
 * 解析并导入世界书 JSON
 * 支持标准格式和 SillyTavern 兼容格式
 * @returns ImportResult（包含解析后的条目）
 */
export function importWorldBook(jsonStr: string): ImportResult & { entries: WorldBookEntry[] } {
  const errors: string[] = []
  let data: unknown

  try {
    data = JSON.parse(jsonStr)
  } catch (e: any) {
    return { success: false, imported: 0, errors: [`JSON 解析失败: ${e.message}`], entries: [] }
  }

  // 支持 { entries: [...] } 包裹或裸数组
  let rawArr: RawWorldBookEntry[]
  if (Array.isArray(data)) {
    rawArr = data
  } else if (data && typeof data === 'object' && Array.isArray((data as any).entries)) {
    rawArr = (data as any).entries
  } else {
    return { success: false, imported: 0, errors: ['JSON 格式错误：期望数组或 { entries: [...] }'], entries: [] }
  }

  const entries: WorldBookEntry[] = []

  for (let i = 0; i < rawArr.length; i++) {
    const raw = rawArr[i]
    if (!raw || typeof raw !== 'object') {
      errors.push(`条目 #${i + 1}: 格式无效，已跳过`)
      continue
    }

    // 兼容 keys / key / keyword
    let keys: string[] = []
    if (Array.isArray(raw.keys)) keys = raw.keys
    else if (typeof raw.keys === 'string') keys = [raw.keys]
    else if (Array.isArray(raw.key)) keys = raw.key
    else if (typeof raw.key === 'string') keys = [raw.key]

    // 也合并 secondary_keys
    if (Array.isArray(raw.secondary_keys)) {
      keys = [...keys, ...raw.secondary_keys]
    }

    // 兼容 content / text
    const content = (raw.content || raw.text || '').trim()

    if (!content) {
      errors.push(`条目 #${i + 1}: 缺少 content 字段，已跳过`)
      continue
    }

    const entry: WorldBookEntry = {
      id: genId(),
      keys: keys.map(k => k.trim()).filter(Boolean),
      content,
      comment: raw.comment || raw.memo || '',
      enabled: raw.enabled !== false, // 默认启用
      priority: typeof raw.priority === 'number' ? Math.max(0, Math.min(100, raw.priority)) : 50,
      position: raw.position || 'after',
    }

    entries.push(entry)
  }

  return {
    success: entries.length > 0,
    imported: entries.length,
    errors,
    entries,
  }
}

// ---------- 预设世界书 ----------

export const PRESET_WORLD_BOOK: WorldBookEntry[] = [
  {
    id: 'preset-001',
    keys: ['星盟', '联邦', '银河议会', '联盟'],
    content: '银河星盟是人类与多个外星种族组成的星际政治联盟，总部设在开普勒-186f 轨道站。三大核心原则：和平共处、自由贸易、共同防御。',
    comment: '银河星盟',
    enabled: true,
    priority: 80,
    position: 'after',
  },
  {
    id: 'preset-002',
    keys: ['虫族', '异虫', '虫群', '虫潮'],
    content: '虫族（Zerg）是来自仙女座方向的蜂群式外星生物，由脑虫统一指挥。虫族以生物科技见长，能吸收基因进化。最近一次虫族入侵「天灾之战」发生在 2812 年。',
    comment: '虫族威胁',
    enabled: true,
    priority: 85,
    position: 'after',
  },
  {
    id: 'preset-003',
    keys: ['曲速', '超光速', '跃迁', 'warp', 'FTL'],
    content: '曲速引擎（Warp Drive）通过压缩前方时空实现超光速航行。标准曲速等级 1-9，等级 5 可达光速 100 倍。长途星际旅行需使用星门跳转。',
    comment: '曲速引擎',
    enabled: true,
    priority: 70,
    position: 'after',
  },
  {
    id: 'preset-004',
    keys: ['暗物质', '暗能量', '黑晶', '暗晶'],
    content: '暗物质是宇宙中最丰富的能量形式。「暗晶」（Dark Crystal）是从暗物质中提炼的高密度能源载体，1 克暗晶可驱动飞船航行 100 光年。开采暗晶是高风险高回报的行业。',
    comment: '暗物质能源',
    enabled: true,
    priority: 75,
    position: 'after',
  },
  {
    id: 'preset-005',
    keys: ['豌豆号', '飞船', '舰船'],
    content: '「豌豆号」是一艘退役军用侦察舰，注册编号 WND-2187。经重度改装后拥有强化护盾和隐蔽系统。舰载 AI「豆豆」是其核心智能中枢。船体规模：中型，可容纳 12 名船员。',
    comment: '豌豆号',
    enabled: true,
    priority: 90,
    position: 'at_constant',
  },
  {
    id: 'preset-006',
    keys: ['海盗', '掠夺者', '走私', '地下市场'],
    content: '银河系边缘地带活跃着多个星际海盗帮派，最大的势力是「赤月帮」，控制着 17 个星系的黑市贸易。他们与部分星盟官员勾结，走私武器、暗晶和奴隶。',
    comment: '星际海盗',
    enabled: true,
    priority: 65,
    position: 'after',
  },
  {
    id: 'preset-007',
    keys: ['星门', '传送门', '跳转', 'gate'],
    content: '星门是古代文明留下的超维传送装置，成对连接两个固定坐标。星门网络至今未被完全探索，约有 40% 的已知星门目的成谜。星盟严禁私自激活未知星门。',
    comment: '星门网络',
    enabled: true,
    priority: 75,
    position: 'after',
  },
  {
    id: 'preset-008',
    keys: ['AI', '人工智能', '机器人', '合成体'],
    content: '强人工智能（AGI）在 26 世纪末得到法律承认，拥有与人类平等的公民权利。合成体（机器人 + 生物组织混合体）在军队中占比约 15%，社会地位存在争议。',
    comment: 'AI 与合成体',
    enabled: true,
    priority: 60,
    position: 'after',
  },
]
