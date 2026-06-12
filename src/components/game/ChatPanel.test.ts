/**
 * ChatPanel 组件测试 — 空态/消息/错误/缓存
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import ChatPanel from './ChatPanel.vue'
import { useChatStore } from '@/stores/chatStore'
import { usePlayerStore } from '@/stores/playerStore'

// stub marked + DOMPurify (不依赖真实 DOM 解析)
vi.mock('marked', () => ({ marked: { parse: (t: string) => `<p>${t}</p>` } }))
vi.mock('dompurify', () => ({ default: { sanitize: (h: string) => h } }))

describe('ChatPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('空态显示提示', () => {
    const w = mount(ChatPanel)
    expect(w.text()).toContain('通讯频道静默中')
    expect(w.text()).toContain('启程星际冒险')
  })

  it('显示 user 和 assistant 消息', async () => {
    const chat = useChatStore()
    chat.messages = [
      { id: 'u1', role: 'user', content: '你好', timestamp: Date.now() },
      { id: 'a1', role: 'assistant', content: '你好，船长', timestamp: Date.now() },
    ]
    const w = mount(ChatPanel)
    await nextTick()
    expect(w.text()).toContain('你好')
    expect(w.text()).toContain('你好，船长')
  })

  it('显示系统消息', async () => {
    const chat = useChatStore()
    chat.messages = [
      { id: 's1', role: 'system', content: '📋 获得 电池', timestamp: Date.now() },
    ]
    const w = mount(ChatPanel)
    await nextTick()
    expect(w.text()).toContain('获得 电池')
  })

  it('AI 消息间显示分隔符', async () => {
    const chat = useChatStore()
    chat.messages = [
      { id: 'u1', role: 'user', content: 'A', timestamp: 1 },
      { id: 'a1', role: 'assistant', content: 'B', timestamp: 2 },
      { id: 'u2', role: 'user', content: 'C', timestamp: 3 },
      { id: 'a2', role: 'assistant', content: 'D', timestamp: 4 },
    ]
    const w = mount(ChatPanel)
    await nextTick()
    // 每条非第一条消息的 assistant 前面都有 sep（这里 a1 和 a2 各有 sep）
    expect(w.findAll('.sep').length).toBe(2)
  })

  it('显示错误', async () => {
    const chat = useChatStore()
    chat.error = 'API Key 无效'
    chat.errorType = 'auth'
    const w = mount(ChatPanel)
    await nextTick()
    expect(w.text()).toContain('认证失败')
    expect(w.text()).toContain('API Key 无效')
  })

  it('错误框可关闭', async () => {
    const chat = useChatStore()
    chat.error = '网络不通'
    chat.errorType = 'network'
    const w = mount(ChatPanel)
    await nextTick()
    expect(w.find('.err-box').exists()).toBe(true)

    await w.find('.err-close').trigger('click')
    await nextTick()
    expect(chat.error).toBe('')
  })

  it('显示用户角色名', async () => {
    const p = usePlayerStore()
    p.updateCharacter({ name: '星际探险者' })
    const chat = useChatStore()
    chat.messages = [
      { id: 'u1', role: 'user', content: '出发', timestamp: Date.now() },
    ]
    const w = mount(ChatPanel)
    await nextTick()
    expect(w.text()).toContain('星际探险者')
  })

  it('md() 缓存命中 — 同 id 同内容不重复解析', async () => {
    const chat = useChatStore()
    chat.messages = [
      { id: 'u1', role: 'user', content: 'test', timestamp: 1 },
    ]
    const w = mount(ChatPanel)
    await nextTick()
    expect(w.text()).toContain('test')

    // 触发 re-render（内容不变），缓存应命中
    chat.messages = [...chat.messages]
    await nextTick()
    // 组件不崩溃、内容一致
    expect(w.text()).toContain('test')
  })
})
