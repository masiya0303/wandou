// ============================================================
// wandou — LLM API (bridge 流式解析 + 重试 + 中止)
// ============================================================

import type { ApiConfig, GameMessage } from '../types/game'

let activeAbort: AbortController | null = null

/** 中止正在进行的请求 */
export function abortGeneration() {
  if (activeAbort) { activeAbort.abort('stopped_by_user'); activeAbort = null }
}

// ---- delta 提取 ----

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

function normalizeUrl(url: string): string {
  let clean = url.trim().replace(/\/+$/, '')
  if (!clean) return ''
  if (!/\/v\d+$/i.test(clean)) clean += '/v1'
  return clean
}

// ---- 错误分类 ----

function classifyError(status: number, body: string): string {
  if (status === 401 || status === 403) return 'API Key 无效或无权访问该模型，请检查设置'
  if (status === 429) return '请求过于频繁，请稍后再试'
  if (status === 502 || status === 503) return '上游服务暂时不可用，正在重试...'
  if (status >= 500) return `服务器错误 (${status})`
  // 尝试解析 body 中的错误信息
  try {
    const err = JSON.parse(body)
    if (err.error?.message) return err.error.message
  } catch { /* raw text */ }
  return `API 错误 ${status}`
}

// ---- 流式请求 ----

export async function chatStream(
  config: ApiConfig,
  systemPrompt: string,
  history: GameMessage[],
  onChunk: (chunk: string) => void,
  signal?: AbortSignal,
  retries = 1,
): Promise<string> {
  if (activeAbort) { activeAbort.abort('replaced'); activeAbort = null }

  const ac = new AbortController()
  activeAbort = ac

  if (signal) {
    if (signal.aborted) { activeAbort = null; return '' }
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

  let lastError: Error | null = null
  let full = ''
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      // 重试前等一小段
      await new Promise(r => setTimeout(r, 800 * attempt))
    }

    try {
      const response = await fetch(url, {
        method: 'POST', headers, body,
        signal: ac.signal,
      })

      if (!response.ok) {
        const text = await response.text().catch(() => '')
        const msg = classifyError(response.status, text)
        // 502/503 可重试，其他直接抛
        if ((response.status === 502 || response.status === 503) && attempt < retries) {
          lastError = new Error(msg)
          continue
        }
        throw new Error(msg)
      }

      if (!response.body) throw new Error('上游未返回流式 body')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
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
    } catch (e: any) {
      if (e.name === 'AbortError') {
        // 用户主动停止 → 返回已收集的部分内容，不抛错
        return full
      }
      lastError = e
    }
  }

  throw lastError || new Error('请求失败')
}

function safeParse(raw: string): any {
  try { return JSON.parse(raw) } catch { return null }
}
