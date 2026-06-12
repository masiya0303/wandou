/**
 * 主题 Store 测试 — 导入、恢复、CSS 变量注入
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useThemeStore } from './themeStore'

const BJD_THEME = JSON.stringify({
  name: 'bjd粉色',
  main_text_color: 'rgba(112, 88, 98, 0.81)',
  accent_color: '#ff80a8',
  chat_bg_url: 'https://example.com/bg.jpeg',
  font_scale: 0.85,
  custom_css: '.test { color: red; }',
})

describe('themeStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('起始不自定义（默认粉色）', () => {
    const theme = useThemeStore()
    expect(theme.isCustom).toBe(false)
  })

  it('导入有效 JSON 后 isCustom 为 true', () => {
    const theme = useThemeStore()
    const ok = theme.importThemeJson(BJD_THEME)
    expect(ok).toBe(true)
    expect(theme.isCustom).toBe(true)
  })

  it('导入后写入 CSS 变量', () => {
    const theme = useThemeStore()
    theme.importThemeJson(BJD_THEME)
    const style = document.documentElement.style
    expect(style.getPropertyValue('--theme-text-accent')).toBe('#ff80a8')
    expect(style.getPropertyValue('--font-scale')).toBe('0.85')
  })

  it('导入后 custom_css 注入 <head>', () => {
    const theme = useThemeStore()
    theme.importThemeJson(BJD_THEME)
    const el = document.getElementById('wandou-theme-custom')
    expect(el).toBeTruthy()
    expect(el!.textContent).toContain('.test')
  })

  it('导入无效 JSON 返回 false', () => {
    const theme = useThemeStore()
    expect(theme.importThemeJson('bad')).toBe(false)
    expect(theme.importThemeJson('{"no_name": 1}')).toBe(false)
    expect(theme.isCustom).toBe(false)
  })

  it('resetToDefault 清除自定义', () => {
    const theme = useThemeStore()
    theme.importThemeJson(BJD_THEME)
    expect(theme.isCustom).toBe(true)

    theme.resetToDefault()
    expect(theme.isCustom).toBe(false)
    // CSS 变量应被移除
    const style = document.documentElement.style
    expect(style.getPropertyValue('--theme-text-accent')).toBe('')
  })

  it('loadCustomTheme 从 localStorage 恢复', () => {
    localStorage.setItem('wandou_custom_theme', BJD_THEME)
    const theme = useThemeStore()
    const ok = theme.loadCustomTheme()
    expect(ok).toBe(true)
    expect(theme.isCustom).toBe(true)
    expect(document.documentElement.style.getPropertyValue('--theme-text-accent')).toBe('#ff80a8')
  })

  it('loadCustomTheme 无存储数据返回 false', () => {
    const theme = useThemeStore()
    expect(theme.loadCustomTheme()).toBe(false)
    expect(theme.isCustom).toBe(false)
  })
})
