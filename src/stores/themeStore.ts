// ============================================================
// wandou · 主题 Store
// 默认 bjd粉色 主题已内置在 style.css，这里只处理自定义导入
// ============================================================
import { defineStore } from 'pinia'
import { ref } from 'vue'

const CUSTOM_KEY = 'wandou_custom_theme'

// 自定义 CSS 注入节点
let customStyleEl: HTMLStyleElement | null = null
function ensureCustomStyle(): HTMLStyleElement {
  if (!customStyleEl) {
    customStyleEl = document.createElement('style')
    customStyleEl.id = 'wandou-theme-custom'
    document.head.appendChild(customStyleEl)
  }
  return customStyleEl
}

/** 将一个主题对象映射为 CSS 变量 */
function applyVars(t: Record<string, any>) {
  const root = document.documentElement.style

  // 主文字色
  const mainText = t.main_text_color || t['--theme-text-main'] || ''
  if (mainText) root.setProperty('--theme-text-main', mainText)

  // 强调色
  const accent = t.accent_color || t['--theme-text-accent']
    || t['--theme-yellow-main'] || ''
  if (accent) root.setProperty('--theme-text-accent', accent)

  // 浅色边框
  const light = t.accent_light || t['--theme-border-light']
    || t['--theme-yellow-light'] || t.blur_tint_color || ''
  if (light) root.setProperty('--theme-border-light', light)

  // 冰色边框
  const ice = t.accent_ice || t['--theme-border-ice']
    || t['--theme-cream-white'] || t.blur_tint_color || ''
  if (ice) root.setProperty('--theme-border-ice', ice)

  // 次要文字
  const secondary = t.italics_text_color || t['--theme-text-secondary'] || ''
  if (secondary) root.setProperty('--theme-text-secondary', secondary)

  // 气泡背景
  const bubble = t.bubble_bg || t['--theme-bubble-bg']
    || t.user_mes_blur_tint_color || t.bot_mes_blur_tint_color || ''
  if (bubble) root.setProperty('--theme-bubble-bg', bubble)

  // 输入区背景
  const input = t.input_bg || t['--theme-input-bg']
    || t.chat_tint_color || t.blur_tint_color || ''
  if (input) root.setProperty('--theme-input-bg', input)

  // 字体缩放
  if (t.font_scale != null) root.setProperty('--font-scale', String(t.font_scale))

  // 背景图
  const bgUrl = t.chat_bg_url || t.panel_bg_url || ''
  if (bgUrl) {
    root.setProperty('--theme-chat-bg', `url(${bgUrl})`)
    root.setProperty('--theme-panel-bg', `url(${bgUrl})`)
  }

  if (t.bubble_bg_url) {
    root.setProperty('--theme-bubble-img', `url(${t.bubble_bg_url})`)
  } else if (t.chat_bg_url) {
    root.setProperty('--theme-bubble-img', `url(${t.chat_bg_url})`)
  }

  // custom_css 注入
  const el = ensureCustomStyle()
  if (t.custom_css && typeof t.custom_css === 'string') {
    el.textContent = t.custom_css
  } else {
    el.textContent = ''
  }
}

/** 清除所有自定义主题 override，恢复 style.css 默认值 */
function clearVars() {
  const root = document.documentElement.style
  const vars = [
    '--theme-text-main', '--theme-text-accent', '--theme-text-secondary',
    '--theme-border-light', '--theme-border-ice',
    '--theme-bubble-bg', '--theme-input-bg', '--font-scale',
    '--theme-chat-bg', '--theme-panel-bg', '--theme-bubble-img',
  ]
  for (const v of vars) root.removeProperty(v)
  const el = document.getElementById('wandou-theme-custom')
  if (el) el.textContent = ''
}

export const useThemeStore = defineStore('theme', () => {
  const isCustom = ref(false)

  /** 启动时调用：加载上次保存的自定义主题 */
  function loadCustomTheme(): boolean {
    try {
      const raw = localStorage.getItem(CUSTOM_KEY)
      if (!raw) return false
      applyVars(JSON.parse(raw))
      isCustom.value = true
      return true
    } catch { return false }
  }

  /** 从 JSON 字符串导入自定义主题 */
  function importThemeJson(jsonStr: string): boolean {
    try {
      const t = JSON.parse(jsonStr)
      if (!t.name) return false
      applyVars(t)
      localStorage.setItem(CUSTOM_KEY, jsonStr)
      isCustom.value = true
      return true
    } catch { return false }
  }

  /** 恢复默认粉色主题 */
  function resetToDefault() {
    try { localStorage.removeItem(CUSTOM_KEY) } catch {}
    clearVars()
    isCustom.value = false
  }

  return { isCustom, loadCustomTheme, importThemeJson, resetToDefault }
})
