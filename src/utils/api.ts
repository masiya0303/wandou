// ============================================================
// wandou — 豌豆星际漂流 · LLM API 工具
// 流式 + 非流式请求
// ============================================================

import type { ApiConfig, GameMessage } from '../types/game'

// 确保 header 值只含 ASCII
function safeHeader(val: string): string {
  return val.replace(/[^\x00-\x7F]/g, '')
}

export async function chatStream(
  config: ApiConfig,
  systemPrompt: string,
  history: GameMessage[],
  onChunk: (chunk: string) => void,
): Promise<string> {
  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: systemPrompt },
    ...history.map(m => ({ role: m.role, content: m.content })),
  ]

  const body = JSON.stringify({
    model: config.model,
    messages,
    temperature: config.temperature,
    max_tokens: config.maxTokens,
    stream: true,
  })

  const response = await fetch(`${config.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${safeHeader(config.apiKey)}`,
    },
    body,
  })

  if (!response.ok) {
    const errBody = await response.text().catch(() => '')
    throw new Error(`API 错误 ${response.status}: ${errBody}`)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error('无法读取响应流')

  const decoder = new TextDecoder()
  let fullContent = ''
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })

    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.startsWith('data: ')) continue

      const data = trimmed.slice(6)
      if (data === '[DONE]') continue

      try {
        const json = JSON.parse(data)
        const delta = json.choices?.[0]?.delta?.content
        if (delta) {
          fullContent += delta
          onChunk(delta)
        }
      } catch {
        // 忽略解析失败的行
      }
    }
  }

  return fullContent
}

export async function chatOnce(
  config: ApiConfig,
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  const response = await fetch(`${config.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${safeHeader(config.apiKey)}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      stream: false,
    }),
  })

  if (!response.ok) {
    throw new Error(`API 错误 ${response.status}`)
  }

  const json = await response.json()
  return json.choices?.[0]?.message?.content || ''
}
