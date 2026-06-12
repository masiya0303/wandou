/**
 * JSON 提取工具测试 — 核心解析逻辑
 */
import { describe, it, expect } from 'vitest'
import {
  safeParseJson,
  stripJsonFence,
  extractBalancedJson,
  tryExtractFromFences,
} from '../utils/jsonExtract'

describe('safeParseJson', () => {
  it('解析合法 JSON', () => {
    expect(safeParseJson('{"a":1}')).toEqual({ a: 1 })
    expect(safeParseJson('[1,2,3]')).toEqual([1, 2, 3])
  })

  it('无效 JSON 返回 null', () => {
    expect(safeParseJson('{bad}')).toBeNull()
    expect(safeParseJson('')).toBeNull()
  })

  it('前后空白不影响', () => {
    expect(safeParseJson('  {"a":1}  ')).toEqual({ a: 1 })
  })
})

describe('stripJsonFence', () => {
  it('去掉 ```json ... ```', () => {
    expect(stripJsonFence('```json\n{"a":1}\n```')).toBe('{"a":1}')
  })

  it('去掉 ``` ... ```', () => {
    expect(stripJsonFence('```\n[1,2]\n```')).toBe('[1,2]')
  })

  it('无围栏直接返回', () => {
    expect(stripJsonFence('{"a":1}')).toBe('{"a":1}')
  })
})

describe('extractBalancedJson', () => {
  it('提取平衡的 {}', () => {
    const result = extractBalancedJson('{"a":{"b":1}}')
    expect(result).toBe('{"a":{"b":1}}')
  })

  it('提取平衡的 []', () => {
    expect(extractBalancedJson('[1, [2, 3]]')).toBe('[1, [2, 3]]')
  })

  it('从杂文本中搜索第一个括号', () => {
    expect(extractBalancedJson('前面文字 {"key": [1,2]} 后面文字')).toBe('{"key": [1,2]}')
  })

  it('空串返回 null', () => {
    expect(extractBalancedJson('')).toBeNull()
    expect(extractBalancedJson('no brackets here')).toBeNull()
  })
})

describe('tryExtractFromFences', () => {
  it('提取 fence 内的 JSON', () => {
    expect(tryExtractFromFences('```json\n{"a":1}\n```')).toEqual({ a: 1 })
  })

  it('无 fence 返回 null', () => {
    expect(tryExtractFromFences('just text')).toBeNull()
  })
})
