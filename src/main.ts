// ============================================================
// wandou v1.0 — 入口
// PWA + 主题 + 全局快捷键 + localStorage 持久化
// ============================================================
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './style.css'

const app = createApp(App)
app.use(createPinia())
app.mount('#app')

// PWA service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {})
}

// 全局快捷键
window.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    // 关闭设置面板: App.vue listens for esc
    window.dispatchEvent(new CustomEvent('wandou:esc'))
  }
})
