// ============================================================
// wandou v0.6 — 豌豆星际漂流 · 入口
// IndexedDB 初始化 + 退出前自动保存
// ============================================================

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './style.css'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.mount('#app')

// 初始化 store（异步检查 IndexedDB 存档）
import { useGameStore } from './stores/gameStore'
const store = useGameStore()
store.initStore()

// 退出前自动保存（页面关闭/刷新时）
window.addEventListener('beforeunload', () => {
  if (store.phase === 'playing' && store.messages.length > 0) {
    store.autoSave()
  }
})

// 页面隐藏时也尝试保存（移动端切换 App）
window.addEventListener('pagehide', () => {
  if (store.phase === 'playing' && store.messages.length > 0) {
    store.autoSave()
  }
})
