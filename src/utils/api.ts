// ============================================================
// wandou — LLM API (bridge 流式解析 + 超时 + 中止)
// ============================================================

import type { ApiConfig, GameMessage } from '../types/game'

let activeAbort: AbortController | null = null

// 中止正在进行的请求
export function abortGeneration() {
  if (activeAbort) { activeAbort.abort('stopped_by_user'); activeAbort = null }
}

// 兼容多种上游 (OpenAI / Gemini中转 / 推理模型) 的 delta 文本提取
function extractDelta(parsed: any): string {
  if (!parsed || typeof parsed !== 'object') return ''
  const ch = parsed.choices?.[0]
  if (!ch || typeof ch !== 'object') return ''
  const d = ch.delta && typeof ch.delta === 'object' ? ch.delta : null
  const parts: string[] = []
  if (d) {
    if (d.content != null && String(d.content) !== '') parts.push(String(d.content))
    if (d.reasoning_content != null && String(d.reasoning_content) !== '') parts.push(String(d.reasoning_content))
    if (d.text != null && String(d.text) !== '') parts.push(String(d.text))
  }
  if (ch.text != null && String(ch.text) !== '') parts.push(String(ch.text))
  if (ch.message?.content != null && String(ch.message.content) !== '') parts.push(String(ch.message.content))
  return parts.join('')
}

// 规范化 base URL
function normalizeUrl(url: string): string {
  let clean = url.trim().replace(/\/+$/, '')
  if (!clean) return ''
  if (!/\/v\d+$/i.test(clean)) clean += '/v1'
  return clean
}

export async function chatStream(
  config: ApiConfig,
  systemPrompt: string,
  history: GameMessage[],
  onChunk: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  // 中止旧请求
  if (activeAbort) { activeAbort.abort('replaced'); activeAbort = null }

  const ac = new AbortController()
  activeAbort = ac

  if (signal) {
    if (signal.aborted) { activeAbort = null; throw new DOMException(signal.reason, 'AbortError') }
    signal.addEventListener('abort', () => ac.abort(signal.reason), { once: true })
  }

  const baseUrl = normalizeUrl(config.baseUrl)
  const url = `${baseUrl}/chat/completions`

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

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey.trim()}`

  try {
    const response = await fetch(url, {
      method: 'POST', headers, body,
      signal: ac.signal,
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      const hint = (response.status === 401 || response.status === 403)
        ? '\n提示：API Key 无效或无权访问该模型。'
        : ''
      throw new Error(`API 错误 ${response.status}: ${text}${hint}`)
    }

    if (!response.body) throw new Error('上游未返回流式 body')

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let full = ''
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const payload = trimmed.slice(5).trim()
        if (!payload || payload === '[DONE]') continue

        const parsed = safeParse(payload)
        const token = extractDelta(parsed)
        if (!token) continue

        full += token
        onChunk(token)
      }
    }

    // 处理最后一行
    if (buffer.trim()) {
      const trimmed = buffer.trim()
      if (trimmed.startsWith('data:')) {
        const payload = trimmed.slice(5).trim()
        if (payload && payload !== '[DONE]') {
          const parsed = safeParse(payload)
          const token = extractDelta(parsed)
          if (token) { full += token; onChunk(token) }
        }
      }
    }

    return full
  } finally {
    if (activeAbort === ac) activeAbort = null
  }
}

function safeParse(raw: string): any {
  try { return JSON.parse(raw) } catch { return null }
}
