/**
 * InputBar 组件测试 — 输入/发送/命令
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import InputBar from './InputBar.vue'
import { useChatStore } from '@/stores/chatStore'

describe('InputBar', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('Enter 键发送消息', async () => {
    const chat = useChatStore()
    const sendSpy = vi.spyOn(chat, 'sendMessage')
    const w = mount(InputBar)

    const textarea = w.find('textarea')
    await textarea.setValue('你好世界')
    await textarea.trigger('keydown', { key: 'Enter', shiftKey: false })

    expect(sendSpy).toHaveBeenCalledWith('你好世界')
    expect((textarea.element as HTMLTextAreaElement).value).toBe('')
  })

  it('Shift+Enter 不发送', async () => {
    const chat = useChatStore()
    const sendSpy = vi.spyOn(chat, 'sendMessage')
    const w = mount(InputBar)

    const textarea = w.find('textarea')
    await textarea.setValue('换行测试')
    await textarea.trigger('keydown', { key: 'Enter', shiftKey: true })

    expect(sendSpy).not.toHaveBeenCalled()
  })

  it('空消息不发送', async () => {
    const chat = useChatStore()
    const sendSpy = vi.spyOn(chat, 'sendMessage')
    const w = mount(InputBar)

    await w.find('textarea').trigger('keydown', { key: 'Enter', shiftKey: false })
    expect(sendSpy).not.toHaveBeenCalled()
  })

  it('send 按钮点击发送', async () => {
    const chat = useChatStore()
    const sendSpy = vi.spyOn(chat, 'sendMessage')
    const w = mount(InputBar)

    await w.find('textarea').setValue('点击发送')
    await w.find('.send-btn').trigger('click')

    expect(sendSpy).toHaveBeenCalledWith('点击发送')
  })

  it('发送按钮在空输入时禁用', () => {
    const w = mount(InputBar)
    const btn = w.find('.send-btn')
    expect((btn.element as HTMLButtonElement).disabled).toBe(true)
  })

  it('生成中显示停止按钮', async () => {
    const chat = useChatStore()
    chat.isGenerating = true
    const w = mount(InputBar)
    await nextTick()
    expect(w.find('.stop-btn').exists()).toBe(true)
    expect(w.find('.send-btn').exists()).toBe(false)
  })

  it('斜杠命令被处理不发送到 AI', async () => {
    const chat = useChatStore()
    const sendSpy = vi.spyOn(chat, 'sendMessage')
    const w = mount(InputBar)

    const textarea = w.find('textarea')
    await textarea.setValue('/help')
    await textarea.trigger('keydown', { key: 'Enter', shiftKey: false })

    expect(sendSpy).not.toHaveBeenCalled()
    // 命令反馈应显示
    await nextTick()
    expect(w.find('.cmd-fb').exists()).toBe(true)
  })
})
